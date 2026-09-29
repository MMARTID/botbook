import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import {
  ALCANCE_DE_LA_FICHA,
  buscarCliente,
} from "../../../src/modules/gestor/buscarCliente.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    booking: { findMany: vi.fn() },
    lead: { findMany: vi.fn() },
    call: { findMany: vi.fn() },
    service: { findMany: vi.fn() },
  },
}));

const mockedBizFindUnique = vi.mocked(prisma.business.findUnique);
const mockedBookingFindMany = vi.mocked(prisma.booking.findMany);
const mockedLeadFindMany = vi.mocked(prisma.lead.findMany);
const mockedCallFindMany = vi.mocked(prisma.call.findMany);
const mockedServiceFindMany = vi.mocked(prisma.service.findMany);

const AHORA = new Date("2026-09-29T10:00:00.000Z");

function cita(
  id: string,
  programedAt: string,
  extra: Partial<{
    clientName: string | null;
    clientPhone: string | null;
    fromNumber: string | null;
    serviceIds: string[];
    isCancelled: boolean;
    confirmada: boolean;
    profesional: string | null;
  }> = {}
) {
  return {
    id,
    programedAt: new Date(programedAt),
    clientName: extra.clientName ?? null,
    clientPhone: extra.clientPhone ?? null,
    serviceIds: extra.serviceIds ?? ["svc_corte"],
    isCancelled: extra.isCancelled ?? false,
    confirmedByClientAt: extra.confirmada ? new Date(programedAt) : null,
    professional: extra.profesional ? { name: extra.profesional } : null,
    call: { fromNumber: extra.fromNumber ?? null },
  };
}

// De la más reciente a la más antigua, como las devuelve la consulta.
const CITAS = [
  cita("b_futura", "2026-10-02T15:00:00.000Z", {
    clientName: "Marta López",
    clientPhone: "+34612345678",
    profesional: "Laura",
    confirmada: true,
  }),
  cita("b_pasada", "2026-09-10T09:00:00.000Z", {
    clientName: "Marta López",
    fromNumber: "+34612345678",
    serviceIds: ["svc_color"],
  }),
  cita("b_cancelada", "2026-08-01T09:00:00.000Z", {
    clientName: "Marta",
    clientPhone: "612 345 678",
    isCancelled: true,
  }),
  cita("b_sin_movil", "2026-07-15T09:00:00.000Z", {
    clientName: "marta lopez",
  }),
  cita("b_martina", "2026-07-01T09:00:00.000Z", {
    clientName: "Martina Ruiz",
    clientPhone: "+34699999999",
  }),
  cita("b_gomez", "2026-06-01T09:00:00.000Z", { clientName: "Marta Gómez" }),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  mockedBizFindUnique.mockResolvedValue({
    id: "biz_1",
    timezone: "Europe/Madrid",
  } as never);
  mockedBookingFindMany.mockResolvedValue(CITAS as never);
  mockedLeadFindMany.mockResolvedValue([
    {
      id: "lead_marta",
      createdAt: new Date("2026-09-25T10:00:00.000Z"),
      data: {
        clientName: "Marta López",
        clientPhone: "+34612345678",
        motivo: "Quiere cambiar la cita",
        quiereQueLeLlamen: true,
      },
    },
    {
      id: "lead_pepe",
      createdAt: new Date("2026-09-24T10:00:00.000Z"),
      data: { clientName: "Pepe", motivo: "Precio de la barba" },
    },
  ] as never);
  mockedCallFindMany.mockResolvedValue([
    {
      fromNumber: "+34612345678",
      startedAt: new Date("2026-09-20T10:00:00.000Z"),
      voiceProvider: "whatsapp",
    },
  ] as never);
  mockedServiceFindMany.mockResolvedValue([
    { id: "svc_corte", name: "Corte" },
    { id: "svc_color", name: "Color" },
  ] as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buscar_cliente por nombre", () => {
  it("junta en una ficha las citas del mismo móvil (y las sin móvil del mismo nombre) con sus próximas, últimas, canceladas y recados", async () => {
    const r = await buscarCliente("biz_1", { cliente: "marta" });

    expect(r.status).toBe(200);
    const body = r.body as {
      clientes: Array<Record<string, unknown>>;
      masCoincidencias: number;
      alcance: string;
    };
    expect(body.alcance).toBe(ALCANCE_DE_LA_FICHA);
    expect(body.masCoincidencias).toBe(0);
    // «Martina» no es «Marta»: cada palabra buscada tiene que empezar una del nombre.
    expect(body.clientes.map((c) => c.nombre)).toEqual([
      "Marta López",
      "Marta Gómez",
    ]);
    expect(body.clientes[0]).toEqual({
      nombre: "Marta López",
      telefono: "+34612345678",
      proximasCitas: [
        {
          citaId: "b_futura",
          cuando: expect.stringContaining("2 de octubre a las 17:00"),
          servicios: ["Corte"],
          profesional: "Laura",
          confirmadaPorElCliente: true,
        },
      ],
      ultimasCitas: [
        {
          cuando: expect.stringContaining("10 de septiembre"),
          servicios: ["Color"],
          profesional: null,
        },
        {
          cuando: expect.stringContaining("15 de julio"),
          servicios: ["Corte"],
          profesional: null,
        },
      ],
      citasEnTotal: 3,
      canceladas: 1,
      recadosSinAtender: [
        {
          recadoId: "lead_marta",
          motivo: "Quiere cambiar la cita",
          quiereQueLeLlamen: true,
          dejadoEl: expect.stringContaining("25 de septiembre"),
        },
      ],
      ultimoContacto: {
        cuando: expect.stringContaining("20 de septiembre"),
        canal: "WhatsApp",
      },
    });
    expect(body.clientes[1]).toMatchObject({
      nombre: "Marta Gómez",
      telefono: null,
      proximasCitas: [],
      citasEnTotal: 1,
      recadosSinAtender: [],
      ultimoContacto: null,
    });
    expect(mockedBookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          call: { businessId: "biz_1" },
          clientName: { not: null },
          programedAt: { gte: expect.any(Date) },
        },
      })
    );
    expect(mockedCallFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz_1",
          OR: [{ fromNumber: { endsWith: "612345678" } }],
          NOT: { callId: { startsWith: "whatsapp:gestor:" } },
        },
      })
    );
  });

  it("no distingue acentos y exige que cada palabra empiece una palabra del nombre", async () => {
    mockedBookingFindMany.mockResolvedValue([
      cita("b_ana", "2026-09-01T09:00:00.000Z", { clientName: "Ana García" }),
      cita("b_anabel", "2026-08-01T09:00:00.000Z", { clientName: "Anabel" }),
      cita("b_susana", "2026-07-01T09:00:00.000Z", { clientName: "Susana" }),
      cita("b_maria", "2026-06-01T09:00:00.000Z", {
        clientName: "María José Ruiz",
      }),
    ] as never);
    mockedLeadFindMany.mockResolvedValue([] as never);

    const ana = await buscarCliente("biz_1", { cliente: "Ana" });
    expect(
      (ana.body as { clientes: Array<{ nombre: string }> }).clientes.map(
        (c) => c.nombre
      )
    ).toEqual(["Ana García", "Anabel"]);

    const maria = await buscarCliente("biz_1", { cliente: "maria jose" });
    expect(
      (maria.body as { clientes: Array<{ nombre: string }> }).clientes.map(
        (c) => c.nombre
      )
    ).toEqual(["María José Ruiz"]);
  });

  it("devuelve como mucho 5 fichas y cuenta las que quedan fuera", async () => {
    mockedBookingFindMany.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) =>
        cita(`b_${i}`, `2026-09-0${i + 1}T09:00:00.000Z`, {
          clientName: "Pepe",
          clientPhone: `+3461111111${i}`,
        })
      ) as never
    );
    mockedLeadFindMany.mockResolvedValue([] as never);

    const body = (await buscarCliente("biz_1", { cliente: "pepe" })).body as {
      clientes: unknown[];
      masCoincidencias: number;
    };
    expect(body.clientes).toHaveLength(5);
    expect(body.masCoincidencias).toBe(2);
  });
});

