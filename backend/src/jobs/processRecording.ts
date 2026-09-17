import { Readable, Transform } from "stream";
import { prisma } from "../lib/prisma.js";
import { uploadRecording } from "../lib/storage.js";
import { ProcessRecordingJob } from "../lib/jobTypes.js";

const RECORDING_DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
const MAX_RECORDING_BYTES = 200 * 1024 * 1024;
const MAX_RECORDING_REDIRECTS = 5;

function esRedirect(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

/**
 * Descarga la grabación desde Retell/Telnyx y la sube a R2/S3. Invocado desde
 * POST /internal/jobs/process-recording (Cloud Tasks) o en línea en dev.
 */
export async function processRecordingJob(data: ProcessRecordingJob): Promise<void> {
  console.log(`[Job] Processing recording for call ${data.callId}`);

  try {
    const { callId, externalUrl } = data;

    const [call, pendingRecording] = await Promise.all([
      prisma.call.findUnique({ where: { id: callId } }),
      // storageKey: null en el filtro — es la marca de "todavía sin subir".
      // Cloud Tasks entrega al menos una vez, así que sin esto una segunda
      // entrega repetía la descarga completa desde el proveedor y el PUT a
      // R2 de un fichero que ya estaba guardado.
      prisma.recording.findFirst({
        where: { callId, deletedAt: null, storageKey: null },
        select: { id: true },
      }),
    ]);
    if (!call) {
      throw new Error(`Call ${callId} not found`);
    }
    if (!pendingRecording) {
      console.log(
        `[Job] La grabación de ${callId} ya está subida o fue retirada; nada que hacer`
      );
      return;
    }

    console.log(`[Job] Downloading recording from: ${externalUrl}`);
    const recording = await downloadRecording(externalUrl);

    // El negocio sale de la fila Call, no del payload del job: si ambos no
    // coincidieran, guardar bajo el prefijo del payload dejaría el audio de
    // un negocio colgando del espacio de otro.
    const storageKey = `recordings/${call.businessId}/${callId}.mp3`;
    console.log(`[Job] Uploading to storage with key: ${storageKey}`);

    const storageUrl = await uploadRecording(
      storageKey,
      recording.stream,
      recording.contentType,
      recording.contentLength
    );

    await prisma.recording.update({
      where: { callId },
      data: { storageKey, storageUrl },
    });

    console.log(`[Job] Recording successfully processed for call ${callId}`);
  } catch (error) {
    console.error(`[Job] Error processing recording for call ${data.callId}:`, error);
    throw error;
  }
}

/**
 * La URL de la grabación llega dentro de webhooks firmados de Retell/Telnyx,
 * pero este job la descarga desde dentro de la red de Cloud Run: si alguna
 * vez llegara una URL manipulada, un `fetch` sin filtro sería una vía directa
 * al servidor de metadatos de GCP (169.254.169.254) o a cualquier servicio
 * interno. Exigimos https y descartamos destinos que no pueden ser un CDN
 * público.
 */
function assertDescargaPermitida(url: string): URL {
  let destino: URL;
  try {
    destino = new URL(url);
  } catch {
    throw new Error("La URL de la grabación no es válida");
  }

  if (destino.protocol !== "https:") {
    throw new Error(`Esquema no permitido para descargar la grabación: ${destino.protocol}`);
  }

  const host = destino.hostname.toLowerCase();
  const esIpPrivada =
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host === "[::1]" ||
    host.startsWith("[fd") ||
    host.startsWith("[fe80");
  if (esIpPrivada) {
    throw new Error(`Destino no permitido para descargar la grabación: ${host}`);
  }

  return destino;
}

async function downloadRecording(url: string): Promise<{
  stream: Readable;
  contentType: string;
  contentLength?: number;
}> {
  // Seguimos los redirects a mano porque las URLs de Retell y Telnyx suelen
  // saltar a un bucket firmado: cada salto tiene que pasar el mismo filtro,
  // o un 302 hacia una IP interna anularía la comprobación inicial.
  let destino = assertDescargaPermitida(url);
  let response = await fetch(destino, {
    redirect: "manual",
    signal: AbortSignal.timeout(RECORDING_DOWNLOAD_TIMEOUT_MS),
  });
  for (let salto = 0; salto < MAX_RECORDING_REDIRECTS && esRedirect(response); salto += 1) {
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("La descarga de la grabación devolvió un redirect sin destino");
    }
    destino = assertDescargaPermitida(new URL(location, destino).toString());
    response = await fetch(destino, {
      redirect: "manual",
      signal: AbortSignal.timeout(RECORDING_DOWNLOAD_TIMEOUT_MS),
    });
  }
  if (esRedirect(response)) {
    throw new Error("La descarga de la grabación encadenó demasiados redirects");
  }
  if (!response.ok) {
    throw new Error(`Failed to download recording: ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error("Recording download returned an empty body");
  }

  const declaredLength = Number(response.headers.get("content-length"));
  const hasDeclaredLength = Number.isFinite(declaredLength) && declaredLength > 0;
  if (hasDeclaredLength && declaredLength > MAX_RECORDING_BYTES) {
    throw new Error("Recording exceeds the maximum accepted size");
  }

  let downloadedBytes = 0;
  const sizeLimiter = new Transform({
    transform(chunk, _encoding, callback) {
      downloadedBytes += Buffer.byteLength(chunk);
      if (downloadedBytes > MAX_RECORDING_BYTES) {
        callback(new Error("Recording exceeds the maximum accepted size"));
        return;
      }
      callback(null, chunk);
    },
  });

  const source = Readable.fromWeb(response.body as import("stream/web").ReadableStream);
  return {
    stream: source.pipe(sizeLimiter),
    contentType: response.headers.get("content-type") || "audio/mpeg",
    // Sin esto, uploadRecording() no puede fijar ContentLength en el PUT a
    // R2 y la carga en streaming falla (ver storage.ts) — no se pasa
    // cuando el origen no declaró un content-length real.
    contentLength: hasDeclaredLength ? declaredLength : undefined,
  };
}
