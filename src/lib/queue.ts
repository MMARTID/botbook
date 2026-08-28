import { Queue, Worker } from "bullmq";
import { initRedis } from "./redis.js";

export interface ProcessRecordingJob {
  callId: string;
  vapiUrl: string;
  businessId: string;
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

export async function initializeQueues(): Promise<void> {
  console.log("[Queue] Queues initialized");
}

export async function closeQueues(): Promise<void> {
  await recordingQueue.close();
  console.log("[Queue] Queues closed");
}
