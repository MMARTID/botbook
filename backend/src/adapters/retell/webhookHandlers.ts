import { z } from "zod";
import type {
  CallEscalationReason,
  CallOutcome,
  CallSentiment,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { enqueueRecordingJob, enqueueUsageReportJob } from "../../lib/cloudTasks.js";
import { callLabel, errorMessage } from "../../lib/logUtils.js";

// Un call_started retrasado o reentregado por Retell no debe poder revivir
// una llamada que ya llegó a un estado terminal (call_ended ya se procesó)
// — hallazgo #20 de la auditoría: sin esto, la llamada desaparecía
// temporalmente de las estadísticas de facturación (vuelve a IN_PROGRESS,
// que getBillingSummary excluye) y la limpieza de zombies podía marcarla
// TIMED_OUT más tarde aunque en realidad se hubiera completado bien.
const TERMINAL_CALL_STATUSES = ["COMPLETED", "FAILED", "TIMED_OUT"] as const;

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

const RetellCallStartedSchema = z.object({
  event_type: z.literal("call_started"),
  data: z.object({
    call_id: z.string(),
    agent_id: z.string(),
    agent_version: z.union([z.string(), z.number()]).optional(),
    from_number: z.string().optional(),
    to_number: z.string().optional(),
    direction: z.string().optional(),
  }),
});

const RetellTranscriptTurnSchema = z
  .object({
    role: z.string(),
    content: z.string(),
  })
  .passthrough();

const RetellCallEndedSchema = z.object({
  event_type: z.literal("call_ended"),
  data: z.object({
    call_id: z.string(),
    agent_id: z.string(),
    duration_ms: z.number().optional(),
    disconnection_reason: z.string().optional(),
    recording_url: z.string().optional(),
    stereo_recording_url: z.string().optional(),
    transcript: z.string().optional(),
    transcript_object: z.array(RetellTranscriptTurnSchema).optional(),
    summary: z.string().optional(),
    call_cost: z
      .object({
        combined_cost: z.number().optional(),
      })
      .optional(),
  }),
});

const RetellCallAnalysisSchema = z
  .object({
    call_successful: z.boolean().optional(),
    call_summary: z.string().optional(),
    user_sentiment: z
      .enum(["Positive", "Neutral", "Negative", "Unknown"])
      .optional(),
    // Definidos por nosotros vía post_call_analysis_data (ver
    // agentBootstrap.ts). Los cuatro se piden en cada llamada: parsearlos a
    // medias era tirar análisis ya pagado.
    custom_analysis_data: z
      .object({
        call_outcome: z.string().optional(),
        escalation_reason: z.string().optional(),
        tool_failure_detected: z.boolean().optional(),
        requested_service_type: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const RetellCallAnalyzedSchema = z.object({
  event_type: z.literal("call_analyzed"),
  data: z.object({
    call_id: z.string(),
    agent_id: z.string(),
    summary: z.string().optional(),
    transcript: z.string().optional(),
    transcript_object: z.array(RetellTranscriptTurnSchema).optional(),
    recording_url: z.string().optional(),
    call_analysis: RetellCallAnalysisSchema.optional(),
  }),
});

export type RetellWebhookPayload =
  | z.infer<typeof RetellCallStartedSchema>
  | z.infer<typeof RetellCallEndedSchema>
  | z.infer<typeof RetellCallAnalyzedSchema>;

/**
 * Normaliza los payloads de prueba de Retell, que usan `event` y `call`
 * en lugar de `event_type` y `data`.
 */
export function normalizeRetellWebhookPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const p = payload as Record<string, any>;
  const normalized: Record<string, any> = { ...p };

  if (!normalized.event_type && normalized.event) {
    normalized.event_type = normalized.event;
  }

  if (!normalized.data && normalized.call) {
    normalized.data = normalized.call;
  }

  return normalized;
}

function sanitizeRetellTranscriptMessages(
  items: z.infer<typeof RetellTranscriptTurnSchema>[] | undefined
): { role: string; content: string }[] {
  if (!items) return [];
  return items.map(({ role, content }) => ({ role, content }));
}

function mapRetellSentiment(
  sentiment: "Positive" | "Neutral" | "Negative" | "Unknown" | undefined
): CallSentiment | null {
  switch (sentiment) {
    case "Positive":
      return "POSITIVE";
    case "Neutral":
      return "NEUTRAL";
    case "Negative":
      return "NEGATIVE";
    default:
      return null;
  }
}

const VALID_CALL_OUTCOMES: CallOutcome[] = [
  "RESOLVED",
  "FRUSTRATED",
  "NO_ANSWER",
  "ESCALATED",
  "LEAD_CAPTURED",
];

function mapRetellCallOutcome(value: string | undefined): CallOutcome | null {
  return value && (VALID_CALL_OUTCOMES as string[]).includes(value)
    ? (value as CallOutcome)
    : null;
}

const VALID_ESCALATION_REASONS: CallEscalationReason[] = [
  "CLIENTE_LO_PIDIO",
  "FALLO_TECNICO",
  "FUERA_DE_HORARIO",
  "CONSULTA_COMPLEJA",
  "NO_APLICA",
];

function mapRetellEscalationReason(
  value: string | undefined
): CallEscalationReason | null {
  return value && (VALID_ESCALATION_REASONS as string[]).includes(value)
    ? (value as CallEscalationReason)
    : null;
}

/**
 * `requested_service_type` llega con el nombre literal del servicio del
 * negocio, o con los comodines OTRO/NO_APLICA que añade
 * buildRequestedServiceAnalysisField. NO_APLICA se guarda como null: no
 * aporta nada distinto de «no se mencionó ningún servicio».
 */
function mapRetellRequestedService(value: string | undefined): string | null {
  if (!value || value === "NO_APLICA") return null;
  return value.slice(0, 80);
}

async function resolveBusinessIdByRetellAgentId(
  retellAgentId: string
): Promise<string | null> {
  const agent = await prisma.agent.findFirst({
    where: { retellAgentId },
    select: { businessId: true },
  });
  return agent?.businessId || null;
}

export async function handleCallStarted(
  payload: unknown
): Promise<{ success: boolean }> {
  const event = RetellCallStartedSchema.parse(payload);
  const { call_id, agent_id, from_number } = event.data;

  console.log(`[Retell] Inició ${callLabel(call_id)} · agente=${agent_id}`);

  try {
    const businessId = await resolveBusinessIdByRetellAgentId(agent_id);
    if (!businessId) {
      console.error(
        `[Retell] No se pudo identificar el negocio de la ${callLabel(call_id)} (agente ${agent_id})`
      );
      return { success: false };
    }

    const agent = await prisma.agent.findFirst({
      where: { retellAgentId: agent_id },
      select: { id: true },
    });

    // No separar la lectura del estado y su actualización: call_ended puede
    // completar la llamada entre ambas operaciones. updateMany incluye el
    // estado en el WHERE, de modo que PostgreSQL lo vuelve a comprobar al
    // obtener el lock de la fila y nunca revive una llamada terminal.
    const updated = await prisma.call.updateMany({
      where: {
        vapiCallId: call_id,
        status: { notIn: [...TERMINAL_CALL_STATUSES] },
      },
      data: { status: "IN_PROGRESS" },
    });

    if (updated.count === 0) {
      try {
        await prisma.call.create({
          data: {
            vapiCallId: call_id,
            businessId,
            agentId: agent?.id || null,
            fromNumber: from_number || null,
            status: "IN_PROGRESS",
            startedAt: new Date(),
          },
        });
      } catch (error) {
        // Otro webhook puede haber creado o completado la fila justo antes
        // de este INSERT. La restricción unique hace de cierre atómico de la
        // carrera y, al no actualizar después, mantiene el estado terminal.
        if (!isUniqueConstraintError(error)) throw error;
        console.warn(
          `[Retell] Inicio tardío o duplicado ignorado para ${callLabel(call_id)}`
        );
      }
    }

    console.log(`[Retell] ${callLabel(call_id)} registrada correctamente`);
    return { success: true };
  } catch (error) {
    console.error(
      `[Retell] Error procesando inicio de ${callLabel(call_id)}: ${errorMessage(
        error
      )}`
    );
    return { success: false };
  }
}

export async function handleCallEnded(
  payload: unknown
): Promise<{ success: boolean }> {
  const event = RetellCallEndedSchema.parse(payload);
  const { call_id, agent_id } = event.data;
  const data = event.data;

  const durationSecs =
    data.duration_ms !== undefined
      ? Math.round(data.duration_ms / 1000)
      : undefined;

  console.log(
    `[Retell] Finalizó ${callLabel(call_id)} · duración=${
      durationSecs ?? "no indicada"
    }s · motivo=${data.disconnection_reason ?? "no indicado"}`
  );

  try {
    const dbCall = await prisma.call.findUnique({
      where: { vapiCallId: call_id },
      include: { business: true, agent: true },
    });

    let businessId: string | null | undefined = dbCall?.businessId;
    let agentId: string | null | undefined = dbCall?.agentId;

    if (!dbCall) {
      console.warn(
        `[Retell] ${callLabel(call_id)} no existía en la base de datos; se intentará recuperar su agente`
      );
      businessId = await resolveBusinessIdByRetellAgentId(agent_id);
      const agent = await prisma.agent.findFirst({
        where: { retellAgentId: agent_id },
        select: { id: true },
      });
      agentId = agent?.id || undefined;

      if (!businessId) {
        console.error(
          `[Retell] No se pudo identificar el negocio de la ${callLabel(call_id)}`
        );
        return { success: false };
      }
    }

    const finalStatus: "COMPLETED" | "FAILED" | "IN_PROGRESS" =
      data.disconnection_reason?.toLowerCase().includes("error") ||
      data.disconnection_reason?.toLowerCase().includes("fail")
        ? "FAILED"
        : "COMPLETED";

    const costCents =
      data.call_cost?.combined_cost !== undefined
        ? Math.round(data.call_cost.combined_cost)
        : undefined;
    const messages = sanitizeRetellTranscriptMessages(data.transcript_object);

    const result = await prisma.$transaction(async (tx) => {
      const updatedCall = await tx.call.upsert({
        where: { vapiCallId: call_id },
        create: {
          vapiCallId: call_id,
          businessId: businessId!,
          agentId: agentId || null,
          status: finalStatus,
          startedAt: new Date(),
          endedAt: new Date(),
          durationSecs,
          costCents,
        },
        update: {
          status: finalStatus,
          endedAt: new Date(),
          durationSecs,
          costCents,
        },
      });

      if (data.transcript) {
        await tx.transcript.upsert({
          where: { callId: updatedCall.id },
          create: {
            callId: updatedCall.id,
            fullText: data.transcript,
            messages,
          },
          update: {
            fullText: data.transcript,
            messages,
          },
        });
      }

      if (data.recording_url) {
        await tx.recording.upsert({
          where: { callId: updatedCall.id },
          create: {
            callId: updatedCall.id,
            vapiUrl: data.recording_url,
          },
          update: {
            vapiUrl: data.recording_url,
          },
        });
      }

      return updatedCall;
    });

    if (data.recording_url) {
      try {
        await enqueueRecordingJob(
          {
            callId: result.id,
            vapiUrl: data.recording_url,
            businessId: result.businessId,
          },
          `process-recording-${result.id}`
        );
      } catch (err) {
        console.error(
          `[Retell] La ${callLabel(call_id)} se guardó, pero no se pudo encolar su grabación: ${errorMessage(
            err
          )}`
        );
      }
    }

    if (durationSecs !== undefined) {
      try {
        await enqueueUsageReportJob(
          { businessId: result.businessId },
          `report-usage-${result.id}`
        );
      } catch (err) {
        console.error(`[Retell] No se pudo encolar el consumo de ${callLabel(call_id)}: ${errorMessage(err)}`);
      }
    }

    console.log(
      `[Retell] ${callLabel(call_id)} guardada correctamente · transcripción=${
        data.transcript ? "sí" : "no"
      } · grabación=${data.recording_url ? "sí" : "no"}`
    );
    return { success: true };
  } catch (error) {
    console.error(
      `[Retell] Error procesando el final de la ${callLabel(call_id)}: ${errorMessage(
        error
      )}`
    );
    return { success: false };
  }
}

export async function handleCallAnalyzed(
  payload: unknown
): Promise<{ success: boolean }> {
  const event = RetellCallAnalyzedSchema.parse(payload);
  const { call_id, agent_id } = event.data;
  const data = event.data;

  console.log(
    `[Retell] Análisis recibido para ${callLabel(call_id)} · agente=${agent_id}`
  );

  try {
    let dbCall = await prisma.call.findUnique({
      where: { vapiCallId: call_id },
      select: { id: true, businessId: true },
    });

    if (!dbCall) {
      // call_analyzed puede llegar antes de que call_started haya terminado
      // de escribir su fila (o de que Retell la reintente). En vez de
      // descartar el análisis en silencio, se crea la fila mínima que falte
      // para no perderlo.
      console.warn(
        `[Retell] ${callLabel(call_id)} no existía en la base de datos al recibir el análisis; se crea antes de perderlo`
      );
      const businessId = await resolveBusinessIdByRetellAgentId(agent_id);
      if (!businessId) {
        console.error(
          `[Retell] No se pudo identificar el negocio de la ${callLabel(call_id)}; se descarta el análisis`
        );
        return { success: false };
      }
      const agent = await prisma.agent.findFirst({
        where: { retellAgentId: agent_id },
        select: { id: true },
      });
      dbCall = await prisma.call.create({
        data: {
          vapiCallId: call_id,
          businessId,
          agentId: agent?.id || null,
          status: "COMPLETED",
        },
        select: { id: true, businessId: true },
      });
    }

    const messages = sanitizeRetellTranscriptMessages(data.transcript_object);
    const sentiment = data.call_analysis
      ? mapRetellSentiment(data.call_analysis.user_sentiment)
      : undefined;
    const outcome = data.call_analysis
      ? mapRetellCallOutcome(
          data.call_analysis.custom_analysis_data?.call_outcome
        )
      : undefined;
    const summary = data.call_analysis?.call_summary;
    const successful = data.call_analysis?.call_successful;
    const analysis = data.call_analysis?.custom_analysis_data;
    const escalationReason = mapRetellEscalationReason(
      analysis?.escalation_reason
    );
    const toolFailureDetected = analysis?.tool_failure_detected;
    const requestedService = mapRetellRequestedService(
      analysis?.requested_service_type
    );

    await prisma.$transaction(async (tx) => {
      if (data.transcript) {
        await tx.transcript.upsert({
          where: { callId: dbCall.id },
          create: {
            callId: dbCall.id,
            fullText: data.transcript,
            messages,
          },
          update: {
            fullText: data.transcript,
            messages,
          },
        });
      }

      if (data.recording_url) {
        await tx.recording.upsert({
          where: { callId: dbCall.id },
          create: {
            callId: dbCall.id,
            vapiUrl: data.recording_url,
          },
          update: {
            vapiUrl: data.recording_url,
          },
        });
      }

      const analysisUpdate = {
        ...(sentiment !== undefined ? { sentiment } : {}),
        ...(outcome !== undefined ? { outcome } : {}),
        ...(summary !== undefined ? { summary } : {}),
        ...(successful !== undefined ? { successful } : {}),
        ...(escalationReason !== null ? { escalationReason } : {}),
        ...(toolFailureDetected !== undefined ? { toolFailureDetected } : {}),
        ...(requestedService !== null ? { requestedService } : {}),
      };

      if (Object.keys(analysisUpdate).length > 0) {
        await tx.call.update({
          where: { id: dbCall.id },
          data: analysisUpdate,
        });
      }
    });

    return { success: true };
  } catch (error) {
    console.error(
      `[Retell] Error procesando análisis de ${callLabel(call_id)}: ${errorMessage(
        error
      )}`
    );
    return { success: false };
  }
}
