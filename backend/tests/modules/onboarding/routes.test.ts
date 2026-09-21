import { describe, it, expect, beforeEach, vi } from "vitest";
import { filaDeConexion } from "../../helpers/conexionDeCalendario.js";
import Fastify from "fastify";
import { onboardingRoutes } from "../../../src/modules/onboarding/routes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { bajaVigente } from "../../../src/modules/whatsapp/bajas.js";
import {
  ComprobacionDeDesvioError,
  iniciarComprobacionDeDesvio,
  obtenerComprobacionDeDesvio,
} from "../../../src/modules/onboarding/comprobacionDesvio.js";

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

// La lógica de la comprobación (Redis, Telnyx) tiene su propio test; aquí
// se prueba el contrato HTTP. La clase de error se deja real para que el
// `instanceof` de la ruta funcione.
vi.mock(
  "../../../src/modules/onboarding/comprobacionDesvio.js",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../../src/modules/onboarding/comprobacionDesvio.js")
      >();
    return {
      ...original,
      iniciarComprobacionDeDesvio: vi.fn(),
      obtenerComprobacionDeDesvio: vi.fn(),
    };
  }
);

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedBajaVigente = vi.mocked(bajaVigente);
const mockedCallFindFirst = vi.mocked(prisma.call.findFirst);
const mockedStateUpsert = vi.mocked(prisma.onboardingState.upsert);
const mockedStateUpdate = vi.mocked(prisma.onboardingState.update);
const mockedIniciarComprobacion = vi.mocked(iniciarComprobacionDeDesvio);
const mockedObtenerComprobacion = vi.mocked(obtenerComprobacionDeDesvio);

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
    phone: "+34931112233",
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

  it("expone la línea de clientes y cuándo se comprobó el desvío de verdad", async () => {
    mockedBusinessFindUnique.mockResolvedValue(businessConfigurado());
    mockedCallFindFirst.mockResolvedValue(null);

    let body = (
      await fastify.inject({ method: "GET", url: "/business/me/onboarding" })
    ).json();
    expect(body.forwarding).toMatchObject({
      checkedAt: null,
      customerLine: "+34931112233",
    });

    // Comprobado de verdad (webhook): también cuenta como confirmado.
    mockedStateUpsert.mockResolvedValue({
      id: "onb_1",
      businessId: "biz_1",
      dismissedAt: null,
      completedAt: null,
      forwardingConfirmedAt: new Date("2026-09-21T10:00:00Z"),
      forwardingCheckedAt: new Date("2026-09-21T10:00:00Z"),
    } as any);
    body = (
      await fastify.inject({ method: "GET", url: "/business/me/onboarding" })
    ).json();
    expect(body.forwarding.checkedAt).toBe("2026-09-21T10:00:00.000Z");
    expect(body.forwarding.status).toBe("done");

    // El placeholder del registro no es una línea a la que llamar.
    mockedBusinessFindUnique.mockResolvedValue(
      businessConfigurado({ phone: "TEMP-1758470000-abcd" })
    );
    body = (
      await fastify.inject({ method: "GET", url: "/business/me/onboarding" })
    ).json();
    expect(body.forwarding.customerLine).toBeNull();
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

describe("«Comprobar desvío»: POST y GET /business/me/onboarding/forwarding/check", () => {
  let fastify: ReturnType<typeof Fastify>;

  const COMPROBACION = {
    id: "a".repeat(32),
    businessId: "biz_1",
    linea: "+34931112233",
    startedAt: "2026-09-21T10:00:00.000Z",
    callControlId: "call_ctrl_out",
    contestada: false,
    resultado: null,
    resueltaAt: null,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(onboardingRoutes);
  });

  it("arranca la comprobación del negocio del token y devuelve solo lo que el panel necesita", async () => {
    mockedIniciarComprobacion.mockResolvedValue(COMPROBACION);

    const response = await fastify.inject({
      method: "POST",
      url: "/business/me/onboarding/forwarding/check",
    });

    expect(response.statusCode).toBe(202);
    expect(mockedIniciarComprobacion).toHaveBeenCalledWith("biz_1");
    expect(response.json()).toEqual({
      id: "a".repeat(32),
      linea: "+34931112233",
      startedAt: "2026-09-21T10:00:00.000Z",
      resultado: null,
      resueltaAt: null,
    });
  });

  it("traduce cada motivo de rechazo a su código HTTP con un `code` claro", async () => {
    const casos: Array<[string, number]> = [
      ["sin_numero", 402],
      ["linea_de_clientes_invalida", 409],
      ["linea_no_admitida", 409],
      ["comprobacion_en_curso", 409],
      ["limite_alcanzado", 429],
      ["telefonia_no_configurada", 503],
      ["no_se_pudo_llamar", 502],
    ];

    for (const [codigo, status] of casos) {
      mockedIniciarComprobacion.mockRejectedValueOnce(
        new ComprobacionDeDesvioError(codigo as any, `motivo ${codigo}`)
      );

      const response = await fastify.inject({
        method: "POST",
        url: "/business/me/onboarding/forwarding/check",
      });

      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual({
        error: `motivo ${codigo}`,
        code: codigo,
      });
    }
  });

  it("un fallo inesperado es un 500 sin filtrar detalles", async () => {
    mockedIniciarComprobacion.mockRejectedValue(new Error("boom"));

    const response = await fastify.inject({
      method: "POST",
      url: "/business/me/onboarding/forwarding/check",
    });

    expect(response.statusCode).toBe(500);
    expect(response.json().error).not.toContain("boom");
  });

  it("devuelve el estado de la comprobación mientras dura y su resultado al terminar", async () => {
    mockedObtenerComprobacion.mockResolvedValue({
      ...COMPROBACION,
      resultado: { estado: "fallo", motivo: "la_has_cogido" },
      resueltaAt: "2026-09-21T10:00:20.000Z",
    });

    const response = await fastify.inject({
      method: "GET",
      url: `/business/me/onboarding/forwarding/check/${"a".repeat(32)}`,
    });

    expect(response.statusCode).toBe(200);
    expect(mockedObtenerComprobacion).toHaveBeenCalledWith(
      "a".repeat(32),
      "biz_1"
    );
    expect(response.json()).toEqual({
      id: "a".repeat(32),
      linea: "+34931112233",
      startedAt: "2026-09-21T10:00:00.000Z",
      resultado: { estado: "fallo", motivo: "la_has_cogido" },
      resueltaAt: "2026-09-21T10:00:20.000Z",
    });
  });

  it("una comprobación de otro negocio (o caducada) es un 404", async () => {
    mockedObtenerComprobacion.mockResolvedValue(null);

    const response = await fastify.inject({
      method: "GET",
      url: `/business/me/onboarding/forwarding/check/${"b".repeat(32)}`,
    });

    expect(response.statusCode).toBe(404);
    expect(mockedObtenerComprobacion).toHaveBeenCalledWith(
      "b".repeat(32),
      "biz_1"
    );
  });
});
