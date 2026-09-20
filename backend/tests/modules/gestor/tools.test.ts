import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { DEFAULT_BUSINESS_SCHEDULE } from "../../../src/lib/businessSchedule.js";
import { getRedis } from "../../../src/lib/redis.js";
import { registrarPropuesta } from "../../../src/modules/gestor/acciones.js";
import {
  claveDePropuesta,
  claveDelTurno,
  handleGestorToolInvocation,
  limitesDeFecha,
} from "../../../src/modules/gestor/tools.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    booking: { findMany: vi.fn(), count: vi.fn() },
    professionalAbsence: { findMany: vi.fn().mockResolvedValue([]) },
    lead: { findMany: vi.fn() },
    service: { findMany: vi.fn() },
    call: { aggregate: vi.fn(), groupBy: vi.fn() },
  },
}));
vi.mock("../../../src/lib/redis.js", () => {
  const redis = { get: vi.fn(), set: vi.fn(), del: vi.fn() };
  return { getRedis: () => redis };
});
vi.mock("../../../src/modules/gestor/acciones.js", () => ({
  registrarPropuesta: vi.fn(),
}));

const mockedBizFindUnique = vi.mocked(prisma.business.findUnique);
const mockedBookingFindMany = vi.mocked(prisma.booking.findMany);
const mockedBookingCount = vi.mocked(prisma.booking.count);
const mockedLeadFindMany = vi.mocked(prisma.lead.findMany);
const mockedServiceFindMany = vi.mocked(prisma.service.findMany);
const mockedCallAggregate = vi.mocked(prisma.call.aggregate);
const mockedCallGroupBy = vi.mocked(prisma.call.groupBy);
const mockedRegistrar = vi.mocked(registrarPropuesta);
const redis = getRedis() as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

const NEGOCIO = {
  id: "biz_1",
  name: "Peluquería Ana",
  businessType: "peluqueria",
  timezone: "Europe/Madrid",
  phone: "+34930000000",
  telnyxPhoneNumber: "+34930111222",
  phoneNumberStatus: "active",
  address: "Calle Mayor 1, Madrid",
  schedule: DEFAULT_BUSINESS_SCHEDULE,
  plan: null,
  stripePriceId: null,
  subscriptionStatus: "ACTIVE",
  active: true,
  calendarProvider: "google",
  calendarConnections: [
    {
      provider: "google",
      calendarId: "primary",
      credentials: { provider: "google", refreshToken: "tok" },
      connected: true,
      disconnectedAt: null,
      lastError: null,
      accountEmail: "ana@gmail.com",
    },
  ],
  services: [
    { id: "svc_1", name: "Corte", durationMinutes: 30, priceCents: 1500 },
    { id: "svc_2", name: "Color", durationMinutes: 90, priceCents: 6050 },
    { id: "svc_3", name: "Barba", durationMinutes: 20, priceCents: null },
  ],
  professionals: [
    {
      id: "pro_1",
      name: "Laura",
      serviceLinks: [
        { serviceId: "svc_2", level: "ESPECIALISTA" },
        { serviceId: "svc_3", level: "NO_SUGERIR" },
      ],
    },
    { id: "pro_2", name: "Marta", serviceLinks: [] },
  ],
};

const CABECERAS = { businessId: "biz_1", role: "owner" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mockedBizFindUnique.mockResolvedValue(NEGOCIO as never);
  mockedLeadFindMany.mockResolvedValue([] as never);
  mockedServiceFindMany.mockResolvedValue([] as never);
  mockedBookingFindMany.mockResolvedValue([] as never);
  mockedBookingCount.mockResolvedValue(0);
  mockedCallAggregate.mockResolvedValue({
    _count: { _all: 0 },
    _sum: { durationSecs: 0 },
  } as never);
  mockedCallGroupBy.mockResolvedValue([] as never);
  redis.get.mockResolvedValue(null);
  redis.set.mockResolvedValue("OK");
  redis.del.mockResolvedValue(1);
});

