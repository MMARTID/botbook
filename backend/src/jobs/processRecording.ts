import { Readable, Transform } from "stream";
import { prisma } from "../lib/prisma.js";
import { uploadRecording } from "../lib/storage.js";
import { ProcessRecordingJob } from "../lib/jobTypes.js";

const RECORDING_DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
const MAX_RECORDING_BYTES = 200 * 1024 * 1024;

/**
 * Descarga la grabación desde Vapi/Retell y la sube a R2/S3. Invocado desde
 * POST /internal/jobs/process-recording (Cloud Tasks) o en línea en dev.
 */
export async function processRecordingJob(data: ProcessRecordingJob): Promise<void> {
  console.log(`[Job] Processing recording for call ${data.callId}`);

  try {
    const { callId, vapiUrl, businessId } = data;

    const call = await prisma.call.findUnique({ where: { id: callId } });
    if (!call) {
      throw new Error(`Call ${callId} not found`);
    }

    console.log(`[Job] Downloading recording from: ${vapiUrl}`);
    const recording = await downloadRecording(vapiUrl);

    const storageKey = `recordings/${businessId}/${callId}.mp3`;
    console.log(`[Job] Uploading to storage with key: ${storageKey}`);

    const storageUrl = await uploadRecording(
      storageKey,
      recording.stream,
      recording.contentType
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

async function downloadRecording(url: string): Promise<{
  stream: Readable;
  contentType: string;
}> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(RECORDING_DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Failed to download recording: ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error("Recording download returned an empty body");
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RECORDING_BYTES) {
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
  };
}
