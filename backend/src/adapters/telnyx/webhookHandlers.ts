import { z } from "zod";
import type { CallEscalationReason, CallOutcome } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { telnyxAiAdapter } from "./TelnyxAiAdapter.js";
import {
  enqueueRecordingJob,
  enqueueUsageReportJob,
} from "../../lib/cloudTasks.js";
import { callLabel, errorMessage } from "../../lib/logUtils.js";
import { selectTelnyxInboundAgent } from "../../modules/phone/telnyxInbound.js";
import { executeVoiceTool } from "../../modules/voiceTools/service.js";
import {
  comprobacionDeDesvioReciente,
  leerClientStateDeComprobacion,
  registrarLlamadaDeComprobacionRecibida,
  registrarSalienteColgada,
  registrarSalienteContestada,
} from "../../modules/onboarding/comprobacionDesvio.js";
import { marcarPataSinCall, motivoDePataSinCall } from "./patasSinCall.js";

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
        // `outgoing` en la pata que origina `client.calls.dial()` (hoy solo
        // «Comprobar desvío») — nunca es una llamada de cliente.
        direction: z.string().optional(),
        // Telnyx manda `client_state: null` (no lo omite) en toda llamada
        // sin estado, es decir, en TODAS las de clientes: `.nullable()` es
        // obligatorio o el parse tumba la recepcionista entera.
        client_state: z.string().nullable().optional(),
      })
      .passthrough(),
  }),
});