describe("handleGestorToolInvocation — autorización por cabeceras", () => {
  it("sin X-Alhabla-Business (o con el placeholder sin resolver) responde 400 y no lee nada", async () => {
    expect(
      await handleGestorToolInvocation({
        businessId: undefined,
        role: "owner",
        toolName: "contexto_negocio",
        params: {},
      })
    ).toMatchObject({ status: 400 });
    expect(
      await handleGestorToolInvocation({
        businessId: "{{business_id}}",
        role: "owner",
        toolName: "contexto_negocio",
        params: {},
      })
    ).toMatchObject({ status: 400 });
    expect(mockedBizFindUnique).not.toHaveBeenCalled();
  });

  it("un rol que no sea owner responde 403", async () => {
    expect(
      await handleGestorToolInvocation({
        businessId: "biz_1",
        role: "client",
        toolName: "contexto_negocio",
        params: {},
      })
    ).toMatchObject({ status: 403 });
    expect(
      await handleGestorToolInvocation({
        businessId: "biz_1",
        role: undefined,
        toolName: "contexto_negocio",
        params: {},
      })
    ).toMatchObject({ status: 403 });
    expect(mockedBizFindUnique).not.toHaveBeenCalled();
  });

  it("una tool desconocida responde 404 y un negocio inexistente también", async () => {
    expect(
      await handleGestorToolInvocation({
        ...CABECERAS,
        toolName: "borrar_todo",
        params: {},
      })
    ).toMatchObject({ status: 404 });
    mockedBizFindUnique.mockResolvedValueOnce(null);
    expect(
      await handleGestorToolInvocation({
        ...CABECERAS,
        toolName: "contexto_negocio",
        params: {},
      })
    ).toMatchObject({ status: 404 });
  });

  it("un error inesperado responde 500 sin lanzar", async () => {
    mockedBizFindUnique.mockRejectedValueOnce(new Error("bd caída"));
    expect(
      await handleGestorToolInvocation({
        ...CABECERAS,
        toolName: "contexto_negocio",
        params: {},
      })
    ).toMatchObject({ status: 500 });
  });
});

