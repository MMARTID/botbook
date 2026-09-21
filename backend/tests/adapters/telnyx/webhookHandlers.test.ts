import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractTelnyxEventEnvelope,
  handleCallInitiated,
  handleCallAnswered,
  handleCallHangup,
  handleCallConversationEnded,
  handleCallRecordingSaved,
  handleCallConversationInsightsGenerated,
  handleCallCost,
  handleTelnyxToolInvocation,
} from "../../../src/adapters/telnyx/webhookHandlers.js";
import { prisma } from "../../../src/lib/prisma.js";
import { telnyxAiAdapter } from "../../../src/adapters/telnyx/TelnyxAiAdapter.js";
import {
  enqueueRecordingJob,
  enqueueUsageReportJob,
} from "../../../src/lib/cloudTasks.js";
import { executeVoiceTool } from "../../../src/modules/voiceTools/service.js";
import {
  codificarClientState,
  comprobacionDeDesvioReciente,
  registrarLlamadaDeComprobacionRecibida,
  registrarSalienteColgada,
  registrarSalienteContestada,
} from "../../../src/modules/onboarding/comprobacionDesvio.js";
import {
  marcarPataSinCall,
  motivoDePataSinCall,
} from "../../../src/adapters/telnyx/patasSinCall.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    call: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    transcript: { upsert: vi.fn() },
    recording: { upsert: vi.fn() },
  },
}));

vi.mock("../../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: {
    hangupCall: vi.fn(),
    answerCallWithAssistant: vi.fn(),
    startNoiseSuppression: vi.fn(),
    listConversationMessages: vi.fn(),
    listRecordingsByCallLegId: vi.fn(),
  },
}));

vi.mock("../../../src/lib/cloudTasks.js", () => ({
  enqueueRecordingJob: vi.fn(),
  enqueueUsageReportJob: vi.fn(),
}));

vi.mock("../../../src/modules/voiceTools/service.js", () => ({
  executeVoiceTool: vi.fn(),
}));

// «Comprobar desvío»: el estado en Redis/Postgres lo prueba su propio test;
// aquí solo importa que el webhook lo llame (o no) y qué hace con la
// llamada. Las funciones puras (client_state) se quedan reales.
vi.mock(
  "../../../src/modules/onboarding/comprobacionDesvio.js",
  async (importOriginal) => {
    const original = await importOriginal<
      typeof import("../../../src/modules/onboarding/comprobacionDesvio.js")
    >();
    return {
      ...original,
      comprobacionDeDesvioReciente: vi.fn(),
      registrarLlamadaDeComprobacionRecibida: vi.fn(),
      registrarSalienteColgada: vi.fn(),
      registrarSalienteContestada: vi.fn(),
    };
  }
);

// Patas propias sin Call (transferencia al dueño, entrante de la
// comprobación): la marca vive en Redis; aquí se comprueba que el webhook
// la pone y la consulta.
vi.mock("../../../src/adapters/telnyx/patasSinCall.js", () => ({
  marcarPataSinCall: vi.fn().mockResolvedValue(undefined),
  motivoDePataSinCall: vi.fn().mockResolvedValue(null),
}));

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedMarcarPataSinCall = vi.mocked(marcarPataSinCall);
const mockedMotivoDePataSinCall = vi.mocked(motivoDePataSinCall);
const mockedCallUpsert = vi.mocked(prisma.call.upsert);
const mockedCallFindUnique = vi.mocked(prisma.call.findUnique);
const mockedCallUpdate = vi.mocked(prisma.call.update);
const mockedTranscriptUpsert = vi.mocked(prisma.transcript.upsert);
const mockedRecordingUpsert = vi.mocked(prisma.recording.upsert);
const mockedHangupCall = vi.mocked(telnyxAiAdapter.hangupCall);
const mockedAnswerCallWithAssistant = vi.mocked(
  telnyxAiAdapter.answerCallWithAssistant
);
const mockedStartNoiseSuppression = vi.mocked(
  telnyxAiAdapter.startNoiseSuppression
);
const mockedListConversationMessages = vi.mocked(
  telnyxAiAdapter.listConversationMessages
);
const mockedListRecordingsByCallLegId = vi.mocked(
  telnyxAiAdapter.listRecordingsByCallLegId
);
const mockedExecuteVoiceTool = vi.mocked(executeVoiceTool);
const mockedEnqueueRecordingJob = vi.mocked(enqueueRecordingJob);
const mockedEnqueueUsageReportJob = vi.mocked(enqueueUsageReportJob);
const mockedComprobacionReciente = vi.mocked(comprobacionDeDesvioReciente);
const mockedRegistrarRecibida = vi.mocked(
  registrarLlamadaDeComprobacionRecibida
);
const mockedRegistrarColgada = vi.mocked(registrarSalienteColgada);
const mockedRegistrarContestada = vi.mocked(registrarSalienteContestada);

beforeEach(() => {
  vi.clearAllMocks();
  mockedMarcarPataSinCall.mockResolvedValue(undefined);
  mockedMotivoDePataSinCall.mockResolvedValue(null);
});

