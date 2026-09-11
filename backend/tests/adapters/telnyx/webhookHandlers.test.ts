import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractTelnyxEventEnvelope,
  handleCallInitiated,
  handleCallHangup,
  handleCallConversationEnded,
  handleCallRecordingSaved,
  handleCallConversationInsightsGenerated,
  handleCallCost,
} from "../../../src/adapters/telnyx/webhookHandlers.js";
import { prisma } from "../../../src/lib/prisma.js";
import { telnyxAiAdapter } from "../../../src/adapters/telnyx/TelnyxAiAdapter.js";
import {
  enqueueRecordingJob,
  enqueueUsageReportJob,
} from "../../../src/lib/cloudTasks.js";

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
    listConversationMessages: vi.fn(),
    listRecordingsByCallLegId: vi.fn(),
  },
}));

vi.mock("../../../src/lib/cloudTasks.js", () => ({
  enqueueRecordingJob: vi.fn(),
  enqueueUsageReportJob: vi.fn(),
}));

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedCallUpsert = vi.mocked(prisma.call.upsert);
const mockedCallFindUnique = vi.mocked(prisma.call.findUnique);
const mockedCallUpdate = vi.mocked(prisma.call.update);
const mockedTranscriptUpsert = vi.mocked(prisma.transcript.upsert);
const mockedRecordingUpsert = vi.mocked(prisma.recording.upsert);
const mockedHangupCall = vi.mocked(telnyxAiAdapter.hangupCall);
const mockedAnswerCallWithAssistant = vi.mocked(
  telnyxAiAdapter.answerCallWithAssistant
);
const mockedListConversationMessages = vi.mocked(
  telnyxAiAdapter.listConversationMessages
);
const mockedListRecordingsByCallLegId = vi.mocked(
  telnyxAiAdapter.listRecordingsByCallLegId
);
const mockedEnqueueRecordingJob = vi.mocked(enqueueRecordingJob);
const mockedEnqueueUsageReportJob = vi.mocked(enqueueUsageReportJob);

beforeEach(() => {
  vi.clearAllMocks();
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
        where: { vapiCallId: "call_ctrl_1" },
        create: expect.objectContaining({
          vapiCallId: "call_ctrl_1",
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
    expect(mockedRecordingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { callId: "call_db_1" },
        create: { callId: "call_db_1", vapiUrl: "https://example.com/a.mp3" },
      })
    );
    expect(mockedEnqueueRecordingJob).toHaveBeenCalledWith(
      {
        callId: "call_db_1",
        vapiUrl: "https://example.com/a.mp3",
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
  it("acepta el evento y no lanza aunque no haya mapeo de insights todavía", async () => {
    const result = await handleCallConversationInsightsGenerated({
      data: {
        id: "evt_5",
        event_type: "call.conversation_insights.generated",
        payload: {
          call_control_id: "call_ctrl_1",
          results: [{ insight_id: "insight_1", result: "positive" }],
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
      data: { providerCostCents: 1 },
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
