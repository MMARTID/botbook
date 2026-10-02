import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { callsRoutes } from "../../../src/modules/calls/routes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { getSignedRecordingUrl } from "../../../src/lib/storage.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    call: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    service: {
      findMany: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
    booking: {
      count: vi.fn(),
    },
    lead: {
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../../../src/lib/storage.js", () => ({
  getSignedRecordingUrl: vi.fn(),
}));

const mockedCallFindUnique = vi.mocked(prisma.call.findUnique);
const mockedCallFindMany = vi.mocked(prisma.call.findMany);
const mockedCallCount = vi.mocked(prisma.call.count);
const mockedServiceFindMany = vi.mocked(prisma.service.findMany);
const mockedGetSignedRecordingUrl = vi.mocked(getSignedRecordingUrl);
const mockedCallFindFirst = vi.mocked(prisma.call.findFirst);
const mockedLeadFindMany = vi.mocked(prisma.lead.findMany);
const mockedLeadUpdateMany = vi.mocked(prisma.lead.updateMany);

describe("GET /business/me/calls/:id", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(callsRoutes);
  });

  it("firma la storageUrl de R2 en vez de devolver la URL de API sin firmar (hallazgo #15 de la auditoría)", async () => {
    mockedCallFindUnique.mockResolvedValue({
      id: "call_1",
      businessId: "biz_1",
      booking: null,
      recording: {
        id: "rec_1",
        storageKey: "recordings/call_1.mp3",
        storageUrl: "https://r2.example/unsigned-api-url",
      },
    } as any);
    mockedGetSignedRecordingUrl.mockResolvedValue("https://r2.example/signed?sig=abc");

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/calls/call_1",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.recording.storageUrl).toBe("https://r2.example/signed?sig=abc");
    expect(mockedGetSignedRecordingUrl).toHaveBeenCalledWith("recordings/call_1.mp3");
  });

  it("cae a null si falla la firma, sin romper la respuesta", async () => {
    mockedCallFindUnique.mockResolvedValue({
      id: "call_1",
      businessId: "biz_1",
      booking: null,
      recording: { id: "rec_1", storageKey: "recordings/call_1.mp3", storageUrl: "unsigned" },
    } as any);
    mockedGetSignedRecordingUrl.mockRejectedValue(new Error("R2 down"));

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/calls/call_1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().recording.storageUrl).toBeNull();
  });

  it("no toca la grabación si no hay storageKey (todavía solo en Retell)", async () => {
    mockedCallFindUnique.mockResolvedValue({
      id: "call_1",
      businessId: "biz_1",
      booking: null,
      recording: { id: "rec_1", storageKey: null, storageUrl: null },
    } as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/calls/call_1",
    });

    expect(response.statusCode).toBe(200);
    expect(mockedGetSignedRecordingUrl).not.toHaveBeenCalled();
  });

  it("no expone ni firma una grabación retirada lógicamente", async () => {
    mockedCallFindUnique.mockResolvedValue({
      id: "call_1",
      businessId: "biz_1",
      booking: null,
      recording: {
        id: "rec_1",
        storageKey: "recordings/call_1.mp3",
        storageUrl: "https://r2.example/unsigned-api-url",
        deletedAt: new Date("2026-09-11T12:00:00.000Z"),
      },
    } as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/calls/call_1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().recording).toBeNull();
    expect(mockedGetSignedRecordingUrl).not.toHaveBeenCalled();
  });
  it("devuelve el agente y el profesional sin su fila completa (nada del prompt ni de ids de proveedor)", async () => {
    const agenteCompleto = {
      id: "agent_1",
      name: "Recepcionista",
      voice: "Octave",
      systemPrompt: "PROMPT_SECRETO_DEL_NEGOCIO",
      retellLlmId: "llm_secreto",
      telnyxAssistantId: "assistant_secreto",
    };
    const profesionalCompleto = {
      id: "pro_1",
      name: "Lucía",
      businessId: "biz_1",
      active: true,
      deletedAt: null,
    };
    // Proyecta como Prisma: `true` trae la fila entera; `select`, solo lo
    // pedido. Así el test falla si la ruta vuelve a pedir `agent: true`.
    const proyectar = (arg: any, fila: Record<string, unknown>) =>
      arg === true
        ? fila
        : Object.fromEntries(
            Object.entries(fila).filter(([clave]) => arg?.select?.[clave])
          );
    mockedCallFindUnique.mockImplementation((async (query: any) => ({
      id: "call_1",
      businessId: "biz_1",
      agent: proyectar(query.include.agent, agenteCompleto),
      booking: {
        id: "booking_1",
        serviceIds: [],
        professional: proyectar(
          query.include.booking.include.professional,
          profesionalCompleto
        ),
      },
      recording: null,
    })) as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/calls/call_1",
    });

    expect(response.statusCode).toBe(200);
    const raw = response.body;
    expect(raw).not.toContain("PROMPT_SECRETO_DEL_NEGOCIO");
    expect(raw).not.toContain("llm_secreto");
    expect(raw).not.toContain("assistant_secreto");
    expect(response.json().agent).toEqual({
      id: "agent_1",
      name: "Recepcionista",
      voice: "Octave",
    });
    expect(response.json().booking.professional).toEqual({
      id: "pro_1",
      name: "Lucía",
    });
  });
});

