import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { alertarDesvioSinComprobar } from "../../src/modules/whatsapp/alertas.js";
import {
  DESDE_HORAS,
  HASTA_HORAS,
  recordarDesvioSinComprobarJob,
} from "../../src/jobs/recordarDesvioSinComprobar.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { business: { findMany: vi.fn(), updateMany: vi.fn() } },
}));
vi.mock("../../src/modules/whatsapp/alertas.js", () => ({
  alertarDesvioSinComprobar: vi.fn(),
}));

const mockedFindMany = vi.mocked(prisma.business.findMany);
const mockedUpdateMany = vi.mocked(prisma.business.updateMany);
const mockedAlertar = vi.mocked(alertarDesvioSinComprobar);

const AHORA = new Date("2026-09-22T10:00:00.000Z");
const HORA_MS = 60 * 60 * 1000;

const NEGOCIO = {
  id: "biz_1",
  name: "Peluquería Ana",
  phone: "+34912345678",
  telnyxPhoneNumber: "+34930453216",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mockedFindMany.mockResolvedValue([NEGOCIO] as never);
  mockedUpdateMany.mockResolvedValue({ count: 1 } as never);
  mockedAlertar.mockResolvedValue({ via: "interactivo" });
});

describe("recordarDesvioSinComprobarJob", () => {
  it("selecciona solo a quien toca: número activo comprado hace 24-48 h, sin comprobar, sin llamadas reales, sin marca y sin ser «alhabla»", async () => {
    await recordarDesvioSinComprobarJob(AHORA);

    expect(mockedFindMany).toHaveBeenCalledTimes(1);
    const where = mockedFindMany.mock.calls[0][0]!.where!;
    expect(where).toMatchObject({
      active: true,
      telnyxPhoneNumber: { not: null },
      phoneNumberStatus: "active",
      telnyxPhoneNumberPurchasedAt: {
        gte: new Date(AHORA.getTime() - HASTA_HORAS * HORA_MS),
        lte: new Date(AHORA.getTime() - DESDE_HORAS * HORA_MS),
      },
      forwardingReminderSentAt: null,
      calls: { none: { voiceProvider: { not: "whatsapp" } } },
    });
    expect(where.AND).toEqual([
      {
        OR: [
          { customerLineType: null },
          { customerLineType: { not: "alhabla" } },
        ],
      },
      {
        OR: [
          { onboardingState: { is: null } },
          { onboardingState: { is: { forwardingCheckedAt: null } } },
        ],
      },
    ]);
    expect(DESDE_HORAS).toBe(24);
    expect(HASTA_HORAS).toBe(48);
  });

  it("reclama la marca ANTES de avisar y manda el recordatorio una sola vez", async () => {
    const resultado = await recordarDesvioSinComprobarJob(AHORA);

    expect(resultado).toEqual({ recordados: 1, omitidos: 0 });
    expect(mockedUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: { id: "biz_1", forwardingReminderSentAt: null },
      data: { forwardingReminderSentAt: AHORA },
    });
    expect(mockedAlertar).toHaveBeenCalledWith({ businessId: "biz_1" });
    // El orden importa: la marca se escribe antes de que salga el aviso.
    expect(mockedUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockedAlertar.mock.invocationCallOrder[0]
    );
  });

  it("no repite si otra pasada ya reclamó la marca", async () => {
    mockedUpdateMany.mockResolvedValue({ count: 0 } as never);

    const resultado = await recordarDesvioSinComprobarJob(AHORA);

    expect(resultado).toEqual({ recordados: 0, omitidos: 1 });
    expect(mockedAlertar).not.toHaveBeenCalled();
  });

  it("no manda nada si la línea de clientes ya es el propio número de Alhabla (caso E sin columna)", async () => {
    mockedFindMany.mockResolvedValue([
      { ...NEGOCIO, phone: NEGOCIO.telnyxPhoneNumber },
    ] as never);

    const resultado = await recordarDesvioSinComprobarJob(AHORA);

    expect(resultado).toEqual({ recordados: 0, omitidos: 1 });
    expect(mockedUpdateMany).not.toHaveBeenCalled();
    expect(mockedAlertar).not.toHaveBeenCalled();
  });

  it("retira la marca si el aviso no salió por ninguna vía, para reintentar en la siguiente pasada", async () => {
    mockedAlertar.mockResolvedValue({
      via: "ninguna",
      motivo: "el negocio no tiene ningún correo",
    });

    const resultado = await recordarDesvioSinComprobarJob(AHORA);

    expect(resultado).toEqual({ recordados: 0, omitidos: 1 });
    expect(mockedUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockedUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "biz_1", forwardingReminderSentAt: AHORA },
      data: { forwardingReminderSentAt: null },
    });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("no salió por ninguna vía")
    );
  });

  it("con el email como respaldo también cuenta como enviado", async () => {
    mockedAlertar.mockResolvedValue({ via: "email", motivo: "sin WhatsApp" });

    const resultado = await recordarDesvioSinComprobarJob(AHORA);

    expect(resultado).toEqual({ recordados: 1, omitidos: 0 });
    expect(mockedUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("sin candidatos no toca nada", async () => {
    mockedFindMany.mockResolvedValue([] as never);

    const resultado = await recordarDesvioSinComprobarJob(AHORA);

    expect(resultado).toEqual({ recordados: 0, omitidos: 0 });
    expect(mockedUpdateMany).not.toHaveBeenCalled();
    expect(mockedAlertar).not.toHaveBeenCalled();
  });
});
