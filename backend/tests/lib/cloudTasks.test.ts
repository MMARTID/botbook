import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockCreateTask, mockQueuePath } = vi.hoisted(() => ({
  mockCreateTask: vi.fn().mockResolvedValue([{}]),
  mockQueuePath: vi.fn(
    (project: string, location: string, queue: string) =>
      `projects/${project}/locations/${location}/queues/${queue}`
  ),
}));

vi.mock("@google-cloud/tasks", () => ({
  CloudTasksClient: vi.fn(function CloudTasksClientMock() {
    return { createTask: mockCreateTask, queuePath: mockQueuePath };
  }),
}));

const { mockProcessRecordingJob, mockProcessRetryFailedBookingJob, mockProcessSendEmailJob } = vi.hoisted(() => ({
  mockProcessRecordingJob: vi.fn().mockResolvedValue(undefined),
  mockProcessRetryFailedBookingJob: vi.fn().mockResolvedValue(undefined),
  mockProcessSendEmailJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/jobs/processRecording.js", () => ({ processRecordingJob: mockProcessRecordingJob }));
vi.mock("../../src/jobs/retryFailedBooking.js", () => ({
  processRetryFailedBookingJob: mockProcessRetryFailedBookingJob,
}));
vi.mock("../../src/jobs/sendEmail.js", () => ({ processSendEmailJob: mockProcessSendEmailJob }));

const ORIGINAL_ENV = { ...process.env };

const recordingPayload = { callId: "call_1", vapiUrl: "https://vapi.example/rec.mp3", businessId: "biz_1" };
const bookingPayload = { leadId: "lead_1" };
const emailPayload = {
  fromAlias: "welcome" as const,
  toAddress: "cliente@example.com",
  subject: "Bienvenido",
  html: "<p>hola</p>",
};

describe("cloudTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  describe("fuera de producción", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "test";
    });

    it("ejecuta el job de grabación en línea sin usar Cloud Tasks", async () => {
      const { enqueueRecordingJob } = await import("../../src/lib/cloudTasks.js");

      await enqueueRecordingJob(recordingPayload);

      expect(mockProcessRecordingJob).toHaveBeenCalledWith(recordingPayload);
      expect(mockCreateTask).not.toHaveBeenCalled();
    });

    it("ejecuta el job de reintento de reserva en línea", async () => {
      const { enqueueRetryBookingJob } = await import("../../src/lib/cloudTasks.js");

      await enqueueRetryBookingJob(bookingPayload);

      expect(mockProcessRetryFailedBookingJob).toHaveBeenCalledWith(bookingPayload);
      expect(mockCreateTask).not.toHaveBeenCalled();
    });

    it("ejecuta el job de email en línea", async () => {
      const { enqueueEmailJob } = await import("../../src/lib/cloudTasks.js");

      await enqueueEmailJob(emailPayload);

      expect(mockProcessSendEmailJob).toHaveBeenCalledWith(emailPayload);
      expect(mockCreateTask).not.toHaveBeenCalled();
    });
  });

  describe("en producción", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production";
      process.env.GCP_PROJECT_ID = "project_test";
      process.env.GCP_REGION = "europe-west1";
      process.env.INTERNAL_JOBS_BASE_URL = "https://api.alhabla.ai/";
      process.env.CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT = "invoker@test.iam.gserviceaccount.com";
    });

    it("crea una tarea de Cloud Tasks en vez de ejecutar el job en línea", async () => {
      const { enqueueRecordingJob } = await import("../../src/lib/cloudTasks.js");

      await enqueueRecordingJob(recordingPayload);

      expect(mockProcessRecordingJob).not.toHaveBeenCalled();
      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          parent: "projects/project_test/locations/europe-west1/queues/process-recording",
          task: expect.objectContaining({
            httpRequest: expect.objectContaining({
              httpMethod: "POST",
              // La barra final de INTERNAL_JOBS_BASE_URL se recorta al construir la URL.
              url: "https://api.alhabla.ai/internal/jobs/process-recording",
              oidcToken: {
                serviceAccountEmail: "invoker@test.iam.gserviceaccount.com",
                audience: "https://api.alhabla.ai",
              },
            }),
          }),
        })
      );
    });

    it("codifica el payload en base64 en el body de la tarea", async () => {
      const { enqueueEmailJob } = await import("../../src/lib/cloudTasks.js");

      await enqueueEmailJob(emailPayload);

      const call = mockCreateTask.mock.calls[0][0];
      const decodedBody = JSON.parse(Buffer.from(call.task.httpRequest.body, "base64").toString());
      expect(decodedBody).toEqual(emailPayload);
    });

    it("usa taskId como nombre de tarea si se proporciona, para deduplicar", async () => {
      const { enqueueRetryBookingJob } = await import("../../src/lib/cloudTasks.js");

      await enqueueRetryBookingJob(bookingPayload, "dedupe-key-1");

      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          task: expect.objectContaining({
            name: "projects/project_test/locations/europe-west1/queues/retry-failed-booking/tasks/dedupe-key-1",
          }),
        })
      );
    });

    it("no pone nombre de tarea si no se proporciona taskId", async () => {
      const { enqueueRetryBookingJob } = await import("../../src/lib/cloudTasks.js");

      await enqueueRetryBookingJob(bookingPayload);

      expect(mockCreateTask).toHaveBeenCalledWith(
        expect.objectContaining({ task: expect.objectContaining({ name: undefined }) })
      );
    });

    it("lanza si falta una variable de entorno requerida, en vez de encolar a medias", async () => {
      delete process.env.GCP_PROJECT_ID;
      const { enqueueRecordingJob } = await import("../../src/lib/cloudTasks.js");

      await expect(enqueueRecordingJob(recordingPayload)).rejects.toThrow("GCP_PROJECT_ID is not configured");
      expect(mockCreateTask).not.toHaveBeenCalled();
    });
  });
});
