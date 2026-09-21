import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { internalJobsRoutes } from "../../../src/modules/internal/routes.js";
import { processRecordingJob } from "../../../src/jobs/processRecording.js";
import { processRetryFailedBookingJob } from "../../../src/jobs/retryFailedBooking.js";
import { processSendEmailJob } from "../../../src/jobs/sendEmail.js";
import { processSendSmsJob } from "../../../src/jobs/sendSms.js";
import { processSendWhatsappJob } from "../../../src/jobs/sendWhatsapp.js";
import { cleanupZombieCallsJob } from "../../../src/jobs/cleanupZombieCalls.js";
import { recordarDesvioSinComprobarJob } from "../../../src/jobs/recordarDesvioSinComprobar.js";
import { retryStuckRecordingsJob } from "../../../src/jobs/retryStuckRecordings.js";
import { suspendOverdueCallsJob } from "../../../src/jobs/suspendOverdueCalls.js";
import { attachUsagePricesJob } from "../../../src/jobs/attachUsagePrices.js";
import { retryUsageReportsJob } from "../../../src/jobs/retryUsageReports.js";

vi.mock("../../../src/jobs/processRecording.js", () => ({
  processRecordingJob: vi.fn(),
}));
vi.mock("../../../src/jobs/retryFailedBooking.js", () => ({
  processRetryFailedBookingJob: vi.fn(),
}));
vi.mock("../../../src/jobs/sendEmail.js", () => ({
  processSendEmailJob: vi.fn(),
}));
vi.mock("../../../src/jobs/sendSms.js", () => ({ processSendSmsJob: vi.fn() }));
vi.mock("../../../src/jobs/sendWhatsapp.js", () => ({
  processSendWhatsappJob: vi.fn(),
}));
vi.mock("../../../src/jobs/cleanupZombieCalls.js", () => ({
  cleanupZombieCallsJob: vi.fn(),
}));
vi.mock("../../../src/jobs/recordarDesvioSinComprobar.js", () => ({
  recordarDesvioSinComprobarJob: vi.fn(),
}));
vi.mock("../../../src/jobs/retryStuckRecordings.js", () => ({
  retryStuckRecordingsJob: vi.fn(),
}));
vi.mock("../../../src/jobs/suspendOverdueCalls.js", () => ({
  suspendOverdueCallsJob: vi.fn(),
}));
vi.mock("../../../src/jobs/attachUsagePrices.js", () => ({
  attachUsagePricesJob: vi.fn(),
}));
vi.mock("../../../src/jobs/retryUsageReports.js", () => ({
  retryUsageReportsJob: vi.fn(),
}));

