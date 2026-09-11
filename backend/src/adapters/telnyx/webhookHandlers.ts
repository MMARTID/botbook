import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { telnyxAiAdapter } from "./TelnyxAiAdapter.js";
import {
  enqueueRecordingJob,
  enqueueUsageReportJob,
} from "../../lib/cloudTasks.js";
import { callLabel, errorMessage } from "../../lib/logUtils.js";
import { selectTelnyxInboundAgent } from "../../modules/phone/telnyxInbound.js";

/**
 * Envoltorio real verificado en vivo el 2026-09-11 y contra los tipos de
 * webhook que publica el SDK (`node_modules/telnyx/resources/webhooks.d.ts`)
 * — Telnyx envuelve cada evento como `{ data: { id, event_type, occurred_at,
 * payload } }`, distinto de la forma `{event_type, data}` de Retell.
 * `.passthrough()` en cada payload: Telnyx puede añadir campos sin avisar y
 * el body real puede diferir del tipo del SDK (ver TelnyxAiAdapter.listVoices).
 */
const TelnyxCallInitiatedSchema = z.object({
  data: z.object({
    id: z.string(),
    event_type: z.literal("call.initiated"),
    payload: z
      .object({
        call_control_id: z.string(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .passthrough(),
  }),
});

const TelnyxCallHangupSchema = z.object({
  data: z.object({
    id: z.string(),
    event_type: z.literal("call.hangup"),
    payload: z
      .object({
        call_control_id: z.string(),
        hangup_cause: z.string().optional(),
      })
      .passthrough(),
  }),
});

const TelnyxCallConversationEndedSchema = z.object({
  data: z.object({
    id: z.string(),
    event_type: z.literal("call.conversation.ended"),
    payload: z
      .object({
        call_control_id: z.string().optional(),
        conversation_id: z.string().optional(),
        duration_sec: z.number().optional(),
      })
      .passthrough(),
  }),
});

const TelnyxCallRecordingSavedSchema = z.object({
  data: z.object({
    id: z.string(),
    event_type: z.literal("call.recording.saved"),
    payload: z
      .object({
        // Ojo: este evento NO trae call_control_id (verificado contra el
        // tipo de webhook del SDK) — solo call_leg_id/call_session_id.
        call_leg_id: z.string().optional(),
        recording_urls: z
          .object({
            mp3: z.string().nullable().optional(),
            wav: z.string().nullable().optional(),
          })
          .optional(),
      })
      .passthrough(),
  }),
});

const TelnyxCallConversationInsightsGeneratedSchema = z.object({
  data: z.object({
    id: z.string(),
    event_type: z.literal("call.conversation_insights.generated"),
    payload: z
      .object({
        call_control_id: z.string().optional(),
        insight_group_id: z.string().optional(),
        results: z
          .array(
            z
              .object({
                insight_id: z.string().optional(),
                result: z.unknown().optional(),
              })
              .passthrough()
          )
          .optional(),
      })
      .passthrough(),
  }),
});

const TelnyxCallCostSchema = z.object({
  data: z.object({
    id: z.string(),
    event_type: z.literal("call.cost"),
    payload: z
      .object({
        call_control_id: z.string().optional(),
        // Sin campo de moneda propio a este nivel (sí lo tiene cada
        // cost_part) — se asume USD, el default habitual de Telnyx, hasta
        // confirmar lo contrario para esta cuenta.
        total_cost: z.string().nullable().optional(),
        status: z.enum(["success", "error"]).optional(),
      })
      .passthrough(),
  }),
});

const TelnyxEventEnvelopeSchema = z.object({
  data: z
    .object({ id: z.string(), event_type: z.string() })
    .passthrough(),
});

/** Lee `data.id`/`data.event_type` sin validar el resto — usado por el
 * router para reclamar idempotencia y decidir a qué handler despachar antes
 * de parsear el payload específico de cada evento. */
export function extractTelnyxEventEnvelope(
  payload: unknown
): { id: string; eventType: string } | null {
  const parsed = TelnyxEventEnvelopeSchema.safeParse(payload);
  if (!parsed.success) return null;
  return { id: parsed.data.data.id, eventType: parsed.data.data.event_type };
}

export async function handleCallInitiated(
  payload: unknown
): Promise<{ success: boolean }> {
  const event = TelnyxCallInitiatedSchema.parse(payload);
  const { call_control_id, from, to } = event.data.payload;

  console.log(
    `[Telnyx] Inició ${callLabel(call_control_id)} → ${to ?? "número desconocido"}`
  );

  if (!to) {
    console.error(
      `[Telnyx] call.initiated de ${callLabel(call_control_id)} sin número de destino`
    );
    return { success: false };
  }

  try {
    const business = await prisma.business.findUnique({
      where: { telnyxPhoneNumber: to },
      select: {
        id: true,
        callsSuspendedAt: true,
        paymentFailureSuspensionAt: true,
        agents: {
          where: {
            active: true,
            deletedAt: null,
            telnyxAssistantId: { not: null },
          },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { id: true, telnyxAssistantId: true },
        },
      },
    });

    if (!business) {
      console.error(`[Telnyx] No hay negocio registrado para el número ${to}`);
      await telnyxAiAdapter.hangupCall(call_control_id).catch(() => {});
      return { success: false };
    }

    const agent = selectTelnyxInboundAgent(business);
    if (!agent) {
      console.warn(
        `[Telnyx] Negocio ${business.id} sin assistant Telnyx operativo o suspendido — se cuelga la llamada`
      );
      await telnyxAiAdapter.hangupCall(call_control_id).catch(() => {});
      return { success: false };
    }

    // upsert, no create: un reintento del mismo call.initiated no debe
    // pisar el estado que ya haya avanzado la llamada.
    await prisma.call.upsert({
      where: { vapiCallId: call_control_id },
      create: {
        vapiCallId: call_control_id,
        voiceProvider: "telnyx",
        providerCallId: call_control_id,
        businessId: business.id,
        agentId: agent.id,
        fromNumber: from || null,
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
      update: {},
    });

    await telnyxAiAdapter.answerCallWithAssistant(
      call_control_id,
      agent.telnyxAssistantId
    );

    console.log(
      `[Telnyx] ${callLabel(call_control_id)} contestada con el assistant ${agent.telnyxAssistantId}`
    );
    return { success: true };
  } catch (error) {
    console.error(
      `[Telnyx] Error procesando inicio de ${callLabel(call_control_id)}: ${errorMessage(error)}`
    );
    return { success: false };
  }
}

export async function handleCallHangup(
  payload: unknown
): Promise<{ success: boolean }> {
  const event = TelnyxCallHangupSchema.parse(payload);
  const { call_control_id, hangup_cause } = event.data.payload;

  console.log(
    `[Telnyx] Colgó ${callLabel(call_control_id)} · motivo=${hangup_cause ?? "no indicado"}`
  );

  try {
    const dbCall = await prisma.call.findUnique({
      where: { vapiCallId: call_control_id },
    });
    if (!dbCall) {
      console.warn(
        `[Telnyx] ${callLabel(call_control_id)} no existía en la base de datos al colgar`
      );
      return { success: false };
    }

    const finalStatus =
      hangup_cause === "call_rejected" || hangup_cause === "timeout"
        ? "FAILED"
        : "COMPLETED";
    const durationSecs =
      dbCall.durationSecs ??
      Math.max(
        0,
        Math.round((Date.now() - dbCall.startedAt.getTime()) / 1000)
      );

    await prisma.call.update({
      where: { id: dbCall.id },
      data: {
        status: finalStatus,
        endedAt: dbCall.endedAt ?? new Date(),
        durationSecs,
      },
    });

    try {
      await enqueueUsageReportJob(
        { businessId: dbCall.businessId },
        `report-usage-${dbCall.id}`
      );
    } catch (err) {
      console.error(
        `[Telnyx] No se pudo encolar el consumo de ${callLabel(call_control_id)}: ${errorMessage(err)}`
      );
    }

    return { success: true };
  } catch (error) {
    console.error(
      `[Telnyx] Error procesando el colgado de ${callLabel(call_control_id)}: ${errorMessage(error)}`
    );
    return { success: false };
  }
}

export async function handleCallConversationEnded(
  payload: unknown
): Promise<{ success: boolean }> {
  const event = TelnyxCallConversationEndedSchema.parse(payload);
  const { call_control_id, conversation_id, duration_sec } =
    event.data.payload;

  if (!call_control_id) {
    console.error(`[Telnyx] call.conversation.ended sin call_control_id`);
    return { success: false };
  }

  console.log(
    `[Telnyx] Conversación finalizada para ${callLabel(call_control_id)} · duración=${
      duration_sec ?? "no indicada"
    }s`
  );

  try {
    const dbCall = await prisma.call.findUnique({
      where: { vapiCallId: call_control_id },
    });
    if (!dbCall) {
      console.warn(
        `[Telnyx] ${callLabel(call_control_id)} no existía en la base de datos al finalizar la conversación`
      );
      return { success: false };
    }

    await prisma.call.update({
      where: { id: dbCall.id },
      data: {
        providerConversationId: conversation_id ?? dbCall.providerConversationId,
        durationSecs:
          duration_sec !== undefined
            ? Math.round(duration_sec)
            : dbCall.durationSecs,
      },
    });

    if (conversation_id) {
      try {
        const messages = await telnyxAiAdapter.listConversationMessages(
          conversation_id
        );
        if (messages.length > 0) {
          const fullText = messages
            .map((message) => `${message.role}: ${message.text}`)
            .join("\n");
          // Objeto plano: TelnyxConversationMessage con campos opcionales no
          // encaja en el tipo JSON estructural que exige Prisma.
          const jsonMessages = messages.map((message) => ({
            role: message.role,
            text: message.text,
            createdAt: message.createdAt ?? null,
            sentAt: message.sentAt ?? null,
          }));
          await prisma.transcript.upsert({
            where: { callId: dbCall.id },
            create: { callId: dbCall.id, fullText, messages: jsonMessages },
            update: { fullText, messages: jsonMessages },
          });
        }
      } catch (err) {
        console.error(
          `[Telnyx] No se pudo descargar la transcripción de ${callLabel(call_control_id)}: ${errorMessage(err)}`
        );
      }
    }

    return { success: true };
  } catch (error) {
    console.error(
      `[Telnyx] Error procesando fin de conversación de ${callLabel(call_control_id)}: ${errorMessage(error)}`
    );
    return { success: false };
  }
}

export async function handleCallRecordingSaved(
  payload: unknown
): Promise<{ success: boolean }> {
  const event = TelnyxCallRecordingSavedSchema.parse(payload);
  const { call_leg_id, recording_urls } = event.data.payload;
  const url = recording_urls?.mp3 ?? recording_urls?.wav ?? undefined;

  if (!call_leg_id || !url) {
    console.warn(
      `[Telnyx] call.recording.saved sin call_leg_id o URL de descarga utilizable`
    );
    return { success: false };
  }

  try {
    // El evento no trae call_control_id — se resuelve vía la API de
    // grabaciones filtrando por call_leg_id (sí presente en el webhook).
    const [recording] = await telnyxAiAdapter.listRecordingsByCallLegId(
      call_leg_id
    );
    const callControlId = recording?.callControlId;
    if (!callControlId) {
      console.error(
        `[Telnyx] No se pudo resolver call_control_id para la grabación del leg ${call_leg_id}`
      );
      return { success: false };
    }

    const dbCall = await prisma.call.findUnique({
      where: { vapiCallId: callControlId },
    });
    if (!dbCall) {
      console.warn(
        `[Telnyx] ${callLabel(callControlId)} no existía en la base de datos al recibir la grabación`
      );
      return { success: false };
    }

    await prisma.recording.upsert({
      where: { callId: dbCall.id },
      create: { callId: dbCall.id, vapiUrl: url },
      update: { vapiUrl: url },
    });

    try {
      await enqueueRecordingJob(
        { callId: dbCall.id, vapiUrl: url, businessId: dbCall.businessId },
        `process-recording-${dbCall.id}`
      );
    } catch (err) {
      console.error(
        `[Telnyx] Grabación guardada pero no se pudo encolar su copia para ${callLabel(callControlId)}: ${errorMessage(err)}`
      );
    }

    return { success: true };
  } catch (error) {
    console.error(`[Telnyx] Error procesando grabación: ${errorMessage(error)}`);
    return { success: false };
  }
}

/**
 * Registra los insights generados, sin mapearlos todavía a
 * CallOutcome/CallEscalationReason: ese mapeo depende del Insight Group real
 * de la cuenta (plan §2, "Insight group común de plataforma"), que no existe
 * todavía — construirlo es trabajo de Fase 0/3.1, no algo que se pueda
 * inventar sin ver los insight_id reales que devuelve la cuenta.
 */
export async function handleCallConversationInsightsGenerated(
  payload: unknown
): Promise<{ success: boolean }> {
  const event = TelnyxCallConversationInsightsGeneratedSchema.parse(payload);
  const { call_control_id, results } = event.data.payload;

  console.log(
    `[Telnyx] Insights recibidos para ${callLabel(call_control_id)}: ${JSON.stringify(
      results ?? []
    )}`
  );

  return { success: true };
}

/**
 * Guarda el coste real de la llamada — solo llega si el Call Control App de
 * plataforma tiene `call_cost_in_webhooks` activado (ver
 * scripts/provisionCallControlApp.ts). Requiere seguimiento interno de
 * coste, no forma parte del diseño original del plan.
 */
export async function handleCallCost(
  payload: unknown
): Promise<{ success: boolean }> {
  const event = TelnyxCallCostSchema.parse(payload);
  const { call_control_id, total_cost, status } = event.data.payload;

  if (!call_control_id) {
    console.error(`[Telnyx] call.cost sin call_control_id`);
    return { success: false };
  }

  if (status === "error" || total_cost == null) {
    console.warn(
      `[Telnyx] call.cost de ${callLabel(call_control_id)} sin coste calculable (status=${status ?? "desconocido"})`
    );
    return { success: true };
  }

  const costCents = Math.round(Number(total_cost) * 100);
  if (!Number.isFinite(costCents)) {
    console.error(
      `[Telnyx] total_cost no numérico para ${callLabel(call_control_id)}: ${total_cost}`
    );
    return { success: false };
  }

  try {
    const dbCall = await prisma.call.findUnique({
      where: { vapiCallId: call_control_id },
    });
    if (!dbCall) {
      console.warn(
        `[Telnyx] ${callLabel(call_control_id)} no existía en la base de datos al recibir el coste`
      );
      return { success: false };
    }

    await prisma.call.update({
      where: { id: dbCall.id },
      data: { providerCostCents: costCents },
    });

    console.log(
      `[Telnyx] Coste guardado para ${callLabel(call_control_id)}: ${costCents} céntimos`
    );
    return { success: true };
  } catch (error) {
    console.error(
      `[Telnyx] Error guardando el coste de ${callLabel(call_control_id)}: ${errorMessage(error)}`
    );
    return { success: false };
  }
}
