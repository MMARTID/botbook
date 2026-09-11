import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { onboardingRoutes } from "../../../src/modules/onboarding/routes.js";
import { prisma } from "../../../src/lib/prisma.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    call: { findFirst: vi.fn() },
    onboardingState: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedCallFindFirst = vi.mocked(prisma.call.findFirst);
const mockedStateFindUnique = vi.mocked(prisma.onboardingState.findUnique);
const mockedStateUpdate = vi.mocked(prisma.onboardingState.update);

const HORARIO_VALIDO = {
  version: 1,
  week: {
    monday: { enabled: true, intervals: [{ start: "09:00", end: "18:00" }] },
    tuesday: { enabled: false, intervals: [] },
    wednesday: { enabled: false, intervals: [] },
    thursday: { enabled: false, intervals: [] },
    friday: { enabled: false, intervals: [] },
    saturday: { enabled: false, intervals: [] },
    sunday: { enabled: false, intervals: [] },
  },
};

/** Negocio con los cuatro pasos de configuración ya resueltos. */
function businessConfigurado(overrides: Record<string, unknown> = {}) {
  return {
    id: "biz_1",
    schedule: HORARIO_VALIDO,
    services: [{ id: "srv_1" }],
    professionals: [{ id: "pro_1" }],
    calendarProvider: "google",
    googleCalendarConnected: true,
    outlookCalendarConnected: false,
    telnyxPhoneNumber: "+34930453218",
    twilioPhoneNumber: null,
    twilioPhoneNumberStatus: "active",
    ...overrides,
  } as any;
}

describe("GET /business/me/onboarding", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockedStateFindUnique.mockResolvedValue({
      id: "onb_1",
      businessId: "biz_1",
      dismissedAt: null,
      completedAt: null,
      forwardingConfirmedAt: null,
    } as any);

    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(onboardingRoutes);
  });

  it("marca el desvío como pendiente y listo cuando hay número activo y ninguna llamada", async () => {
    mockedBusinessFindUnique.mockResolvedValue(businessConfigurado());
    mockedCallFindFirst.mockResolvedValue(null);

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/onboarding",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.steps.forwarding).toBe(false);
    expect(body.forwarding).toMatchObject({
      status: "ready",
      phoneNumber: "+34930453218",
      firstCallAt: null,
    });
    // Cuatro de cinco pasos hechos.
    expect(body.progress).toBe(80);
    expect(body.isActive).toBe(true);
  });

  it("deja el desvío en espera mientras el número no está aprobado", async () => {
    mockedBusinessFindUnique.mockResolvedValue(
      businessConfigurado({ twilioPhoneNumberStatus: "purchased" })
    );
    mockedCallFindFirst.mockResolvedValue(null);

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/onboarding",
    });

    expect(response.json().forwarding.status).toBe("waiting_number");
  });

  it("da el desvío por hecho en cuanto ha entrado una llamada real", async () => {
    mockedBusinessFindUnique.mockResolvedValue(businessConfigurado());
    mockedCallFindFirst.mockResolvedValue({
      startedAt: new Date("2026-09-10T08:30:00Z"),
    } as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/onboarding",
    });

    const body = response.json();
    expect(body.steps.forwarding).toBe(true);
    expect(body.forwarding.status).toBe("done");
    expect(body.forwarding.firstCallAt).toBe("2026-09-10T08:30:00.000Z");
    expect(body.progress).toBe(100);
    // Con todo hecho, la guía deja de mostrarse.
    expect(body.isActive).toBe(false);
  });

  it("acepta la confirmación manual del negocio aunque no haya llamadas todavía", async () => {
    mockedStateFindUnique.mockResolvedValue({
      id: "onb_1",
      businessId: "biz_1",
      dismissedAt: null,
      completedAt: null,
      forwardingConfirmedAt: new Date("2026-09-11T10:00:00Z"),
    } as any);
    mockedBusinessFindUnique.mockResolvedValue(businessConfigurado());
    mockedCallFindFirst.mockResolvedValue(null);

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/onboarding",
    });

    const body = response.json();
    expect(body.steps.forwarding).toBe(true);
    expect(body.forwarding.status).toBe("done");
    expect(body.forwarding.confirmedAt).toBe("2026-09-11T10:00:00.000Z");
  });

  it("no da por activo un desvío cuyo número todavía no existe", async () => {
    mockedBusinessFindUnique.mockResolvedValue(
      businessConfigurado({
        telnyxPhoneNumber: null,
        twilioPhoneNumber: null,
        twilioPhoneNumberStatus: "active",
      })
    );
    mockedCallFindFirst.mockResolvedValue(null);

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/onboarding",
    });

    expect(response.json().forwarding).toMatchObject({
      status: "waiting_number",
      phoneNumber: null,
    });
  });
});

describe("POST /business/me/onboarding/confirm-forwarding", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockedStateFindUnique.mockResolvedValue({
      id: "onb_1",
      businessId: "biz_1",
      forwardingConfirmedAt: null,
    } as any);

    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(onboardingRoutes);
  });

  it("guarda la fecha de confirmación del negocio", async () => {
    mockedStateUpdate.mockResolvedValue({
      forwardingConfirmedAt: new Date("2026-09-11T12:00:00Z"),
    } as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/business/me/onboarding/confirm-forwarding",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().confirmedAt).toBe("2026-09-11T12:00:00.000Z");
    expect(mockedStateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: "biz_1" } })
    );
  });
});