describe("extractTelnyxEventEnvelope", () => {
  it("lee id y event_type del envoltorio real de Telnyx", () => {
    const envelope = extractTelnyxEventEnvelope({
      data: { id: "evt_1", event_type: "call.initiated", occurred_at: "t" },
    });

    expect(envelope).toEqual({ id: "evt_1", eventType: "call.initiated" });
  });

  it("devuelve null si falta id o event_type", () => {
    expect(extractTelnyxEventEnvelope({ data: {} })).toBeNull();
    expect(extractTelnyxEventEnvelope({})).toBeNull();
    expect(extractTelnyxEventEnvelope(null)).toBeNull();
  });
});

describe("handleCallInitiated", () => {
  const basePayload = {
    data: {
      id: "evt_1",
      event_type: "call.initiated" as const,
      payload: {
        call_control_id: "call_ctrl_1",
        from: "+34600000000",
        to: "+34900000000",
      },
    },
  };

  it("contesta con el assistant cuando el negocio y el agente son elegibles", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: "biz1",
      callsSuspendedAt: null,
      paymentFailureSuspensionAt: null,
      agents: [{ id: "agent1", telnyxAssistantId: "assistant_1" }],
    } as any);
    mockedCallUpsert.mockResolvedValue({} as any);

    const result = await handleCallInitiated(basePayload);

    expect(result).toEqual({ success: true });
    expect(mockedCallUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { callId: "call_ctrl_1" },
        create: expect.objectContaining({
          callId: "call_ctrl_1",
          voiceProvider: "telnyx",
          providerCallId: "call_ctrl_1",
          businessId: "biz1",
          agentId: "agent1",
          status: "IN_PROGRESS",
        }),
      })
    );
    expect(mockedAnswerCallWithAssistant).toHaveBeenCalledWith(
      "call_ctrl_1",
      "assistant_1"
    );
    expect(mockedHangupCall).not.toHaveBeenCalled();
    expect(mockedStartNoiseSuppression).toHaveBeenCalledWith("call_ctrl_1");
  });

  it("contesta igualmente aunque falle la supresión de ruido (BETA, nunca debe tumbar la llamada)", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: "biz1",
      callsSuspendedAt: null,
      paymentFailureSuspensionAt: null,
      agents: [{ id: "agent1", telnyxAssistantId: "assistant_1" }],
    } as any);
    mockedCallUpsert.mockResolvedValue({} as any);
    mockedStartNoiseSuppression.mockRejectedValue(new Error("Telnyx BETA caída"));

    const result = await handleCallInitiated(basePayload);

    expect(result).toEqual({ success: true });
    expect(mockedAnswerCallWithAssistant).toHaveBeenCalledWith(
      "call_ctrl_1",
      "assistant_1"
    );
  });

  it("cuelga la llamada y no la persiste si no hay negocio para el número", async () => {
    mockedBusinessFindUnique.mockResolvedValue(null);

    const result = await handleCallInitiated(basePayload);

    expect(result).toEqual({ success: false });
    expect(mockedHangupCall).toHaveBeenCalledWith("call_ctrl_1");
    expect(mockedCallUpsert).not.toHaveBeenCalled();
    expect(mockedAnswerCallWithAssistant).not.toHaveBeenCalled();
  });

  it("cuelga la llamada si el negocio está suspendido por impago", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: "biz1",
      callsSuspendedAt: new Date("2020-01-01"),
      paymentFailureSuspensionAt: null,
      agents: [{ id: "agent1", telnyxAssistantId: "assistant_1" }],
    } as any);

    const result = await handleCallInitiated(basePayload);

    expect(result).toEqual({ success: false });
    expect(mockedHangupCall).toHaveBeenCalledWith("call_ctrl_1");
    expect(mockedAnswerCallWithAssistant).not.toHaveBeenCalled();
  });

  it("cuelga la llamada si el negocio no tiene ningún assistant Telnyx operativo", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: "biz1",
      callsSuspendedAt: null,
      paymentFailureSuspensionAt: null,
      agents: [],
    } as any);

    const result = await handleCallInitiated(basePayload);

    expect(result).toEqual({ success: false });
    expect(mockedHangupCall).toHaveBeenCalledWith("call_ctrl_1");
  });

  it("no lanza si falta el número de destino en el payload", async () => {
    const result = await handleCallInitiated({
      data: {
        id: "evt_1",
        event_type: "call.initiated",
        payload: { call_control_id: "call_ctrl_1" },
      },
    });

    expect(result).toEqual({ success: false });
    expect(mockedBusinessFindUnique).not.toHaveBeenCalled();
  });
});

