import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { PermanentJobError } from "../../lib/jobErrors.js";
import { processRecordingJob } from "../../jobs/processRecording.js";
import { processRetryFailedBookingJob } from "../../jobs/retryFailedBooking.js";
import { processSendEmailJob } from "../../jobs/sendEmail.js";
import { processSendSmsJob } from "../../jobs/sendSms.js";
import { processSendWhatsappJob } from "../../jobs/sendWhatsapp.js";
import { processRecordarRecadoJob } from "../../jobs/recordarRecado.js";
import { cleanupZombieCallsJob } from "../../jobs/cleanupZombieCalls.js";
import { recordarDesvioSinComprobarJob } from "../../jobs/recordarDesvioSinComprobar.js";
import { purgeOldRecordingsJob } from "../../jobs/purgeOldRecordings.js";
import { telnyxHealthCheckJob } from "../../jobs/telnyxHealthCheck.js";
import { telnyxReconcilerJob } from "../../jobs/telnyxReconciler.js";
import { retryStuckRecordingsJob } from "../../jobs/retryStuckRecordings.js";
import { suspendOverdueCallsJob } from "../../jobs/suspendOverdueCalls.js";
import { processUsageReportJob } from "../../jobs/processUsageReport.js";
import { attachUsagePricesJob } from "../../jobs/attachUsagePrices.js";
import { retryUsageReportsJob } from "../../jobs/retryUsageReports.js";
import { sendWeeklySummaryJob } from "../../jobs/sendWeeklySummary.js";
import { E164_PHONE_REGEX } from "../../lib/phone.js";

const ProcessRecordingSchema = z.object({
  callId: z.string(),
  externalUrl: z.string(),
  businessId: z.string(),
});

const RecordarRecadoSchema = z.object({
  leadId: z.string(),
  intento: z.number().int().min(1).max(10).optional(),
});

const RetryFailedBookingSchema = z.object({
  leadId: z.string(),
  attempt: z.number().int().min(0).optional(),
});
const ReportUsageSchema = z.object({ businessId: z.string() });

// `idempotencyKey` viaja en el payload de la tarea (enqueue*Job la añade a
// partir del taskId) y es lo que `reclamarEnvio` usa para que Cloud Tasks,
// que entrega al menos una vez, no mande dos veces el mismo mensaje. Sin
// declararla aquí, z.object la descartaba en silencio y la protección no
// existía en producción.
const idempotencyKey = z.string().optional();

const SendEmailSchema = z.object({
  fromAlias: z.enum(["welcome", "support"]),
  toAddress: z.string().email(),
  subject: z.string(),
  html: z.string(),
  idempotencyKey,
});

const SendSmsSchema = z.object({
  // Mismo regex que UpdateBusinessSchema.phone (businesses/routes.ts) — este
  // endpoint es el punto real de envío a Telnyx, así que es donde más
  // importa no dejar pasar un número mal formateado, no solo en el punto de
  // entrada donde el negocio edita su teléfono.
  fromNumber: z.string().regex(E164_PHONE_REGEX),
  toNumber: z.string().regex(E164_PHONE_REGEX),
  text: z.string(),
  idempotencyKey,
});

const SendWhatsappLegadoSchema = z.object({
  toNumber: z.string().regex(E164_PHONE_REGEX),
  templateName: z.string(),
  languageCode: z.string(),
  bodyParams: z.record(z.string()),
  idempotencyKey,
  businessId: z.string().optional(),
  audience: z.enum(["client", "owner"]).optional(),
});

// Forma por propósito (PR 4, lado cliente): el job relee la reserva o el
// lead y elige la plantilla aprobada en el momento del envío.
const SendWhatsappPorPropositoSchema = z
  .object({
    proposito: z.enum(["confirmacion", "recordatorio", "hueco_libre"]),
    bookingId: z.string().optional(),
    leadId: z.string().optional(),
    programedAtMs: z.number().int().optional(),
    toNumber: z.string().regex(E164_PHONE_REGEX),
    businessId: z.string(),
    audience: z.literal("client").optional(),
    idempotencyKey,
    sinV2: z.boolean().optional(),
    saltos: z.number().int().min(0).max(12).optional(),
  })
  .refine(
    (d) =>
      d.proposito === "hueco_libre"
        ? !!d.leadId
        : !!d.bookingId && d.programedAtMs !== undefined,
    { message: "Falta bookingId+programedAtMs o leadId" }
  );

