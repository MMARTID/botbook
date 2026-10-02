import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { busquedaRoutes } from "../../../src/modules/busqueda/routes.js";
import { prisma } from "../../../src/lib/prisma.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    service: { findMany: vi.fn() },
    booking: { findMany: vi.fn() },
    call: { findMany: vi.fn() },
  },
}));

const mockedServicios = vi.mocked(prisma.service.findMany);
const mockedCitas = vi.mocked(prisma.booking.findMany);
const mockedLlamadas = vi.mocked(prisma.call.findMany);

async function servidor() {
  const fastify = Fastify();
  fastify.decorate("authenticate", async (request: any) => {
    request.user = { businessId: "biz_1" };
  });
  await fastify.register(busquedaRoutes);
  return fastify;
}

function cita(id: string, programedAt: string) {
  return {
    id,
    programedAt: new Date(programedAt),
    durationMinutes: 45,
    clientName: "Marta",
    clientPhone: null,
    serviceIds: ["srv_corte"],
    professional: { name: "Laura" },
    call: { fromNumber: "+34612345678" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedServicios.mockResolvedValue([] as never);
  mockedCitas.mockResolvedValue([] as never);
  mockedLlamadas.mockResolvedValue([] as never);
});

describe("GET /business/me/buscar", () => {
  it("busca citas por nombre, teléfono y servicio solo en el negocio, primero las que vienen", async () => {
    const fastify = await servidor();
    mockedServicios
      .mockResolvedValueOnce([{ id: "srv_corte" }] as never) // coincidencias
      .mockResolvedValueOnce([] as never) // búsqueda de llamadas
      .mockResolvedValueOnce([{ id: "srv_corte", name: "Corte" }] as never); // nombres
    mockedCitas
      .mockResolvedValueOnce([cita("bk_futura", "2099-01-01T10:00:00Z")] as never)
      .mockResolvedValueOnce([cita("bk_pasada", "2026-09-01T10:00:00Z")] as never);

    const response = await fastify.inject({
      method: "GET",
      url: `/business/me/buscar?q=${encodeURIComponent("612 345")}`,
    });

    expect(response.statusCode).toBe(200);
    const where = (mockedCitas.mock.calls[0][0] as any).where;
    expect(where.call).toEqual({ businessId: "biz_1" });
    expect(where.isCancelled).toBe(false);
    expect(where.OR).toEqual([
      { clientName: { contains: "612 345", mode: "insensitive" } },
      { clientPhone: { contains: "612345" } },
      { call: { fromNumber: { contains: "612345" } } },
      { serviceIds: { hasSome: ["srv_corte"] } },
    ]);
    expect(response.json().citas.map((c: { id: string }) => c.id)).toEqual([
      "bk_futura",
      "bk_pasada",
    ]);
    expect(response.json().citas[0]).toMatchObject({
      clientName: "Marta",
      clientPhone: "+34612345678",
      servicios: ["Corte"],
      profesional: "Laura",
    });
  });

  it("las conversaciones salen sin las filas del Gestor y con el resumen recortado", async () => {
    const fastify = await servidor();
    mockedLlamadas.mockResolvedValue([
      {
        id: "call_1",
        startedAt: new Date("2026-10-01T09:00:00Z"),
        fromNumber: "+34612345678",
        voiceProvider: "whatsapp",
        durationSecs: null,
        summary: "x".repeat(300),
        booking: { isCancelled: false },
      },
    ] as never);

    const response = await fastify.inject({ method: "GET", url: "/business/me/buscar?q=Marta" });

    const where = (mockedLlamadas.mock.calls[0][0] as any).where;
    expect(where.businessId).toBe("biz_1");
    expect(where.AND[0]).toEqual({
      NOT: { callId: { startsWith: "whatsapp:gestor:" } },
    });
    const [llamada] = response.json().llamadas;
    expect(llamada).toMatchObject({ canal: "whatsapp", conCita: true });
    expect(llamada.resumen).toHaveLength(140);
  });

  it("exige al menos 2 caracteres", async () => {
    const fastify = await servidor();
    const response = await fastify.inject({ method: "GET", url: "/business/me/buscar?q=a" });
    expect(response.statusCode).toBe(400);
    expect(mockedCitas).not.toHaveBeenCalled();
  });
});
