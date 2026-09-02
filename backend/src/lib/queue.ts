import { Queue, Worker } from "bullmq";
import { initRedis } from "./redis.js";

export interface ProcessRecordingJob {
  callId: string;
  vapiUrl: string;
  businessId: string;
}

export interface RetryFailedBookingJob {
  leadId: string;
}

// Get IORedis connection for BullMQ
const redisConnection = initRedis() as any;

export const recordingQueue = new Queue<ProcessRecordingJob, void, string>(
  "process-recording",
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: true,
    },
  }
);

// Reintenta en segundo plano una reserva que falló durante la llamada (ver
// capturePendingBookingLead en voiceTools/service.ts). El cliente ya colgó,
// así que un backoff de unos minutos es aceptable: no hay nadie esperando.
export const retryBookingQueue = new Queue<RetryFailedBookingJob, void, string>(
  "retry-failed-booking",
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 4,
      backoff: {
        type: "exponential",
        delay: 30000,
      },
      removeOnComplete: true,
      removeOnFail: 1000,
    },
  }
);

export async function initializeQueues(): Promise<void> {
  console.log("[Queue] Queues initialized");
}

export async function closeQueues(): Promise<void> {
  await recordingQueue.close();
  await retryBookingQueue.close();
  console.log("[Queue] Queues closed");
}
