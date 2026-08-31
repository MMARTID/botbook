  import { Worker, Job } from "bullmq";
  import { Readable } from "stream";
  import { prisma } from "../lib/prisma.js";
  import { uploadRecording } from "../lib/storage.js";
  import { ProcessRecordingJob } from "../lib/queue.js";
  import { getRedis } from "../lib/redis.js";

  /**
   * Job processor: Download recording from Vapi and upload to R2/S3
   */
  export async function processRecordingWorker() {
    const redisConnection = getRedis();

    const worker = new Worker<ProcessRecordingJob, unknown, string>(
      "process-recording",
      async (job: Job<ProcessRecordingJob>) => {
        console.log(`[Job] Processing recording for call ${job.data.callId}`);

        try {
          const { callId, vapiUrl, businessId } = job.data;

          // Verify call exists
          const call = await prisma.call.findUnique({
            where: { id: callId },
          });

          if (!call) {
            throw new Error(`Call ${callId} not found`);
          }

          // Download recording from Vapi
          console.log(`[Job] Downloading recording from: ${vapiUrl}`);
          const recordingBuffer = await downloadFromVapi(vapiUrl);

          // Generate storage key based on business ID and call ID
          const storageKey = `recordings/${businessId}/${callId}.mp3`;
          console.log(`[Job] Uploading to storage with key: ${storageKey}`);

          // Convert buffer to readable stream
          const recordingStream = Readable.from(recordingBuffer);

          // Upload to R2/S3
          const storageUrl = await uploadRecording(storageKey, recordingStream);

          // Update recording in database
          await prisma.recording.update({
            where: { callId: callId },
            data: {
              storageKey,
              storageUrl,
            },
          });

          console.log(`[Job] Recording successfully processed for call ${callId}`);
          return { success: true, callId, storageKey, storageUrl };
        } catch (error) {
          console.error(`[Job] Error processing recording for call ${job.data.callId}:`, error);
          throw error;
        }
      },
      {
        connection: redisConnection as any,
        concurrency: 3,
      }
    );

    worker.on("completed", (job) => {
      console.log(`[Job] Recording job completed: ${job.id}`);
    });

    worker.on("failed", (job, error) => {
      console.error(`[Job] Recording job failed: ${job?.id}`, error);
    });

    return worker;
  }

  /**
   * Helper function to download recording from Vapi URL
   */
  async function downloadFromVapi(url: string): Promise<Buffer> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download recording: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