const mockedProcessRecordingJob = vi.mocked(processRecordingJob);
const mockedProcessRetryFailedBookingJob = vi.mocked(
  processRetryFailedBookingJob
);
const mockedProcessSendEmailJob = vi.mocked(processSendEmailJob);
const mockedProcessSendSmsJob = vi.mocked(processSendSmsJob);
const mockedProcessSendWhatsappJob = vi.mocked(processSendWhatsappJob);
const mockedCleanupZombieCallsJob = vi.mocked(cleanupZombieCallsJob);
const mockedRecordarDesvioJob = vi.mocked(recordarDesvioSinComprobarJob);
const mockedRetryStuckRecordingsJob = vi.mocked(retryStuckRecordingsJob);
const mockedSuspendOverdueCallsJob = vi.mocked(suspendOverdueCallsJob);
const mockedAttachUsagePricesJob = vi.mocked(attachUsagePricesJob);
const mockedRetryUsageReportsJob = vi.mocked(retryUsageReportsJob);

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

  describe("POST /jobs/send-whatsapp", () => {
    it("send-whatsapp acepta la forma legada y la forma por propósito (con sinV2 y saltos opcionales), y rechaza (400) un propósito sin bookingId+programedAtMs o sin leadId", async () => {
      mockedProcessSendWhatsappJob.mockResolvedValue(undefined);

      const legado = {
        toNumber: "+34600111222",
        templateName: "confirmacion_cita",
        languageCode: "es",
        bodyParams: { negocio_nombre: "Peluquería Ana" },
        idempotencyKey: "k1",
        businessId: "biz_1",
        audience: "client",
      };
      let response = await fastify.inject({
        method: "POST",
        url: "/jobs/send-whatsapp",
        payload: legado,
      });
      expect(response.statusCode).toBe(200);
      expect(mockedProcessSendWhatsappJob).toHaveBeenLastCalledWith(legado);

      const porProposito = {
        proposito: "confirmacion",
        bookingId: "booking_1",
        programedAtMs: 1_800_000_000_000,
        toNumber: "+34600111222",
        businessId: "biz_1",
        idempotencyKey: "booking-booking_1-confirmacion-1800000000",
        sinV2: true,
      };
      response = await fastify.inject({
        method: "POST",
        url: "/jobs/send-whatsapp",
        payload: porProposito,
      });
      expect(response.statusCode).toBe(200);
      expect(mockedProcessSendWhatsappJob).toHaveBeenLastCalledWith({
        ...porProposito,
        audience: "client",
      });

      response = await fastify.inject({
        method: "POST",
        url: "/jobs/send-whatsapp",
        payload: {
          proposito: "recordatorio",
          bookingId: "booking_1",
          programedAtMs: 1_800_000_000_000,
          toNumber: "+34600111222",
          businessId: "biz_1",
          saltos: 3,
        },
      });
      expect(response.statusCode).toBe(200);

      response = await fastify.inject({
        method: "POST",
        url: "/jobs/send-whatsapp",
        payload: {
          proposito: "hueco_libre",
          leadId: "lead_1",
          toNumber: "+34600111222",
          businessId: "biz_1",
        },
      });
      expect(response.statusCode).toBe(200);

      // Sin bookingId+programedAtMs / sin leadId: 400.
      response = await fastify.inject({
        method: "POST",
        url: "/jobs/send-whatsapp",
        payload: {
          proposito: "confirmacion",
          bookingId: "booking_1",
          toNumber: "+34600111222",
          businessId: "biz_1",
        },
      });
      expect(response.statusCode).toBe(400);
      response = await fastify.inject({
        method: "POST",
        url: "/jobs/send-whatsapp",
        payload: {
          proposito: "hueco_libre",
          toNumber: "+34600111222",
          businessId: "biz_1",
        },
      });
      expect(response.statusCode).toBe(400);
      expect(mockedProcessSendWhatsappJob).toHaveBeenCalledTimes(4);
    });
  });

  describe("POST /jobs/process-recording", () => {
    const validPayload = {
      callId: "call_1",
      externalUrl: "https://vapi.example/rec.mp3",
      businessId: "biz_1",
    };

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
      expect(mockedProcessRetryFailedBookingJob).toHaveBeenCalledWith({
        leadId: "lead_1",
      });
    });

    it("devuelve 500 si el calendario sigue desconectado (reintento pendiente)", async () => {
      mockedProcessRetryFailedBookingJob.mockRejectedValue(
        new Error("Calendario todavía desconectado")
      );

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
      mockedProcessSendSmsJob.mockRejectedValue(
        new Error("Telnyx no responde")
      );

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

      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/cleanup-zombie-calls",
      });

      expect(response.statusCode).toBe(200);
      expect(mockedCleanupZombieCallsJob).toHaveBeenCalled();
    });

    it("devuelve 500 si el job falla", async () => {
      mockedCleanupZombieCallsJob.mockRejectedValue(new Error("DB caída"));

      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/cleanup-zombie-calls",
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe("POST /jobs/recordar-desvio-sin-comprobar", () => {
    it("despacha el job sin body y devuelve el recuento", async () => {
      mockedRecordarDesvioJob.mockResolvedValue({ recordados: 1, omitidos: 2 });

      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/recordar-desvio-sin-comprobar",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        received: true,
        recordados: 1,
        omitidos: 2,
      });
      expect(mockedRecordarDesvioJob).toHaveBeenCalledTimes(1);
    });

    it("devuelve 500 si el job falla", async () => {
      mockedRecordarDesvioJob.mockRejectedValue(new Error("DB caída"));

      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/recordar-desvio-sin-comprobar",
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe("POST /jobs/suspend-overdue-calls", () => {
    it("suspende los negocios cuyo plazo de impago venció", async () => {
      mockedSuspendOverdueCallsJob.mockResolvedValue(2);

      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/suspend-overdue-calls",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        received: true,
        suspendedBusinesses: 2,
      });
      expect(mockedSuspendOverdueCallsJob).toHaveBeenCalled();
    });

    it("devuelve 500 para que Cloud Scheduler lo reintente", async () => {
      mockedSuspendOverdueCallsJob.mockRejectedValue(new Error("DB caída"));

      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/suspend-overdue-calls",
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe("POST /jobs/attach-usage-prices", () => {
    it("añade precios medidos a suscripciones existentes", async () => {
      mockedAttachUsagePricesJob.mockResolvedValue(3);

      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/attach-usage-prices",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        received: true,
        attachedSubscriptions: 3,
      });
    });
  });

  describe("POST /jobs/retry-usage-reports", () => {
    it("recupera informes de consumo pendientes", async () => {
      mockedRetryUsageReportsJob.mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/retry-usage-reports",
      });

      expect(response.statusCode).toBe(200);
      expect(mockedRetryUsageReportsJob).toHaveBeenCalled();
    });
  });

  describe("POST /jobs/retry-stuck-recordings (hallazgo #30 de la auditoría)", () => {
    it("despacha el job sin necesitar body", async () => {
      mockedRetryStuckRecordingsJob.mockResolvedValue(undefined);

      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/retry-stuck-recordings",
      });

      expect(response.statusCode).toBe(200);
      expect(mockedRetryStuckRecordingsJob).toHaveBeenCalled();
    });

    it("devuelve 500 si el job falla", async () => {
      mockedRetryStuckRecordingsJob.mockRejectedValue(new Error("DB caída"));

      const response = await fastify.inject({
        method: "POST",
        url: "/jobs/retry-stuck-recordings",
      });

      expect(response.statusCode).toBe(500);
    });
  });
});

