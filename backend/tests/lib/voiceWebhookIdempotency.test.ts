import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  claimVoiceWebhookEvent,
  completeVoiceWebhookEvent,
} from "../../src/lib/voiceWebhookIdempotency.js";
import { prisma } from "../../src/lib/prisma.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    voiceWebhookEvent: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const mockedCreate = vi.mocked(prisma.voiceWebhookEvent.create);
const mockedUpdate = vi.mocked(prisma.voiceWebhookEvent.update);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("claimVoiceWebhookEvent", () => {
  it("devuelve true cuando el evento no se había visto antes", async () => {
    mockedCreate.mockResolvedValue({} as any);

    const claimed = await claimVoiceWebhookEvent("telnyx", "evt_1", "call.hangup");

    expect(claimed).toBe(true);
    expect(mockedCreate).toHaveBeenCalledWith({
      data: { provider: "telnyx", eventId: "evt_1", type: "call.hangup" },
    });
  });

  it("devuelve false ante un reintento del mismo evento (violación de unicidad)", async () => {
    mockedCreate.mockRejectedValue({ code: "P2002" });

    const claimed = await claimVoiceWebhookEvent("telnyx", "evt_1", "call.hangup");

    expect(claimed).toBe(false);
  });

  it("propaga cualquier otro error de base de datos", async () => {
    mockedCreate.mockRejectedValue(new Error("DB caída"));

    await expect(
      claimVoiceWebhookEvent("telnyx", "evt_1", "call.hangup")
    ).rejects.toThrow("DB caída");
  });
});

describe("completeVoiceWebhookEvent", () => {
  it("registra el resultado sin lanzar aunque falle la actualización", async () => {
    mockedUpdate.mockRejectedValue(new Error("fila ya borrada"));

    await expect(
      completeVoiceWebhookEvent("telnyx", "evt_1", "success")
    ).resolves.toBeUndefined();

    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { provider_eventId: { provider: "telnyx", eventId: "evt_1" } },
      data: {
        processedAt: expect.any(Date),
        result: "success",
        callId: undefined,
        lastError: undefined,
      },
    });
  });

  it("acepta callId y lastError opcionales", async () => {
    mockedUpdate.mockResolvedValue({} as any);

    await completeVoiceWebhookEvent("telnyx", "evt_1", "error", {
      callId: "call_db_1",
      lastError: "boom",
    });

    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ callId: "call_db_1", lastError: "boom" }),
      })
    );
  });
});
