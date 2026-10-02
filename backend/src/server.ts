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
import { citasDelPanelRoutes } from "./modules/bookings/citasDelPanel.js";
import { busquedaRoutes } from "./modules/busqueda/routes.js";
import { placesRoutes } from "./modules/places/routes.js";
import { agentsRoutes } from "./modules/agents/routes.js";
import { callsRoutes } from "./modules/calls/routes.js";
import { recordingsRoutes } from "./modules/recordings/routes.js";
import { calendarRoutes } from "./modules/calendar/routes.js";
import { bookingSettingsRoutes } from "./modules/bookings/routes.js";
import { billingRoutes } from "./modules/billing/routes.js";
import { phoneRoutes } from "./modules/phone/routes.js";
import { onboardingRoutes } from "./modules/onboarding/routes.js";
import { whatsappRoutes } from "./modules/whatsapp/routes.js";
import { demoRoutes } from "./modules/demo/routes.js";
import { webhooksTelnyxRoutes } from "./modules/webhooksTelnyx/routes.js";
import { webhooksRetellRoutes } from "./modules/webhooksRetell/routes.js";
import { retellAdapter } from "./adapters/retell/RetellAdapter.js";
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

    // Webhooks firmados de Retell (eventos, llamada entrante y tools): la
    // firma se verifica en un único preHandler encapsulado en su plugin
    // (modules/webhooksRetell/routes.ts).
    fastify.register(webhooksRetellRoutes);

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
    fastify.register(citasDelPanelRoutes);
    fastify.register(busquedaRoutes);
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