describe("handleCallHangup", () => {
  it("marca la llamada COMPLETED y calcula la duración si falta", async () => {
    const startedAt = new Date(Date.now() - 45_000);
    mockedCallFindUnique.mockResolvedValue({
      id: "call_db_1",
      businessId: "biz1",
      startedAt,
      endedAt: null,
      durationSecs: null,
    } as any);
    mockedCallUpdate.mockResolvedValue({} as any);

    const result = await handleCallHangup({
      data: {
        id: "evt_2",
        event_type: "call.hangup",
        payload: { call_control_id: "call_ctrl_1", hangup_cause: "normal_clearing" },
      },
    });

    expect(result).toEqual({ success: true });
    expect(mockedCallUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "call_db_1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      })
    );
    expect(mockedEnqueueUsageReportJob).toHaveBeenCalledWith(
      { businessId: "biz1" },
      "report-usage-call_db_1"
    );
  });

  it("marca FAILED si la llamada se rechazó", async () => {
    mockedCallFindUnique.mockResolvedValue({
      id: "call_db_1",
      businessId: "biz1",
      startedAt: new Date(),
      endedAt: null,
      durationSecs: 0,
    } as any);
    mockedCallUpdate.mockResolvedValue({} as any);

    await handleCallHangup({
      data: {
        id: "evt_2",
        event_type: "call.hangup",
        payload: { call_control_id: "call_ctrl_1", hangup_cause: "call_rejected" },
      },
    });

    expect(mockedCallUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  it("devuelve false si la llamada no existe en la base de datos", async () => {
    mockedCallFindUnique.mockResolvedValue(null);

    const result = await handleCallHangup({
      data: {
        id: "evt_2",
        event_type: "call.hangup",
        payload: { call_control_id: "call_desconocida" },
      },
    });

    expect(result).toEqual({ success: false });
    expect(mockedCallUpdate).not.toHaveBeenCalled();
  });
});

describe("handleCallConversationEnded", () => {
  it("guarda conversation_id/duración y descarga la transcripción", async () => {
    mockedCallFindUnique.mockResolvedValue({
      id: "call_db_1",
      providerConversationId: null,
      durationSecs: null,
    } as any);
    mockedCallUpdate.mockResolvedValue({} as any);
    mockedListConversationMessages.mockResolvedValue([
      { role: "user", text: "Hola" },
      { role: "assistant", text: "¿En qué te ayudo?" },
    ]);
    mockedTranscriptUpsert.mockResolvedValue({} as any);

    const result = await handleCallConversationEnded({
      data: {
        id: "evt_3",
        event_type: "call.conversation.ended",
        payload: {
          call_control_id: "call_ctrl_1",
          conversation_id: "conv_1",
          duration_sec: 42,
        },
      },
    });

    expect(result).toEqual({ success: true });
    expect(mockedCallUpdate).toHaveBeenCalledWith({
      where: { id: "call_db_1" },
      data: { providerConversationId: "conv_1", durationSecs: 42 },
    });
    expect(mockedTranscriptUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { callId: "call_db_1" },
        create: expect.objectContaining({
          callId: "call_db_1",
          fullText: "user: Hola\nassistant: ¿En qué te ayudo?",
        }),
      })
    );
  });

  it("reordena los mensajes por fecha — la API de Telnyx los devuelve del más reciente al más antiguo", async () => {
    mockedCallFindUnique.mockResolvedValue({
      id: "call_db_1",
      providerConversationId: null,
      durationSecs: null,
    } as any);
    mockedCallUpdate.mockResolvedValue({} as any);
    mockedListConversationMessages.mockResolvedValue([
      {
        role: "assistant",
        text: "Cita reservada correctamente",
        sentAt: "2026-09-12T14:28:00Z",
      },
      {
        role: "user",
        text: "Hola, quiero reservar",
        sentAt: "2026-09-12T14:27:00Z",
      },
      {
        role: "assistant",
        text: "Hola, gracias por llamar",
        sentAt: "2026-09-12T14:26:00Z",
      },
    ]);
    mockedTranscriptUpsert.mockResolvedValue({} as any);

    await handleCallConversationEnded({
      data: {
        id: "evt_3",
        event_type: "call.conversation.ended",
        payload: { call_control_id: "call_ctrl_1", conversation_id: "conv_1" },
      },
    });

    expect(mockedTranscriptUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          fullText:
            "assistant: Hola, gracias por llamar\nuser: Hola, quiero reservar\nassistant: Cita reservada correctamente",
        }),
      })
    );
  });

  it("no falla si la descarga de la transcripción falla", async () => {
    mockedCallFindUnique.mockResolvedValue({
      id: "call_db_1",
      providerConversationId: null,
      durationSecs: null,
    } as any);
    mockedCallUpdate.mockResolvedValue({} as any);
    mockedListConversationMessages.mockRejectedValue(new Error("Telnyx down"));

    const result = await handleCallConversationEnded({
      data: {
        id: "evt_3",
        event_type: "call.conversation.ended",
        payload: { call_control_id: "call_ctrl_1", conversation_id: "conv_1" },
      },
    });

    expect(result).toEqual({ success: true });
    expect(mockedTranscriptUpsert).not.toHaveBeenCalled();
  });
});

