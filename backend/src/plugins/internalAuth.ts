import fp from "fastify-plugin";
import { OAuth2Client } from "google-auth-library";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    verifyCloudTasks: any;
  }
}

const oauthClient = new OAuth2Client();

// Verifica que la petición viene de verdad de Cloud Tasks/Cloud Scheduler:
// token OIDC firmado por Google, con la audience de este servicio y emitido
// para la cuenta de servicio designada como invocadora. Sin esto, cualquiera
// podría hacer POST a /internal/jobs/* y disparar un job arbitrario.
const internalAuthPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate("verifyCloudTasks", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Unauthorized: Missing OIDC token" });
      }

      // Las dos variables son obligatorias: google-auth-library se salta la
      // comprobación de audience cuando se le pasa undefined, así que con la
      // configuración a medias la verificación se debilita en silencio.
      // Mejor rechazar la petición que aceptarla con menos garantías.
      const expectedAudience = process.env.INTERNAL_JOBS_BASE_URL;
      const expectedServiceAccount = process.env.CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT;
      if (!expectedAudience || !expectedServiceAccount) {
        fastify.log.error(
          "[InternalAuth] Falta INTERNAL_JOBS_BASE_URL o CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT: se rechazan los jobs internos"
        );
        return reply.status(503).send({ error: "Internal jobs auth is not configured" });
      }

      const idToken = authHeader.slice("Bearer ".length);
      const ticket = await oauthClient.verifyIdToken({
        idToken,
        audience: expectedAudience,
      });

      const payload = ticket.getPayload();

      if (!payload?.email || !payload.email_verified || payload.email !== expectedServiceAccount) {
        return reply.status(403).send({ error: "Forbidden: Unexpected token issuer" });
      }
    } catch (error) {
      fastify.log.warn({ err: error }, "Cloud Tasks OIDC verification failed");
      return reply.status(401).send({ error: "Unauthorized: Invalid OIDC token" });
    }
  });
};

export default fp(internalAuthPlugin);
