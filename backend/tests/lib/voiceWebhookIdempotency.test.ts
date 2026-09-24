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
      updateMany: vi.fn(),
    },
  },
}));

const mockedCreate = vi.mocked(prisma.voiceWebhookEvent.create);
const mockedUpdate = vi.mocked(prisma.voiceWebhookEvent.update);
const mockedUpdateMany = vi.mocked(prisma.voiceWebhookEvent.updateMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("claimVoiceWebhookEvent", () => {
  it("devuelve true cuando el evento no se había visto antes, y lo deja en curso", async () => {
    mockedCreate.mockResolvedValue({} as any);

    const claimed = await claimVoiceWebhookEvent("telnyx", "evt_1", "call.hangup");

    expect(claimed).toBe(true);
    expect(mockedCreate).toHaveBeenCalledWith({
      data: {
        provider: "telnyx",
        eventId: "evt_1",
        type: "call.hangup",
        result: "processing",
        claimedAt: expect.any(Date),
        attempts: 1,
      },
    });
    expect(mockedUpdateMany).not.toHaveBeenCalled();
  });

  // La regresión que motivó el cambio: antes, un evento que había fallado
  // quedaba marcado para siempre y el reintento del proveedor recibía
  // «200 deduped», así que se perdía.
  it("vuelve a reclamar un evento cuyo intento anterior falló", async () => {
    mockedCreate.mockRejectedValue({ code: "P2002" });
    mockedUpdateMany.mockResolvedValue({ count: 1 } as any);

    const claimed = await claimVoiceWebhookEvent("telnyx", "evt_1", "call.hangup");

    expect(claimed).toBe(true);
    const where = mockedUpdateMany.mock.calls[0]![0].where as any;
    expect(where.OR).toContainEqual({ result: "error" });
    expect(mockedUpdateMany.mock.calls[0]![0].data).toMatchObject({
      result: "processing",
      attempts: { increment: 1 },
      lastError: null,
    });
  });

  it("no reclama lo que ya terminó bien ni lo que se está procesando ahora", async () => {
    mockedCreate.mockRejectedValue({ code: "P2002" });
    // La condición del UPDATE no encaja: ni `error` ni `processing` caducado.
    mockedUpdateMany.mockResolvedValue({ count: 0 } as any);

    await expect(
      claimVoiceWebhookEvent("telnyx", "evt_1", "call.hangup")
    ).resolves.toBe(false);
  });

  it("puede reclamar un «processing» que lleva colgado más que el lease", async () => {
    mockedCreate.mockRejectedValue({ code: "P2002" });
    mockedUpdateMany.mockResolvedValue({ count: 1 } as any);

    await claimVoiceWebhookEvent("telnyx", "evt_1", "call.hangup");

    const where = mockedUpdateMany.mock.calls[0]![0].where as any;
    const caducado = where.OR.find(
      (c: any) => c.result === "processing" && c.claimedAt?.lt instanceof Date
    );
    expect(caducado).toBeDefined();
    // El corte del lease está en el pasado, nunca en el futuro: reclamar
    // antes de tiempo significaría procesar el mismo evento dos veces.
    expect(caducado.claimedAt.lt.getTime()).toBeLessThan(Date.now());
  });

  it("propaga cualquier otro error de base de datos", async () => {
    mockedCreate.mockRejectedValue(new Error("DB caída"));

    await expect(
      claimVoiceWebhookEvent("telnyx", "evt_1", "call.hangup")
    ).rejects.toThrow("DB caída");
  });
});

describe("completeVoiceWebhookEvent", () => {
  it("registra el resultado y suelta el lease sin lanzar aunque falle", async () => {
    mockedUpdate.mockRejectedValue(new Error("fila ya borrada"));

    await expect(
      completeVoiceWebhookEvent("telnyx", "evt_1", "success")
    ).resolves.toBeUndefined();

    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { provider_eventId: { provider: "telnyx", eventId: "evt_1" } },
      data: {
        processedAt: expect.any(Date),
        claimedAt: null,
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
