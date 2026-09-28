import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import authPlugin from "./plugins/auth.js";
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
import { billingRoutes } from "./modules/billing/routes.js";
import { phoneRoutes } from "./modules/phone/routes.js";
import { selectRetellInboundAgent } from "./modules/phone/retellInbound.js";
import { onboardingRoutes } from "./modules/onboarding/routes.js";
import { whatsappRoutes } from "./modules/whatsapp/routes.js";
import { demoRoutes } from "./modules/demo/routes.js";
import { webhooksTelnyxRoutes } from "./modules/webhooksTelnyx/routes.js";
import {
  handleCallStarted,
  handleCallEnded,
  handleCallAnalyzed,
  normalizeRetellWebhookPayload,
} from "./adapters/retell/webhookHandlers.js";
import { retellAdapter } from "./adapters/retell/RetellAdapter.js";
import { buildInboundCallDynamicVariables } from "./lib/agentBootstrap.js";
import { executeVoiceTool } from "./modules/voiceTools/service.js";
import { comprobarClaveDeCifrado } from "./lib/cifradoDeCredenciales.js";
import { origenesPermitidos } from "./lib/urls.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

if (!process.env.JWT_SECRET) {
  console.error("[Server] JWT_SECRET is not defined. The server cannot start safely without it.");
  process.exit(1);
}

// Las credenciales de calendario van cifradas en reposo: sin clave no se
// podría leer ninguna conexión existente ni guardar una nueva. Mejor no
// arrancar (Cloud Run deja la revisión anterior sirviendo) que fallar en
// cada llamada de voz con "reconecta tu calendario".
try {
  comprobarClaveDeCifrado();
} catch (error) {
  console.error(
    `[Server] ${error instanceof Error ? error.message : String(error)}. El servidor no puede arrancar sin la clave de cifrado de credenciales de calendario.`
  );
  process.exit(1);
}