const TelnyxCallAnsweredSchema = z.object({
  data: z.object({
    id: z.string(),
    event_type: z.literal("call.answered"),
    payload: z
      .object({
        call_control_id: z.string(),
        client_state: z.string().nullable().optional(),
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
        client_state: z.string().nullable().optional(),
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

const TelnyxCostPartSchema = z
  .object({
    call_part: z.string().optional(),
    cost: z.string().optional(),
    currency: z.string().optional(),
    rate: z.string().optional(),
    billed_duration_secs: z.number().optional(),
  })
  .passthrough();

const TelnyxCallCostSchema = z.object({
  data: z.object({
    id: z.string(),
    event_type: z.literal("call.cost"),
    payload: z
      .object({
        call_control_id: z.string().optional(),
        client_state: z.string().nullable().optional(),
        // Sin campo de moneda propio a este nivel (sí lo tiene cada
        // cost_part) — se asume USD, el default habitual de Telnyx, hasta
        // confirmar lo contrario para esta cuenta.
        total_cost: z.string().nullable().optional(),
        status: z.enum(["success", "error"]).optional(),
        // Desglose por partida (sip-trunking, call-control,
        // call-recording...) — SOLO telefonía, nunca IA. Confirmado
        // 2026-09-12 contra usageReports: el coste de IA (LLM+STT+TTS) se
        // reporta aparte, como producto ai-voice-assistant, y no aparece
        // en cost_parts ni en total_cost.
        cost_parts: z.array(TelnyxCostPartSchema).optional(),
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

/**
 * «Comprobar desvío» (PLAN-TELEFONIA-UX.md § 4): el número de Alhabla del
 * negocio llama a su línea de clientes y, si el desvío funciona, la llamada
 * vuelve a entrar por ese mismo número de Alhabla con `from` = el propio
 * número de Alhabla — ningún cliente llama desde ahí. Por si la operadora
 * de la línea presentase como llamante a la propia línea desviada en vez
 * de al llamante original, también cuenta `from` = línea de clientes, pero
 * solo si hay una comprobación reciente (ventana de 45 s desde que empezó,
 * resuelta o no: el colgado de la saliente puede procesarse antes).
 */
async function esLlamadaDeComprobacionDeDesvio(
  business: { id: string; phone: string; telnyxPhoneNumber: string | null },
  from: string | undefined
): Promise<boolean> {
  if (!from) return false;
  if (business.telnyxPhoneNumber && from === business.telnyxPhoneNumber) {
    return true;
  }
  if (from !== business.phone) return false;
  try {
    return (await comprobacionDeDesvioReciente(business.id)) !== null;
  } catch (error) {
    console.error(
      `[Telnyx] Negocio ${business.id}: no se pudo consultar si hay una comprobación de desvío reciente: ${errorMessage(error)}`
    );
    return false;
  }
}

/**
 * La llamada de comprobación se cuelga sin contestar y sin crear Call: no
 * es una llamada de cliente, no hay recepcionista, transcripción ni coste
 * que registrar. Marcar el resultado y colgar son independientes: aunque
 * Redis/Postgres fallen, la llamada no se queda sonando.
 */
async function recibirLlamadaDeComprobacion(
  businessId: string,
  callControlId: string
): Promise<{ success: boolean }> {
  let success = true;
  // Su colgado (y su coste, si lo hay) no deben buscar una Call que no existe.
  await marcarPataSinCall(callControlId, "comprobacion");
  try {
    const check = await registrarLlamadaDeComprobacionRecibida(businessId);
    console.log(
      `[Telnyx] ${callLabel(callControlId)} es la comprobación de desvío ${check?.id ?? "(sin comprobación viva)"} del negocio ${businessId}; se cuelga sin arrancar la recepcionista`
    );
  } catch (error) {
    success = false;
    console.error(
      `[Telnyx] Negocio ${businessId}: no se pudo registrar la llamada de comprobación de desvío ${callLabel(callControlId)}: ${errorMessage(error)}`
    );
  }
  try {
    await telnyxAiAdapter.hangupCall(callControlId);
  } catch (error) {
    success = false;
    console.error(
      `[Telnyx] No se pudo colgar la llamada de comprobación ${callLabel(callControlId)}: ${errorMessage(error)}`
    );
  }
  return { success };
}

/**
 * `call.answered` solo interesa para la pata saliente de «Comprobar
 * desvío»: si alguien la coge (el dueño por reflejo o su contestador), la
 * comprobación ya no puede salir bien, así que se anota y se cuelga para no
 * dejar a nadie escuchando silencio. Para las llamadas de clientes (la
 * recepcionista contesta con `answerCallWithAssistant`) no hay nada que
 * hacer aquí.
 */
export async function handleCallAnswered(
  payload: unknown
): Promise<{ success: boolean }> {
  const event = TelnyxCallAnsweredSchema.parse(payload);
  const { call_control_id, client_state } = event.data.payload;

  const comprobacion = leerClientStateDeComprobacion(client_state);
  if (!comprobacion) return { success: true };

  try {
    const check = await registrarSalienteContestada(comprobacion.checkId);
    console.log(
      `[Telnyx] La llamada de comprobación de desvío ${comprobacion.checkId} del negocio ${comprobacion.businessId} la ha cogido alguien${check ? "" : " (comprobación ya caducada)"}; se cuelga`
    );
  } catch (error) {
    console.error(
      `[Telnyx] No se pudo anotar que la comprobación ${comprobacion.checkId} fue contestada: ${errorMessage(error)}`
    );
  }
  try {
    await telnyxAiAdapter.hangupCall(call_control_id);
  } catch (error) {
    console.error(
      `[Telnyx] No se pudo colgar la saliente de comprobación ${callLabel(call_control_id)}: ${errorMessage(error)}`
    );
  }
  return { success: true };
}

export async function handleCallInitiated(
  payload: unknown
): Promise<{ success: boolean }> {
  const event = TelnyxCallInitiatedSchema.parse(payload);
  const { call_control_id, from, to, direction, client_state } =
    event.data.payload;

  console.log(
    `[Telnyx] Inició ${callLabel(call_control_id)} → ${to ?? "número desconocido"}`
  );

  // Pata saliente de «Comprobar desvío» (o cualquier otra que originemos
  // nosotros): no es una llamada de cliente. Sin esta salida, el `to` (la
  // línea del negocio) no casaría con ningún número de Alhabla y se
  // colgaría nuestra propia llamada como «negocio desconocido».
  if (leerClientStateDeComprobacion(client_state)) {
    console.log(
      `[Telnyx] ${callLabel(call_control_id)} es la saliente de «Comprobar desvío»; no se trata como llamada de cliente`
    );
    return { success: true };
  }
  if (direction === "outgoing") {
    // La pata que abre la tool `transfer` hacia el móvil del dueño (fase
    // 4): nace sin client_state y no tiene Call. Se apunta para que su
    // colgado y su coste no se procesen como llamada desconocida.
    console.log(
      `[Telnyx] ${callLabel(call_control_id)} es una pata saliente propia (${from ?? "?"} → ${to ?? "?"}), seguramente una transferencia al dueño; no se trata como llamada de cliente`
    );
    await marcarPataSinCall(call_control_id, "transferencia");
    return { success: true };
  }

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
        phone: true,
        telnyxPhoneNumber: true,
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

    if (await esLlamadaDeComprobacionDeDesvio(business, from)) {
      return recibirLlamadaDeComprobacion(business.id, call_control_id);
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
      where: { callId: call_control_id },
      create: {
        callId: call_control_id,
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

    // Mejora de calidad de audio, nunca debe poder tumbar la llamada ya
    // contestada — BETA de Telnyx, aislado en su propio try/catch.
    try {
      await telnyxAiAdapter.startNoiseSuppression(call_control_id);
    } catch (noiseSuppressionError) {
      console.error(
        `[Telnyx] ${callLabel(call_control_id)} no se pudo activar la supresión de ruido: ${errorMessage(noiseSuppressionError)}`
      );
    }

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
  const { call_control_id, hangup_cause, client_state } = event.data.payload;

  console.log(
    `[Telnyx] Colgó ${callLabel(call_control_id)} · motivo=${hangup_cause ?? "no indicado"}`
  );

  // Pata saliente de «Comprobar desvío»: cierra la comprobación (fallo si
  // la llamada nunca volvió a entrar por el número de Alhabla) y nada más —
  // no hay Call que actualizar ni consumo que reportar.
  const comprobacion = leerClientStateDeComprobacion(client_state);
  if (comprobacion) {
    try {
      await registrarSalienteColgada(comprobacion.checkId, hangup_cause);
    } catch (error) {
      console.error(
        `[Telnyx] No se pudo cerrar la comprobación de desvío ${comprobacion.checkId} del negocio ${comprobacion.businessId}: ${errorMessage(error)}`
      );
      return { success: false };
    }
    return { success: true };
  }

  try {
    const dbCall = await prisma.call.findUnique({
      where: { callId: call_control_id },
    });
    if (!dbCall) {
      const pataPropia = await motivoDePataSinCall(call_control_id);
      if (pataPropia) {
        console.log(
          `[Telnyx] Colgó la pata propia ${callLabel(call_control_id)} (${pataPropia}) · motivo=${hangup_cause ?? "no indicado"}; no hay Call que actualizar`
        );
        return { success: true };
      }
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
      where: { callId: call_control_id },
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
        // `client.ai.conversations.messages.list()` devuelve del más
        // reciente al más antiguo (verificado en vivo 2026-09-12) — sin
        // reordenar, fullText queda con la conversación al revés.
        messages.sort((a, b) => {
          const timeA = Date.parse(a.sentAt ?? a.createdAt ?? "");
          const timeB = Date.parse(b.sentAt ?? b.createdAt ?? "");
          return timeA - timeB;
        });
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
      where: { callId: callControlId },
    });
    if (!dbCall) {
      console.warn(
        `[Telnyx] ${callLabel(callControlId)} no existía en la base de datos al recibir la grabación`
      );
      return { success: false };
    }

    // El leg se guarda porque esta URL caduca a los 10 minutos: si la copia
    // a R2 no llega a tiempo, processRecording le pide otra a Telnyx con él.
    await prisma.recording.upsert({
      where: { callId: dbCall.id },
      create: { callId: dbCall.id, externalUrl: url, providerLegId: call_leg_id },
      update: { externalUrl: url, providerLegId: call_leg_id },
    });

    try {
      await enqueueRecordingJob(
        { callId: dbCall.id, externalUrl: url, businessId: dbCall.businessId },
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
const VALID_CALL_OUTCOMES: CallOutcome[] = [
  "RESOLVED",
  "FRUSTRATED",
  "NO_ANSWER",
  "ESCALATED",
  "LEAD_CAPTURED",
];

const VALID_ESCALATION_REASONS: CallEscalationReason[] = [
  "CLIENTE_LO_PIDIO",
  "FALLO_TECNICO",
  "FUERA_DE_HORARIO",
  "CONSULTA_COMPLEJA",
  "NO_APLICA",
];

/**
 * Los insights custom devuelven su `result` siguiendo el json_schema con el
 * que se crearon en Telnyx (`{ "<nombre_del_campo>": <valor> }`, ver
 * scripts/createTelnyxCallInsights.ts) — pero por si acaso Telnyx aplanase el
 * valor (lo devolviera directo, sin envolver), se acepta también esa forma.
 * Sin verificar todavía contra una llamada real (ver nota en la función que
 * llama a esto) — si el resultado real difiere, ajustar aquí, no en cada
 * mapeador individual.
 */
function unwrapInsightResult(result: unknown, fieldName: string): unknown {
  if (result && typeof result === "object" && fieldName in result) {
    return (result as Record<string, unknown>)[fieldName];
  }
  return result;
}

function mapTelnyxCallOutcome(value: unknown): CallOutcome | null {
  return typeof value === "string" &&
    (VALID_CALL_OUTCOMES as string[]).includes(value)
    ? (value as CallOutcome)
    : null;
}

function mapTelnyxEscalationReason(value: unknown): CallEscalationReason | null {
  return typeof value === "string" &&
    (VALID_ESCALATION_REASONS as string[]).includes(value)
    ? (value as CallEscalationReason)
    : null;
}

function mapTelnyxToolFailureDetected(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * IDs reales de los 3 insights custom creados en la cuenta de Telnyx
 * (2026-09-14, ver memoria del proyecto) y asignados al insight group
 * "Default" que ya usan los 5 assistants — mismas categorías que
 * CALL_OUTCOME_ANALYSIS_FIELD/ESCALATION_REASON_FIELD/TOOL_FAILURE_FIELD de
 * Retell (agentBootstrap.ts), para que ambos proveedores clasifiquen la
 * llamada de forma comparable. `requested_service_type` queda fuera a
 * propósito: en Retell es un enum generado por negocio (sus propios
 * servicios), pero el insight group de Telnyx es único y compartido para
 * toda la plataforma — no hay un mecanismo limpio para un enum por negocio
 * aquí sin duplicar insights por cada uno.
 */
function getTelnyxInsightIds() {
  return {
    callOutcome: process.env.TELNYX_INSIGHT_CALL_OUTCOME_ID,
    escalationReason: process.env.TELNYX_INSIGHT_ESCALATION_REASON_ID,
    toolFailureDetected: process.env.TELNYX_INSIGHT_TOOL_FAILURE_ID,
  };
}

/**
 * NO verificado todavía contra una llamada real (a diferencia del resto del
 * webhook de Telnyx) — construido a partir del json_schema con el que se
 * crearon los insights, no de un payload real observado. Sigue el mismo
 * patrón defensivo que el resto de esta sesión: nunca lanza, un insight
 * desconocido o con forma inesperada simplemente no actualiza ese campo.
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

  if (!call_control_id || !results?.length) {
    return { success: true };
  }

  try {
    const insightIds = getTelnyxInsightIds();
    let outcome: CallOutcome | null = null;
    let escalationReason: CallEscalationReason | null = null;
    let toolFailureDetected: boolean | undefined;

    for (const { insight_id, result } of results) {
      if (insight_id && insight_id === insightIds.callOutcome) {
        outcome = mapTelnyxCallOutcome(
          unwrapInsightResult(result, "call_outcome")
        );
      } else if (insight_id && insight_id === insightIds.escalationReason) {
        escalationReason = mapTelnyxEscalationReason(
          unwrapInsightResult(result, "escalation_reason")
        );
      } else if (insight_id && insight_id === insightIds.toolFailureDetected) {
        toolFailureDetected = mapTelnyxToolFailureDetected(
          unwrapInsightResult(result, "tool_failure_detected")
        );
      }
    }

    const analysisUpdate = {
      ...(outcome !== null ? { outcome } : {}),
      ...(escalationReason !== null ? { escalationReason } : {}),
      ...(toolFailureDetected !== undefined ? { toolFailureDetected } : {}),
    };

    if (Object.keys(analysisUpdate).length > 0) {
      await prisma.call.update({
        where: { callId: call_control_id },
        data: analysisUpdate,
      });
    }
  } catch (error) {
    console.error(
      `[Telnyx] No se pudo aplicar el mapeo de insights de ${callLabel(call_control_id)}: ${errorMessage(error)}`
    );
  }

  return { success: true };
}

/**
 * Guarda el coste de TELEFONÍA de la llamada (sip-trunking, call-control,
 * grabación) — solo llega si el Call Control App de plataforma tiene
 * `call_cost_in_webhooks` activado (ver scripts/provisionCallControlApp.ts).
 * Requiere seguimiento interno de coste, no forma parte del diseño original
 * del plan. NO incluye el coste de IA (LLM+STT+TTS): ese se factura como
 * producto ai-voice-assistant y solo se puede consultar de forma agregada
 * (por hora y assistant_id, no por llamada) vía client.usageReports.list().
 */
export async function handleCallCost(
  payload: unknown
): Promise<{ success: boolean }> {
  const event = TelnyxCallCostSchema.parse(payload);
  const { call_control_id, total_cost, status, cost_parts, client_state } =
    event.data.payload;

  // El coste de la pata saliente de «Comprobar desvío» no es de ninguna
  // llamada de cliente: se deja en el log y no se busca una Call que no
  // existe.
  if (leerClientStateDeComprobacion(client_state)) {
    console.log(
      `[Telnyx] Coste de la llamada de comprobación de desvío ${callLabel(call_control_id)}: ${total_cost ?? "sin importe"} (no se guarda)`
    );
    return { success: true };
  }

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
      where: { callId: call_control_id },
    });
    if (!dbCall) {
      const pataPropia = await motivoDePataSinCall(call_control_id);
      if (pataPropia) {
        console.log(
          `[Telnyx] Coste de la pata propia ${callLabel(call_control_id)} (${pataPropia}): ${total_cost} (no se guarda: no hay Call)`
        );
        return { success: true };
      }
      console.warn(
        `[Telnyx] ${callLabel(call_control_id)} no existía en la base de datos al recibir el coste`
      );
      return { success: false };
    }

    const costBreakdown = cost_parts?.map((part) => ({
      call_part: part.call_part ?? null,
      cost: part.cost ?? null,
      currency: part.currency ?? null,
      rate: part.rate ?? null,
      billed_duration_secs: part.billed_duration_secs ?? null,
    }));

    await prisma.call.update({
      where: { id: dbCall.id },
      data: {
        providerCostCents: costCents,
        providerCostBreakdown: costBreakdown ?? undefined,
      },
    });

    console.log(
      `[Telnyx] Coste de telefonía guardado para ${callLabel(call_control_id)}: ${costCents} céntimos (no incluye IA)`
    );
    return { success: true };
  } catch (error) {
    console.error(
      `[Telnyx] Error guardando el coste de ${callLabel(call_control_id)}: ${errorMessage(error)}`
    );
    return { success: false };
  }
}

export interface TelnyxToolInvocationResult {
  status: number;
  body: unknown;
}

/**
 * Resuelve y ejecuta una tool invocada por un assistant Telnyx durante una
 * llamada (plan §4: "Las tools usan call_control_id del sistema... ignora
 * cualquier businessId... enviado por el modelo"). El `businessId` SIEMPRE
 * se deriva de la `Call` ya persistida por `call_control_id` (header
 * X-Alhabla-Call-Control-Id, templado por Telnyx con la variable de sistema
 * {{call_control_id}} — ver telnyxAssistantPayload.ts) — nunca de `params`
 * (lo que el LLM decide mandar en el body). Aísla dos negocios aunque un
 * modelo mal instruido intente colar un businessId ajeno: ese campo, si
 * aparece en `params`, viaja sin usarse para autorizar nada, porque ninguna
 * tool real (get_catalog/check_availability/book_appointment) lo declara
 * como parámetro (ver calendarService.buildTelnyxCalendarTools).
 */
export async function handleTelnyxToolInvocation(input: {
  callControlId: string | undefined;
  toolName: string;
  params: Record<string, unknown>;
}): Promise<TelnyxToolInvocationResult> {
  const { callControlId, toolName, params } = input;

  if (!callControlId) {
    console.error(
      `[Telnyx Tool] Falta el header X-Alhabla-Call-Control-Id en ${toolName}`
    );
    return { status: 400, body: { error: "Missing call_control_id" } };
  }

  try {
    const call = await prisma.call.findUnique({
      where: { callId: callControlId },
      select: { businessId: true },
    });

    if (!call) {
      console.error(`[Telnyx Tool] No se encontró la llamada ${callControlId}`);
      return { status: 404, body: { error: "Call not found" } };
    }

    const result = await executeVoiceTool({
      businessId: call.businessId,
      toolName,
      params,
      callLabel: `llamada ${callControlId}`,
      callId: callControlId,
    });

    return { status: result.success ? 200 : 500, body: result.result };
  } catch (error) {
    console.error(
      `[Telnyx Tool] Error ejecutando ${toolName}: ${errorMessage(error)}`
    );
    return { status: 500, body: { error: "Internal server error" } };
  }
}
