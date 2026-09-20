import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { businessesRoutes } from "../../../src/modules/businesses/routes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { filaDeConexion } from "../../helpers/conexionDeCalendario.js";
import {
  cambiarMovilDelDueno,
  esNumeroDeAlhabla,
} from "../../../src/modules/whatsapp/altaDueno.js";
import { syncAgentNameWithBusinessType } from "../../../src/lib/agentBootstrap.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    agent: { findMany: vi.fn(), update: vi.fn() },
  },
}));

// Dependencias que el módulo arrastra al importarse pero que esta ruta no usa.
vi.mock("../../../src/lib/redis.js", () => ({ getRedis: vi.fn() }));
vi.mock("../../../src/modules/calendar/service.js", () => ({
  calendarService: {},
}));
vi.mock("../../../src/lib/agentBootstrap.js", () => ({
  syncAgentNameWithBusinessType: vi.fn(),
  syncAgentToRetell: vi.fn(),
}));
vi.mock("../../../src/lib/telnyxAgentSync.js", () => ({
  syncAgentToTelnyx: vi.fn(),
}));
// Gate de la frase de la lista de espera en el prompt (PR 4).
vi.mock("../../../src/modules/whatsapp/service.js", () => ({
  listaDeEsperaDisponible: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../../src/modules/whatsapp/altaDueno.js", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../../src/modules/whatsapp/altaDueno.js")
    >();
  return {
    ...actual,
    cambiarMovilDelDueno: vi.fn(),
    esNumeroDeAlhabla: vi.fn(),
  };
});

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedBusinessUpdate = vi.mocked(prisma.business.update);
const mockedBusinessFindUniqueOrThrow = vi.mocked(
  prisma.business.findUniqueOrThrow
);
const mockedAgentFindMany = vi.mocked(prisma.agent.findMany);
const mockedAgentUpdate = vi.mocked(prisma.agent.update);
const mockedCambiarMovil = vi.mocked(cambiarMovilDelDueno);
const mockedEsNumeroDeAlhabla = vi.mocked(esNumeroDeAlhabla);
const mockedSyncName = vi.mocked(syncAgentNameWithBusinessType);

async function buildServer() {
  const fastify = Fastify();
  fastify.decorate("authenticate", async (request: any) => {
    request.user = { businessId: "biz_1" };
  });
  await fastify.register(businessesRoutes);
  return fastify;
}

/** Lo que devuelve Prisma para GET /me: negocio + relaciones incluidas. La
 * conexión de calendario viene como filas de calendar_connections (con las
 * credenciales dentro), NUNCA como columnas de Business. */
function negocioDePrisma(overrides: Record<string, unknown> = {}) {
  return {
    id: "biz_1",
    name: "Peluquería Test",
    calendarProvider: "google",
    agents: [],
    services: [],
    professionals: [],
    calendarConnections: [
      filaDeConexion("google", {
        refreshToken: "SECRETO_GOOGLE",
        calendarId: "primary",
      }),
      filaDeConexion("outlook", {
        refreshToken: "SECRETO_OUTLOOK",
        calendarId: null,
        connected: false,
        disconnectedAt: new Date("2026-09-18T10:00:00Z"),
        lastError: "invalid_grant",
        accountEmail: "barber@outlook.com",
      }),
    ],
    ...overrides,
  };
}

