import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import authPlugin from "./plugins/auth.js";
import multipart from "@fastify/multipart";
import rawBody from "fastify-raw-body";
import { prisma } from "./lib/prisma.js";
import { getRedis, initRedis } from "./lib/redis.js";
import { initStorage } from "./lib/storage.js";
import internalAuthPlugin from "./plugins/internalAuth.js";
import { internalJobsRoutes } from "./modules/internal/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import { businessesRoutes } from "./modules/businesses/routes.js";
import { placesRoutes } from "./modules/places/routes.js";
import { agentsRoutes } from "./modules/agents/routes.js";
import { callsRoutes } from "./modules/calls/routes.js";
import { recordingsRoutes } from "./modules/recordings/routes.js";
import { calendarRoutes } from "./modules/calendar/routes.js";
import { bookingSettingsRoutes } from "./modules/bookings/routes.js";
import { filesRoutes } from "./modules/files/routes.js";
import { billingRoutes } from "./modules/billing/routes.js";
import { phoneRoutes } from "./modules/phone/routes.js";
import { onboardingRoutes } from "./modules/onboarding/routes.js";
import { demoRoutes } from "./modules/demo/routes.js";
import {
  handleFunctionCall,
  handleEndOfCallReport,
  handleStatusUpdate,
} from "./adapters/vapi/webhookHandlers.js";
import { vapiAdapter } from "./adapters/vapi/VapiAdapter.js";
import {
  handleCallStarted,
  handleCallEnded,
  handleCallAnalyzed,
  normalizeRetellWebhookPayload,
} from "./adapters/retell/webhookHandlers.js";
import { retellAdapter } from "./adapters/retell/RetellAdapter.js";
import { executeVoiceTool } from "./modules/voiceTools/service.js";
import { fetchAndSetNgrokUrl } from "./lib/ngrok.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

if (!process.env.JWT_SECRET) {
  console.error("[Server] JWT_SECRET is not defined. The server cannot start safely without it.");
  process.exit(1);
}

