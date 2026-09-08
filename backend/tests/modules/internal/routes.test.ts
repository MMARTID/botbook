import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { internalJobsRoutes } from "../../../src/modules/internal/routes.js";
import { processRecordingJob } from "../../../src/jobs/processRecording.js";
import { processRetryFailedBookingJob } from "../../../src/jobs/retryFailedBooking.js";
import { processSendEmailJob } from "../../../src/jobs/sendEmail.js";
import { processSendSmsJob } from "../../../src/jobs/sendSms.js";
import { cleanupZombieCallsJob } from "../../../src/jobs/cleanupZombieCalls.js";
import { retryStuckRecordingsJob } from "../../../src/jobs/retryStuckRecordings.js";
import { suspendOverdueCallsJob } from "../../../src/jobs/suspendOverdueCalls.js";

vi.mock("../../../src/jobs/processRecording.js", () => ({ processRecordingJob: vi.fn() }));
vi.mock("../../../src/jobs/retryFailedBooking.js", () => ({ processRetryFailedBookingJob: vi.fn() }));
vi.mock("../../../src/jobs/sendEmail.js", () => ({ processSendEmailJob: vi.fn() }));
vi.mock("../../../src/jobs/sendSms.js", () => ({ processSendSmsJob: vi.fn() }));
vi.mock("../../../src/jobs/cleanupZombieCalls.js", () => ({ cleanupZombieCallsJob: vi.fn() }));
vi.mock("../../../src/jobs/retryStuckRecordings.js", () => ({ retryStuckRecordingsJob: vi.fn() }));
vi.mock("../../../src/jobs/suspendOverdueCalls.js", () => ({ suspendOverdueCallsJob: vi.fn() }));

const mockedProcessRecordingJob = vi.mocked(processRecordingJob);
const mockedProcessRetryFailedBookingJob = vi.mocked(processRetryFailedBookingJob);
const mockedProcessSendEmailJob = vi.mocked(processSendEmailJob);
const mockedProcessSendSmsJob = vi.mocked(processSendSmsJob);
const mockedCleanupZombieCallsJob = vi.mocked(cleanupZombieCallsJob);
const mockedRetryStuckRecordingsJob = vi.mocked(retryStuckRecordingsJob);
const mockedSuspendOverdueCallsJob = vi.mocked(suspendOverdueCallsJob);

