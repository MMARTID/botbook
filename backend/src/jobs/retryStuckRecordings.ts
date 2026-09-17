import { prisma } from "../lib/prisma.js";
import { enqueueRecordingJob } from "../lib/cloudTasks.js";
import { errorMessage } from "../lib/logUtils.js";

// Margen antes de considerar una grabación "atascada": el procesamiento
// normal (Cloud Tasks -> processRecordingJob -> copia a R2) tarda segundos,
// no minutos — este umbral solo debe alcanzar a grabaciones cuyo primer
// intento realmente falló, no a una que sigue en curso.
const STUCK_RECORDING_THRESHOLD_MINUTES = 15;
const MAX_RECORDINGS_PER_RUN = 50;
// El mismo plazo que purgeOldRecordings: es lo que pedimos conservar a Retell
// y Telnyx, así que más allá no hay nada que descargar.
const RETENTION_DAYS = Number(process.env.RECORDING_RETENTION_DAYS || 30);

/**
 * Reintenta encolar el copiado a R2 de grabaciones que se quedaron sin
 * storageKey — el Recording ya se crea en la misma transacción que guarda la
 * llamada (handleCallEnded en webhookHandlers.ts), así que existe aunque el
 * enqueueRecordingJob posterior fallara (Cloud Tasks caído, permisos IAM mal
 * configurados, etc.). Sin este barrido periódico, ese fallo era definitivo:
 * la grabación se quedaba solo en Retell, sujeta a su propia ventana de
 * retención (dataStorageRetentionDays), sin ningún mecanismo que lo
 * recuperara (hallazgo #30 de la auditoría). Invocado cada 15 min por Cloud
 * Scheduler vía POST /internal/jobs/retry-stuck-recordings.
 */
export async function retryStuckRecordingsJob(): Promise<void> {
  console.log("[Recordings] Buscando grabaciones atascadas sin copiar a R2...");

  const threshold = new Date(
    Date.now() - STUCK_RECORDING_THRESHOLD_MINUTES * 60 * 1000
  );

  // Lo que supera la retención del proveedor ya no está ni en Telnyx ni en
  // Retell: reencolarlo solo produce 403 cada 15 minutos hasta el fin de los
  // tiempos. Se marca como irrecuperable con motivo y sale del barrido.
  const limiteRetencion = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const caducadas = await prisma.recording.updateMany({
    where: {
      storageKey: null,
      deletedAt: null,
      processingFailedAt: null,
      createdAt: { lt: limiteRetencion },
    },
    data: {
      processingFailedAt: new Date(),
      processingError: `Sin copiar a R2 pasados ${RETENTION_DAYS} días: el proveedor ya no conserva el audio`,
    },
  });
  if (caducadas.count > 0) {
    console.warn(
      `[Recordings] ${caducadas.count} grabación(es) superaban la retención sin copiarse; marcadas como irrecuperables.`
    );
  }

  const stuckRecordings = await prisma.recording.findMany({
    where: {
      storageKey: null,
      deletedAt: null,
      // Las irrecuperables (proveedor sin audio, ver processRecording.ts) no
      // vuelven a la cola: ya se intentó pedir una URL nueva y no la hubo.
      processingFailedAt: null,
      createdAt: { lt: threshold },
    },
    select: {
      id: true,
      callId: true,
      externalUrl: true,
      call: { select: { businessId: true } },
    },
    take: MAX_RECORDINGS_PER_RUN,
  });

  if (stuckRecordings.length === 0) {
    console.log("[Recordings] No hay grabaciones atascadas.");
    return;
  }

  console.log(
    `[Recordings] Reintentando ${stuckRecordings.length} grabaciones atascadas...`
  );

  let succeeded = 0;
  for (const recording of stuckRecordings) {
    try {
      // Sin taskId (a diferencia del intento original en webhookHandlers.ts,
      // que usa `process-recording-${callId}`): Cloud Tasks rechaza con
      // ALREADY_EXISTS un nombre de tarea reutilizado hasta ~1h después de
      // que la tarea anterior corriera — precisamente el caso que este job
      // existe para reintentar (una tarea que YA corrió pero no dejó
      // storageKey). Con el mismo nombre, este reintento fallaría siempre
      // en el escenario que pretende arreglar. Sin taskId, Cloud Tasks
      // genera uno propio y no hay colisión.
      await enqueueRecordingJob({
        callId: recording.callId,
        externalUrl: recording.externalUrl,
        businessId: recording.call.businessId,
      });
      succeeded++;
    } catch (err) {
      console.error(
        `[Recordings] No se pudo reintentar la grabación ${recording.id} (call ${recording.callId}): ${errorMessage(err)}`
      );
    }
  }

  console.log(
    `[Recordings] Reintento completado: ${succeeded}/${stuckRecordings.length} encoladas.`
  );
}
