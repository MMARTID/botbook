import { Readable } from "stream";
import { prisma } from "../lib/prisma.js";
import { uploadRecording } from "../lib/storage.js";
import { ProcessRecordingJob } from "../lib/jobTypes.js";

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
    const recordingBuffer = await downloadFromVapi(vapiUrl);

    const storageKey = `recordings/${businessId}/${callId}.mp3`;
    console.log(`[Job] Uploading to storage with key: ${storageKey}`);

    const recordingStream = Readable.from(recordingBuffer);
    const storageUrl = await uploadRecording(storageKey, recordingStream);

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

async function downloadFromVapi(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download recording: ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