describe("GET /business/me/calls", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(callsRoutes);
  });

  it("resuelve la reserva asociada de toda una página sin consultas por fila", async () => {
    mockedCallFindMany.mockResolvedValue([
      {
        id: "call_1",
        businessId: "biz_1",
        booking: {
          id: "booking_1",
          serviceIds: ["srv_1", "srv_2"],
          professional: { id: "pro_1", name: "Lucía" },
        },
      },
      {
        id: "call_2",
        businessId: "biz_1",
        booking: { id: "booking_2", serviceIds: ["srv_1"], professional: null },
      },
    ] as any);
    mockedCallCount.mockResolvedValue(2 as any);
    mockedServiceFindMany.mockResolvedValue([
      { id: "srv_1", name: "Corte", durationMinutes: 30, priceCents: 1800 },
      { id: "srv_2", name: "Color", durationMinutes: 45, priceCents: null },
    ] as any);

    const response = await fastify.inject({ method: "GET", url: "/business/me/calls?limit=25&offset=0" });

    expect(response.statusCode).toBe(200);
    expect(mockedServiceFindMany).toHaveBeenCalledTimes(1);
    expect(mockedServiceFindMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1", id: { in: ["srv_1", "srv_2"] } },
      select: { id: true, name: true, durationMinutes: true, priceCents: true },
    });
    expect(response.json().data[0].booking).toMatchObject({
      professional: { id: "pro_1", name: "Lucía" },
      services: [
        { id: "srv_1", name: "Corte", priceCents: 1800 },
        { id: "srv_2", name: "Color", priceCents: null },
      ],
    });
  });
});

describe("GET /business/me/calls/analytics — gating por plan Scale", () => {
  let fastify: ReturnType<typeof Fastify>;
  const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
  const mockedCallAggregate = vi.mocked(prisma.call.aggregate);
  const mockedCallGroupBy = vi.mocked(prisma.call.groupBy);
  const mockedBookingCount = vi.mocked(prisma.booking.count);
  const mockedLeadCount = vi.mocked(prisma.lead.count);

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(callsRoutes);
  });

  it("devuelve 403 PLAN_LIMIT_ANALYTICS para un plan que no sea Scale", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      plan: "pro",
      stripePriceId: null,
    } as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/calls/analytics",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("PLAN_LIMIT_ANALYTICS");
    expect(mockedCallAggregate).not.toHaveBeenCalled();
  });

  it("calcula la analítica para un negocio Scale con horas en la zona del negocio", async () => {
    // Primera llamada: gate del plan; segunda (desde analytics.ts): timezone.
    mockedBusinessFindUnique
      .mockResolvedValueOnce({ plan: "enterprise", stripePriceId: null } as any)
      .mockResolvedValueOnce({ timezone: "Europe/Madrid" } as any);
    mockedCallAggregate.mockResolvedValue({
      _count: { _all: 2 },
      _sum: { durationSecs: 190 },
      _avg: { durationSecs: 95 },
    } as any);
    mockedCallGroupBy
      .mockResolvedValueOnce([
        { outcome: "RESOLVED", _count: { _all: 2 } },
      ] as any)
      .mockResolvedValueOnce([
        { sentiment: "POSITIVE", _count: { _all: 1 } },
      ] as any)
      .mockResolvedValueOnce([
        { requestedService: "Corte", _count: { _all: 2 } },
      ] as any);
    // 16:00Z en septiembre = 18:00 en Madrid.
    mockedCallFindMany.mockResolvedValue([
      { startedAt: new Date("2026-09-10T16:00:00Z") },
      { startedAt: new Date("2026-09-10T16:30:00Z") },
    ] as any);
    mockedBookingCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    mockedLeadCount.mockResolvedValue(3);

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/calls/analytics?days=30",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.totals).toMatchObject({
      calls: 2,
      minutes: 4,
      bookings: 1,
      waitlistLeads: 3,
    });
    expect(body.byHour).toEqual([{ hour: 18, count: 2 }]);
    expect(body.byWeekday).toEqual([{ weekday: 4, count: 2 }]); // jueves
    expect(body.topServices).toEqual([{ service: "Corte", count: 2 }]);
  });
});

