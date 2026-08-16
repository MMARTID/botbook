import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleCallStarted,
  handleCallEnded,
  handleCallAnalyzed,
} from "../../../src/adapters/retell/webhookHandlers.js";
import { prisma } from "../../../src/lib/prisma.js";
import { recordingQueue, classifyQueue } from "../../../src/lib/queue.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    agent: {
      findFirst: vi.fn(),
    },
    call: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    transcript: {
      upsert: vi.fn(),
    },
    recording: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

vi.mock("../../../src/lib/queue.js", () => ({
  recordingQueue: { add: vi.fn() },
  classifyQueue: { add: vi.fn() },
}));

const mockedAgentFindFirst = vi.mocked(prisma.agent.findFirst);
const mockedCallUpsert = vi.mocked(prisma.call.upsert);
const mockedCallFindUnique = vi.mocked(prisma.call.findUnique);
const mockedRecordingQueueAdd = vi.mocked(recordingQueue.add);
const mockedClassifyQueueAdd = vi.mocked(classifyQueue.add);

describe("Retell webhook handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleCallStarted", () => {
    it("registra una llamada nueva cuando el agente existe", async () => {
      mockedAgentFindFirst.mockResolvedValue({
        id: "agent_123",
        businessId: "business_123",
      } as any);
      mockedCallUpsert.mockResolvedValue({ id: "call_123" } as any);

      const result = await handleCallStarted({
        event_type: "call_started",
        data: {
          call_id: "retell_call_123",
          agent_id: "retell_agent_123",
        },
      });

      expect(result.success).toBe(true);
      expect(mockedCallUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { vapiCallId: "retell_call_123" },
          create: expect.objectContaining({
            vapiCallId: "retell_call_123",
            businessId: "business_123",
            agentId: "agent_123",
            status: "IN_PROGRESS",
          }),
          update: { status: "IN_PROGRESS" },
        })
      );
    });

    it("falla si no encuentra el negocio del agente", async () => {
      mockedAgentFindFirst.mockResolvedValue(null as any);

      const result = await handleCallStarted({
        event_type: "call_started",
        data: {
          call_id: "retell_call_123",
          agent_id: "retell_agent_123",
        },
      });

      expect(result.success).toBe(false);
      expect(mockedCallUpsert).not.toHaveBeenCalled();
    });
  });

  describe("handleCallEnded", () => {
    it("guarda la llamada, transcript y grabación, y encola jobs", async () => {
      mockedCallFindUnique.mockResolvedValue({
        id: "call_123",
        businessId: "business_123",
        agentId: "agent_123",
      } as any);
      mockedCallUpsert.mockResolvedValue({
        id: "call_123",
        businessId: "business_123",
      } as any);

      const result = await handleCallEnded({
        event_type: "call_ended",
        data: {
          call_id: "retell_call_123",
          agent_id: "retell_agent_123",
          duration_seconds: 120,
          disconnect_reason: "completed",
          recording_url: "https://example.com/recording.mp3",
          transcript: "Hola, quiero una cita",
          call_cost: { total_cost: 0.05 },
        },
      });

      expect(result.success).toBe(true);
      expect(mockedRecordingQueueAdd).toHaveBeenCalled();
      expect(mockedClassifyQueueAdd).toHaveBeenCalled();
    });

    it("recupera el negocio si la llamada no existía", async () => {
      mockedCallFindUnique.mockResolvedValue(null as any);
      mockedAgentFindFirst.mockResolvedValue({
        id: "agent_123",
        businessId: "business_123",
      } as any);
      mockedCallUpsert.mockResolvedValue({
        id: "call_123",
        businessId: "business_123",
      } as any);

      const result = await handleCallEnded({
        event_type: "call_ended",
        data: {
          call_id: "retell_call_123",
          agent_id: "retell_agent_123",
          duration_seconds: 60,
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("handleCallAnalyzed", () => {
    it("actualiza transcript y grabación si la llamada existe", async () => {
      mockedCallFindUnique.mockResolvedValue({
        id: "call_123",
        businessId: "business_123",
      } as any);

      const result = await handleCallAnalyzed({
        event_type: "call_analyzed",
        data: {
          call_id: "retell_call_123",
          agent_id: "retell_agent_123",
          transcript: "Transcripción final",
          recording_url: "https://example.com/recording.mp3",
        },
      });

      expect(result.success).toBe(true);
    });

    it("ignora el análisis si la llamada no existe", async () => {
      mockedCallFindUnique.mockResolvedValue(null as any);

      const result = await handleCallAnalyzed({
        event_type: "call_analyzed",
        data: {
          call_id: "retell_call_123",
          agent_id: "retell_agent_123",
        },
      });

      expect(result.success).toBe(false);
    });
  });
});
