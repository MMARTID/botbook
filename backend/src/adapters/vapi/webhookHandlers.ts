import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { enqueueRecordingJob } from "../../lib/cloudTasks.js";
import { executeVoiceTool } from "../../modules/voiceTools/service.js";
import { VapiFunctionCallEvent } from "./types.js";
import { callLabel, errorMessage } from "../../lib/logUtils.js";

// Esquemas flexibles (tolerantes a cambios de Vapi)
const VapiCallSchema = z.object({
  id: z.string(),
  phoneNumberId: z.string().optional(),
  phoneNumber: z.string().optional(),
  customerId: z.string().optional(),
  assistantId: z.string().optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  duration: z.number().optional(),
  cost: z.number().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system", "bot"]),
        message: z.string(),
        timestamp: z.number().optional(),
      })
    )
    .optional(),
});

const VapiAssistantSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  model: z
    .object({
      provider: z.string(),
      model: z.string(),
    })
    .optional(),
});

// --- Function Call ---
const FunctionCallEventSchema = z.object({
  message: z.object({
    type: z.literal("function-call"),
    toolUse: z.object({
      type: z.string(),
      function: z.object({
        name: z.string(),
        description: z.string().optional(),
        parameters: z.record(z.unknown()).optional(),
      }),
      result: z.record(z.unknown()).optional(),
      id: z.string().optional(),
    }),
  }),
  call: VapiCallSchema.optional(),
  assistant: VapiAssistantSchema.optional(),
  timestamp: z.string().optional(),
});

// --- End of Call Report (actualizado) ---
const EndOfCallReportEventSchema = z.object({
  message: z.object({
    type: z.literal("end-of-call-report"),
    call: VapiCallSchema.optional(),
    assistant: VapiAssistantSchema.optional(),
    callStatus: z
      .enum(["completed", "failed", "forwarded", "in-progress"])
      .optional(),
    endedReason: z.string().optional(),
    summary: z.string().optional(),
    transcript: z.string().optional(),
    recordingUrl: z.string().optional(),
    stereoRecordingUrl: z.string().optional(),
    durationSeconds: z.number().optional(),
    cost: z.number().optional(),
    costBreakdown: z.record(z.any()).optional(),
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant", "system", "bot"]),
          message: z.string(),
          timestamp: z.number().optional(),
          time: z.number().optional(),
          secondsFromStart: z.number().optional(),
        })
      )
      .optional(),
    startedAt: z.string().optional(),
    endedAt: z.string().optional(),
  }),
});

// --- Status Update (actualizado) ---
const StatusUpdateEventSchema = z.object({
  message: z.object({
    type: z.literal("status-update"),
    status: z
      .enum(["queued", "ringing", "active", "ended", "in-progress"])
      .catch("active"),
    call: VapiCallSchema.optional(),
    assistant: VapiAssistantSchema.optional(),
    endedReason: z.string().optional(),
  }),
});

// --- Handlers ---

export async function handleFunctionCall(
  payload: unknown
): Promise<{ success: boolean; result?: any }> {
  const event = FunctionCallEventSchema.parse(payload) as VapiFunctionCallEvent;
  const functionName = event.message.toolUse.function.name;
  const callId = event.call?.id || "unknown";

  console.log(`[Vapi] ${callLabel(callId)} solicitó la herramienta ${functionName}`);

  const assistantId = event.assistant?.id;
  if (!assistantId) {
    console.error(`[Vapi] ${callLabel(callId)} no incluye assistantId`);
    return {
      success: false,
      result: { success: false, error: "Assistant ID not provided in event" },
    };
  }

  const agent = await prisma.agent.findFirst({
    where: { vapiAssistantId: assistantId },
    select: { businessId: true },
  });

  if (!agent) {
    console.error(`[Vapi] ${callLabel(callId)} no encontró agente para assistantId ${assistantId}`);
    return {
      success: false,
      result: { success: false, error: "Agent not found for assistant ID" },
    };
  }

  return executeVoiceTool({
    businessId: agent.businessId,
    toolName: functionName,
    params: (event.message.toolUse.function.parameters as Record<string, unknown>) || {},
    callLabel: callLabel(callId),
    callId: callId !== "unknown" ? callId : undefined,
  });
}