// El limitador global (server.ts, 100/min por IP, contador en Redis) es para
// el público. Cloud Tasks y Cloud Scheduler llaman desde un puñado de IPs de
// Google: el 2026-09-17, al drenar una cola atascada, process-recording
// devolvió 293 × 429 en tres minutos. Con cien correos del resumen semanal
// encolados a la vez habrían sido envíos perdidos tras cuatro reintentos.
describe("internalJobsRoutes — fuera del rate limit global", () => {
  it("las rutas internas no devuelven 429 aunque el limitador global esté al mínimo", async () => {
    const { default: rateLimit } = await import("@fastify/rate-limit");
    const app = Fastify();
    await app.register(rateLimit, { max: 1, timeWindow: "1 minute" });
    app.decorate("verifyCloudTasks", async () => {});
    // Ruta de control: con el mismo limitador, la segunda petición ya es 429.
    app.get("/publica", async () => ({ ok: true }));
    await app.register(internalJobsRoutes);
    mockedCleanupZombieCallsJob.mockResolvedValue(undefined);

    const publicas = [];
    for (let i = 0; i < 2; i += 1)
      publicas.push(
        (await app.inject({ method: "GET", url: "/publica" })).statusCode
      );
    const internas = [];
    for (let i = 0; i < 5; i += 1)
      internas.push(
        (
          await app.inject({
            method: "POST",
            url: "/jobs/cleanup-zombie-calls",
          })
        ).statusCode
      );

    expect(publicas).toEqual([200, 429]);
    expect(internas).toEqual([200, 200, 200, 200, 200]);
  });
});
