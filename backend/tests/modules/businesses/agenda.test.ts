import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { businessesRoutes } from "../../../src/modules/businesses/routes.js";
import { prisma } from "../../../src/lib/prisma.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn(), update: vi.fn() },
    booking: { findMany: vi.fn(), count: vi.fn() },
    service: { findMany: vi.fn(), count: vi.fn() },
    call: { count: vi.fn(), findMany: vi.fn() },
    lead: { count: vi.fn(), findMany: vi.fn() },
  },
}));

// Dependencias que el módulo arrastra al importarse pero que estas rutas no usan.
vi.mock("../../../src/lib/redis.js", () => ({ getRedis: vi.fn() }));
vi.mock("../../../src/adapters/vapi/VapiAdapter.js", () => ({ vapiAdapter: {} }));
vi.mock("../../../src/modules/calendar/service.js", () => ({ calendarService: {} }));
vi.mock("../../../src/lib/agentBootstrap.js", () => ({
  syncAgentNameWithBusinessType: vi.fn(),
  syncAgentToRetell: vi.fn(),
}));

const mockedBookingFindMany = vi.mocked(prisma.booking.findMany);
const mockedServiceFindMany = vi.mocked(prisma.service.findMany);
const mockedServiceCount = vi.mocked(prisma.service.count);
const mockedCallCount = vi.mocked(prisma.call.count);
const mockedCallFindMany = vi.mocked(prisma.call.findMany);
const mockedLeadCount = vi.mocked(prisma.lead.count);
const mockedLeadFindMany = vi.mocked(prisma.lead.findMany);

async function buildServer() {
  const fastify = Fastify();
  fastify.decorate("authenticate", async (request: any) => {
    request.user = { businessId: "biz_1" };
  });
  await fastify.register(businessesRoutes);
  return fastify;
}

describe("GET /business/me/agenda", () => {
  let fastify: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = await buildServer();
  });

  it("resuelve nombres de servicio y usa el número de la llamada cuando la reserva no trae otro", async () => {
    mockedBookingFindMany.mockResolvedValue([
      {
        id: "bk_1",
        callId: "call_1",
        programedAt: new Date("2026-09-12T15:00:00Z"),
        durationMinutes: 45,
        numberPeople: 1,
        clientPhone: null,
        professional: { id: "pro_1", name: "Pedro" },
        serviceIds: ["srv_1", "srv_2"],
        externalEventId: "evt_1",
        externalCalendarProvider: "google",
        call: { id: "call_1", fromNumber: "+34692138456" },
      },
    ] as any);
    mockedServiceFindMany.mockResolvedValue([
      { id: "srv_1", name: "Corte", durationMinutes: 30, priceCents: 1800 },
      { id: "srv_2", name: "Mechas", durationMinutes: 60, priceCents: null },
    ] as any);

    const response = await fastify.inject({ method: "GET", url: "/business/me/agenda" });

    expect(response.statusCode).toBe(200);
    const [booking] = response.json().bookings;
    expect(booking.clientPhone).toBe("+34692138456");
    expect(booking.services.map((s: { name: string }) => s.name)).toEqual([
      "Corte",
      "Mechas",
    ]);
    expect(booking.professional).toEqual({ id: "pro_1", name: "Pedro" });
  });

  it("prefiere el teléfono propio de la reserva cuando el cliente pidió otro", async () => {
    mockedBookingFindMany.mockResolvedValue([
      {
        id: "bk_1",
        callId: "call_1",
        programedAt: new Date("2026-09-12T15:00:00Z"),
        durationMinutes: 30,
        numberPeople: 1,
        clientPhone: "+34600111222",
        professional: null,
        serviceIds: [],
        externalEventId: null,
        externalCalendarProvider: null,
        call: { id: "call_1", fromNumber: "+34692138456" },
      },
    ] as any);
    mockedServiceFindMany.mockResolvedValue([] as any);

    const response = await fastify.inject({ method: "GET", url: "/business/me/agenda" });

    expect(response.json().bookings[0].clientPhone).toBe("+34600111222");
  });

  it("solo pide citas futuras, sin cancelar y del negocio autenticado", async () => {
    mockedBookingFindMany.mockResolvedValue([] as any);

    await fastify.inject({ method: "GET", url: "/business/me/agenda?days=3" });

    const where = mockedBookingFindMany.mock.calls[0][0]?.where as any;
    expect(where.isCancelled).toBe(false);
    expect(where.call).toEqual({ businessId: "biz_1" });
    expect(where.programedAt.gte).toBeInstanceOf(Date);
    // El rango pedido son 3 días, no los 7 por defecto.
    const dias = Math.round(
      (where.programedAt.lte.getTime() - where.programedAt.gte.getTime()) / 86_400_000
    );
    expect(dias).toBe(3);
  });

  it("rechaza un rango de días fuera de lo permitido", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/agenda?days=999",
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("GET /business/me/stats (ventana semanal)", () => {
  let fastify: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = await buildServer();
    // Totales históricos, que esta suite no ejercita.
    mockedCallFindMany.mockResolvedValue([] as any);
    vi.mocked(prisma.booking.count).mockResolvedValue(0 as any);
  });

  it("no inventa ingresos cuando ningún servicio tiene precio", async () => {
    mockedServiceCount.mockResolvedValue(0 as any);
    mockedCallCount.mockResolvedValue(4 as any);
    mockedBookingFindMany.mockResolvedValue([{ serviceIds: ["srv_1"] }] as any);
    mockedLeadCount.mockResolvedValue(0 as any);

    const response = await fastify.inject({ method: "GET", url: "/business/me/stats" });

    const { week } = response.json();
    expect(week.revenueCents).toBeNull();
    expect(week.revenueIsPartial).toBe(false);
    expect(week.bookings).toBe(1);
  });

  it("suma solo los servicios con precio y avisa de que la estimación es parcial", async () => {
    mockedServiceCount.mockResolvedValue(1 as any);
    mockedCallCount.mockResolvedValue(2 as any);
    mockedBookingFindMany.mockResolvedValue([
      { serviceIds: ["srv_con_precio", "srv_sin_precio"] },
    ] as any);
    mockedServiceFindMany.mockResolvedValue([
      { id: "srv_con_precio", name: "Corte", durationMinutes: 30, priceCents: 1800 },
      { id: "srv_sin_precio", name: "Mechas", durationMinutes: 60, priceCents: null },
    ] as any);
    mockedLeadCount.mockResolvedValue(0 as any);

    const response = await fastify.inject({ method: "GET", url: "/business/me/stats" });

    const { week } = response.json();
    expect(week.revenueCents).toBe(1800);
    expect(week.revenueIsPartial).toBe(true);
  });

  it("compara contra los 7 días anteriores, no contra la semana natural", async () => {
    mockedServiceCount.mockResolvedValue(0 as any);
    mockedCallCount.mockResolvedValue(0 as any);
    mockedBookingFindMany.mockResolvedValue([] as any);
    mockedLeadCount.mockResolvedValue(0 as any);

    await fastify.inject({ method: "GET", url: "/business/me/stats" });

    // Dos ventanas de conteo de llamadas: la actual y la anterior, contiguas.
    const rangos = mockedCallCount.mock.calls
      .map((call) => (call[0] as any)?.where?.startedAt)
      .filter(Boolean);
    expect(rangos).toHaveLength(2);
    const [actual, anterior] = rangos.sort(
      (a: any, b: any) => b.gte.getTime() - a.gte.getTime()
    );
    expect(anterior.lt.getTime()).toBe(actual.gte.getTime());
    const duracion = actual.lt.getTime() - actual.gte.getTime();
    expect(Math.round(duracion / 86_400_000)).toBe(7);
  });
});

