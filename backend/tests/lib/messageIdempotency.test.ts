import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { reclamarEnvio } from "../../src/lib/messageIdempotency.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { sentMessage: { create: vi.fn(), updateMany: vi.fn() } },
}));

const mockedCreate = vi.mocked(prisma.sentMessage.create);
const mockedUpdateMany = vi.mocked(prisma.sentMessage.updateMany);

describe("reclamarEnvio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCreate.mockResolvedValue({} as never);
  });

  it("sin datos extra crea la fila solo con canal y clave (jobs de voz)", async () => {
    expect(await reclamarEnvio("whatsapp", "confirm-sms-booking_1")).toBe(true);
    expect(mockedCreate).toHaveBeenCalledWith({
      data: { channel: "whatsapp", idempotencyKey: "confirm-sms-booking_1" },
    });
  });

  it("con datos extra la fila nace con negocio, audiencia, destino, callback y tipo", async () => {
    expect(
      await reclamarEnvio("whatsapp", "alta:biz_1:1", {
        businessId: "biz_1",
        audience: "owner",
        toNumber: "+34600123456",
        callbackData: "alta:biz_1",
        kind: "template",
      })
    ).toBe(true);
    expect(mockedCreate).toHaveBeenCalledWith({
      data: {
        channel: "whatsapp",
        idempotencyKey: "alta:biz_1:1",
        businessId: "biz_1",
        audience: "owner",
        toNumber: "+34600123456",
        callbackData: "alta:biz_1",
        kind: "template",
      },
    });
  });

  it("sin clave no toca la base de datos y deja enviar", async () => {
    expect(await reclamarEnvio("email", undefined)).toBe(true);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("una clave ya reclamada (P2002) devuelve false; otro fallo de BD deja enviar", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mockedCreate.mockRejectedValueOnce({ code: "P2002" });
    expect(await reclamarEnvio("whatsapp", "k")).toBe(false);

    mockedCreate.mockRejectedValueOnce(new Error("BD caída"));
    expect(await reclamarEnvio("whatsapp", "k")).toBe(true);
    expect(errorSpy).toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("reclamarEnvio con reintentarFallidos vuelve a reclamar una fila failed sin providerMessageId (la limpia y devuelve true) y no una queued/sent/suppressed ni una failed con providerMessageId", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    mockedCreate.mockRejectedValue({ code: "P2002" });

    // El updateMany condicional es el que distingue los casos: solo la
    // fila failed + providerMessageId null casa con el where.
    mockedUpdateMany.mockResolvedValueOnce({ count: 1 });
    expect(
      await reclamarEnvio("whatsapp", "k", undefined, {
        reintentarFallidos: true,
      })
    ).toBe(true);
    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: {
        channel: "whatsapp",
        idempotencyKey: "k",
        deliveryStatus: "failed",
        providerMessageId: null,
      },
      data: {
        deliveryStatus: null,
        errorCode: null,
        errorDetail: null,
        failedAt: null,
        sentAt: expect.any(Date),
      },
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("había fallado; se vuelve a intentar")
    );

    // queued / sent / suppressed, o failed con providerMessageId: 0 filas.
    mockedUpdateMany.mockResolvedValueOnce({ count: 0 });
    expect(
      await reclamarEnvio("whatsapp", "k", undefined, {
        reintentarFallidos: true,
      })
    ).toBe(false);
    logSpy.mockRestore();
  });

  it("reclamarEnvio sin la opción sigue devolviendo false ante cualquier fila existente, también failed", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    mockedCreate.mockRejectedValue({ code: "P2002" });

    expect(await reclamarEnvio("whatsapp", "k")).toBe(false);
    expect(await reclamarEnvio("whatsapp", "k", { audience: "owner" })).toBe(
      false
    );
    expect(mockedUpdateMany).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
