import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { businessesRoutes } from "../../../src/modules/businesses/routes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { filaDeConexion } from "../../helpers/conexionDeCalendario.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn(), update: vi.fn() },
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

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);

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
