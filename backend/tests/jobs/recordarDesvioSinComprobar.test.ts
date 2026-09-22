import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import {
  alertarDesvioComprobado,
  alertarDesvioSinComprobar,
} from "../../src/modules/whatsapp/alertas.js";
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
  alertarDesvioComprobado: vi.fn(),
}));

const mockedFindMany = vi.mocked(prisma.business.findMany);
const mockedUpdateMany = vi.mocked(prisma.business.updateMany);
const mockedAlertar = vi.mocked(alertarDesvioSinComprobar);
const mockedConfirmar = vi.mocked(alertarDesvioComprobado);

const AHORA = new Date("2026-09-22T10:00:00.000Z");
const HORA_MS = 60 * 60 * 1000;

const NEGOCIO = {
  id: "biz_1",
  name: "Peluquería Ana",
  phone: "+34912345678",
  telnyxPhoneNumber: "+34930453216",
  onboardingState: { forwardingCheckedAt: null },
};

const SIN_NADA = { recordados: 0, confirmados: 0, omitidos: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mockedFindMany.mockResolvedValue([NEGOCIO] as never);
  mockedUpdateMany.mockResolvedValue({ count: 1 } as never);
  mockedAlertar.mockResolvedValue({ via: "interactivo" });
  mockedConfirmar.mockResolvedValue({ via: "interactivo" });
});