describe("contexto_negocio", () => {
  it("devuelve el negocio, el catálogo con precios en euros, el calendario y lo que falta por configurar", async () => {
    mockedLeadFindMany
      .mockResolvedValueOnce([
        {
          id: "lead_1",
          createdAt: new Date("2026-09-14T14:46:00.000Z"),
          data: {
            clientName: "Elena",
            startDateTime: "2026-09-14T15:00:00.000Z",
            serviceIds: ["svc_1"],
            failureCode: "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
          },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: "lead_2",
          createdAt: new Date("2026-09-19T10:00:00.000Z"),
          data: {
            clientName: "Marta",
            clientPhone: "+34600000001",
            motivo: "Mechas",
            quiereQueLeLlamen: true,
          },
        },
      ] as never);
    mockedServiceFindMany.mockResolvedValueOnce([
      { id: "svc_1", name: "Corte" },
    ] as never);

    const r = await handleGestorToolInvocation({
      ...CABECERAS,
      toolName: "contexto_negocio",
      params: {},
    });

    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown>;
    expect(body.negocio).toMatchObject({
      nombre: "Peluquería Ana",
      sector: "Peluquería",
      zonaHoraria: "Europe/Madrid",
      telefonoDelLocal: "+34930000000",
      numeroDeAlhabla: "+34930111222",
      plan: "inicio",
      suscripcion: "ACTIVE",
    });
    expect(body.servicios).toEqual([
      {
        servicioId: "svc_1",
        nombre: "Corte",
        duracionMinutos: 30,
        precio: "15 €",
      },
      {
        servicioId: "svc_2",
        nombre: "Color",
        duracionMinutos: 90,
        precio: "60,50 €",
      },
      {
        servicioId: "svc_3",
        nombre: "Barba",
        duracionMinutos: 20,
        precio: "sin precio",
      },
    ]);
    expect(body.profesionales).toEqual([
      {
        profesionalId: "pro_1",
        nombre: "Laura",
        especialista: ["Color"],
        noSugerir: ["Barba"],
      },
      {
        profesionalId: "pro_2",
        nombre: "Marta",
        especialista: [],
        noSugerir: [],
      },
    ]);
    expect(body.calendario).toEqual({
      conectado: true,
      proveedor: "google",
      estado: "conectado",
    });
    expect(body.faltaPorConfigurar).toEqual([]);
    expect(body.enlaces).toEqual({
      panel: "https://alhabla.ai/",
      calendario: "https://alhabla.ai/agente",
      ajustes: "https://alhabla.ai/ajustes",
    });
    expect(body.citasPendientes).toEqual([
      expect.objectContaining({
        pendienteId: "lead_1",
        cliente: "Elena",
        servicios: ["Corte"],
        motivo: "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
        cuando: expect.stringContaining("14 sept"),
      }),
    ]);
    expect(body.recados).toEqual([
      expect.objectContaining({
        recadoId: "lead_2",
        cliente: "Marta",
        motivo: "Mechas",
        quiereQueLeLlamen: true,
      }),
    ]);
  });

  it("un negocio a medio configurar lista lo que falta", async () => {
    mockedBizFindUnique.mockResolvedValueOnce({
      ...NEGOCIO,
      schedule: null,
      services: [],
      professionals: [],
      calendarProvider: null,
      calendarConnections: [],
      phoneNumberStatus: "pending",
      telnyxPhoneNumber: null,
      phone: "TEMP-123",
      businessType: "otro",
    } as never);

    const r = await handleGestorToolInvocation({
      ...CABECERAS,
      toolName: "contexto_negocio",
      params: {},
    });
    const body = r.body as Record<string, unknown>;
    expect(body.faltaPorConfigurar).toEqual([
      "horario",
      "servicios",
      "profesionales",
      "calendario",
      "número de teléfono de Alhabla",
    ]);
    expect(body.calendario).toEqual({
      conectado: false,
      proveedor: null,
      estado: "sin conectar",
    });
    expect(
      (body.negocio as Record<string, unknown>).telefonoDelLocal
    ).toBeNull();
    expect(
      (body.negocio as Record<string, unknown>).numeroDeAlhabla
    ).toBeNull();
    expect((body.negocio as Record<string, unknown>).sector).toBe("otro");
  });
});

describe("contexto_negocio — calendario a medias o caducado", () => {
  it("distingue una cuenta enlazada sin calendario elegido y una conexión caducada", async () => {
    mockedBizFindUnique.mockResolvedValueOnce({
      ...NEGOCIO,
      calendarProvider: "outlook",
      calendarConnections: [
        {
          provider: "outlook",
          calendarId: null,
          credentials: null,
          connected: false,
          disconnectedAt: null,
          lastError: null,
          accountEmail: "ana@outlook.com",
        },
      ],
    } as never);
    let r = await handleGestorToolInvocation({
      ...CABECERAS,
      toolName: "contexto_negocio",
      params: {},
    });
    expect((r.body as { calendario: unknown }).calendario).toEqual({
      conectado: false,
      proveedor: "outlook",
      estado: "a medias: falta elegir el calendario en el panel",
    });

    mockedBizFindUnique.mockResolvedValueOnce({
      ...NEGOCIO,
      calendarConnections: [
        {
          ...NEGOCIO.calendarConnections[0],
          credentials: null,
          connected: false,
          disconnectedAt: new Date(),
          lastError: "invalid_grant",
        },
      ],
    } as never);
    r = await handleGestorToolInvocation({
      ...CABECERAS,
      toolName: "contexto_negocio",
      params: {},
    });
    expect(
      (r.body as { calendario: { estado: string } }).calendario.estado
    ).toContain("caducado");
  });
});

