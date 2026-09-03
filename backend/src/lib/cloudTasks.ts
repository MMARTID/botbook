import { CloudTasksClient } from "@google-cloud/tasks";
import { ProcessRecordingJob, RetryFailedBookingJob, SendEmailJob } from "./jobTypes.js";
import { processRecordingJob } from "../jobs/processRecording.js";
import { processRetryFailedBookingJob } from "../jobs/retryFailedBooking.js";
import { processSendEmailJob } from "../jobs/sendEmail.js";

// En producción, cada job se despacha como una tarea HTTP de Cloud Tasks
// contra POST /internal/jobs/<queue> en este mismo servicio (alhabla-api) —
// así Cloud Run solo asigna CPU mientras se procesa la petición, sin
// necesitar un servicio "worker" siempre encendido aparte.
//
// En dev/local no hay Cloud Tasks real disponible (ni sentido montarlo:
// necesitaría credenciales de GCP y una URL pública estable) — el job se
// ejecuta en línea, directamente, en el mismo proceso que lo encoló.
const IS_PRODUCTION = process.env.NODE_ENV === "production";

let tasksClient: CloudTasksClient | undefined;

function getTasksClient() {
  tasksClient ??= new CloudTasksClient();
  return tasksClient;
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

async function enqueueCloudTask(input: {
  queue: string;
  path: string;
  payload: unknown;
  taskId?: string;
}) {
  const projectId = requireEnv("GCP_PROJECT_ID");
  const location = requireEnv("GCP_REGION");
  const baseUrl = requireEnv("INTERNAL_JOBS_BASE_URL").replace(/\/$/, "");
  const serviceAccountEmail = requireEnv("CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT");

  const client = getTasksClient();
  const parent = client.queuePath(projectId, location, input.queue);
  const url = `${baseUrl}${input.path}`;

  await client.createTask({
    parent,
    task: {
      name: input.taskId ? `${parent}/tasks/${input.taskId}` : undefined,
      httpRequest: {
        httpMethod: "POST",
        url,
        headers: { "Content-Type": "application/json" },
        body: Buffer.from(JSON.stringify(input.payload)).toString("base64"),
        oidcToken: {
          serviceAccountEmail,
          audience: baseUrl,
        },
      },
    },
  });
}

export async function enqueueRecordingJob(payload: ProcessRecordingJob, taskId?: string): Promise<void> {
  if (!IS_PRODUCTION) {
    await processRecordingJob(payload);
    return;
  }
  await enqueueCloudTask({
    queue: "process-recording",
    path: "/internal/jobs/process-recording",
    payload,
    taskId,
  });
}

export async function enqueueRetryBookingJob(payload: RetryFailedBookingJob, taskId?: string): Promise<void> {
  if (!IS_PRODUCTION) {
    await processRetryFailedBookingJob(payload);
    return;
  }
  await enqueueCloudTask({
    queue: "retry-failed-booking",
    path: "/internal/jobs/retry-failed-booking",
    payload,
    taskId,
  });
}

export async function enqueueEmailJob(payload: SendEmailJob, taskId?: string): Promise<void> {
  if (!IS_PRODUCTION) {
    await processSendEmailJob(payload);
    return;
  }
  await enqueueCloudTask({
    queue: "send-email",
    path: "/internal/jobs/send-email",
    payload,
    taskId,
  });
}