describe("buscar_cliente por móvil", () => {
  it("busca por los 9 últimos dígitos en la cita y en la llamada, y los recados de ese móvil", async () => {
    mockedBookingFindMany.mockResolvedValue(CITAS.slice(0, 3) as never);

    const r = await buscarCliente("biz_1", { cliente: "+34 612 34 56 78" });

    expect(mockedBookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          call: { businessId: "biz_1" },
          OR: [
            { clientPhone: { endsWith: "612345678" } },
            { call: { fromNumber: { endsWith: "612345678" } } },
          ],
        },
      })
    );
    const body = r.body as {
      clientes: Array<{ nombre: string; recadosSinAtender: unknown[] }>;
    };
    expect(body.clientes).toHaveLength(1);
    expect(body.clientes[0].nombre).toBe("Marta López");
    expect(body.clientes[0].recadosSinAtender).toHaveLength(1);
  });

  it("sin nada de ese móvil no inventa fichas y recuerda qué no ve", async () => {
    mockedBookingFindMany.mockResolvedValue([] as never);
    mockedLeadFindMany.mockResolvedValue([] as never);

    expect((await buscarCliente("biz_1", { cliente: "600000000" })).body).toEqual(
      { clientes: [], masCoincidencias: 0, alcance: ALCANCE_DE_LA_FICHA }
    );
    expect(mockedCallFindMany).not.toHaveBeenCalled();
  });
});

describe("buscar_cliente — entrada", () => {
  it("sin nombre ni móvil lo pide sin consultar nada, y un negocio inexistente es 404", async () => {
    for (const cliente of [undefined, "", " a ", "12"]) {
      expect(await buscarCliente("biz_1", { cliente })).toEqual({
        status: 200,
        body: { error: "Dime el nombre o el móvil del cliente." },
      });
    }
    expect(mockedBookingFindMany).not.toHaveBeenCalled();

    mockedBizFindUnique.mockResolvedValue(null as never);
    expect(await buscarCliente("biz_x", { cliente: "Marta" })).toMatchObject({
      status: 404,
    });
  });
});