const SendWhatsappSchema = z.union([
  SendWhatsappPorPropositoSchema,
  SendWhatsappLegadoSchema,
]);

// Endpoints invocados por Cloud Tasks/Cloud Scheduler (no por negocios ni
// desde el frontend) — ver plugins/internalAuth.ts para la verificación del
// token OIDC. Cloud Tasks reintenta automáticamente cualquier respuesta que
// no sea 2xx, según la configuración de reintentos de cada cola.
export const internalJobsRoutes: FastifyPluginAsync = async (fastify) => {
  // Fuera del limitador global de 100/min por IP (server.ts): estas rutas las
  // llaman Cloud Tasks y Cloud Scheduler desde un puñado de IPs de Google y
  // ya van autenticadas con OIDC. Con el límite hecho global en Redis, drenar
  // una cola o encolar cien correos del resumen semanal a la vez devolvía
  // 429 en cadena y Cloud Tasks agotaba reintentos sobre envíos legítimos
  // (visto el 2026-09-17: 293 × 429 en process-recording en tres minutos).
  // Va en las opciones de cada ruta, no en un hook onRoute de este plugin:
  // @fastify/rate-limit lee `config.rateLimit` en su propio hook, que corre
  // antes que cualquiera registrado aquí dentro.
  const opcionesDeJob = {
    preValidation: [fastify.verifyCloudTasks],
    config: { rateLimit: false as const },
  };

  fastify.post(
    "/jobs/process-recording",
    opcionesDeJob,
    async (request, reply) => {
      try {
        const data = ProcessRecordingSchema.parse(request.body);
        await processRecordingJob(data);
        return reply.send({ received: true });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        // Un fallo definitivo (destinatario inválido, plantilla no aprobada,
        // número rechazado) se responde 200: devolver 500 solo conseguía que
        // Cloud Tasks repitiera cuatro veces algo que nunca va a salir bien.
        if (error instanceof PermanentJobError) {
          fastify.log.warn(
            { err: error, reason: error.reason },
            "process-recording job failed descartado por fallo definitivo"
          );
          return reply.send({ received: true, skipped: error.reason });
        }
        fastify.log.error({ err: error }, "process-recording job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/recordar-recado",
    opcionesDeJob,
    async (request, reply) => {
      try {
        const data = RecordarRecadoSchema.parse(request.body);
        await processRecordarRecadoJob(data);
        return reply.send({ received: true });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        fastify.log.error({ err: error }, "recordar-recado job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/retry-failed-booking",
    opcionesDeJob,
    async (request, reply) => {
      try {
        const data = RetryFailedBookingSchema.parse(request.body);
        await processRetryFailedBookingJob(data);
        return reply.send({ received: true });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        // Un fallo definitivo (destinatario inválido, plantilla no aprobada,
        // número rechazado) se responde 200: devolver 500 solo conseguía que
        // Cloud Tasks repitiera cuatro veces algo que nunca va a salir bien.
        if (error instanceof PermanentJobError) {
          fastify.log.warn(
            { err: error, reason: error.reason },
            "retry-failed-booking job failed descartado por fallo definitivo"
          );
          return reply.send({ received: true, skipped: error.reason });
        }
        fastify.log.error({ err: error }, "retry-failed-booking job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/send-email",
    opcionesDeJob,
    async (request, reply) => {
      try {
        const data = SendEmailSchema.parse(request.body);
        await processSendEmailJob(data);
        return reply.send({ received: true });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        // Un fallo definitivo (destinatario inválido, plantilla no aprobada,
        // número rechazado) se responde 200: devolver 500 solo conseguía que
        // Cloud Tasks repitiera cuatro veces algo que nunca va a salir bien.
        if (error instanceof PermanentJobError) {
          fastify.log.warn(
            { err: error, reason: error.reason },
            "send-email job failed descartado por fallo definitivo"
          );
          return reply.send({ received: true, skipped: error.reason });
        }
        fastify.log.error({ err: error }, "send-email job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/send-sms",
    opcionesDeJob,
    async (request, reply) => {
      try {
        const data = SendSmsSchema.parse(request.body);
        await processSendSmsJob(data);
        return reply.send({ received: true });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        // Un fallo definitivo (destinatario inválido, plantilla no aprobada,
        // número rechazado) se responde 200: devolver 500 solo conseguía que
        // Cloud Tasks repitiera cuatro veces algo que nunca va a salir bien.
        if (error instanceof PermanentJobError) {
          fastify.log.warn(
            { err: error, reason: error.reason },
            "send-sms job failed descartado por fallo definitivo"
          );
          return reply.send({ received: true, skipped: error.reason });
        }
        fastify.log.error({ err: error }, "send-sms job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/send-whatsapp",
    opcionesDeJob,
    async (request, reply) => {
      try {
        const data = SendWhatsappSchema.parse(request.body);
        await processSendWhatsappJob(
          "proposito" in data ? { ...data, audience: "client" } : data
        );
        return reply.send({ received: true });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        // Un fallo definitivo (destinatario inválido, plantilla no aprobada,
        // número rechazado) se responde 200: devolver 500 solo conseguía que
        // Cloud Tasks repitiera cuatro veces algo que nunca va a salir bien.
        if (error instanceof PermanentJobError) {
          fastify.log.warn(
            { err: error, reason: error.reason },
            "send-whatsapp job failed descartado por fallo definitivo"
          );
          return reply.send({ received: true, skipped: error.reason });
        }
        fastify.log.error({ err: error }, "send-whatsapp job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/purge-old-recordings",
    opcionesDeJob,
    async (_request, reply) => {
      try {
        const result = await purgeOldRecordingsJob();
        return reply.send({ received: true, ...result });
      } catch (error) {
        fastify.log.error({ err: error }, "purge-old-recordings job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/cleanup-zombie-calls",
    opcionesDeJob,
    async (_request, reply) => {
      try {
        await cleanupZombieCallsJob();
        return reply.send({ received: true });
      } catch (error) {
        if (error instanceof PermanentJobError) {
          fastify.log.warn(
            { err: error, reason: error.reason },
            "cleanup-zombie-calls job failed descartado por fallo definitivo"
          );
          return reply.send({ received: true, skipped: error.reason });
        }
        fastify.log.error({ err: error }, "cleanup-zombie-calls job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  // Cada hora (Cloud Scheduler) — PLAN-TELEFONIA-UX.md § 5, fase 5: el
  // recordatorio único «aún no has comprobado el desvío» a los negocios que
  // compraron su número hace entre 24 y 48 h. Idempotente por
  // Business.forwardingReminderSentAt (ver jobs/recordarDesvioSinComprobar.ts).
  fastify.post(
    "/jobs/recordar-desvio-sin-comprobar",
    opcionesDeJob,
    async (_request, reply) => {
      try {
        const result = await recordarDesvioSinComprobarJob();
        return reply.send({ received: true, ...result });
      } catch (error) {
        if (error instanceof PermanentJobError) {
          fastify.log.warn(
            { err: error, reason: error.reason },
            "recordar-desvio-sin-comprobar job failed descartado por fallo definitivo"
          );
          return reply.send({ received: true, skipped: error.reason });
        }
        fastify.log.error(
          { err: error },
          "recordar-desvio-sin-comprobar job failed"
        );
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
    opcionesDeJob,
    async (_request, reply) => {
      try {
        await telnyxHealthCheckJob();
        return reply.send({ received: true });
      } catch (error) {
        if (error instanceof PermanentJobError) {
          fastify.log.warn(
            { err: error, reason: error.reason },
            "telnyx-health-check job failed descartado por fallo definitivo"
          );
          return reply.send({ received: true, skipped: error.reason });
        }
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
    opcionesDeJob,
    async (_request, reply) => {
      try {
        const result = await telnyxReconcilerJob();
        return reply.send({ received: true, result });
      } catch (error) {
        if (error instanceof PermanentJobError) {
          fastify.log.warn(
            { err: error, reason: error.reason },
            "telnyx-reconciler job failed descartado por fallo definitivo"
          );
          return reply.send({ received: true, skipped: error.reason });
        }
        fastify.log.error({ err: error }, "telnyx-reconciler job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/report-usage",
    opcionesDeJob,
    async (request, reply) => {
      try {
        await processUsageReportJob(ReportUsageSchema.parse(request.body));
        return reply.send({ received: true });
      } catch (error) {
        if (error instanceof z.ZodError) return reply.status(400).send({ error: error.errors });
        if (error instanceof PermanentJobError) {
          fastify.log.warn(
            { err: error, reason: error.reason },
            "report-usage job failed descartado por fallo definitivo"
          );
          return reply.send({ received: true, skipped: error.reason });
        }
        fastify.log.error({ err: error }, "report-usage job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/attach-usage-prices",
    opcionesDeJob,
    async (_request, reply) => {
      try {
        const attachedSubscriptions = await attachUsagePricesJob();
        return reply.send({ received: true, attachedSubscriptions });
      } catch (error) {
        if (error instanceof PermanentJobError) {
          fastify.log.warn(
            { err: error, reason: error.reason },
            "attach-usage-prices job failed descartado por fallo definitivo"
          );
          return reply.send({ received: true, skipped: error.reason });
        }
        fastify.log.error({ err: error }, "attach-usage-prices job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/retry-usage-reports",
    opcionesDeJob,
    async (_request, reply) => {
      try {
        await retryUsageReportsJob();
        return reply.send({ received: true });
      } catch (error) {
        if (error instanceof PermanentJobError) {
          fastify.log.warn(
            { err: error, reason: error.reason },
            "retry-usage-reports job failed descartado por fallo definitivo"
          );
          return reply.send({ received: true, skipped: error.reason });
        }
        fastify.log.error({ err: error }, "retry-usage-reports job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/suspend-overdue-calls",
    opcionesDeJob,
    async (_request, reply) => {
      try {
        const suspendedBusinesses = await suspendOverdueCallsJob();
        return reply.send({ received: true, suspendedBusinesses });
      } catch (error) {
        if (error instanceof PermanentJobError) {
          fastify.log.warn(
            { err: error, reason: error.reason },
            "suspend-overdue-calls job failed descartado por fallo definitivo"
          );
          return reply.send({ received: true, skipped: error.reason });
        }
        fastify.log.error({ err: error }, "suspend-overdue-calls job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  // Lunes a las 08:00 Europe/Madrid (Cloud Scheduler). Resumen de actividad
  // de los últimos 7 días para negocios Pro/Scale — ver sendWeeklySummary.ts.
  fastify.post(
    "/jobs/send-weekly-summaries",
    opcionesDeJob,
    async (_request, reply) => {
      try {
        const result = await sendWeeklySummaryJob();
        return reply.send({ received: true, ...result });
      } catch (error) {
        if (error instanceof PermanentJobError) {
          fastify.log.warn(
            { err: error, reason: error.reason },
            "send-weekly-summaries job failed descartado por fallo definitivo"
          );
          return reply.send({ received: true, skipped: error.reason });
        }
        fastify.log.error({ err: error }, "send-weekly-summaries job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );

  fastify.post(
    "/jobs/retry-stuck-recordings",
    opcionesDeJob,
    async (_request, reply) => {
      try {
        await retryStuckRecordingsJob();
        return reply.send({ received: true });
      } catch (error) {
        if (error instanceof PermanentJobError) {
          fastify.log.warn(
            { err: error, reason: error.reason },
            "retry-stuck-recordings job failed descartado por fallo definitivo"
          );
          return reply.send({ received: true, skipped: error.reason });
        }
        fastify.log.error({ err: error }, "retry-stuck-recordings job failed");
        return reply.status(500).send({ error: "Job processing failed" });
      }
    }
  );
};