describe("listar_agenda", () => {
  it("hoy, manana y una fecha exacta; un día inválido lo dice sin consultar", async () => {
    mockedBookingFindMany.mockResolvedValue([
      {
        id: "b_1",
        programedAt: new Date("2026-09-21T15:00:00.000Z"),
        durationMinutes: 30,
        clientName: "Miguel",
        clientPhone: null,
        serviceIds: ["svc_1"],
        confirmedByClientAt: null,
        professional: { name: "Pedro" },
        call: { fromNumber: "+34692000000" },
      },
    ] as never);
    mockedServiceFindMany.mockResolvedValue([
      { id: "svc_1", name: "Corte" },
    ] as never);
    // Laura falta toda la semana; Pedro solo la mañana del 21 (Madrid).
    vi.mocked(prisma.professionalAbsence.findMany).mockResolvedValue([
      {
        startsAt: new Date("2026-09-13T22:00:00Z"),
        endsAt: new Date("2026-09-27T22:00:00Z"),
        reason: "vacaciones",
        professional: { name: "Laura" },
      },
      {
        startsAt: new Date("2026-09-21T07:00:00Z"),
        endsAt: new Date("2026-09-21T12:00:00Z"),
        reason: null,
        professional: { name: "Pedro" },
      },
    ] as never);

    for (const dia of ["hoy", "manana", "mañana", "2026-09-21"]) {
      const r = await handleGestorToolInvocation({
        ...CABECERAS,
        toolName: "listar_agenda",
        params: { dia },
      });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({
        total: 1,
        citas: [
          {
            citaId: "b_1",
            hora: "17:00",
            cliente: "Miguel",
            telefono: "+34692000000",
            servicios: ["Corte"],
            profesional: "Pedro",
            confirmadaPorElCliente: false,
          },
        ],
      });
    }
    const fecha = await handleGestorToolInvocation({
      ...CABECERAS,
      toolName: "listar_agenda",
      params: { dia: "2026-09-21" },
    });
    expect((fecha.body as { dia: string }).dia).toBe("lunes, 21 de septiembre");
    expect((fecha.body as { ausencias: unknown }).ausencias).toEqual([
      {
        profesional: "Laura",
        desde: "todo el día",
        hasta: null,
        motivo: "vacaciones",
      },
      { profesional: "Pedro", desde: "09:00", hasta: "14:00", motivo: null },
    ]);
    const rango = mockedBookingFindMany.mock.calls.at(-1)![0]!.where as {
      programedAt: { gte: Date; lt: Date };
    };
    // Medianoche local de Madrid del 21-09 (CEST, +02:00).
    expect(rango.programedAt.gte.toISOString()).toBe(
      "2026-09-20T22:00:00.000Z"
    );
    expect(rango.programedAt.lt.toISOString()).toBe("2026-09-21T22:00:00.000Z");

    mockedBookingFindMany.mockClear();
    const invalido = await handleGestorToolInvocation({
      ...CABECERAS,
      toolName: "listar_agenda",
      params: { dia: "el jueves" },
    });
    expect(invalido.body).toEqual({
      error: 'Día no válido: usa "hoy", "manana" o AAAA-MM-DD.',
    });
    expect(mockedBookingFindMany).not.toHaveBeenCalled();
  });

  it("limitesDeFecha devuelve null con una fecha malformada", () => {
    expect(limitesDeFecha("Europe/Madrid", "21/09/2026")).toBeNull();
    expect(limitesDeFecha("Europe/Madrid", "2026-13-45")).not.toBeNull(); // Date.UTC normaliza; se acepta
    expect(limitesDeFecha("Europe/Madrid", "2026-09-21")?.etiqueta).toBe(
      "lunes, 21 de septiembre"
    );
  });
});

