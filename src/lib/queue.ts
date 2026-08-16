import { Queue, Worker } from "bullmq";
import { initRedis } from "./redis.js";

export interface ProcessRecordingJob {
  callId: string;
  vapiUrl: string;
  businessId: string;
}

export interface ClassifyCallJob {
  callId: string;
  businessId: string;
  transcriptText: string;
}

export type QueueJobs = ProcessRecordingJob | ClassifyCallJob;

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

export const classifyQueue = new Queue<ClassifyCallJob, void, string>("classify-call", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
  },
});

export async function initializeQueues(): Promise<void> {
  console.log("[Queue] Queues initialized");
}

export async function closeQueues(): Promise<void> {
  await recordingQueue.close();
  await classifyQueue.close();
  console.log("[Queue] Queues closed");
}