async function start() {
  const fastify: FastifyInstance = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "debug",
    },
    // En Cloud Run cada petición llega a través del proxy de Google, así que
    // el socket siempre trae la IP del GFE: sin esto, `request.ip` es la misma
    // para todos los clientes y el rate limit de /auth/login se convierte en
    // un cubo compartido (ni frena una fuerza bruta ni distingue a quien la
    // sufre). La IP real viaja en X-Forwarded-For, que Cloud Run reescribe
    // añadiendo la del cliente al final, por lo que confiar en el proxy aquí
    // es seguro: nadie puede falsificar su posición en la cadena.
    trustProxy: true,
  });

  // Node por defecto cierra los sockets keep-alive tras solo 5s de
  // inactividad (`http.Server.keepAliveTimeout`). Delante de Cloud Run, el
  // proxy de Google (GFE) reutiliza conexiones keep-alive hacia el
  // contenedor durante mucho más tiempo que eso — si Node cierra el socket
  // primero, la siguiente petición que GFE reenvía sobre esa conexión ya
  // cerrada llega como una conexión rota, sin que nuestro código llegue
  // siquiera a verla (no aparece en los logs de Cloud Run ni en los
  // nuestros). Encontrado el 2026-09-15 analizando la transcripción de una
  // llamada real al centro de estética: dos intentos seguidos de la tool
  // get_catalog volvieron "delivery_failed"/":closed" —error que genera
  // Telnyx cuando la entrega del webhook nunca llega a completarse— y el
  // tercer intento, ya sobre una conexión nueva, funcionó a la primera. Es
  // el mismo problema documentado para cualquier servidor Node.js en Cloud
  // Run: subir keepAliveTimeout por encima del timeout de GFE (~620s) lo
  // resuelve. headersTimeout tiene que ser mayor que keepAliveTimeout o
  // Node lo rechaza en arranque.
  fastify.server.keepAliveTimeout = 620_000;
  fastify.server.headersTimeout = 630_000;

  try {
    // Initialize external services
    console.log("[Server] Initializing external services...");
    initRedis();
    initStorage();

    // Register plugins
    console.log("[Server] Registering plugins...");
    fastify.register(cors, {
      origin: (origin, callback) => {
        // La app (APP_URL), la web de marketing (WEB_URL: registro y
        // recuperación de contraseña) y un origen extra opcional (un túnel
        // para ver el panel desde fuera). Los redirects de OAuth/Stripe los
        // gobierna APP_URL, no esta lista.
        if (!origin || origenesPermitidos().has(origin)) {
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
      // Sin store compartido el contador vive en la memoria de cada instancia:
      // se reinicia en cada arranque en frío y se multiplica por el número de
      // instancias de Cloud Run, así que el límite real era muchas veces el
      // configurado. Redis lo hace global. `skipOnError` deja pasar la
      // petición si Redis no responde: preferimos quedarnos sin límite un rato
      // a devolver 500 en toda la API por una caída de la caché.
      redis: getRedis(),
      nameSpace: "ratelimit:",
      skipOnError: true,
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
      ];

      if (process.env.RETELL_API_KEY) {
        checkPromises.push(retellAdapter.checkHealth().then(() => "ok"));
      }

      const checks = await Promise.allSettled(checkPromises);

      const [postgres, redis, retell] = checks;
      const healthy = checks.every((check) => check.status === "fulfilled");
      const statusCode = healthy ? 200 : 503;

      const dependencies: Record<string, string> = {
        postgres: postgres.status === "fulfilled" ? "ok" : "unhealthy",
        redis: redis.status === "fulfilled" ? "ok" : "unhealthy",
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

    // Webhook de llamada entrante de Retell — se configura por número de
    // teléfono (inbound_webhook_url, ver phone/service.ts), es distinto del
    // webhook de eventos de arriba. Responde con los dynamic variables
    // mínimas (nombre y zona horaria) que el prompt gestionado espera — el
    // catálogo se consulta con get_catalog bajo demanda para no inflar cada
    // turno — ver managedAgentPrompt.ts y
    // buildInboundCallDynamicVariables en agentBootstrap.ts. Si no
    // encontramos el negocio o algo falla, respondemos igualmente con 200 y
    // variables vacías: rechazar la llamada (reject) es mucho más disruptivo
    // que un prompt con huecos, y el propio prompt ya instruye a no inventar
    // información cuando falta.
    fastify.post("/webhooks/retell/inbound", {
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
        fastify.log.warn("[Retell Inbound] Missing signature or raw body");
        return reply.status(400).send({ error: "Missing webhook signature or body" });
      }

      const rawBody = typeof request.rawBody === "string" ? request.rawBody : request.rawBody.toString("utf8");
      const isValid = await retellAdapter.validateWebhookSignature(rawBody, signature);
      if (!isValid) {
        fastify.log.warn("[Retell Inbound] Invalid signature");
        return reply.status(401).send({ error: "Invalid webhook signature" });
      }

      const payload = request.body as { call_inbound?: { to_number?: string } };
      const toNumber = payload.call_inbound?.to_number;

      if (!toNumber) {
        fastify.log.warn("[Retell Inbound] Missing call_inbound.to_number");
        return reply.status(200).send({ call_inbound: { dynamic_variables: {} } });
      }

      try {
        const business = await prisma.business.findUnique({
          where: { retellPhoneNumber: toNumber },
          select: {
            id: true,
            callsSuspendedAt: true,
            paymentFailureSuspensionAt: true,
            agents: {
              where: {
                active: true,
                deletedAt: null,
                retellAgentId: { not: null },
              },
              orderBy: { createdAt: "asc" },
              take: 1,
              select: { retellAgentId: true },
            },
          },
        });

        if (!business) {
          fastify.log.warn({ toNumber }, "[Retell Inbound] No business registered for this number");
          return reply.status(200).send({ call_inbound: { dynamic_variables: {} } });
        }

        const retellAgentId = selectRetellInboundAgent(business);
        if (!retellAgentId) {
          // Retell rechaza una llamada si su webhook entrante devuelve 2xx
          // sin override_agent_id. Es intencionado: evita atender llamadas
          // tras el séptimo día de impago o si no queda agente operativo.
          return reply.status(200).send({ call_inbound: {} });
        }

        const dynamicVariables = await buildInboundCallDynamicVariables(business.id);
        return reply.status(200).send({
          call_inbound: {
            override_agent_id: retellAgentId,
            dynamic_variables: dynamicVariables,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Retell Inbound] Error building dynamic variables for ${toNumber}: ${message}`);
        return reply.status(200).send({ call_inbound: { dynamic_variables: {} } });
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

    // Webhooks firmados de Telnyx (Call Control App de plataforma, WhatsApp,
    // tools de voz y del Gestor): la firma Ed25519 se verifica en un único
    // preHandler encapsulado en su plugin (modules/webhooksTelnyx/routes.ts).
    fastify.register(webhooksTelnyxRoutes);

    // Webhook de la pata que origina scripts/telnyxCallHarness.ts (el
    // "cliente" simulado que llama de verdad a un assistant real). Se pasa
    // explícitamente como `webhook_url` en `client.calls.dial()` para que
    // esos eventos NUNCA lleguen al Call Control App de plataforma — evita
    // que handleCallInitiated intente resolver un negocio para la pata
    // saliente (no es una llamada entrante de ningún negocio) y confunda el
    // enrutamiento real. No hace nada más que registrar y responder 200.
    // Solo se registra fuera de producción: es el webhook de un script de
    // pruebas, no lleva firma, y no hay razón para exponer un endpoint
    // público más en el servicio real.
    if (process.env.NODE_ENV !== "production") {
      fastify.post("/webhooks/telnyx-harness", async (request, reply) => {
        const body = request.body as { data?: { event_type?: string } } | undefined;
        console.log(`[Telnyx Harness] Evento ignorado: ${body?.data?.event_type ?? "desconocido"}`);
        return reply.status(200).send({ received: true });
      });
    }

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
    fastify.register(billingRoutes, { prefix: '/billing' });
    fastify.register(phoneRoutes, { prefix: '/phone' });
    fastify.register(onboardingRoutes);
    fastify.register(whatsappRoutes);
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
