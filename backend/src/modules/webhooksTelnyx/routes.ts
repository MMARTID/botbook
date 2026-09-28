import type { FastifyInstance } from "fastify";
import { verificarFirmaDeTelnyx } from "../../plugins/firmaTelnyx.js";
import {
  handleCallInitiated,
  handleCallAnswered,
  handleCallHangup,
  handleCallConversationEnded,
  handleCallRecordingSaved,
  handleCallConversationInsightsGenerated,
  handleCallCost,
  handleTelnyxToolInvocation,
  extractTelnyxEventEnvelope,
} from "../../adapters/telnyx/webhookHandlers.js";
import { handleGestorToolInvocation } from "../gestor/tools.js";
import {
  handleWhatsappMessages,
  handleMessageStatusEvent,
  handleTemplateStatusEvent,
} from "../whatsapp/webhooks.js";
import {
  claimVoiceWebhookEvent,
  completeVoiceWebhookEvent,
} from "../../lib/voiceWebhookIdempotency.js";

/**
 * Todas las rutas que reciben peticiones FIRMADAS por Telnyx: los eventos del
 * Call Control App y de WhatsApp, las tools de voz de la recepcionista y las
 * tools del Gestor.
 *
 * La firma Ed25519 se comprueba una sola vez, en el `preHandler` de este
 * plugin (plugins/firmaTelnyx.ts), antes de que se ejecute ningún handler:
 * una ruta nueva que se registre aquí queda protegida sin tener que acordarse
 * de nada. Por eso este plugin NO va envuelto en `fastify-plugin`: el hook
 * tiene que quedarse encapsulado aquí y no llegar al resto de rutas. Cada
 * ruta necesita `rawBody: true`, porque la firma es sobre los bytes
 * recibidos. El webhook sin firma del harness de pruebas
 * (`/webhooks/telnyx-harness`) vive fuera, en server.ts.
 */