describe("GET /business/me/calls — recados y filtros del panel móvil", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(callsRoutes);
    mockedServiceFindMany.mockResolvedValue([] as any);
  });

  it("filtra «por devolver» por recados sin atender y devuelve los tres recuentos", async () => {
    mockedCallFindMany.mockResolvedValue([] as any);
    mockedCallCount
      .mockResolvedValueOnce(2 as any) // total del filtro
      .mockResolvedValueOnce(10 as any) // todas
      .mockResolvedValueOnce(3 as any) // con cita
      .mockResolvedValueOnce(2 as any); // por devolver

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/calls?filtro=por_devolver",
    });

    expect(response.statusCode).toBe(200);
    expect(mockedCallFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: "biz_1",
          leads: { some: { type: "message", resolvedAt: null } },
        },
      })
    );
    expect(response.json()).toMatchObject({
      total: 2,
      filtro: "por_devolver",
      conteos: { todas: 10, conCita: 3, porDevolver: 2 },
    });
  });

  it("filtra «con cita» por reservas que siguen vivas", async () => {
    mockedCallFindMany.mockResolvedValue([] as any);
    mockedCallCount.mockResolvedValue(0 as any);

    await fastify.inject({
      method: "GET",
      url: "/business/me/calls?filtro=con_cita",
    });

    expect(mockedCallFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: "biz_1", booking: { is: { isCancelled: false } } },
      })
    );
  });

  it("rechaza un filtro desconocido con 400", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/calls?filtro=todo",
    });

    expect(response.statusCode).toBe(400);
    expect(mockedCallFindMany).not.toHaveBeenCalled();
  });

  it("describe el recado de cada llamada sin mandar los leads crudos", async () => {
    mockedCallFindMany.mockResolvedValue([
      {
        id: "call_1",
        businessId: "biz_1",
        booking: null,
        leads: [
          {
            id: "lead_1",
            resolvedAt: null,
            data: { clientName: "Laura", clientPhone: "645778120", motivo: "Keratina" },
          },
        ],
      },
      {
        id: "call_2",
        businessId: "biz_1",
        booking: null,
        leads: [
          {
            id: "lead_2",
            resolvedAt: new Date("2026-10-01T10:00:00Z"),
            data: { clientName: "", motivo: 42 },
          },
        ],
      },
      { id: "call_3", businessId: "biz_1", booking: null, leads: [] },
    ] as any);
    mockedCallCount.mockResolvedValue(3 as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/calls",
    });

    const [pendiente, atendido, sinRecado] = response.json().data;
    expect(pendiente.leads).toBeUndefined();
    expect(pendiente.recado).toEqual({
      id: "lead_1",
      nombre: "Laura",
      telefono: "645778120",
      motivo: "Keratina",
      atendidoAt: null,
    });
    // Un campo vacío o que no es texto no se cuela como dato.
    expect(atendido.recado).toEqual({
      id: "lead_2",
      nombre: null,
      telefono: null,
      motivo: null,
      atendidoAt: "2026-10-01T10:00:00.000Z",
    });
    expect(sinRecado.recado).toBeNull();
  });

  it("una llamada con un recado atendido y otro no sigue pendiente", async () => {
    mockedCallFindMany.mockResolvedValue([
      {
        id: "call_1",
        businessId: "biz_1",
        booking: null,
        leads: [
          { id: "lead_nuevo", resolvedAt: new Date("2026-10-01T10:00:00Z"), data: {} },
          { id: "lead_viejo", resolvedAt: null, data: {} },
        ],
      },
    ] as any);
    mockedCallCount.mockResolvedValue(1 as any);

    const response = await fastify.inject({ method: "GET", url: "/business/me/calls" });

    expect(response.json().data[0].recado.atendidoAt).toBeNull();
  });
});

