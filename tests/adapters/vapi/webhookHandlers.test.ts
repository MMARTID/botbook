import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  handleFunctionCall,
  handleEndOfCallReport,
  handleStatusUpdate,
} from "../../../src/adapters/vapi/webhookHandlers.js";
import { prisma } from "../../../src/lib/prisma.js";
import { executeVoiceTool } from "../../../src/modules/voiceTools/service.js";
import { recordingQueue, classifyQueue } from "../../../src/lib/queue.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    agent: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    call: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../../src/modules/voiceTools/service.js", () => ({
  executeVoiceTool: vi.fn(),
  invalidateVoiceConfigCache: vi.fn(),
}));

vi.mock("../../../src/lib/queue.js", () => ({
  recordingQueue: { add: vi.fn() },
  classifyQueue: { add: vi.fn() },
  initializeQueues: vi.fn(),
  closeQueues: vi.fn(),
}));

const mockedAgentFindFirst = vi.mocked(prisma.agent.findFirst);
const mockedCallFindUnique = vi.mocked(prisma.call.findUnique);
const mockedCallUpsert = vi.mocked(prisma.call.upsert);
const mockedCallUpdate = vi.mocked(prisma.call.update);
const mockedTransaction = vi.mocked(prisma.$transaction);
const mockedExecuteVoiceTool = vi.mocked(executeVoiceTool);
const mockedRecordingQueueAdd = vi.mocked(recordingQueue.add);
const mockedClassifyQueueAdd = vi.mocked(classifyQueue.add);

function buildAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: "agent_123",
    businessId: "business_123",
    vapiAssistantId: "assistant_123",
    name: "Agente Test",
    systemPrompt: "Eres un asistente...",
    ...overrides,
  };
}

function buildFunctionCallPayload(name: string, parameters: Record<string, unknown>) {
  return {
    message: {
      type: "function-call" as const,
      toolUse: {
        type: "function" as const,
        function: {
          name,
          parameters,
        },
      },
    },
    call: { id: "call_123" },
    assistant: { id: "assistant_123" },
  };
}

describe("handleFunctionCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resuelve el negocio y delega en executeVoiceTool para check_business_hours", async () => {
    mockedAgentFindFirst.mockResolvedValue(buildAgent() as any);
    mockedExecuteVoiceTool.mockResolvedValue({
      success: true,
      result: { isOpen: true },
    });

    const result = await handleFunctionCall(
      buildFunctionCallPayload("check_business_hours", {
        startDateTime: "2026-08-10T10:00:00",
        durationMinutes: 60,
      })
    );

    expect(result.success).toBe(true);
    expect(result.result.isOpen).toBe(true);
    expect(mockedAgentFindFirst).toHaveBeenCalledWith({
      where: { vapiAssistantId: "assistant_123" },
      select: { businessId: true },
    });
    expect(mockedExecuteVoiceTool).toHaveBeenCalledWith({
      businessId: "business_123",
      toolName: "check_business_hours",
      params: {
        startDateTime: "2026-08-10T10:00:00",
        durationMinutes: 60,
      },
      callLabel: "llamada call_123",
      callId: "call_123",
    });
  });

  it("check_business_hours falla si no hay assistantId", async () => {
    const payload = buildFunctionCallPayload("check_business_hours", {});
    payload.assistant = { id: "" };

    const result = await handleFunctionCall(payload);

    expect(result.success).toBe(false);
    expect(mockedExecuteVoiceTool).not.toHaveBeenCalled();
  });

  it("resuelve el negocio y delega en executeVoiceTool para check_availability", async () => {
    mockedAgentFindFirst.mockResolvedValue(buildAgent() as any);
    mockedExecuteVoiceTool.mockResolvedValue({
      success: true,
      result: { available: true },
    });

    const result = await handleFunctionCall(
      buildFunctionCallPayload("check_availability", {
        startDateTime: "2026-08-10T10:00:00",
        durationMinutes: 60,
      })
    );

    expect(result.success).toBe(true);
    expect(result.result.available).toBe(true);
    expect(mockedExecuteVoiceTool).toHaveBeenCalledWith({
      businessId: "business_123",
      toolName: "check_availability",
      params: {
        startDateTime: "2026-08-10T10:00:00",
        durationMinutes: 60,
      },
      callLabel: "llamada call_123",
      callId: "call_123",
    });
  });

  it("resuelve el negocio y delega en executeVoiceTool para book_appointment", async () => {
    mockedAgentFindFirst.mockResolvedValue(buildAgent() as any);
    mockedExecuteVoiceTool.mockResolvedValue({
      success: true,
      result: { success: true, eventLink: "https://calendar.google.com/event/1" },
    });

    const result = await handleFunctionCall(
      buildFunctionCallPayload("book_appointment", {
        clientName: "María",
        startDateTime: "2026-08-10T10:00:00",
        durationMinutes: 60,
        clientEmail: "maria@example.com",
      })
    );

    expect(result.success).toBe(true);
    expect(result.result.success).toBe(true);
    expect(mockedExecuteVoiceTool).toHaveBeenCalledWith({
      businessId: "business_123",
      toolName: "book_appointment",
      params: {
        clientName: "María",
        startDateTime: "2026-08-10T10:00:00",
        durationMinutes: 60,
        clientEmail: "maria@example.com",
      },
      callLabel: "llamada call_123",
      callId: "call_123",
    });
  });

  it("devuelve success sin resultado para funciones desconocidas", async () => {
    mockedAgentFindFirst.mockResolvedValue(buildAgent() as any);
    mockedExecuteVoiceTool.mockResolvedValue({ success: true });

    const result = await handleFunctionCall(
      buildFunctionCallPayload("unknown_function", {})
    );

    expect(result.success).toBe(true);
    expect(result.result).toBeUndefined();
  });
});

