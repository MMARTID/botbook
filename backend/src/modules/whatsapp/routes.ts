import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  iniciarActivacionDelDueno,
  resumenWhatsappDelDueno,
} from "./altaDueno.js";
import {
  decidirEnElPanel,
  historialDelGestor,
  preguntarAlGestor,
} from "../gestor/panel.js";

const MensajeAlGestorSchema = z
  .object({ texto: z.string().trim().min(1).max(1000) })
  .strict();
const DecisionSchema = z
  .object({ decision: z.enum(["confirmar", "cancelar"]) })
  .strict();

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

  // «Tu Gestor» en el panel (fase 2 / PR 5): historial, un mensaje y los
  // botones de una propuesta. Mismo Gestor y misma conversación que por
  // WhatsApp; la respuesta vuelve aquí en vez de salir como mensaje.
  fastify.get(
    "/business/me/gestor",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const estado = await historialDelGestor(request.user!.businessId);
        if (!estado) {
          return reply.status(404).send({ error: "Business not found" });
        }
        return reply.send(estado);
      } catch (error) {
        fastify.log.error(
          { err: error },
          "[Gestor] No se pudo cargar el chat del panel"
        );
        return reply
          .status(500)
          .send({ error: "No se pudo cargar el chat con el asistente" });
      }
    }
  );

  fastify.post(
    "/business/me/gestor/mensajes",
    {
      preValidation: [fastify.authenticate],
      config: { rateLimit: { max: 30, timeWindow: "10 minutes" } },
    },
    async (request: FastifyRequest, reply) => {
      const parsed = MensajeAlGestorSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.errors });
      }
      try {
        const r = await preguntarAlGestor({
          businessId: request.user!.businessId,
          texto: parsed.data.texto,
        });
        if (!r.ok) {
          const status =
            r.motivo === "limite"
              ? 429
              : r.motivo === "ocupado"
                ? 409
                : r.motivo === "sin_respuesta"
                  ? 502
                  : 403;
          return reply
            .status(status)
            .send({ error: r.mensaje, code: r.motivo });
        }
        return reply.send(r);
      } catch (error) {
        fastify.log.error(
          { err: error },
          "[Gestor] El mensaje desde el panel falló"
        );
        return reply
          .status(500)
          .send({ error: "El asistente no ha podido atender el mensaje" });
      }
    }
  );

  fastify.post(
    "/business/me/gestor/acciones/:accionId",
    {
      preValidation: [fastify.authenticate],
      config: { rateLimit: { max: 30, timeWindow: "10 minutes" } },
    },
    async (request: FastifyRequest, reply) => {
      const parsed = DecisionSchema.safeParse(request.body);
      const { accionId } = request.params as { accionId?: string };
      if (!parsed.success || !accionId || accionId.length > 64) {
        return reply.status(400).send({
          error: parsed.success ? "Acción no válida" : parsed.error.errors,
        });
      }
      try {
        const r = await decidirEnElPanel({
          businessId: request.user!.businessId,
          accionId,
          decision: parsed.data.decision,
        });
        if (!r.ok) {
          return reply
            .status(r.motivo === "no_encontrada" ? 404 : 409)
            .send({ error: r.mensaje, code: r.motivo });
        }
        return reply.send(r);
      } catch (error) {
        fastify.log.error(
          { err: error },
          "[Gestor] El botón desde el panel falló"
        );
        return reply
          .status(500)
          .send({ error: "No se pudo decidir la propuesta" });
      }
    }
  );
}