describe("resumen_llamadas", () => {
  it("acota los días a [1, 31] con 7 por defecto, excluye las Call de chat y traduce los resultados", async () => {
    mockedCallAggregate.mockResolvedValue({
      _count: { _all: 20 },
      _sum: { durationSecs: 1790 },
    } as never);
    mockedCallGroupBy.mockResolvedValue([
      { outcome: "RESOLVED", _count: { _all: 12 } },
      { outcome: "LEAD_CAPTURED", _count: { _all: 3 } },
      { outcome: null, _count: { _all: 5 } },
    ] as never);
    mockedBookingCount.mockResolvedValueOnce(9).mockResolvedValueOnce(1);

    const r = await handleGestorToolInvocation({
      ...CABECERAS,
      toolName: "resumen_llamadas",
      params: {},
    });
    expect(r.body).toMatchObject({
      dias: 7,
      llamadas: {
        total: 20,
        minutos: 30,
        porResultado: {
          resueltas: 12,
          "con recado o datos del cliente": 3,
          "sin clasificar": 5,
        },
      },
      citasReservadas: 9,
      citasCanceladas: 1,
      citasPendientes: [],
      recados: [],
    });
    const where = mockedCallAggregate.mock.calls[0]![0]!.where as Record<
      string,
      unknown
    >;
    expect(where.NOT).toEqual({ voiceProvider: "whatsapp" });

    expect(
      (
        (
          await handleGestorToolInvocation({
            ...CABECERAS,
            toolName: "resumen_llamadas",
            params: { dias: 90 },
          })
        ).body as { dias: number }
      ).dias
    ).toBe(31);
    expect(
      (
        (
          await handleGestorToolInvocation({
            ...CABECERAS,
            toolName: "resumen_llamadas",
            params: { dias: 0 },
          })
        ).body as { dias: number }
      ).dias
    ).toBe(1);
    expect(
      (
        (
          await handleGestorToolInvocation({
            ...CABECERAS,
            toolName: "resumen_llamadas",
            params: { dias: "muchos" },
          })
        ).body as { dias: number }
      ).dias
    ).toBe(7);
  });
});

describe("proponer_accion", () => {
  it("sin turno de chat en curso no registra nada y lo dice", async () => {
    redis.get.mockResolvedValueOnce(null);
    const r = await handleGestorToolInvocation({
      ...CABECERAS,
      toolName: "proponer_accion",
      params: {
        tipo: "resolver_pendiente",
        parametros: { pendienteId: "lead_1" },
        resumen: "x",
      },
    });
    expect(r.body).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("conversación en curso"),
    });
    expect(mockedRegistrar).not.toHaveBeenCalled();
  });

  it("con turno en curso registra la propuesta con el entrante y la conversación, y la anota para los botones", async () => {
    redis.get.mockResolvedValueOnce(
      JSON.stringify({ inboundMessageId: "in_9", conversationId: "conv_9" })
    );
    mockedRegistrar.mockResolvedValueOnce({
      ok: true,
      accionId: "acc_9",
      descripcion: "la cita pendiente de Elena",
      expiresAt: new Date(),
    });

    const r = await handleGestorToolInvocation({
      ...CABECERAS,
      toolName: "proponer_accion",
      params: {
        tipo: "resolver_pendiente",
        parametros: { pendienteId: "lead_1" },
        resumen: "Doy por resuelta la cita de Elena.",
      },
    });

    expect(r.body).toMatchObject({
      ok: true,
      accionId: "acc_9",
      recurso: "la cita pendiente de Elena",
    });
    expect(mockedRegistrar).toHaveBeenCalledWith({
      businessId: "biz_1",
      timezone: "Europe/Madrid",
      conversationId: "conv_9",
      inboundMessageId: "in_9",
      tipo: "resolver_pendiente",
      parametros: { pendienteId: "lead_1" },
      resumen: "Doy por resuelta la cita de Elena.",
    });
    expect(redis.get).toHaveBeenCalledWith(claveDelTurno("biz_1"));
    expect(redis.set).toHaveBeenCalledWith(
      claveDePropuesta("biz_1"),
      "acc_9",
      "EX",
      180
    );
  });

  it("devuelve el motivo del registro cuando la propuesta no procede", async () => {
    redis.get.mockResolvedValueOnce(
      JSON.stringify({ inboundMessageId: "in_9", conversationId: "conv_9" })
    );
    mockedRegistrar.mockResolvedValueOnce({
      ok: false,
      motivo: "Esa cita pendiente ya está resuelta.",
    });
    const r = await handleGestorToolInvocation({
      ...CABECERAS,
      toolName: "proponer_accion",
      params: {
        tipo: "resolver_pendiente",
        parametros: { pendienteId: "lead_1" },
        resumen: "x",
      },
    });
    expect(r.body).toEqual({
      ok: false,
      motivo: "Esa cita pendiente ya está resuelta.",
    });
    expect(redis.set).not.toHaveBeenCalled();
  });
});
