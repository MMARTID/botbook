import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { processRecordingJob } from "../../jobs/processRecording.js";
import { processRetryFailedBookingJob } from "../../jobs/retryFailedBooking.js";
import { processSendEmailJob } from "../../jobs/sendEmail.js";
import { processSendSmsJob } from "../../jobs/sendSms.js";
import { cleanupZombieCallsJob } from "../../jobs/cleanupZombieCalls.js";
import { telnyxHealthCheckJob } from "../../jobs/telnyxHealthCheck.js";
import { telnyxReconcilerJob } from "../../jobs/telnyxReconciler.js";
import { retryStuckRecordingsJob } from "../../jobs/retryStuckRecordings.js";
import { suspendOverdueCallsJob } from "../../jobs/suspendOverdueCalls.js";
import { processUsageReportJob } from "../../jobs/processUsageReport.js";
import { attachUsagePricesJob } from "../../jobs/attachUsagePrices.js";
import { retryUsageReportsJob } from "../../jobs/retryUsageReports.js";
import { E164_PHONE_REGEX } from "../../lib/phone.js";

const ProcessRecordingSchema = z.object({
  callId: z.string(),
  vapiUrl: z.string(),
  businessId: z.string(),
});

const RetryFailedBookingSchema = z.object({
  leadId: z.string(),
});
const ReportUsageSchema = z.object({ businessId: z.string() });

const SendEmailSchema = z.object({
  fromAlias: z.enum(["welcome", "support"]),
  toAddress: z.string().email(),
  subject: z.string(),
  html: z.string(),
});

const SendSmsSchema = z.object({
  // Mismo regex que UpdateBusinessSchema.phone (businesses/routes.ts) — este
  // endpoint es el punto real de envío a Telnyx, así que es donde más
  // importa no dejar pasar un número mal formateado, no solo en el punto de
  // entrada donde el negocio edita su teléfono.
  fromNumber: z.string().regex(E164_PHONE_REGEX),
  toNumber: z.string().regex(E164_PHONE_REGEX),
  text: z.string(),
});

// Endpoints invocados por Cloud Tasks/Cloud Scheduler (no por negocios ni
// desde el frontend) — ver plugins/internalAuth.ts para la verificación del
// token OIDC. Cloud Tasks reintenta automáticamente cualquier respuesta que
// no sea 2xx, según la configuración de reintentos de cada cola.
export const internalJobsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/jobs/process-recording",
    { preValidation: [fastify.verifyCloudTasks] },
    async (request, reply) => {
      try {
        const data = ProcessRecordingSchema.parse(request.body);
        await processRecordingJob(data);
        return reply.send({ received: true });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        fastify.log.error({ err: error }, "process-recording job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/retry-failed-booking",
    { preValidation: [fastify.verifyCloudTasks] },
    async (request, reply) => {
      try {
        const data = RetryFailedBookingSchema.parse(request.body);
        await processRetryFailedBookingJob(data);
        return reply.send({ received: true });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        fastify.log.error({ err: error }, "retry-failed-booking job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/send-email",
    { preValidation: [fastify.verifyCloudTasks] },
    async (request, reply) => {
      try {
        const data = SendEmailSchema.parse(request.body);
        await processSendEmailJob(data);
        return reply.send({ received: true });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        fastify.log.error({ err: error }, "send-email job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/send-sms",
    { preValidation: [fastify.verifyCloudTasks] },
    async (request, reply) => {
      try {
        const data = SendSmsSchema.parse(request.body);
        await processSendSmsJob(data);
        return reply.send({ received: true });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        fastify.log.error({ err: error }, "send-sms job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/cleanup-zombie-calls",
    { preValidation: [fastify.verifyCloudTasks] },
    async (_request, reply) => {
      try {
        await cleanupZombieCallsJob();
        return reply.send({ received: true });
      } catch (error) {
        fastify.log.error({ err: error }, "cleanup-zombie-calls job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  // Cada 2 minutos (Cloud Scheduler) — plan Telnyx-orquestador §7. Inerte
  // por defecto: VOICE_FAILOVER_ENABLED=off y ningún negocio tiene
  // orchestrator="telnyx" todavía (eso es la Fase 5, deliberadamente sin
  // ejecutar).
  fastify.post(
    "/jobs/telnyx-health-check",
    { preValidation: [fastify.verifyCloudTasks] },
    async (_request, reply) => {
      try {
        await telnyxHealthCheckJob();
        return reply.send({ received: true });
      } catch (error) {
        fastify.log.error({ err: error }, "telnyx-health-check job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  // Una vez al día (Cloud Scheduler) — plan Telnyx-orquestador §6.
  // Resincroniza cualquier agente con telnyxSyncError pendiente y avisa por
  // email (TELNYX_ALERT_EMAIL) de assistants borrados a mano en Telnyx o de
  // un enrutamiento inconsistente. No mueve tráfico ni cambia connection_id
  // de ningún negocio — eso sigue siendo cosa de telnyx-health-check/Fase 5.
  fastify.post(
    "/jobs/telnyx-reconciler",
    { preValidation: [fastify.verifyCloudTasks] },
    async (_request, reply) => {
      try {
        const result = await telnyxReconcilerJob();
        return reply.send({ received: true, result });
      } catch (error) {
        fastify.log.error({ err: error }, "telnyx-reconciler job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/report-usage",
    { preValidation: [fastify.verifyCloudTasks] },
    async (request, reply) => {
      try {
        await processUsageReportJob(ReportUsageSchema.parse(request.body));
        return reply.send({ received: true });
      } catch (error) {
        if (error instanceof z.ZodError) return reply.status(400).send({ error: error.errors });
        fastify.log.error({ err: error }, "report-usage job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/attach-usage-prices",
    { preValidation: [fastify.verifyCloudTasks] },
    async (_request, reply) => {
      try {
        const attachedSubscriptions = await attachUsagePricesJob();
        return reply.send({ received: true, attachedSubscriptions });
      } catch (error) {
        fastify.log.error({ err: error }, "attach-usage-prices job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/retry-usage-reports",
    { preValidation: [fastify.verifyCloudTasks] },
    async (_request, reply) => {
      try {
        await retryUsageReportsJob();
        return reply.send({ received: true });
      } catch (error) {
        fastify.log.error({ err: error }, "retry-usage-reports job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/suspend-overdue-calls",
    { preValidation: [fastify.verifyCloudTasks] },
    async (_request, reply) => {
      try {
        const suspendedBusinesses = await suspendOverdueCallsJob();
        return reply.send({ received: true, suspendedBusinesses });
      } catch (error) {
        fastify.log.error({ err: error }, "suspend-overdue-calls job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/retry-stuck-recordings",
    { preValidation: [fastify.verifyCloudTasks] },
    async (_request, reply) => {
      try {
        await retryStuckRecordingsJob();
        return reply.send({ received: true });
      } catch (error) {
        fastify.log.error({ err: error }, "retry-stuck-recordings job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );
};
