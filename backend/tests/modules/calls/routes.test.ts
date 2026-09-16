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
