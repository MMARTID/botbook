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
    // `any` a propósito: se usa como hook en rutas con genéricos propios
    // (Body, Querystring…), y un tipo FastifyRequest concreto rompe la
    // inferencia de esas rutas.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

async function versionDelUsuario(
  userId: string,
  { sinCache = false }: { sinCache?: boolean } = {}
): Promise<number | null> {
  const enCache = cache.get(userId);
  if (!sinCache && enCache && enCache.expira > Date.now()) {
    return enCache.version;
  }

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
          .send({ error: "Inicia sesión para continuar." });
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
          .send({ error: "Tu sesión ha caducado. Vuelve a iniciar sesión." });
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
        return reply
          .status(401)
          .send({ error: "Tu sesión ha caducado. Vuelve a iniciar sesión." });
      }
      if (version === null) {
        // El usuario ya no existe.
        return reply
          .status(401)
          .send({ error: "Tu sesión ha caducado. Vuelve a iniciar sesión." });
      }
      // `tv` ausente = token emitido antes de que existiera la versión. Vale
      // mientras la contraseña no se haya cambiado desde entonces (version 0).
      // La versión solo sube. Un token con una versión MAYOR que la cacheada
      // lo acaba de emitir un cambio de contraseña (en esta instancia o en
      // otra): la caché está vieja, no el token. Sin releer, la sesión nueva
      // que devuelve el cambio de contraseña se rechazaba durante 30 s.
      if ((decoded.tv ?? 0) > version) {
        try {
          version = await versionDelUsuario(decoded.id, { sinCache: true });
        } catch (error) {
          request.log.error({ err: error }, "[Auth] No se pudo comprobar la versión del token");
          return reply
            .status(401)
            .send({ error: "Tu sesión ha caducado. Vuelve a iniciar sesión." });
        }
        if (version === null) {
          return reply
            .status(401)
            .send({ error: "Tu sesión ha caducado. Vuelve a iniciar sesión." });
        }
      }
      if ((decoded.tv ?? 0) !== version) {
        return reply
          .status(401)
          .send({ error: "Tu sesión ha caducado. Vuelve a iniciar sesión." });
      }

      request.user = { id: decoded.id, businessId: decoded.businessId };
    }
  );
};

export default fp(authPlugin);