describe("GET /business/me/pending-bookings", () => {
  let fastify: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = await buildServer();
  });

  it("devuelve la cita perdida con los datos que hacen falta para devolver la llamada", async () => {
    mockedLeadFindMany.mockResolvedValue([
      {
        id: "lead_1",
        callId: "call_1",
        createdAt: new Date("2026-09-06T06:27:21Z"),
        data: {
          clientName: "Miguel",
          clientPhone: "692138456",
          startDateTime: "2026-09-07T09:00:00+02:00",
          failureCode: "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
        },
        call: { id: "call_1", fromNumber: "+34692138456", startedAt: new Date() },
      },
    ] as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/pending-bookings",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().pendingBookings[0]).toMatchObject({
      clientName: "Miguel",
      clientPhone: "692138456",
      requestedAt: "2026-09-07T09:00:00+02:00",
      failureCode: "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
    });
  });

  it("cae al número de la llamada y tolera un data sin los campos esperados", async () => {
    mockedLeadFindMany.mockResolvedValue([
      {
        id: "lead_2",
        callId: "call_2",
        createdAt: new Date("2026-09-06T06:27:21Z"),
        data: { failureCode: 42 },
        call: { id: "call_2", fromNumber: "+34600111222", startedAt: new Date() },
      },
    ] as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/pending-bookings",
    });

    expect(response.json().pendingBookings[0]).toMatchObject({
      clientName: null,
      clientPhone: "+34600111222",
      requestedAt: null,
      // Un número donde se esperaba texto no debe colarse en la respuesta.
      failureCode: null,
    });
  });

  it("solo pide las que siguen sin resolverse", async () => {
    mockedLeadFindMany.mockResolvedValue([] as any);

    await fastify.inject({ method: "GET", url: "/business/me/pending-bookings" });

    expect(mockedLeadFindMany.mock.calls[0][0]?.where).toMatchObject({
      type: "pending_booking",
      resolvedAt: null,
      call: { businessId: "biz_1" },
    });
  });
});