describe("GET /business/me (contrato de calendario con el panel)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve los campos de calendario históricos calculados desde calendar_connections", async () => {
    mockedBusinessFindUnique.mockResolvedValue(negocioDePrisma() as any);
    const fastify = await buildServer();

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    // Exactamente lo que leen agenda/page.tsx, agente/page.tsx y
    // operational-status.tsx: si esto cambia, el panel deja de ver el
    // calendario como conectado.
    expect(body).toMatchObject({
      calendarProvider: "google",
      googleCalendarId: "primary",
      googleCalendarConnected: true,
      googleCalendarDisconnectedAt: null,
      googleCalendarLastError: null,
      outlookCalendarId: null,
      outlookCalendarConnected: false,
      outlookCalendarDisconnectedAt: "2026-09-18T10:00:00.000Z",
      outlookCalendarLastError: "invalid_grant",
      outlookUserEmail: "barber@outlook.com",
    });
  });

  it("nunca incluye calendarConnections ni credenciales en la respuesta", async () => {
    mockedBusinessFindUnique.mockResolvedValue(negocioDePrisma() as any);
    const fastify = await buildServer();

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me",
    });

    expect(response.json()).not.toHaveProperty("calendarConnections");
    expect(response.body).not.toContain("SECRETO_GOOGLE");
    expect(response.body).not.toContain("SECRETO_OUTLOOK");
  });

  it("pide las filas de calendario a Prisma junto al resto de relaciones", async () => {
    mockedBusinessFindUnique.mockResolvedValue(negocioDePrisma() as any);
    const fastify = await buildServer();

    await fastify.inject({ method: "GET", url: "/business/me" });

    const args = mockedBusinessFindUnique.mock.calls[0][0] as any;
    expect(args.where).toEqual({ id: "biz_1" });
    expect(args.include.calendarConnections).toBeDefined();
  });

  it("un negocio sin ninguna conexión sale como no conectado (flags false, resto null)", async () => {
    mockedBusinessFindUnique.mockResolvedValue(
      negocioDePrisma({
        calendarProvider: null,
        calendarConnections: [],
      }) as any
    );
    const fastify = await buildServer();

    const body = (
      await fastify.inject({ method: "GET", url: "/business/me" })
    ).json();

    expect(body.googleCalendarConnected).toBe(false);
    expect(body.outlookCalendarConnected).toBe(false);
    expect(body.outlookUserEmail).toBeNull();
    expect(body.googleCalendarId).toBeNull();
  });
});