describe("recordarDesvioSinComprobarJob", () => {
  it("selecciona solo a quien toca: número activo comprado hace 24-48 h, sin marca, sin ser «alhabla», y comprobado o bien sin comprobar y sin llamadas reales", async () => {
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
          { onboardingState: { is: { forwardingCheckedAt: { not: null } } } },
          {
            AND: [
              {
                OR: [
                  { onboardingState: { is: null } },
                  { onboardingState: { is: { forwardingCheckedAt: null } } },
                ],
              },
              { calls: { none: { voiceProvider: { not: "whatsapp" } } } },
            ],
          },
        ],
      },
    ]);
    expect(DESDE_HORAS).toBe(24);
    expect(HASTA_HORAS).toBe(48);
  });

  it("exige lo mismo que «Comprobar desvío»: línea guardada (no el TEMP- del registro) y número enrutado a Telnyx", async () => {
    await recordarDesvioSinComprobarJob(AHORA);

    const where = mockedFindMany.mock.calls[0][0]!.where!;
    expect(where).toMatchObject({
      voiceRoutingTarget: "telnyx",
      NOT: { phone: { startsWith: "TEMP-" } },
    });
  });

  it("reclama la marca ANTES de avisar y manda el recordatorio una sola vez, con el instante del intento", async () => {
    const resultado = await recordarDesvioSinComprobarJob(AHORA);

    expect(resultado).toEqual({ recordados: 1, confirmados: 0, omitidos: 0 });
    expect(mockedUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: { id: "biz_1", forwardingReminderSentAt: null },
      data: { forwardingReminderSentAt: AHORA },
    });
    expect(mockedAlertar).toHaveBeenCalledWith({
      businessId: "biz_1",
      intento: AHORA,
    });
    expect(mockedConfirmar).not.toHaveBeenCalled();
    // El orden importa: la marca se escribe antes de que salga el aviso.
    expect(mockedUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockedAlertar.mock.invocationCallOrder[0]
    );
  });

  it("con el desvío ya comprobado manda «tu desvío está comprobado» en vez del recordatorio", async () => {
    mockedFindMany.mockResolvedValue([
      {
        ...NEGOCIO,
        onboardingState: {
          forwardingCheckedAt: new Date("2026-09-21T12:00:00.000Z"),
        },
      },
    ] as never);

    const resultado = await recordarDesvioSinComprobarJob(AHORA);

    expect(resultado).toEqual({ recordados: 0, confirmados: 1, omitidos: 0 });
    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: { id: "biz_1", forwardingReminderSentAt: null },
      data: { forwardingReminderSentAt: AHORA },
    });
    expect(mockedConfirmar).toHaveBeenCalledWith({
      businessId: "biz_1",
      intento: AHORA,
    });
    expect(mockedAlertar).not.toHaveBeenCalled();
  });

  it("no repite si otra pasada ya reclamó la marca", async () => {
    mockedUpdateMany.mockResolvedValue({ count: 0 } as never);

    const resultado = await recordarDesvioSinComprobarJob(AHORA);

    expect(resultado).toEqual({ ...SIN_NADA, omitidos: 1 });
    expect(mockedAlertar).not.toHaveBeenCalled();
    expect(mockedConfirmar).not.toHaveBeenCalled();
  });

  it("no manda nada si la línea de clientes ya es el propio número de Alhabla (caso E sin columna)", async () => {
    mockedFindMany.mockResolvedValue([
      { ...NEGOCIO, phone: NEGOCIO.telnyxPhoneNumber },
    ] as never);

    const resultado = await recordarDesvioSinComprobarJob(AHORA);

    expect(resultado).toEqual({ ...SIN_NADA, omitidos: 1 });
    expect(mockedUpdateMany).not.toHaveBeenCalled();
    expect(mockedAlertar).not.toHaveBeenCalled();
  });

  it("no escribe a una línea que «Comprobar desvío» no llamaría (ni extranjera ni 900), y no la marca", async () => {
    mockedFindMany.mockResolvedValue([
      { ...NEGOCIO, id: "biz_fr", phone: "+33123456789" },
      { ...NEGOCIO, id: "biz_900", phone: "+34900123456" },
    ] as never);

    const resultado = await recordarDesvioSinComprobarJob(AHORA);

    expect(resultado).toEqual({ ...SIN_NADA, omitidos: 2 });
    expect(mockedUpdateMany).not.toHaveBeenCalled();
    expect(mockedAlertar).not.toHaveBeenCalled();
    expect(mockedConfirmar).not.toHaveBeenCalled();
  });

  it("retira la marca si el aviso no salió por ninguna vía, para reintentar en la siguiente pasada", async () => {
    mockedAlertar.mockResolvedValue({
      via: "ninguna",
      motivo: "el negocio no tiene ningún correo",
    });

    const resultado = await recordarDesvioSinComprobarJob(AHORA);

    expect(resultado).toEqual({ ...SIN_NADA, omitidos: 1 });
    expect(mockedUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockedUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "biz_1", forwardingReminderSentAt: AHORA },
      data: { forwardingReminderSentAt: null },
    });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("no salió por ninguna vía")
    );
  });

  it("el reintento de la pasada siguiente lleva otro instante de intento (otro recursoId), no el del fallido", async () => {
    mockedAlertar.mockResolvedValueOnce({ via: "ninguna", motivo: "caído" });
    await recordarDesvioSinComprobarJob(AHORA);

    const siguiente = new Date(AHORA.getTime() + HORA_MS);
    mockedAlertar.mockResolvedValueOnce({ via: "email" });
    const resultado = await recordarDesvioSinComprobarJob(siguiente);

    expect(resultado).toEqual({ recordados: 1, confirmados: 0, omitidos: 0 });
    expect(mockedAlertar).toHaveBeenNthCalledWith(1, {
      businessId: "biz_1",
      intento: AHORA,
    });
    expect(mockedAlertar).toHaveBeenNthCalledWith(2, {
      businessId: "biz_1",
      intento: siguiente,
    });
  });

  it("con el email como respaldo también cuenta como enviado", async () => {
    mockedAlertar.mockResolvedValue({ via: "email", motivo: "sin WhatsApp" });

    const resultado = await recordarDesvioSinComprobarJob(AHORA);

    expect(resultado).toEqual({ recordados: 1, confirmados: 0, omitidos: 0 });
    expect(mockedUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("sin candidatos no toca nada", async () => {
    mockedFindMany.mockResolvedValue([] as never);

    const resultado = await recordarDesvioSinComprobarJob(AHORA);

    expect(resultado).toEqual(SIN_NADA);
    expect(mockedUpdateMany).not.toHaveBeenCalled();
    expect(mockedAlertar).not.toHaveBeenCalled();
    expect(mockedConfirmar).not.toHaveBeenCalled();
  });
});