export async function handleEndOfCallReport(
  payload: unknown
): Promise<{ success: boolean }> {
  // Parseamos sin hacer 'as' para que Zod infiera el tipo correctamente
  const event = EndOfCallReportEventSchema.parse(payload);
  const { message } = event;
  const call = message.call;
  const assistant = message.assistant;

  console.log(
    `[Vapi] Finalizó ${callLabel(call?.id)} · estado=${message.callStatus || "completada"} · duración=${Math.round(message.durationSeconds ?? call?.duration ?? 0)}s · motivo=${message.endedReason || "no indicado"}`
  );

  if (!call || !call.id) {
    console.error("[Vapi] El informe final no contiene un identificador de llamada");
    return { success: false };
  }

  try {
    const dbCall = await prisma.call.findUnique({
      where: { vapiCallId: call.id },
      include: { business: true, agent: true },
    });

    let businessId = dbCall?.businessId;
    let agentId = dbCall?.agentId;

    if (!dbCall) {
      console.warn(`[Vapi] ${callLabel(call.id)} no existía en la base de datos; se intentará recuperar su agente`);
      
      if (call.assistantId) {
        const agent = await prisma.agent.findFirst({
          where: { vapiAssistantId: call.assistantId },
          select: { id: true, businessId: true },
        });
        if (agent) {
          businessId = agent.businessId;
          agentId = agent.id;
        }
      }

      if (!businessId) {
        console.error(`[Vapi] No se pudo identificar el negocio de la ${callLabel(call.id)}`);
        return { success: false };
      }
    }

    let finalStatus: "COMPLETED" | "FAILED" | "IN_PROGRESS" | "TIMED_OUT" | "INITIATED" = "COMPLETED";
    if (
      message.callStatus === "failed" ||
      message.endedReason?.toLowerCase().includes("error") ||
      message.endedReason?.toLowerCase().includes("fail")
    ) {
      finalStatus = "FAILED";
    } else if (message.callStatus === "completed" || !message.callStatus) {
      finalStatus = "COMPLETED";
    } else {
      finalStatus = "IN_PROGRESS";
    }

    const rawMessages = message.messages || [];
    const sanitizedMessages = (rawMessages as any[])
      .filter((m) => m.role !== "system")
      .map((m) => ({
        ...m,
        role: m.role === "bot" ? "assistant" : m.role,
      }))
      .filter((m) => m.role === "user" || m.role === "assistant");

    const durationSecs = message.durationSeconds ?? call.duration ?? undefined;
    const costCents = message.cost ? Math.round(message.cost * 100) : undefined;

    // Envolver todo en una transacción atómica
    const result = await prisma.$transaction(async (tx) => {
      // 1. Upsert del estado de la llamada. 
      // Upsert es crucial porque si el webhook call-start falló, la llamada no existe.
      const updatedCall = await tx.call.upsert({
        where: { vapiCallId: call.id },
        update: {
          status: finalStatus,
          endedAt: message.endedAt ? new Date(message.endedAt) : new Date(),
          durationSecs: durationSecs,
          costCents: costCents,
        },
        create: {
          vapiCallId: call.id,
          businessId: businessId!,
          agentId: agentId || null,
          status: finalStatus,
          startedAt: message.startedAt ? new Date(message.startedAt) : new Date(),
          endedAt: message.endedAt ? new Date(message.endedAt) : new Date(),
          durationSecs: durationSecs,
          costCents: costCents,
        },
      });

      // Simulación de análisis para Booking u Order (como se requiere en los handlers)
      // Normalmente aquí iría el parser real del transcript. Para este ejemplo, lo mantenemos simple.
      // const analysisResult = analyzeTranscript(message.transcript);
      const isBooking = false; // Placeholder
      const isOrder = false; // Placeholder

      if (isBooking) {
        // Upsert en la transacción con callId como clave de unicidad. update vacío = no-op.
        await tx.booking.upsert({
          where: { callId: updatedCall.id },
          create: {
            callId: updatedCall.id,
            programedAt: new Date(), // Placeholder para datos reales
            numberPeople: 2,         // Placeholder para datos reales
          },
          update: {}, // No-op si ya existe (webhooks duplicados no rompen la tx)
        });
      } else if (isOrder) {
        await tx.order.upsert({
          where: { callId: updatedCall.id },
          create: {
            callId: updatedCall.id,
            order: "Order details", // Placeholder para datos reales
          },
          update: {},
        });
      }

      if (message.transcript) {
        await tx.transcript.upsert({
          where: { callId: updatedCall.id },
          update: {
            fullText: message.transcript,
            messages: sanitizedMessages,
          },
          create: {
            callId: updatedCall.id,
            fullText: message.transcript,
            messages: sanitizedMessages,
          },
        });
      }

      if (message.recordingUrl) {
        await tx.recording.upsert({
          where: { callId: updatedCall.id },
          update: {
            vapiUrl: message.recordingUrl,
          },
          create: {
            callId: updatedCall.id,
            vapiUrl: message.recordingUrl,
          },
        });
      }

      return updatedCall;
    });

    if (message.recordingUrl) {
      try {
        await enqueueRecordingJob(
          {
            callId: result.id,
            vapiUrl: message.recordingUrl,
            businessId: result.businessId,
          },
          `process-recording-${result.id}`
        );
      } catch (err) {
        console.error(`[Vapi] La ${callLabel(call.id)} se guardó, pero no se pudo encolar su grabación: ${errorMessage(err)}`);
      }
    }

    // VAPI: inactivo, sin clasificación de resultado — Retell la resuelve de
    // forma nativa (post_call_analysis_data); si se reactiva Vapi habrá que
    // definir un mecanismo propio.

    console.log(
      `[Vapi] ${callLabel(call.id)} guardada correctamente · transcripción=${message.transcript ? "sí" : "no"} · grabación=${message.recordingUrl ? "sí" : "no"}`
    );
    return { success: true };
  } catch (error) {
    console.error(`[Vapi] Error procesando el informe final de la ${callLabel(call.id)}: ${errorMessage(error)}`);
    return { success: false };
  }
}

