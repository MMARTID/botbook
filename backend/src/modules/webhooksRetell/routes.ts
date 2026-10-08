import type { FastifyInstance } from "fastify";
import { verificarFirmaDeRetell } from "../../plugins/firmaRetell.js";
import { prisma } from "../../lib/prisma.js";
import {
  handleCallStarted,
  handleCallEnded,
  handleCallAnalyzed,
  normalizeRetellWebhookPayload,
} from "../../adapters/retell/webhookHandlers.js";
import { selectRetellInboundAgent } from "../phone/retellInbound.js";
import { buildInboundCallDynamicVariables } from "../../lib/agentBootstrap.js";
import { executeVoiceTool } from "../voiceTools/service.js";

/**
 * Todas las rutas que reciben peticiones FIRMADAS por Retell: los eventos de
 * llamada, el webhook de llamada entrante y las tools de voz.
 *
 * La firma (`x-retell-signature`) se comprueba una sola vez, en el
 * `preHandler` de este plugin (plugins/firmaRetell.ts), antes de que se
 * ejecute ningún handler: una ruta nueva que se registre aquí queda protegida
 * sin tener que acordarse de nada. Por eso este plugin NO va envuelto en
 * `fastify-plugin`: el hook tiene que quedarse encapsulado aquí y no llegar al
 * resto de rutas. Cada ruta necesita `rawBody: true`, porque la firma es
 * sobre los bytes recibidos.
 */
export async function webhooksRetellRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", verificarFirmaDeRetell);

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
        // Para rechazar hay que decirlo con `reject: true`: un 2xx sin
        // override_agent_id NO rechaza, Retell atiende con el agente que el
        // número tiene vinculado (lo importamos con él). Así se cumple la
        // suspensión tras el séptimo día de impago y no se atiende sin agente
        // operativo, igual que el camino de Telnyx cuelga.
        fastify.log.warn(
          { businessId: business.id, toNumber },
          "[Retell Inbound] Llamada rechazada: negocio suspendido o sin agente operativo"
        );
        return reply.status(200).send({ call_inbound: { reject: true } });
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
}