describe("handleCallRecordingSaved", () => {
  it("resuelve el call_control_id vía call_leg_id y encola la copia a R2", async () => {
    mockedListRecordingsByCallLegId.mockResolvedValue([
      { id: "rec_1", callControlId: "call_ctrl_1" },
    ]);
    mockedCallFindUnique.mockResolvedValue({
      id: "call_db_1",
      businessId: "biz1",
    } as any);
    mockedRecordingUpsert.mockResolvedValue({} as any);

    const result = await handleCallRecordingSaved({
      data: {
        id: "evt_4",
        event_type: "call.recording.saved",
        payload: {
          call_leg_id: "leg_1",
          recording_urls: { mp3: "https://example.com/a.mp3" },
        },
      },
    });

    expect(result).toEqual({ success: true });
    expect(mockedListRecordingsByCallLegId).toHaveBeenCalledWith("leg_1");
    // El leg se guarda con la grabación: la URL del webhook caduca a los 10
    // minutos y es lo único con lo que processRecording puede pedir otra.
    expect(mockedRecordingUpsert).toHaveBeenCalledWith({
      where: { callId: "call_db_1" },
      create: { callId: "call_db_1", externalUrl: "https://example.com/a.mp3", providerLegId: "leg_1" },
      update: { externalUrl: "https://example.com/a.mp3", providerLegId: "leg_1" },
    });
    expect(mockedEnqueueRecordingJob).toHaveBeenCalledWith(
      {
        callId: "call_db_1",
        externalUrl: "https://example.com/a.mp3",
        businessId: "biz1",
      },
      "process-recording-call_db_1"
    );
  });

  it("devuelve false si no hay URL de grabación utilizable", async () => {
    const result = await handleCallRecordingSaved({
      data: {
        id: "evt_4",
        event_type: "call.recording.saved",
        payload: { call_leg_id: "leg_1" },
      },
    });

    expect(result).toEqual({ success: false });
    expect(mockedListRecordingsByCallLegId).not.toHaveBeenCalled();
  });

  it("devuelve false si no se puede correlacionar la grabación con ninguna llamada", async () => {
    mockedListRecordingsByCallLegId.mockResolvedValue([]);

    const result = await handleCallRecordingSaved({
      data: {
        id: "evt_4",
        event_type: "call.recording.saved",
        payload: {
          call_leg_id: "leg_1",
          recording_urls: { mp3: "https://example.com/a.mp3" },
        },
      },
    });

    expect(result).toEqual({ success: false });
    expect(mockedRecordingUpsert).not.toHaveBeenCalled();
  });
});

describe("handleCallConversationInsightsGenerated", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.TELNYX_INSIGHT_CALL_OUTCOME_ID = "insight_outcome";
    process.env.TELNYX_INSIGHT_ESCALATION_REASON_ID = "insight_escalation";
    process.env.TELNYX_INSIGHT_TOOL_FAILURE_ID = "insight_tool_failure";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("acepta el evento y no lanza si un insight_id no coincide con ninguno conocido", async () => {
    const result = await handleCallConversationInsightsGenerated({
      data: {
        id: "evt_5",
        event_type: "call.conversation_insights.generated",
        payload: {
          call_control_id: "call_ctrl_1",
          results: [{ insight_id: "insight_desconocido", result: "positive" }],
        },
      },
    });

    expect(result).toEqual({ success: true });
    expect(mockedCallUpdate).not.toHaveBeenCalled();
  });

  it("mapea call_outcome/escalation_reason/tool_failure_detected a Call cuando el resultado viene envuelto en un objeto", async () => {
    mockedCallUpdate.mockResolvedValue({} as any);

    const result = await handleCallConversationInsightsGenerated({
      data: {
        id: "evt_5",
        event_type: "call.conversation_insights.generated",
        payload: {
          call_control_id: "call_ctrl_1",
          results: [
            { insight_id: "insight_outcome", result: { call_outcome: "RESOLVED" } },
            { insight_id: "insight_escalation", result: { escalation_reason: "NO_APLICA" } },
            { insight_id: "insight_tool_failure", result: { tool_failure_detected: true } },
          ],
        },
      },
    });

    expect(result).toEqual({ success: true });
    expect(mockedCallUpdate).toHaveBeenCalledWith({
      where: { callId: "call_ctrl_1" },
      data: {
        outcome: "RESOLVED",
        escalationReason: "NO_APLICA",
        toolFailureDetected: true,
      },
    });
  });

  it("también acepta el resultado sin envolver (por si Telnyx lo aplana)", async () => {
    mockedCallUpdate.mockResolvedValue({} as any);

    await handleCallConversationInsightsGenerated({
      data: {
        id: "evt_5",
        event_type: "call.conversation_insights.generated",
        payload: {
          call_control_id: "call_ctrl_1",
          results: [{ insight_id: "insight_outcome", result: "ESCALATED" }],
        },
      },
    });

    expect(mockedCallUpdate).toHaveBeenCalledWith({
      where: { callId: "call_ctrl_1" },
      data: { outcome: "ESCALATED" },
    });
  });

  it("ignora un valor que no pertenece al enum en vez de guardar basura", async () => {
    const result = await handleCallConversationInsightsGenerated({
      data: {
        id: "evt_5",
        event_type: "call.conversation_insights.generated",
        payload: {
          call_control_id: "call_ctrl_1",
          results: [{ insight_id: "insight_outcome", result: { call_outcome: "NO_ES_UN_VALOR_VALIDO" } }],
        },
      },
    });

    expect(result).toEqual({ success: true });
    expect(mockedCallUpdate).not.toHaveBeenCalled();
  });

  it("no lanza si la llamada no existe en la base de datos al actualizar", async () => {
    mockedCallUpdate.mockRejectedValue(new Error("Record to update not found"));

    const result = await handleCallConversationInsightsGenerated({
      data: {
        id: "evt_5",
        event_type: "call.conversation_insights.generated",
        payload: {
          call_control_id: "call_ctrl_1",
          results: [{ insight_id: "insight_outcome", result: { call_outcome: "RESOLVED" } }],
        },
      },
    });

    expect(result).toEqual({ success: true });
  });
});

