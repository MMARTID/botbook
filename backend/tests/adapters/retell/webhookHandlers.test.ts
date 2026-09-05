import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleCallStarted,
  handleCallEnded,
  handleCallAnalyzed,
} from "../../../src/adapters/retell/webhookHandlers.js";
import { prisma } from "../../../src/lib/prisma.js";
import { enqueueRecordingJob } from "../../../src/lib/cloudTasks.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    agent: {
      findFirst: vi.fn(),
    },
    call: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
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

vi.mock("../../../src/lib/cloudTasks.js", () => ({
  enqueueRecordingJob: vi.fn(),
}));

const mockedAgentFindFirst = vi.mocked(prisma.agent.findFirst);
const mockedCallUpsert = vi.mocked(prisma.call.upsert);
const mockedCallFindUnique = vi.mocked(prisma.call.findUnique);
const mockedCallUpdate = vi.mocked(prisma.call.update);
const mockedTranscriptUpsert = vi.mocked(prisma.transcript.upsert);
const mockedEnqueueRecordingJob = vi.mocked(enqueueRecordingJob);

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

    it("guarda from_number cuando Retell lo manda", async () => {
      mockedAgentFindFirst.mockResolvedValue({
        id: "agent_123",
        businessId: "business_123",
      } as any);
      mockedCallUpsert.mockResolvedValue({ id: "call_123" } as any);

      await handleCallStarted({
        event_type: "call_started",
        data: {
          call_id: "retell_call_123",
          agent_id: "retell_agent_123",
          from_number: "692138456",
        },
      });

      expect(mockedCallUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ fromNumber: "692138456" }),
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
          duration_ms: 23362,
          disconnection_reason: "user_hangup",
          recording_url: "https://example.com/recording.mp3",
          transcript: "Agent: Hola\nUser: Quiero una cita",
          transcript_object: [
            { role: "agent", content: "Hola" },
            { role: "user", content: "Quiero una cita" },
          ],
          call_cost: { combined_cost: 6.1 },
        },
      });

      expect(result.success).toBe(true);
      expect(mockedCallUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ durationSecs: 23, costCents: 6 }),
          update: expect.objectContaining({ durationSecs: 23, costCents: 6 }),
        })
      );
      expect(mockedTranscriptUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            messages: [
              { role: "agent", content: "Hola" },
              { role: "user", content: "Quiero una cita" },
            ],
          }),
        })
      );
      expect(mockedEnqueueRecordingJob).toHaveBeenCalled();
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
          duration_ms: 60000,
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
          transcript_object: [{ role: "user", content: "Transcripción final" }],
          recording_url: "https://example.com/recording.mp3",
        },
      });

      expect(result.success).toBe(true);
      expect(mockedTranscriptUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            messages: [{ role: "user", content: "Transcripción final" }],
          }),
        })
      );
      expect(mockedCallUpdate).not.toHaveBeenCalled();
    });

    it("guarda el sentimiento cuando call_analysis.user_sentiment viene informado", async () => {
      mockedCallFindUnique.mockResolvedValue({
        id: "call_123",
        businessId: "business_123",
      } as any);

      const result = await handleCallAnalyzed({
        event_type: "call_analyzed",
        data: {
          call_id: "retell_call_123",
          agent_id: "retell_agent_123",
          call_analysis: { user_sentiment: "Positive" },
        },
      });

      expect(result.success).toBe(true);
      expect(mockedCallUpdate).toHaveBeenCalledWith({
        where: { id: "call_123" },
        data: { sentiment: "POSITIVE", outcome: null },
      });
    });

    it("guarda sentiment=null cuando user_sentiment es Unknown", async () => {
      mockedCallFindUnique.mockResolvedValue({
        id: "call_123",
        businessId: "business_123",
      } as any);

      const result = await handleCallAnalyzed({
        event_type: "call_analyzed",
        data: {
          call_id: "retell_call_123",
          agent_id: "retell_agent_123",
          call_analysis: { user_sentiment: "Unknown" },
        },
      });

      expect(result.success).toBe(true);
      expect(mockedCallUpdate).toHaveBeenCalledWith({
        where: { id: "call_123" },
        data: { sentiment: null, outcome: null },
      });
    });

    it("guarda call_outcome desde custom_analysis_data", async () => {
      mockedCallFindUnique.mockResolvedValue({
        id: "call_123",
        businessId: "business_123",
      } as any);

      const result = await handleCallAnalyzed({
        event_type: "call_analyzed",
        data: {
          call_id: "retell_call_123",
          agent_id: "retell_agent_123",
          call_analysis: {
            user_sentiment: "Neutral",
            custom_analysis_data: { call_outcome: "LEAD_CAPTURED" },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(mockedCallUpdate).toHaveBeenCalledWith({
        where: { id: "call_123" },
        data: { sentiment: "NEUTRAL", outcome: "LEAD_CAPTURED" },
      });
    });

    it("guarda outcome=null si custom_analysis_data trae un valor no reconocido", async () => {
      mockedCallFindUnique.mockResolvedValue({
        id: "call_123",
        businessId: "business_123",
      } as any);

      const result = await handleCallAnalyzed({
        event_type: "call_analyzed",
        data: {
          call_id: "retell_call_123",
          agent_id: "retell_agent_123",
          call_analysis: {
            custom_analysis_data: { call_outcome: "algo_inesperado" },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(mockedCallUpdate).toHaveBeenCalledWith({
        where: { id: "call_123" },
        data: { sentiment: null, outcome: null },
      });
    });

    it("guarda call_summary y call_successful cuando vienen informados", async () => {
      mockedCallFindUnique.mockResolvedValue({
        id: "call_123",
        businessId: "business_123",
      } as any);

      const result = await handleCallAnalyzed({
        event_type: "call_analyzed",
        data: {
          call_id: "retell_call_123",
          agent_id: "retell_agent_123",
          call_analysis: {
            call_summary: "El cliente reservó corte de pelo para el jueves a las 17:00.",
            call_successful: true,
          },
        },
      });

      expect(result.success).toBe(true);
      expect(mockedCallUpdate).toHaveBeenCalledWith({
        where: { id: "call_123" },
        data: {
          sentiment: null,
          outcome: null,
          summary: "El cliente reservó corte de pelo para el jueves a las 17:00.",
          successful: true,
        },
      });
    });

    it("no incluye summary/successful en la actualización si call_analysis no los trae", async () => {
      mockedCallFindUnique.mockResolvedValue({
        id: "call_123",
        businessId: "business_123",
      } as any);

      await handleCallAnalyzed({
        event_type: "call_analyzed",
        data: {
          call_id: "retell_call_123",
          agent_id: "retell_agent_123",
          call_analysis: { user_sentiment: "Positive" },
        },
      });

      const updatePayload = mockedCallUpdate.mock.calls[0][0];
      expect(updatePayload.data).not.toHaveProperty("summary");
      expect(updatePayload.data).not.toHaveProperty("successful");
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