export async function handleStatusUpdate(
  payload: unknown
): Promise<{ success: boolean }> {
  const event = StatusUpdateEventSchema.parse(payload);
  const { message } = event;
  const call = message.call;
  const assistant = message.assistant;

  const statusMessages: Record<string, string> = {
    queued: "en cola",
    ringing: "llamando",
    active: "activa",
    "in-progress": "en curso",
    ended: "finalizada",
  };
  console.log(`[Vapi] ${callLabel(call?.id)}: ${statusMessages[message.status] || message.status}`);

  if (!call || !call.id) {
    console.warn("[Vapi] Se ignoró un cambio de estado sin identificador de llamada");
    return { success: true };
  }

  try {
    // Buscar si la llamada ya existe en la BD
    let dbCall = await prisma.call.findUnique({
      where: { vapiCallId: call.id },
    });

    // Si no existe, crearla
    if (!dbCall) {
      console.log(`[Vapi] Registrando ${callLabel(call.id)} en la base de datos`);

      // Obtener businessId desde el agente (si existe)
      let businessId: string | null = null;
      if (call.assistantId) {
        const agent = await prisma.agent.findFirst({
          where: { vapiAssistantId: call.assistantId },
          select: { businessId: true },
        });
        if (agent) {
          businessId = agent.businessId;
        }
      }

      if (!businessId) {
        console.error(`[Vapi] No se pudo identificar el negocio de la ${callLabel(call.id)}`);
        return { success: false };
      }

      dbCall = await prisma.call.upsert({
        where: { vapiCallId: call.id },
        create: {
          vapiCallId: call.id,
          businessId: businessId,
          status: "IN_PROGRESS",
          startedAt: call.startedAt ? new Date(call.startedAt) : new Date(),
        },
        update: {
          status: "IN_PROGRESS",
        },
      });
      console.log(`[Vapi] ${callLabel(call.id)} registrada correctamente`);
    }

    // Ahora actualizamos el estado según el status-update
    if (message.status === "ended" && dbCall.status === "IN_PROGRESS") {
      await prisma.call.update({
        where: { id: dbCall.id },
        data: { status: "COMPLETED", endedAt: new Date() },
      });
    } else if (
      message.status === "in-progress" &&
      dbCall.status === "IN_PROGRESS"
    ) {
      // No es necesario actualizar
    }

    return { success: true };
  } catch (error) {
    console.error(`[Vapi] Error actualizando el estado de la ${callLabel(call?.id)}: ${errorMessage(error)}`);
    return { success: false };
  }
}