describe("handleCallCost", () => {
  it("guarda el coste en céntimos redondeando el total_cost declarado", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_db_1" } as any);
    mockedCallUpdate.mockResolvedValue({} as any);

    const result = await handleCallCost({
      data: {
        id: "evt_6",
        event_type: "call.cost",
        payload: {
          call_control_id: "call_ctrl_1",
          total_cost: "0.0123",
          status: "success",
        },
      },
    });

    expect(result).toEqual({ success: true });
    expect(mockedCallUpdate).toHaveBeenCalledWith({
      where: { id: "call_db_1" },
      data: { providerCostCents: 1, providerCostBreakdown: undefined },
    });
  });

  it("guarda el desglose de cost_parts (solo telefonía, no incluye IA)", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_db_1" } as any);
    mockedCallUpdate.mockResolvedValue({} as any);

    const result = await handleCallCost({
      data: {
        id: "evt_7",
        event_type: "call.cost",
        payload: {
          call_control_id: "call_ctrl_1",
          total_cost: "0.0252",
          status: "success",
          cost_parts: [
            {
              call_part: "sip-trunking",
              cost: "0.0168",
              currency: "USD",
              rate: "0.0056",
              billed_duration_secs: 180,
            },
            { call_part: "call-control", cost: "0.0042", currency: "USD" },
          ],
        },
      },
    });

    expect(result).toEqual({ success: true });
    expect(mockedCallUpdate).toHaveBeenCalledWith({
      where: { id: "call_db_1" },
      data: {
        providerCostCents: 3,
        providerCostBreakdown: [
          {
            call_part: "sip-trunking",
            cost: "0.0168",
            currency: "USD",
            rate: "0.0056",
            billed_duration_secs: 180,
          },
          {
            call_part: "call-control",
            cost: "0.0042",
            currency: "USD",
            rate: null,
            billed_duration_secs: null,
          },
        ],
      },
    });
  });

  it("no guarda nada (pero no falla) si Telnyx no pudo calcular el coste", async () => {
    const result = await handleCallCost({
      data: {
        id: "evt_6",
        event_type: "call.cost",
        payload: { call_control_id: "call_ctrl_1", status: "error" },
      },
    });

    expect(result).toEqual({ success: true });
    expect(mockedCallUpdate).not.toHaveBeenCalled();
  });

  it("devuelve false si la llamada no existe en la base de datos", async () => {
    mockedCallFindUnique.mockResolvedValue(null);

    const result = await handleCallCost({
      data: {
        id: "evt_6",
        event_type: "call.cost",
        payload: {
          call_control_id: "call_desconocida",
          total_cost: "0.05",
          status: "success",
        },
      },
    });

    expect(result).toEqual({ success: false });
    expect(mockedCallUpdate).not.toHaveBeenCalled();
  });
});

describe("handleTelnyxToolInvocation", () => {
  it("responde 400 si falta el header X-Alhabla-Call-Control-Id", async () => {
    const result = await handleTelnyxToolInvocation({
      callControlId: undefined,
      toolName: "get_catalog",
      params: {},
    });

    expect(result).toEqual({
      status: 400,
      body: { error: "Missing call_control_id" },
    });
    expect(mockedCallFindUnique).not.toHaveBeenCalled();
  });

  it("responde 404 si el call_control_id no corresponde a ninguna llamada registrada", async () => {
    mockedCallFindUnique.mockResolvedValue(null);

    const result = await handleTelnyxToolInvocation({
      callControlId: "call_ctrl_unknown",
      toolName: "get_catalog",
      params: {},
    });

    expect(result).toEqual({ status: 404, body: { error: "Call not found" } });
    expect(mockedExecuteVoiceTool).not.toHaveBeenCalled();
  });

  it("resuelve el businessId SIEMPRE por la Call persistida — ignora un businessId ajeno colado en params", async () => {
    // Aislamiento entre tenants (plan §4 / Fase 0 "acceso entre dos
    // tenants"): la llamada real pertenece a biz_real; aunque el modelo
    // mande un businessId de otro negocio en el body, executeVoiceTool debe
    // recibir siempre el de la Call, nunca el de params.
    mockedCallFindUnique.mockResolvedValue({
      businessId: "biz_real",
    } as any);
    mockedExecuteVoiceTool.mockResolvedValue({
      success: true,
      result: { success: true },
    });

    await handleTelnyxToolInvocation({
      callControlId: "call_ctrl_1",
      toolName: "check_availability",
      params: { businessId: "biz_de_otro_negocio", startDateTime: "2026-01-01T10:00:00Z" },
    });

    expect(mockedCallFindUnique).toHaveBeenCalledWith({
      where: { callId: "call_ctrl_1" },
      select: { businessId: true },
    });
    expect(mockedExecuteVoiceTool).toHaveBeenCalledWith({
      businessId: "biz_real",
      toolName: "check_availability",
      params: { businessId: "biz_de_otro_negocio", startDateTime: "2026-01-01T10:00:00Z" },
      callLabel: "llamada call_ctrl_1",
      callId: "call_ctrl_1",
    });
  });

  it("devuelve 200 y el resultado de la tool cuando executeVoiceTool tiene éxito", async () => {
    mockedCallFindUnique.mockResolvedValue({ businessId: "biz_real" } as any);
    mockedExecuteVoiceTool.mockResolvedValue({
      success: true,
      result: { success: true, slots: [] },
    });

    const result = await handleTelnyxToolInvocation({
      callControlId: "call_ctrl_1",
      toolName: "check_availability",
      params: {},
    });

    expect(result).toEqual({ status: 200, body: { success: true, slots: [] } });
  });

  it("devuelve 500 con el resultado de la tool cuando executeVoiceTool falla de forma controlada", async () => {
    mockedCallFindUnique.mockResolvedValue({ businessId: "biz_real" } as any);
    mockedExecuteVoiceTool.mockResolvedValue({
      success: false,
      result: { success: false, error: "Business not found" },
    });

    const result = await handleTelnyxToolInvocation({
      callControlId: "call_ctrl_1",
      toolName: "book_appointment",
      params: {},
    });

    expect(result).toEqual({
      status: 500,
      body: { success: false, error: "Business not found" },
    });
  });

  it("devuelve 500 sin lanzar si la consulta a la BD lanza", async () => {
    mockedCallFindUnique.mockRejectedValue(new Error("DB caída"));

    const result = await handleTelnyxToolInvocation({
      callControlId: "call_ctrl_1",
      toolName: "get_catalog",
      params: {},
    });

    expect(result).toEqual({
      status: 500,
      body: { error: "Internal server error" },
    });
  });
});

