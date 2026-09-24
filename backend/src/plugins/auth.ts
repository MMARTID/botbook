import fp from "fastify-plugin";
import jwt from "jsonwebtoken";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../lib/prisma.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      businessId: string;
    };
  }
  interface FastifyInstance {
    authenticate: any;
  }
}

/**
 * Carga de `tokenVersion` con caché corta en memoria. Sin ella, comprobar la
 * versión costaría una consulta por petición autenticada; con 30 s, una
 * contraseña cambiada corta las sesiones en medio minuto como mucho y el
 * coste en la BD es despreciable. La caché es por instancia: cada una se
 * entera a su ritmo, dentro de la misma ventana.
 */
const CACHE_MS = 30_000;
const cache = new Map<string, { version: number | null; expira: number }>();

async function versionDelUsuario(userId: string): Promise<number | null> {
  const enCache = cache.get(userId);
  if (enCache && enCache.expira > Date.now()) return enCache.version;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true },
  });
  const version = user ? user.tokenVersion : null;
  cache.set(userId, { version, expira: Date.now() + CACHE_MS });
  return version;
}

/** Solo para los tests: olvida lo cacheado. */
export function olvidarVersionesDeToken(): void {
  cache.clear();
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply
          .status(401)
          .send({ error: "Unauthorized: Missing or invalid token" });
      }

      let decoded: { id: string; businessId: string; tv?: number };
      try {
        decoded = jwt.verify(authHeader.split(" ")[1]!, process.env.JWT_SECRET!) as {
          id: string;
          businessId: string;
          tv?: number;
        };
      } catch {
        return reply
          .status(401)
          .send({ error: "Unauthorized: Token expired or invalid" });
      }

      // Cambiar o restablecer la contraseña sube `tokenVersion`, así que un
      // token emitido antes deja de valer aunque no haya caducado. Un fallo
      // al comprobarlo cierra la puerta en vez de abrirla: si no podemos
      // saber si la sesión sigue siendo válida, no lo es.
      let version: number | null;
      try {
        version = await versionDelUsuario(decoded.id);
      } catch (error) {
        request.log.error({ err: error }, "[Auth] No se pudo comprobar la versión del token");
        return reply.status(401).send({ error: "Unauthorized: Token expired or invalid" });
      }
      if (version === null) {
        // El usuario ya no existe.
        return reply.status(401).send({ error: "Unauthorized: Token expired or invalid" });
      }
      // `tv` ausente = token emitido antes de que existiera la versión. Vale
      // mientras la contraseña no se haya cambiado desde entonces (version 0).
      if ((decoded.tv ?? 0) !== version) {
        return reply
          .status(401)
          .send({ error: "Unauthorized: Token expired or invalid" });
      }

      request.user = { id: decoded.id, businessId: decoded.businessId };
    }
  );
};

export default fp(authPlugin);