describe("handleEndOfCallReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserta la llamada, transcript y grabación, y encola jobs", async () => {
    const callRecord = { id: "db_call_123", businessId: "business_123" };
    mockedTransaction.mockImplementation(async (callback: any) => callback({
      call: {
        upsert: vi.fn().mockResolvedValue(callRecord),
        update: vi.fn(),
      },
      booking: { upsert: vi.fn() },
      order: { upsert: vi.fn() },
      transcript: { upsert: vi.fn() },
      recording: { upsert: vi.fn() },
    }));

    const result = await handleEndOfCallReport({
      message: {
        type: "end-of-call-report" as const,
        call: { id: "call_123", assistantId: "assistant_123" },
        transcript: "Hola, quiero una cita",
        recordingUrl: "https://vapi.com/recording.mp3",
        durationSeconds: 120,
        cost: 0.05,
      },
    });

    expect(result.success).toBe(true);
    expect(mockedRecordingQueueAdd).toHaveBeenCalled();
    expect(mockedClassifyQueueAdd).toHaveBeenCalled();
  });

  it("falla si no hay identificador de llamada", async () => {
    const result = await handleEndOfCallReport({
      message: { type: "end-of-call-report" as const, call: { id: "" } },
    });

    expect(result.success).toBe(false);
  });
});

describe("handleStatusUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea la llamada si no existe", async () => {
    mockedCallFindUnique.mockResolvedValue(null);
    mockedAgentFindFirst.mockResolvedValue(buildAgent() as any);
    mockedCallUpsert.mockResolvedValue({ id: "db_call_123" } as any);

    const result = await handleStatusUpdate({
      message: {
        type: "status-update" as const,
        status: "active",
        call: { id: "call_123", assistantId: "assistant_123" },
      },
    });

    expect(result.success).toBe(true);
    expect(mockedCallUpsert).toHaveBeenCalled();
  });

  it("actualiza el estado a COMPLETED cuando la llamada termina", async () => {
    mockedCallFindUnique.mockResolvedValue({
      id: "db_call_123",
      status: "IN_PROGRESS",
    } as any);

    const result = await handleStatusUpdate({
      message: {
        type: "status-update" as const,
        status: "ended",
        call: { id: "call_123" },
      },
    });

    expect(result.success).toBe(true);
    expect(mockedCallUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED" }),
      })
    );
  });
});
