import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { processRecordingJob } from "../../jobs/processRecording.js";
import { processRetryFailedBookingJob } from "../../jobs/retryFailedBooking.js";
import { processSendEmailJob } from "../../jobs/sendEmail.js";
import { cleanupZombieCallsJob } from "../../jobs/cleanupZombieCalls.js";

const ProcessRecordingSchema = z.object({
  callId: z.string(),
  vapiUrl: z.string(),
  businessId: z.string(),
});

const RetryFailedBookingSchema = z.object({
  leadId: z.string(),
});

const SendEmailSchema = z.object({
  fromAlias: z.enum(["welcome", "support"]),
  toAddress: z.string().email(),
  subject: z.string(),
  html: z.string(),
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
};
