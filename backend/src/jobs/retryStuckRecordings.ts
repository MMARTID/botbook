import { prisma } from "../lib/prisma.js";
import { enqueueRecordingJob } from "../lib/cloudTasks.js";
import { errorMessage } from "../lib/logUtils.js";

// Margen antes de considerar una grabación "atascada": el procesamiento
// normal (Cloud Tasks -> processRecordingJob -> copia a R2) tarda segundos,
// no minutos — este umbral solo debe alcanzar a grabaciones cuyo primer
// intento realmente falló, no a una que sigue en curso.
const STUCK_RECORDING_THRESHOLD_MINUTES = 15;
const MAX_RECORDINGS_PER_RUN = 50;

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

  const stuckRecordings = await prisma.recording.findMany({
    where: {
      storageKey: null,
      createdAt: { lt: threshold },
    },
    select: {
      id: true,
      callId: true,
      vapiUrl: true,
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
      await enqueueRecordingJob(
        {
          callId: recording.callId,
          vapiUrl: recording.vapiUrl,
          businessId: recording.call.businessId,
        },
        `process-recording-${recording.callId}`
      );
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