describe("«Comprobar desvío» en los webhooks de Telnyx", () => {
  const ALHABLA = "+34930453218";
  const LINEA = "+34931112233";
  const CLIENT_STATE = codificarClientState({
    businessId: "biz1",
    checkId: "a".repeat(32),
  });

  function negocioConNumero() {
    return {
      id: "biz1",
      phone: LINEA,
      telnyxPhoneNumber: ALHABLA,
      callsSuspendedAt: null,
      paymentFailureSuspensionAt: null,
      agents: [{ id: "agent1", telnyxAssistantId: "assistant_1" }],
    } as any;
  }

  function entrante(from: string, extra: Record<string, unknown> = {}) {
    return {
      data: {
        id: "evt_in",
        event_type: "call.initiated" as const,
        payload: {
          call_control_id: "call_ctrl_in",
          direction: "incoming",
          from,
          to: ALHABLA,
          ...extra,
        },
      },
    };
  }

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedComprobacionReciente.mockResolvedValue(null);
    mockedRegistrarRecibida.mockResolvedValue({
      id: "a".repeat(32),
      resultado: { estado: "ok" },
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Telnyx no omite `client_state` en las llamadas sin estado: lo manda como
  // `null` en cada evento de toda llamada de cliente (payloads reales de
  // team-telnyx/telnyx-code-examples). Si el esquema lo rechazara, el parse
  // (fuera del try/catch) tumbaría la recepcionista entera.
  it("client_state: null (toda llamada de cliente real) pasa el esquema de los cuatro eventos y sigue el camino normal", async () => {
    mockedBusinessFindUnique.mockResolvedValue(negocioConNumero());
    mockedCallUpsert.mockResolvedValue({} as any);

    const iniciada = await handleCallInitiated(
      entrante("+34600000000", { client_state: null })
    );
    expect(iniciada).toEqual({ success: true });
    expect(mockedAnswerCallWithAssistant).toHaveBeenCalledWith(
      "call_ctrl_in",
      "assistant_1"
    );
    expect(mockedRegistrarRecibida).not.toHaveBeenCalled();

    const contestada = await handleCallAnswered({
      data: {
        id: "evt_ans_null",
        event_type: "call.answered",
        payload: { call_control_id: "call_ctrl_in", client_state: null },
      },
    });
    expect(contestada).toEqual({ success: true });
    expect(mockedRegistrarContestada).not.toHaveBeenCalled();
    expect(mockedHangupCall).not.toHaveBeenCalled();

    mockedCallFindUnique.mockResolvedValue({
      id: "call_db_in",
      businessId: "biz1",
      startedAt: new Date(Date.now() - 10_000),
      endedAt: null,
      durationSecs: null,
    } as any);
    mockedCallUpdate.mockResolvedValue({} as any);
    const colgada = await handleCallHangup({
      data: {
        id: "evt_hang_null",
        event_type: "call.hangup",
        payload: {
          call_control_id: "call_ctrl_in",
          hangup_cause: "normal_clearing",
          client_state: null,
        },
      },
    });
    expect(colgada).toEqual({ success: true });
    expect(mockedRegistrarColgada).not.toHaveBeenCalled();
    expect(mockedCallUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "call_db_in" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      })
    );

    mockedCallUpdate.mockClear();
    const coste = await handleCallCost({
      data: {
        id: "evt_cost_null",
        event_type: "call.cost",
        payload: {
          call_control_id: "call_ctrl_in",
          total_cost: "0.0123",
          status: "success",
          client_state: null,
        },
      },
    });
    expect(coste).toEqual({ success: true });
    expect(mockedCallUpdate).toHaveBeenCalledWith({
      where: { id: "call_db_in" },
      data: { providerCostCents: 1, providerCostBreakdown: undefined },
    });
  });

  it("la llamada que entra desde el propio número de Alhabla es la comprobación: la marca, cuelga y no crea Call ni arranca la recepcionista", async () => {
    mockedBusinessFindUnique.mockResolvedValue(negocioConNumero());

    const result = await handleCallInitiated(entrante(ALHABLA));

    expect(result).toEqual({ success: true });
    expect(mockedRegistrarRecibida).toHaveBeenCalledWith("biz1");
    expect(mockedHangupCall).toHaveBeenCalledWith("call_ctrl_in");
    expect(mockedCallUpsert).not.toHaveBeenCalled();
    expect(mockedAnswerCallWithAssistant).not.toHaveBeenCalled();
    expect(mockedStartNoiseSuppression).not.toHaveBeenCalled();
  });

  it("cuelga igualmente aunque no se pueda registrar el resultado, y lo dice", async () => {
    mockedBusinessFindUnique.mockResolvedValue(negocioConNumero());
    mockedRegistrarRecibida.mockRejectedValue(new Error("Redis caído"));

    const result = await handleCallInitiated(entrante(ALHABLA));

    expect(result).toEqual({ success: false });
    expect(mockedHangupCall).toHaveBeenCalledWith("call_ctrl_in");
    expect(mockedCallUpsert).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Redis caído")
    );
  });

  it("si la operadora presenta la línea desviada como llamante, solo cuenta como comprobación si hay una reciente", async () => {
    mockedBusinessFindUnique.mockResolvedValue(negocioConNumero());
    mockedCallUpsert.mockResolvedValue({} as any);

    // Sin comprobación reciente: es una llamada normal (el dueño llamando a
    // su recepcionista desde el local).
    let result = await handleCallInitiated(entrante(LINEA));
    expect(result).toEqual({ success: true });
    expect(mockedComprobacionReciente).toHaveBeenCalledWith("biz1");
    expect(mockedRegistrarRecibida).not.toHaveBeenCalled();
    expect(mockedAnswerCallWithAssistant).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mockedBusinessFindUnique.mockResolvedValue(negocioConNumero());
    mockedComprobacionReciente.mockResolvedValue("a".repeat(32));
    mockedRegistrarRecibida.mockResolvedValue(null);

    result = await handleCallInitiated(entrante(LINEA));
    expect(result).toEqual({ success: true });
    expect(mockedRegistrarRecibida).toHaveBeenCalledWith("biz1");
    expect(mockedHangupCall).toHaveBeenCalledWith("call_ctrl_in");
    expect(mockedAnswerCallWithAssistant).not.toHaveBeenCalled();
    expect(mockedCallUpsert).not.toHaveBeenCalled();
  });

  it("un cliente cualquiera sigue llegando a la recepcionista aunque haya una comprobación reciente", async () => {
    mockedBusinessFindUnique.mockResolvedValue(negocioConNumero());
    mockedCallUpsert.mockResolvedValue({} as any);
    mockedComprobacionReciente.mockResolvedValue("a".repeat(32));

    const result = await handleCallInitiated(entrante("+34600000000"));

    expect(result).toEqual({ success: true });
    expect(mockedRegistrarRecibida).not.toHaveBeenCalled();
    expect(mockedAnswerCallWithAssistant).toHaveBeenCalledWith(
      "call_ctrl_in",
      "assistant_1"
    );
  });

  it("la pata saliente de la comprobación no es una llamada de cliente: ni busca negocio ni la cuelga", async () => {
    const result = await handleCallInitiated({
      data: {
        id: "evt_out",
        event_type: "call.initiated",
        payload: {
          call_control_id: "call_ctrl_out",
          direction: "outgoing",
          from: ALHABLA,
          to: LINEA,
          client_state: CLIENT_STATE,
        },
      },
    });

    expect(result).toEqual({ success: true });
    expect(mockedBusinessFindUnique).not.toHaveBeenCalled();
    expect(mockedHangupCall).not.toHaveBeenCalled();
    expect(mockedCallUpsert).not.toHaveBeenCalled();
  });

  it("cualquier pata saliente propia se ignora aunque no lleve client_state, y se apunta como pata sin Call (transferencia al dueño)", async () => {
    const result = await handleCallInitiated({
      data: {
        id: "evt_out",
        event_type: "call.initiated",
        payload: {
          call_control_id: "call_ctrl_out",
          direction: "outgoing",
          from: ALHABLA,
          to: "+34600111222",
          client_state: null,
        },
      },
    });

    expect(result).toEqual({ success: true });
    expect(mockedBusinessFindUnique).not.toHaveBeenCalled();
    expect(mockedHangupCall).not.toHaveBeenCalled();
    expect(mockedMarcarPataSinCall).toHaveBeenCalledWith(
      "call_ctrl_out",
      "transferencia"
    );
  });

  it("la saliente de la comprobación (con client_state) no se apunta: sus eventos ya se reconocen por el client_state", async () => {
    await handleCallInitiated({
      data: {
        id: "evt_out",
        event_type: "call.initiated",
        payload: {
          call_control_id: "call_ctrl_out",
          direction: "outgoing",
          from: ALHABLA,
          to: LINEA,
          client_state: CLIENT_STATE,
        },
      },
    });

    expect(mockedMarcarPataSinCall).not.toHaveBeenCalled();
  });

  it("la entrante de la comprobación se apunta como pata sin Call antes de colgarla", async () => {
    mockedBusinessFindUnique.mockResolvedValue(negocioConNumero());

    await handleCallInitiated(entrante(ALHABLA));

    expect(mockedMarcarPataSinCall).toHaveBeenCalledWith(
      "call_ctrl_in",
      "comprobacion"
    );
  });

  it("el colgado y el coste de una pata propia sin Call (la transferencia al dueño) se dan por buenos: ni 404 ni evento en error", async () => {
    mockedCallFindUnique.mockResolvedValue(null);
    mockedMotivoDePataSinCall.mockResolvedValue("transferencia");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const colgada = await handleCallHangup({
      data: {
        id: "evt_hang_out",
        event_type: "call.hangup",
        payload: {
          call_control_id: "call_ctrl_out",
          hangup_cause: "normal_clearing",
          client_state: null,
        },
      },
    });
    expect(colgada).toEqual({ success: true });
    expect(mockedMotivoDePataSinCall).toHaveBeenCalledWith("call_ctrl_out");
    expect(mockedCallUpdate).not.toHaveBeenCalled();
    expect(mockedEnqueueUsageReportJob).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();

    const coste = await handleCallCost({
      data: {
        id: "evt_cost_out",
        event_type: "call.cost",
        payload: {
          call_control_id: "call_ctrl_out",
          total_cost: "0.0100",
          status: "success",
          client_state: null,
        },
      },
    });
    expect(coste).toEqual({ success: true });
    expect(mockedCallUpdate).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("una llamada desconocida de verdad (sin marca) sigue devolviendo false al colgar y al recibir el coste", async () => {
    mockedCallFindUnique.mockResolvedValue(null);
    mockedMotivoDePataSinCall.mockResolvedValue(null);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const colgada = await handleCallHangup({
      data: {
        id: "evt_hang_x",
        event_type: "call.hangup",
        payload: { call_control_id: "call_fantasma", client_state: null },
      },
    });
    const coste = await handleCallCost({
      data: {
        id: "evt_cost_x",
        event_type: "call.cost",
        payload: {
          call_control_id: "call_fantasma",
          total_cost: "0.0100",
          status: "success",
          client_state: null,
        },
      },
    });

    expect(colgada).toEqual({ success: false });
    expect(coste).toEqual({ success: false });
    expect(mockedMotivoDePataSinCall).toHaveBeenCalledTimes(2);
  });

  it("call.answered de la saliente: anota que la cogieron y cuelga; el de una llamada de cliente no hace nada", async () => {
    mockedRegistrarContestada.mockResolvedValue({ contestada: true } as any);

    let result = await handleCallAnswered({
      data: {
        id: "evt_ans",
        event_type: "call.answered",
        payload: { call_control_id: "call_ctrl_out", client_state: CLIENT_STATE },
      },
    });

    expect(result).toEqual({ success: true });
    expect(mockedRegistrarContestada).toHaveBeenCalledWith("a".repeat(32));
    expect(mockedHangupCall).toHaveBeenCalledWith("call_ctrl_out");

    vi.clearAllMocks();
    result = await handleCallAnswered({
      data: {
        id: "evt_ans2",
        event_type: "call.answered",
        payload: { call_control_id: "call_ctrl_in" },
      },
    });

    expect(result).toEqual({ success: true });
    expect(mockedRegistrarContestada).not.toHaveBeenCalled();
    expect(mockedHangupCall).not.toHaveBeenCalled();
  });

  it("call.hangup de la saliente cierra la comprobación sin tocar ninguna Call ni reportar consumo", async () => {
    mockedRegistrarColgada.mockResolvedValue({
      resultado: { estado: "fallo", motivo: "sin_desvio" },
    } as any);

    const result = await handleCallHangup({
      data: {
        id: "evt_hang",
        event_type: "call.hangup",
        payload: {
          call_control_id: "call_ctrl_out",
          hangup_cause: "timeout",
          client_state: CLIENT_STATE,
        },
      },
    });

    expect(result).toEqual({ success: true });
    expect(mockedRegistrarColgada).toHaveBeenCalledWith("a".repeat(32), "timeout");
    expect(mockedCallFindUnique).not.toHaveBeenCalled();
    expect(mockedCallUpdate).not.toHaveBeenCalled();
    expect(mockedEnqueueUsageReportJob).not.toHaveBeenCalled();
  });

  it("call.cost de la saliente no busca ninguna Call", async () => {
    const result = await handleCallCost({
      data: {
        id: "evt_cost",
        event_type: "call.cost",
        payload: {
          call_control_id: "call_ctrl_out",
          total_cost: "0.0120",
          status: "success",
          client_state: CLIENT_STATE,
        },
      },
    });

    expect(result).toEqual({ success: true });
    expect(mockedCallFindUnique).not.toHaveBeenCalled();
    expect(mockedCallUpdate).not.toHaveBeenCalled();
  });
});