export async function webhooksTelnyxRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", verificarFirmaDeTelnyx);

  // Telnyx AI Assistants — Call Control App de plataforma (compartido por
  // todos los negocios en rollout Telnyx, ver PLAN-TELNYX-ORQUESTADOR.md
  // §4). Idempotente por `data.id` vía VoiceWebhookEvent: un reintento del
  // proveedor del mismo evento se ignora sin reprocesar nada.
  fastify.post("/webhooks/telnyx", {
    config: {
      rawBody: true,
      rateLimit: {
        max: 300,
        timeWindow: "1 minute",
      },
    },
  }, async (request, reply) => {
    const payload = request.body;
    const envelope = extractTelnyxEventEnvelope(payload);
    if (!envelope) {
      fastify.log.warn("[Telnyx Webhook] Missing event id/type");
      return reply.status(400).send({ error: "Missing event id or type" });
    }

    const claimed = await claimVoiceWebhookEvent(
      "telnyx",
      envelope.id,
      envelope.eventType
    );
    if (!claimed) {
      fastify.log.debug(
        { eventId: envelope.id },
        "[Telnyx] Evento ya procesado, se ignora el reintento"
      );
      return reply.status(200).send({ success: true, deduped: true });
    }

    try {
      let result: { success: boolean };

      switch (envelope.eventType) {
        case "call.initiated":
          result = await handleCallInitiated(payload);
          break;
        // Solo actúa sobre la pata saliente de «Comprobar desvío» (por su
        // client_state); en las llamadas de clientes no hace nada.
        case "call.answered":
          result = await handleCallAnswered(payload);
          break;
        case "call.hangup":
          result = await handleCallHangup(payload);
          break;
        case "call.conversation.ended":
          result = await handleCallConversationEnded(payload);
          break;
        case "call.recording.saved":
          result = await handleCallRecordingSaved(payload);
          break;
        case "call.conversation_insights.generated":
          result = await handleCallConversationInsightsGenerated(payload);
          break;
        case "call.cost":
          result = await handleCallCost(payload);
          break;
        // WhatsApp (PLAN-CANAL-DUENO.md § 6): entrantes y entregas del
        // webhook del WABA, eventos clásicos de cada envío y estado de
        // las plantillas. Misma firma e idempotencia que la voz.
        case "whatsapp.messages":
          result = await handleWhatsappMessages(payload);
          break;
        case "message.sent":
        case "message.finalized":
        case "message.read":
          result = await handleMessageStatusEvent(payload);
          break;
        default:
          if (envelope.eventType.startsWith("whatsapp.template.")) {
            result = await handleTemplateStatusEvent(payload);
            break;
          }
          if (
            envelope.eventType.startsWith("whatsapp.") ||
            envelope.eventType.startsWith("message.")
          ) {
            // El nombre real del evento de plantilla no está verificado
            // (fase 0): que se vea de inmediato si llega con otro nombre.
            fastify.log.warn(
              { eventType: envelope.eventType },
              "[Telnyx] Evento de WhatsApp/mensajería sin handler; se ignora"
            );
          } else {
            fastify.log.debug(
              { eventType: envelope.eventType },
              "[Telnyx] Evento no procesable ignorado"
            );
          }
          await completeVoiceWebhookEvent("telnyx", envelope.id, "success");
          return reply.status(200).send({ success: true, ignored: true });
      }

      await completeVoiceWebhookEvent(
        "telnyx",
        envelope.id,
        result.success ? "success" : "error"
      );

      if (result.success) {
        return reply.status(200).send({ success: true });
      } else {
        console.error(`[Telnyx] No se pudo procesar el evento ${envelope.eventType}`);
        return reply.status(404).send({ error: "Business or call not registered in Alhabla" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Telnyx] Error procesando ${envelope.eventType}: ${message}`);
      await completeVoiceWebhookEvent("telnyx", envelope.id, "error", {
        lastError: message,
      });
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // Telnyx tool endpoints. A diferencia de Retell, el body es solo los
  // argumentos que decide el LLM — call_control_id llega por el header
  // custom X-Alhabla-Call-Control-Id, templado con la variable de
  // sistema {{call_control_id}} (ver CANAL_DE_TOOLS_DE_VOZ en
  // lib/telnyxAssistantPayload.ts). Confirmado con una reserva real de
  // punta a punta el 2026-09-12.
  fastify.post("/webhooks/telnyx/tools/:toolName", {
    config: {
      rawBody: true,
      rateLimit: {
        max: 300,
        timeWindow: "1 minute",
      },
    },
  }, async (request, reply) => {
    const { toolName } = request.params as { toolName: string };
    const callControlIdHeader = request.headers["x-alhabla-call-control-id"];
    const callControlId =
      typeof callControlIdHeader === "string" ? callControlIdHeader : undefined;
    const toolParams = (request.body as Record<string, unknown>) || {};

    const { status, body } = await handleTelnyxToolInvocation({
      callControlId,
      toolName,
      params: toolParams,
    });
    return reply.status(status).send(body);
  });

  // Tools del Gestor (fase 2 del plan de WhatsApp, § 8): el assistant
  // único de plataforma con el que chatea el dueño. Misma firma Ed25519 que
  // las tools de voz (el preHandler del plugin); el negocio no viene de una
  // Call sino de las cabeceras X-Alhabla-Business / X-Alhabla-Role, que
  // Telnyx templa desde los metadata de la conversación creada por Alhabla
  // (modules/gestor/tools.ts).
  fastify.post("/webhooks/telnyx/gestor/:toolName", {
    config: {
      rawBody: true,
      rateLimit: {
        max: 300,
        timeWindow: "1 minute",
      },
    },
  }, async (request, reply) => {
    const { toolName } = request.params as { toolName: string };
    const businessHeader = request.headers["x-alhabla-business"];
    const roleHeader = request.headers["x-alhabla-role"];
    const { status, body } = await handleGestorToolInvocation({
      businessId: typeof businessHeader === "string" ? businessHeader : undefined,
      role: typeof roleHeader === "string" ? roleHeader : undefined,
      toolName,
      params: (request.body as Record<string, unknown>) || {},
    });
    return reply.status(status).send(body);
  });
}