describe("internalJobsRoutes", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = Fastify();
    // La autenticación OIDC (verifyCloudTasks) se prueba aparte en
    // tests/plugins/internalAuth.test.ts — aquí se deja pasar siempre para
    // aislar la validación y el despacho a cada job.
    fastify.decorate("verifyCloudTasks", async () => {});
    await fastify.register(internalJobsRoutes);
  });

  describe("POST /jobs/process-recording", () => {
    const validPayload = { callId: "call_1", vapiUrl: "https://vapi.example/rec.mp3", businessId: "biz_1" };

    it("valida el body y despacha el job", async () => {
      mockedProcessRecordingJob.mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/process-recording",
        payload: validPayload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ received: true });
      expect(mockedProcessRecordingJob).toHaveBeenCalledWith(validPayload);
    });

    it("devuelve 400 si el body no cumple el schema", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/process-recording",
        payload: { callId: "call_1" },
      });

      expect(response.statusCode).toBe(400);
      expect(mockedProcessRecordingJob).not.toHaveBeenCalled();
    });

    it("devuelve 500 si el job falla (para que Cloud Tasks reintente)", async () => {
      mockedProcessRecordingJob.mockRejectedValue(new Error("R2 caído"));

      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/process-recording",
        payload: validPayload,
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: "Job processing failed" });
    });
  });

  describe("POST /jobs/retry-failed-booking", () => {
    it("valida el body y despacha el job", async () => {
      mockedProcessRetryFailedBookingJob.mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/retry-failed-booking",
        payload: { leadId: "lead_1" },
      });

      expect(response.statusCode).toBe(200);
      expect(mockedProcessRetryFailedBookingJob).toHaveBeenCalledWith({ leadId: "lead_1" });
    });

    it("devuelve 500 si el calendario sigue desconectado (reintento pendiente)", async () => {
      mockedProcessRetryFailedBookingJob.mockRejectedValue(new Error("Calendario todavía desconectado"));

      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/retry-failed-booking",
        payload: { leadId: "lead_1" },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe("POST /jobs/send-email", () => {
    const validPayload = {
      fromAlias: "welcome",
      toAddress: "cliente@example.com",
      subject: "Bienvenido",
      html: "<p>hola</p>",
    };

    it("valida el body y despacha el job", async () => {
      mockedProcessSendEmailJob.mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/send-email",
        payload: validPayload,
      });

      expect(response.statusCode).toBe(200);
      expect(mockedProcessSendEmailJob).toHaveBeenCalledWith(validPayload);
    });

    it("devuelve 400 si toAddress no es un email válido", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/send-email",
        payload: { ...validPayload, toAddress: "no-es-un-email" },
      });

      expect(response.statusCode).toBe(400);
      expect(mockedProcessSendEmailJob).not.toHaveBeenCalled();
    });

    it("devuelve 400 si fromAlias no es welcome ni support", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/send-email",
        payload: { ...validPayload, fromAlias: "billing" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /jobs/send-sms", () => {
    const validPayload = {
      fromNumber: "+34911222333",
      toNumber: "+34600111222",
      text: "Nueva reserva — María — Corte — vie 12:00",
    };

    it("valida el body y despacha el job", async () => {
      mockedProcessSendSmsJob.mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/send-sms",
        payload: validPayload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ received: true });
      expect(mockedProcessSendSmsJob).toHaveBeenCalledWith(validPayload);
    });

    it("devuelve 400 si falta algún campo obligatorio", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/send-sms",
        payload: { fromNumber: "+34911222333", toNumber: "+34600111222" },
      });

      expect(response.statusCode).toBe(400);
      expect(mockedProcessSendSmsJob).not.toHaveBeenCalled();
    });

    it("devuelve 500 si el job falla (para que Cloud Tasks reintente)", async () => {
      mockedProcessSendSmsJob.mockRejectedValue(new Error("Telnyx no responde"));

      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/send-sms",
        payload: validPayload,
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: "Job processing failed" });
    });
  });

  describe("POST /jobs/cleanup-zombie-calls", () => {
    it("despacha el job sin necesitar body", async () => {
      mockedCleanupZombieCallsJob.mockResolvedValue(undefined);

      const response = await fastify.inject({ method: "POST", url: "/jobs/cleanup-zombie-calls" });

      expect(response.statusCode).toBe(200);
      expect(mockedCleanupZombieCallsJob).toHaveBeenCalled();
    });

    it("devuelve 500 si el job falla", async () => {
      mockedCleanupZombieCallsJob.mockRejectedValue(new Error("DB caída"));

      const response = await fastify.inject({ method: "POST", url: "/jobs/cleanup-zombie-calls" });

      expect(response.statusCode).toBe(500);
    });
  });

  describe("POST /jobs/suspend-overdue-calls", () => {
    it("suspende los negocios cuyo plazo de impago venció", async () => {
      mockedSuspendOverdueCallsJob.mockResolvedValue(2);

      const response = await fastify.inject({ method: "POST", url: "/jobs/suspend-overdue-calls" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ received: true, suspendedBusinesses: 2 });
      expect(mockedSuspendOverdueCallsJob).toHaveBeenCalled();
    });

    it("devuelve 500 para que Cloud Scheduler lo reintente", async () => {
      mockedSuspendOverdueCallsJob.mockRejectedValue(new Error("DB caída"));

      const response = await fastify.inject({ method: "POST", url: "/jobs/suspend-overdue-calls" });

      expect(response.statusCode).toBe(500);
    });
  });

  describe("POST /jobs/retry-stuck-recordings (hallazgo #30 de la auditoría)", () => {
    it("despacha el job sin necesitar body", async () => {
      mockedRetryStuckRecordingsJob.mockResolvedValue(undefined);

      const response = await fastify.inject({ method: "POST", url: "/jobs/retry-stuck-recordings" });

      expect(response.statusCode).toBe(200);
      expect(mockedRetryStuckRecordingsJob).toHaveBeenCalled();
    });

    it("devuelve 500 si el job falla", async () => {
      mockedRetryStuckRecordingsJob.mockRejectedValue(new Error("DB caída"));

      const response = await fastify.inject({ method: "POST", url: "/jobs/retry-stuck-recordings" });

      expect(response.statusCode).toBe(500);
    });
  });
});