async function start() {
  const fastify: FastifyInstance = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "debug",
    },
  });

  try {
    // Initialize external services
    console.log("[Server] Initializing external services...");
    initRedis();
    initStorage();
    await fetchAndSetNgrokUrl();

    // Register plugins
    console.log("[Server] Registering plugins...");
    fastify.register(cors, {
      origin: (origin, callback) => {
        const frontendOrigin = process.env.FRONTEND_URL || "http://localhost:3001";
        // Origen extra opcional (ej. un túnel ngrok temporal para ver el panel
        // desde fuera) — no sustituye a FRONTEND_URL, que sigue gobernando
        // redirects de OAuth/Stripe.
        const extraOrigin = process.env.EXTRA_ALLOWED_ORIGIN;
        if (!origin || origin === frontendOrigin || (extraOrigin && origin === extraOrigin)) {
          callback(null, true);
          return;
        }
        // No lanzar aquí: un origen no permitido es un rechazo normal de CORS,
        // no un error del servidor. Lanzar producía un 500 engañoso en vez de
        // la respuesta sin cabeceras CORS que el navegador ya sabe interpretar.
        callback(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Origin", "Accept"],
    });
    await fastify.register(rateLimit, {
      max: 100,
      timeWindow: "1 minute",
      errorResponseBuilder: (_req, context) => ({
        statusCode: 429,
        error: "Too Many Requests",
        message: `Rate limit exceeded. Retry in ${context.after}`,
      }),
    });
    fastify.register(authPlugin);
    await fastify.register(rawBody, {
      global: false,
      encoding: false,
      runFirst: true,
    });
    fastify.register(multipart, {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      }
    });

    // Global error handler: normalize response shape and log with Pino
    fastify.setErrorHandler((error: unknown, request, reply) => {
      const errorObject =
        error instanceof Error
          ? error
          : typeof error === "object" && error !== null
            ? (error as Record<string, unknown>)
            : new Error(String(error));

      const statusCode =
        ((errorObject as Record<string, unknown>).statusCode as number | undefined) ?? 500;

      const message =
        ((errorObject as Record<string, unknown>).message as string | undefined) ??
        (errorObject as Error).message ??
        "Something went wrong";

      const name =
        ((errorObject as Record<string, unknown>).error as string | undefined) ??
        (errorObject as Error).name ??
        "Error";

      fastify.log.error(
        { err: errorObject, req: { id: request.id, method: request.method, url: request.url } },
        "Unhandled error",
      );

      const isServerError = statusCode >= 500;
      reply.status(statusCode).send({
        statusCode,
        error: isServerError ? "Internal Server Error" : name,
        message: isServerError ? "Internal server error" : message,
      });
    });

    // Health check endpoint with dependency probes
    fastify.get("/health", async (_request, reply) => {
      const checkPromises: Promise<string>[] = [
        prisma.$queryRaw`SELECT 1`.then(() => "ok"),
        getRedis().ping().then(() => "ok"),
        vapiAdapter.checkHealth().then(() => "ok"),
      ];

      if (process.env.RETELL_API_KEY) {
        checkPromises.push(retellAdapter.checkHealth().then(() => "ok"));
      }

      const checks = await Promise.allSettled(checkPromises);

      const [postgres, redis, vapi, retell] = checks;
      const healthy = checks.every((check) => check.status === "fulfilled");
      const statusCode = healthy ? 200 : 503;

      const dependencies: Record<string, string> = {
        postgres: postgres.status === "fulfilled" ? "ok" : "unhealthy",
        redis: redis.status === "fulfilled" ? "ok" : "unhealthy",
        vapi: vapi.status === "fulfilled" ? "ok" : "unhealthy",
      };

      if (process.env.RETELL_API_KEY) {
        dependencies.retell = retell.status === "fulfilled" ? "ok" : "unhealthy";
      }

      reply.status(statusCode).send({
        status: healthy ? "ok" : "degraded",
        timestamp: new Date().toISOString(),
        dependencies,
      });
    });

    // Vapi webhook endpoint. VAPI: inactivo — ningún negocio nuevo lo usa
    // (Retell es el único orquestador), se deja registrado por si queda
    // tráfico residual o se retoma para Latinoamérica.
    fastify.post("/webhooks/vapi", {
  config: {
    rawBody: true,
    rateLimit: {
      max: 300,
      timeWindow: "1 minute",
    },
  },
}, async (request, reply) => {
  const signature = request.headers["x-vapi-signature"];
  if (typeof signature !== "string" || !request.rawBody) {
    fastify.log.warn("[Vapi Webhook] Missing signature or raw body");
    return reply.status(400).send({ error: "Missing webhook signature or body" });
  }

  const rawBody = typeof request.rawBody === "string" ? request.rawBody : request.rawBody.toString("utf8");
  const isValid = vapiAdapter.validateWebhookSignature(rawBody, signature);
  if (!isValid) {
    fastify.log.warn("[Vapi Webhook] Invalid signature");
    return reply.status(401).send({ error: "Invalid webhook signature" });
  }

  const payload = request.body as any;
  const eventType = payload.message?.type || payload.type;

  // Si no hay tipo, respondemos 400 porque no podemos procesarlo
  if (!eventType) {
    console.warn("[Webhook] Missing event type in payload");
    return reply.status(400).send({ error: "Missing event type" });
  }

  try {
    let result: { success: boolean; result?: any };

    switch (eventType) {
      case "function-call":
        result = await handleFunctionCall(payload);
        break;
      case "end-of-call-report":
        result = await handleEndOfCallReport(payload);
        break;
      case "status-update":
        result = await handleStatusUpdate(payload);
        break;
      default:
        // Eventos no críticos: los ignoramos y respondemos OK
        fastify.log.debug({ eventType }, "[Vapi] Evento no procesable ignorado");
        return reply.status(200).send({ success: true, ignored: true });
    }

    if (result.success) {
      // Vapi expects a result object back in the response for function calls
      if (eventType === "function-call" && result.result) {
        return reply.status(200).send({ result: result.result });
      }
      return reply.status(200).send({ success: true });
    } else {
      console.error(`[Vapi] No se pudo procesar el evento ${eventType}`);
      // If no structured result is provided, treat as internal failure
      return reply.status(500).send({ error: "Failed to process webhook" });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Vapi] Error procesando ${eventType}: ${message}`);
    return reply.status(500).send({ error: "Internal server error" });
  }
});

    // Retell webhook endpoint
    fastify.post("/webhooks/retell", {
      config: {
        rawBody: true,
        rateLimit: {
          max: 300,
          timeWindow: "1 minute",
        },
      },
    }, async (request, reply) => {
      const signature = request.headers["x-retell-signature"];
      if (typeof signature !== "string" || !request.rawBody) {
        fastify.log.warn("[Retell Webhook] Missing signature or raw body");
        return reply.status(400).send({ error: "Missing webhook signature or body" });
      }

      const rawBody = typeof request.rawBody === "string" ? request.rawBody : request.rawBody.toString("utf8");
      const isValid = await retellAdapter.validateWebhookSignature(rawBody, signature);
      if (!isValid) {
        fastify.log.warn("[Retell Webhook] Invalid signature");
        return reply.status(401).send({ error: "Invalid webhook signature" });
      }

      const rawPayload = request.body as any;
      const payload = normalizeRetellWebhookPayload(rawPayload);
      const eventType = (payload as any)?.event_type;

      if (!eventType) {
        fastify.log.warn("[Retell Webhook] Missing event type");
        return reply.status(400).send({ error: "Missing event type" });
      }

      try {
        let result: { success: boolean };

        switch (eventType) {
          case "call_started":
            result = await handleCallStarted(payload);
            break;
          case "call_ended":
            result = await handleCallEnded(payload);
            break;
          case "call_analyzed":
            result = await handleCallAnalyzed(payload);
            break;
          default:
            fastify.log.debug({ eventType }, "[Retell] Evento no procesable ignorado");
            return reply.status(200).send({ success: true, ignored: true });
        }

        if (result.success) {
          return reply.status(200).send({ success: true });
        } else {
          console.error(`[Retell] No se pudo procesar el evento ${eventType}`);
          return reply.status(404).send({ error: "Agent or call not registered in Alhabla" });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Retell] Error procesando ${eventType}: ${message}`);
        return reply.status(500).send({ error: "Internal server error" });
      }
    });

    // Retell tool endpoints (custom tools configured in Retell LLM). El
    // retellAgentId va en la propia URL (registrada por nosotros en
    // buildRetellCalendarTools) porque Retell no incluye ningún identificador
    // de agente en el cuerpo de estas peticiones. Nuestras tools se registran
    // con args_at_root: false, así que Retell debería mandar
    // {name, call, args} — pero se tolera también el body plano (args en la
    // raíz, sin `call`) mientras un negocio no se haya resincronizado con la
    // config nueva.
    fastify.post("/webhooks/retell/tools/:retellAgentId/:toolName", {
      config: {
        rawBody: true,
        rateLimit: {
          max: 300,
          timeWindow: "1 minute",
        },
      },
    }, async (request, reply) => {
      const signature = request.headers["x-retell-signature"];
      if (typeof signature !== "string" || !request.rawBody) {
        fastify.log.warn("[Retell Tool] Missing signature or raw body");
        return reply.status(400).send({ error: "Missing webhook signature or body" });
      }

      const rawBody = typeof request.rawBody === "string" ? request.rawBody : request.rawBody.toString("utf8");
      const isValid = await retellAdapter.validateWebhookSignature(rawBody, signature);
      if (!isValid) {
        fastify.log.warn("[Retell Tool] Invalid signature");
        return reply.status(401).send({ error: "Invalid webhook signature" });
      }

      const { retellAgentId, toolName } = request.params as {
        retellAgentId: string;
        toolName: string;
      };
      const payload = (request.body as Record<string, any>) || {};
      const toolParams = (payload.args ?? payload) as Record<string, unknown>;
      const callId = payload.call?.call_id as string | undefined;

      try {
        const agent = await prisma.agent.findFirst({
          where: { retellAgentId },
          select: { businessId: true },
        });

        if (!agent) {
          console.error(`[Retell Tool] No se encontró agente para retellAgentId ${retellAgentId}`);
          return reply.status(404).send({ error: "Agent not found" });
        }

        const result = await executeVoiceTool({
          businessId: agent.businessId,
          toolName,
          params: toolParams,
          callLabel: callId ? `llamada ${callId}` : "llamada en curso",
          callId,
        });

        // Retell expects the tool result in the response body
        return reply.status(result.success ? 200 : 500).send(result.result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Retell Tool] Error ejecutando ${toolName}: ${message}`);
        return reply.status(500).send({ error: "Internal server error" });
      }
    });

    // Register routes
    console.log("[Server] Registering routes...");
    fastify.register(authRoutes, { prefix: '/auth' });
    fastify.register(businessesRoutes);
    fastify.register(placesRoutes);
    fastify.register(agentsRoutes);
    fastify.register(callsRoutes);
    fastify.register(recordingsRoutes);
    fastify.register(calendarRoutes, { prefix: '/calendar' });
    fastify.register(bookingSettingsRoutes, { prefix: '/booking-settings' });
    fastify.register(filesRoutes, { prefix: '/agents' });
    fastify.register(billingRoutes, { prefix: '/billing' });
    fastify.register(phoneRoutes, { prefix: '/phone' });
    fastify.register(onboardingRoutes);
    fastify.register(demoRoutes, { prefix: '/demo' });
    fastify.register(internalAuthPlugin);
    fastify.register(internalJobsRoutes, { prefix: '/internal' });

    // Start server
    await fastify.listen({ port: PORT, host: HOST });
    console.log(
      `[Server] Server running at http://${HOST}:${PORT}`
    );
  } catch (error) {
    console.error("[Server] Fatal error:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("[Server] SIGINT received, shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[Server] SIGTERM received, shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});

// Start the server
start().catch((error) => {
  console.error("[Server] Failed to start:", error);
  process.exit(1);
});