describe("PATCH /business/me (móvil del dueño para WhatsApp)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEsNumeroDeAlhabla.mockResolvedValue(false);
    mockedCambiarMovil.mockResolvedValue({ count: 1 });
    mockedBusinessFindUnique.mockResolvedValue({
      name: "Peluquería Test",
      businessDetails: null,
      agentSettings: null,
      timezone: "Europe/Madrid",
    } as any);
    mockedBusinessUpdate.mockResolvedValue({} as any);
    mockedAgentFindMany.mockResolvedValue([{ id: "agent_1" }] as any);
    mockedAgentUpdate.mockResolvedValue({} as any);
    mockedBusinessFindUniqueOrThrow.mockResolvedValue(
      negocioDePrisma({ ownerWhatsappNumber: "+34600123456" }) as any
    );
  });

  async function patch(body: unknown) {
    const fastify = await buildServer();
    return fastify.inject({
      method: "PATCH",
      url: "/business/me",
      payload: body as any,
    });
  }

  it("un móvil que no es E.164 es un 400 de Zod", async () => {
    const response = await patch({ ownerWhatsappNumber: "600123456" });
    expect(response.statusCode).toBe(400);
    expect(mockedCambiarMovil).not.toHaveBeenCalled();
  });

  it("un móvil válido pasa por cambiarMovilDelDueno con el negocio del JWT y no llega al update genérico", async () => {
    const response = await patch({ ownerWhatsappNumber: "+34600123456" });

    expect(response.statusCode).toBe(200);
    expect(mockedCambiarMovil).toHaveBeenCalledWith("biz_1", "+34600123456");
    const updateData = mockedBusinessUpdate.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(updateData).not.toHaveProperty("ownerWhatsappNumber");
    expect(response.json().ownerWhatsappNumber).toBe("+34600123456");
  });

  it("null quita el móvil", async () => {
    await patch({ ownerWhatsappNumber: null });
    expect(mockedCambiarMovil).toHaveBeenCalledWith("biz_1", null);
  });

  it("notificationPrefs se fusiona con lo guardado y rechaza claves desconocidas", async () => {
    mockedBusinessFindUnique.mockResolvedValueOnce({
      notificationPrefs: { otraClave: true },
    } as never);

    const response = await patch({ notificationPrefs: { avisoPorReserva: false } });

    expect(response.statusCode).toBe(200);
    const updateData = mockedBusinessUpdate.mock.calls[0][0].data as Record<string, unknown>;
    expect(updateData.notificationPrefs).toEqual({ otraClave: true, avisoPorReserva: false });

    const malo = await patch({ notificationPrefs: { loQueSea: true } as never });
    expect(malo.statusCode).toBe(400);
  });

  it("los interruptores de las conversaciones (Beta) se guardan tal cual y solo aceptan booleanos", async () => {
    const response = await patch({
      ownerChatEnabled: false,
      clientChatEnabled: true,
    } as never);
    expect(response.statusCode).toBe(200);
    const updateData = mockedBusinessUpdate.mock.calls[0][0].data as Record<string, unknown>;
    expect(updateData).toMatchObject({ ownerChatEnabled: false, clientChatEnabled: true });

    const malo = await patch({ ownerChatEnabled: "no" } as never);
    expect(malo.statusCode).toBe(400);
  });

  it("el número de Alhabla se rechaza ANTES de tocar los agentes o el nombre", async () => {
    mockedEsNumeroDeAlhabla.mockResolvedValue(true);

    const response = await patch({
      ownerWhatsappNumber: "+34930453218",
      name: "Otro nombre",
      businessType: "peluqueria",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Ese número es el de Alhabla. Escribe tu propio móvil.",
      code: "OWNER_WHATSAPP_IS_ALHABLA",
    });
    expect(mockedSyncName).not.toHaveBeenCalled();
    expect(mockedAgentUpdate).not.toHaveBeenCalled();
    expect(mockedBusinessUpdate).not.toHaveBeenCalled();
    expect(mockedCambiarMovil).not.toHaveBeenCalled();
  });

  it("PATCH /business/me guarda placeId y address, devuelve 400 con un placeId con caracteres fuera de [A-Za-z0-9_-] y no resincroniza el prompt", async () => {
    const response = await patch({
      placeId: "ChIJd8BlQ2BZwokRAFUEcm_qrcA",
      address: "  Calle Mayor 1, Madrid  ",
    });

    expect(response.statusCode).toBe(200);
    const updateData = mockedBusinessUpdate.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(updateData.placeId).toBe("ChIJd8BlQ2BZwokRAFUEcm_qrcA");
    expect(updateData.address).toBe("Calle Mayor 1, Madrid");
    // No entra en shouldResyncPrompt: ni prompt nuevo ni agentes tocados.
    expect(updateData).not.toHaveProperty("systemPrompt");
    expect(mockedAgentUpdate).not.toHaveBeenCalled();

    const rechazado = await patch({ placeId: "abc&query=x" });
    expect(rechazado.statusCode).toBe(400);

    mockedBusinessUpdate.mockClear();
    await patch({ placeId: null, address: null });
    expect(mockedBusinessUpdate.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ placeId: null, address: null })
    );
  });

  it("si solo cambia el nombre no se toca el móvil", async () => {
    const response = await patch({ name: "Peluquería Nueva" });
    expect(response.statusCode).toBe(200);
    expect(mockedCambiarMovil).not.toHaveBeenCalled();
  });

  it("las columnas de consentimiento no son escribibles desde el panel", async () => {
    await patch({
      name: "Peluquería Nueva",
      ownerWhatsappOptInAt: "2026-09-20T00:00:00Z",
      ownerAltaCode: "AAAAAA",
      ownerWhatsappOptOutAt: null,
    });

    const updateData = mockedBusinessUpdate.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(updateData).not.toHaveProperty("ownerWhatsappOptInAt");
    expect(updateData).not.toHaveProperty("ownerAltaCode");
    expect(updateData).not.toHaveProperty("ownerWhatsappOptOutAt");
  });

  it("un nombre largo de Google Places no se rechaza (la plantilla lo acota aparte)", async () => {
    const largo =
      "Centro de Estética y Belleza Integral María del Carmen Fernández Rodríguez - Salón Unisex";
    expect(largo.length).toBeGreaterThan(80);
    expect((await patch({ name: largo })).statusCode).toBe(200);
    expect((await patch({ name: "" })).statusCode).toBe(400);
  });

  it("si cambiarMovilDelDueno lanza NumeroDeAlhablaError también es un 400 con código", async () => {
    const { NumeroDeAlhablaError } =
      await import("../../../src/modules/whatsapp/altaDueno.js");
    mockedCambiarMovil.mockRejectedValue(new NumeroDeAlhablaError());

    const response = await patch({ ownerWhatsappNumber: "+34600123456" });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("OWNER_WHATSAPP_IS_ALHABLA");
  });
});
