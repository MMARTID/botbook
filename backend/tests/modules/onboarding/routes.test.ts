import { describe, it, expect, beforeEach, vi } from "vitest";
import { filaDeConexion } from "../../helpers/conexionDeCalendario.js";
import Fastify from "fastify";
import { onboardingRoutes } from "../../../src/modules/onboarding/routes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { bajaVigente } from "../../../src/modules/whatsapp/bajas.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    call: { findFirst: vi.fn() },
    onboardingState: {
      // upsert, no findUnique + create: dos cargas simultáneas del panel
      // chocaban contra el unique de businessId y devolvían un 500.
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../../src/modules/whatsapp/bajas.js", () => ({
  bajaVigente: vi.fn(),
}));

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedBajaVigente = vi.mocked(bajaVigente);
const mockedCallFindFirst = vi.mocked(prisma.call.findFirst);
const mockedStateUpsert = vi.mocked(prisma.onboardingState.upsert);
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

/** Negocio con los cinco pasos de configuración (WhatsApp incluido) ya
 * resueltos; solo falta el desvío. */
function businessConfigurado(overrides: Record<string, unknown> = {}) {
  return {
    id: "biz_1",
    schedule: HORARIO_VALIDO,
    services: [{ id: "srv_1" }],
    professionals: [{ id: "pro_1" }],
    calendarProvider: "google",
    calendarConnections: [filaDeConexion("google")],
    telnyxPhoneNumber: "+34930453218",
    phoneNumberStatus: "active",
    ownerWhatsappNumber: "+34600123456",
    ownerWhatsappOptInAt: new Date("2026-09-20T10:00:00Z"),
    ownerWhatsappOptOutAt: null,
    ownerWhatsappUnreachableAt: null,
    ...overrides,
  } as any;
}

describe("GET /business/me/onboarding", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockedBajaVigente.mockResolvedValue(null);
    mockedStateUpsert.mockResolvedValue({
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
    // Cinco de los seis pasos (falta el desvío): WhatsApp cuenta como los
    // demás desde que el panel conoce el paso.
    expect(body.progress).toBe(83);
    expect(body.isActive).toBe(true);
  });

  it("WhatsApp pendiente mantiene la guía abierta aunque los otros cinco pasos estén hechos", async () => {
    mockedBusinessFindUnique.mockResolvedValue(
      businessConfigurado({
        ownerWhatsappNumber: null,
        ownerWhatsappOptInAt: null,
      })
    );
    mockedCallFindFirst.mockResolvedValue({
      startedAt: new Date("2026-09-19T10:00:00Z"),
    } as any);

    const body = (
      await fastify.inject({ method: "GET", url: "/business/me/onboarding" })
    ).json();

    expect(body.steps.whatsapp).toBe(false);
    expect(body.steps.forwarding).toBe(true);
    expect(body.progress).toBe(83);
    expect(body.isActive).toBe(true);
  });

  it("el paso de WhatsApp va antes del desvío y refleja el estado del dueño", async () => {
    mockedBusinessFindUnique.mockResolvedValue(businessConfigurado());
    mockedCallFindFirst.mockResolvedValue(null);

    const body = (
      await fastify.inject({ method: "GET", url: "/business/me/onboarding" })
    ).json();

    expect(Object.keys(body.steps)).toEqual([
      "schedule",
      "services",
      "professionals",
      "calendar",
      "whatsapp",
      "forwarding",
    ]);
    expect(body.steps.whatsapp).toBe(true);
    expect(body.whatsapp).toEqual({
      status: "activo",
      ownerWhatsappNumber: "+34600123456",
    });
    expect(mockedBajaVigente).toHaveBeenCalledWith("owner", "+34600123456");
  });

  it("sin móvil, o con el móvil sin WhatsApp, el paso sigue pendiente y coherente con el estado", async () => {
    mockedCallFindFirst.mockResolvedValue(null);

    mockedBusinessFindUnique.mockResolvedValue(
      businessConfigurado({
        ownerWhatsappNumber: null,
        ownerWhatsappOptInAt: null,
      })
    );
    let body = (
      await fastify.inject({ method: "GET", url: "/business/me/onboarding" })
    ).json();
    expect(body.steps.whatsapp).toBe(false);
    expect(body.whatsapp).toEqual({
      status: "sin_numero",
      ownerWhatsappNumber: null,
    });
    // Cuatro de seis: faltan WhatsApp y el desvío.
    expect(body.progress).toBe(67);
    expect(mockedBajaVigente).not.toHaveBeenCalled();

    mockedBusinessFindUnique.mockResolvedValue(
      businessConfigurado({
        ownerWhatsappUnreachableAt: new Date("2026-09-20T11:00:00Z"),
      })
    );
    body = (
      await fastify.inject({ method: "GET", url: "/business/me/onboarding" })
    ).json();
    expect(body.steps.whatsapp).toBe(false);
    expect(body.whatsapp.status).toBe("sin_whatsapp");

    mockedBusinessFindUnique.mockResolvedValue(
      businessConfigurado({ ownerWhatsappOptInAt: null })
    );
    body = (
      await fastify.inject({ method: "GET", url: "/business/me/onboarding" })
    ).json();
    expect(body.steps.whatsapp).toBe(false);
    expect(body.whatsapp.status).toBe("pendiente");
  });

  it("una baja solo por la fila global cuenta como resuelto, igual que la baja por columna", async () => {
    mockedCallFindFirst.mockResolvedValue(null);
    mockedBajaVigente.mockResolvedValue({
      optedOutAt: new Date("2026-09-19T09:00:00Z"),
      keyword: "STOP",
    });
    mockedBusinessFindUnique.mockResolvedValue(
      businessConfigurado({ ownerWhatsappOptInAt: null })
    );

    const body = (
      await fastify.inject({ method: "GET", url: "/business/me/onboarding" })
    ).json();

    expect(body.whatsapp.status).toBe("baja");
    expect(body.steps.whatsapp).toBe(true);
  });

  it("deja el desvío en espera mientras el número no está aprobado", async () => {
    mockedBusinessFindUnique.mockResolvedValue(
      businessConfigurado({ phoneNumberStatus: "purchased" })
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
    mockedStateUpsert.mockResolvedValue({
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
        phoneNumberStatus: "active",
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
    mockedStateUpsert.mockResolvedValue({
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
