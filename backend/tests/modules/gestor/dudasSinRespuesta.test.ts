import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { dudasSinRespuesta } from "../../../src/modules/gestor/dudasSinRespuesta.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    call: { findMany: vi.fn() },
  },
}));

const mockedBizFindUnique = vi.mocked(prisma.business.findUnique);
const mockedCallFindMany = vi.mocked(prisma.call.findMany);

const AHORA = new Date("2026-09-29T10:00:00.000Z");
const DIA = 24 * 60 * 60 * 1000;

const LLAMADAS = [
  {
    startedAt: new Date("2026-09-28T16:00:00.000Z"),
    voiceProvider: "telnyx",
    outcome: "ESCALATED",
    escalationReason: "CONSULTA_COMPLEJA",
    requestedService: null,
    summary: null,
    postCallReport: {
      resultado: "ESCALATED",
      recado: { motivo: "Quiere precio de un recogido de novia" },
      dudas_sin_respuesta: ["¿Aceptáis Bizum?"],
    },
  },
  {
    startedAt: new Date("2026-09-27T09:00:00.000Z"),
    voiceProvider: "telnyx",
    outcome: "RESOLVED",
    escalationReason: "NO_APLICA",
    requestedService: "Corte",
    summary: null,
    postCallReport: {
      resultado: "RESOLVED",
      dudas_sin_respuesta: ["aceptais bizum", "¿Hay parking cerca?"],
    },
  },
  {
    startedAt: new Date("2026-09-26T09:00:00.000Z"),
    voiceProvider: "retell",
    outcome: "FRUSTRATED",
    escalationReason: "FALLO_TECNICO",
    requestedService: "Color",
    summary: `El cliente quería color y la reserva falló. ${"x".repeat(400)}`,
    postCallReport: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  mockedBizFindUnique.mockResolvedValue({
    id: "biz_1",
    timezone: "Europe/Madrid",
  } as never);
  mockedCallFindMany.mockResolvedValue(LLAMADAS as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("dudas_sin_respuesta", () => {
  it("agrupa las dudas repetidas (sin distinguir acentos ni signos), las más preguntadas primero", async () => {
    const r = await dudasSinRespuesta("biz_1", {});

    expect(r.status).toBe(200);
    const body = r.body as {
      dias: number;
      dudas: Array<{ pregunta: string; veces: number; ultimaVez: string }>;
    };
    expect(body.dias).toBe(14);
    expect(body.dudas).toEqual([
      {
        pregunta: "¿Aceptáis Bizum?",
        veces: 2,
        ultimaVez: expect.stringContaining("28 de septiembre a las 18:00"),
      },
      {
        pregunta: "¿Hay parking cerca?",
        veces: 1,
        ultimaVez: expect.stringContaining("27 de septiembre"),
      },
    ]);
    expect(mockedCallFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz_1",
          startedAt: { gte: new Date(AHORA.getTime() - 14 * DIA) },
          OR: [
            { postCallReportAt: { not: null } },
            { outcome: { in: ["FRUSTRATED", "ESCALATED"] } },
          ],
        },
        orderBy: { startedAt: "desc" },
      })
    );
  });

  it("lista las llamadas sin resolver con su motivo, el recado y el resumen recortado", async () => {
    const r = await dudasSinRespuesta("biz_1", {});
    const { llamadasSinResolver } = r.body as {
      llamadasSinResolver: { total: number; ultimas: unknown[] };
    };

    expect(llamadasSinResolver.total).toBe(2);
    expect(llamadasSinResolver.ultimas).toEqual([
      {
        cuando: expect.stringContaining("28 de septiembre"),
        canal: "llamada",
        resultado: "derivada al negocio",
        motivo: "una consulta que la recepcionista no supo resolver",
        servicioPedido: null,
        recado: "Quiere precio de un recogido de novia",
        dudas: ["¿Aceptáis Bizum?"],
        resumen: null,
      },
      {
        cuando: expect.stringContaining("26 de septiembre"),
        canal: "llamada",
        resultado: "sin resolver",
        motivo: "un fallo técnico de Alhabla",
        servicioPedido: "Color",
        recado: null,
        dudas: [],
        resumen: expect.stringMatching(/^El cliente quería color.*…$/),
      },
    ]);
    const segunda = llamadasSinResolver.ultimas[1] as { resumen: string };
    expect(segunda.resumen).toHaveLength(300);
  });

  it("acota los días entre 1 y 31, con 14 por defecto", async () => {
    await dudasSinRespuesta("biz_1", { dias: 90 });
    await dudasSinRespuesta("biz_1", { dias: 0 });
    await dudasSinRespuesta("biz_1", { dias: "muchos" });
    const desdes = mockedCallFindMany.mock.calls.map(
      ([args]) =>
        (args as { where: { startedAt: { gte: Date } } }).where.startedAt.gte
    );
    expect(desdes).toEqual([
      new Date(AHORA.getTime() - 31 * DIA),
      new Date(AHORA.getTime() - 1 * DIA),
      new Date(AHORA.getTime() - 14 * DIA),
    ]);
  });

  it("sin dudas ni llamadas sin resolver devuelve listas vacías, y un negocio inexistente 404", async () => {
    mockedCallFindMany.mockResolvedValue([] as never);
    expect((await dudasSinRespuesta("biz_1", { dias: 7 })).body).toEqual({
      dias: 7,
      dudas: [],
      llamadasSinResolver: { total: 0, ultimas: [] },
    });

    mockedBizFindUnique.mockResolvedValue(null as never);
    expect(await dudasSinRespuesta("biz_x", {})).toMatchObject({
      status: 404,
    });
  });
});