describe("PATCH /business/me/calls/:id/recado", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(callsRoutes);
  });

  it("marca atendido solo lo pendiente de una llamada del negocio", async () => {
    mockedCallFindFirst.mockResolvedValue({ id: "call_1" } as any);
    mockedLeadUpdateMany.mockResolvedValue({ count: 1 } as any);
    mockedLeadFindMany.mockResolvedValue([
      { id: "lead_1", resolvedAt: new Date("2026-10-02T09:00:00Z"), data: { clientName: "Laura" } },
    ] as any);

    const response = await fastify.inject({
      method: "PATCH",
      url: "/business/me/calls/call_1/recado",
      payload: { atendido: true },
    });

    expect(response.statusCode).toBe(200);
    expect(mockedCallFindFirst).toHaveBeenCalledWith({
      where: { id: "call_1", businessId: "biz_1" },
      select: { id: true },
    });
    expect(mockedLeadUpdateMany).toHaveBeenCalledWith({
      where: { callId: "call_1", type: "message", resolvedAt: null },
      data: { resolvedAt: expect.any(Date), snoozedUntil: null },
    });
    expect(response.json().recado).toMatchObject({
      id: "lead_1",
      nombre: "Laura",
      atendidoAt: "2026-10-02T09:00:00.000Z",
    });
  });

  it("deshacer reabre lo que estaba atendido", async () => {
    mockedCallFindFirst.mockResolvedValue({ id: "call_1" } as any);
    mockedLeadUpdateMany.mockResolvedValue({ count: 1 } as any);
    mockedLeadFindMany.mockResolvedValue([
      { id: "lead_1", resolvedAt: null, data: {} },
    ] as any);

    const response = await fastify.inject({
      method: "PATCH",
      url: "/business/me/calls/call_1/recado",
      payload: { atendido: false },
    });

    expect(response.statusCode).toBe(200);
    expect(mockedLeadUpdateMany).toHaveBeenCalledWith({
      where: { callId: "call_1", type: "message", resolvedAt: { not: null } },
      data: { resolvedAt: null },
    });
    expect(response.json().recado.atendidoAt).toBeNull();
  });

  it("devuelve 404 si la llamada es de otro negocio, sin tocar ningún lead", async () => {
    mockedCallFindFirst.mockResolvedValue(null);

    const response = await fastify.inject({
      method: "PATCH",
      url: "/business/me/calls/call_ajena/recado",
      payload: { atendido: true },
    });

    expect(response.statusCode).toBe(404);
    expect(mockedLeadUpdateMany).not.toHaveBeenCalled();
  });

  it("devuelve 404 si la llamada no tiene recado", async () => {
    mockedCallFindFirst.mockResolvedValue({ id: "call_1" } as any);
    mockedLeadUpdateMany.mockResolvedValue({ count: 0 } as any);
    mockedLeadFindMany.mockResolvedValue([] as any);

    const response = await fastify.inject({
      method: "PATCH",
      url: "/business/me/calls/call_1/recado",
      payload: { atendido: true },
    });

    expect(response.statusCode).toBe(404);
  });

  it("valida el body con 400", async () => {
    const response = await fastify.inject({
      method: "PATCH",
      url: "/business/me/calls/call_1/recado",
      payload: { atendido: "sí" },
    });

    expect(response.statusCode).toBe(400);
    expect(mockedCallFindFirst).not.toHaveBeenCalled();
  });
});
