import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  iniciarActivacionDelDueno,
  resumenWhatsappDelDueno,
} from "./altaDueno.js";

/**
 * Rutas del panel para el WhatsApp del dueño (PLAN-CANAL-DUENO.md § 2 y
 * § 13). Todas leen el negocio del JWT; ningún body acepta `businessId`.
 * El móvil se cambia con `PATCH /business/me` (`ownerWhatsappNumber`).
 */
export async function whatsappRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/business/me/whatsapp",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const estado = await resumenWhatsappDelDueno(request.user!.businessId);
        if (!estado) {
          return reply.status(404).send({ error: "Business not found" });
        }
        return reply.send(estado);
      } catch (error) {
        fastify.log.error(
          { err: error },
          "[WhatsApp] No se pudo cargar el estado de WhatsApp del dueño"
        );
        return reply
          .status(500)
          .send({ error: "No se pudo cargar el estado de WhatsApp" });
      }
    }
  );

  // «Guardar y activar» / «Reenviar activación». Sin body. Además del límite
  // por IP, el freno de 5 min por negocio y el tope por móvil destino viven
  // en la base de datos (modules/whatsapp/altaDueno.ts).
  fastify.post(
    "/business/me/whatsapp/activation",
    {
      preValidation: [fastify.authenticate],
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
    },
    async (request: FastifyRequest, reply) => {
      const businessId = request.user!.businessId;
      try {
        const resultado = await iniciarActivacionDelDueno(businessId);
        switch (resultado.outcome) {
          case "sin_negocio":
            return reply.status(404).send({ error: "Business not found" });
          case "sin_numero":
            return reply.status(409).send({
              error: "Añade primero tu móvil con WhatsApp.",
              code: "OWNER_WHATSAPP_MISSING",
            });
          case "ya_activo":
            return reply.status(409).send({
              error: "Los avisos ya están activos en este móvil.",
              code: "OWNER_WHATSAPP_ALREADY_ACTIVE",
            });
          case "baja": {
            const estado = await resumenWhatsappDelDueno(businessId);
            return reply.status(409).send({
              error:
                "Ese móvil pidió no recibir avisos. Solo puede volver a activarlos escribiendo ALTA desde el propio móvil.",
              code: "OWNER_WHATSAPP_OPTED_OUT",
              ...(estado ?? {}),
            });
          }
          case "limite_destino":
            return reply.status(429).send({
              error:
                "Ya hemos enviado dos mensajes de activación a ese móvil hoy. Prueba con el enlace o inténtalo mañana.",
              code: "OWNER_WHATSAPP_DESTINATION_LIMIT",
            });
          case "demasiado_pronto":
            return reply.status(429).send({
              error:
                "Acabamos de enviarte el mensaje. Espera cinco minutos antes de pedir otro.",
              code: "OWNER_WHATSAPP_ACTIVATION_TOO_SOON",
              retryAfterSeconds: resultado.retryAfterSeconds,
            });
          default: {
            const estado = await resumenWhatsappDelDueno(businessId);
            if (!estado) {
              return reply.status(404).send({ error: "Business not found" });
            }
            return reply.send({ ...estado, sent: resultado.sent });
          }
        }
      } catch (error) {
        fastify.log.error(
          { err: error },
          `[WhatsApp] No se pudo iniciar la activación del negocio ${businessId}`
        );
        return reply
          .status(500)
          .send({ error: "No se pudo iniciar la activación por WhatsApp" });
      }
    }
  );
}
