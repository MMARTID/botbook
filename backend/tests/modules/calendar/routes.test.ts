import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  filaDeConexion,
  negocioConConexiones,
} from "../../helpers/conexionDeCalendario.js";
import Fastify from "fastify";
import { calendarRoutes } from "../../../src/modules/calendar/routes.js";
import { calendarService } from "../../../src/modules/calendar/service.js";
import { prisma } from "../../../src/lib/prisma.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: { business: { findUnique: vi.fn(), update: vi.fn() } },
}));

const { mockRedisClient } = vi.hoisted(() => ({
  mockRedisClient: { del: vi.fn().mockResolvedValue(1) },
}));

vi.mock("../../../src/lib/redis.js", () => ({
  getRedis: () => mockRedisClient,
}));

vi.mock("../../../src/modules/calendar/service.js", () => ({
  CalendarBusinessError: class CalendarBusinessError extends Error {},
  calendarService: {
    getAuthUrl: vi.fn(),
    getMicrosoftAuthUrl: vi.fn(),
    handleCallback: vi.fn(),
    handleMicrosoftCallback: vi.fn(),
    listarCalendarios: vi.fn(),
  },
}));

const mockedGetAuthUrl = vi.mocked(calendarService.getAuthUrl);
const mockedGetMicrosoftAuthUrl = vi.mocked(calendarService.getMicrosoftAuthUrl);
const mockedHandleCallback = vi.mocked(calendarService.handleCallback);
const mockedHandleMicrosoftCallback = vi.mocked(calendarService.handleMicrosoftCallback);
const mockedListarCalendarios = vi.mocked(calendarService.listarCalendarios);
const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedBusinessUpdate = vi.mocked(prisma.business.update);

/** Negocio con Google conectado, tal como lo lee cargarConexion (fila de
 * calendar_connections sin calendario elegido ⇒ "primary" por defecto). */
function filaGoogleConectada(opciones: { connected?: boolean } = {}) {
  return negocioConConexiones("google", [
    filaDeConexion("google", {
      refreshToken: "google_refresh_token",
      calendarId: null,
      connected: opciones.connected ?? true,
    }),
  ]);
}

describe("calendarRoutes OAuth", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.FRONTEND_URL = "http://localhost:3001";
    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(calendarRoutes);
  });

  it("liga el state de Google al navegador que inició la autorización", async () => {
    mockedGetAuthUrl.mockResolvedValue("https://accounts.google.com/o/oauth2?state=google_state");

    const start = await fastify.inject({ method: "GET", url: "/auth/google" });
    expect(start.statusCode).toBe(200);
    expect(start.headers["set-cookie"]).toContain("alhabla_google_calendar_oauth_state=google_state");

    const rejected = await fastify.inject({
      method: "GET",
      url: "/auth/google/callback?code=code&state=google_state",
    });
    expect(rejected.headers.location).toContain("calendar_error=invalid_state");
    expect(mockedHandleCallback).not.toHaveBeenCalled();

    const accepted = await fastify.inject({
      method: "GET",
      url: "/auth/google/callback?code=code&state=google_state",
      headers: { cookie: "alhabla_google_calendar_oauth_state=google_state" },
    });
    expect(accepted.headers.location).toContain("calendar_success=true");
    expect(mockedHandleCallback).toHaveBeenCalledWith("code", "google_state");
  });

  it("liga también el state de Microsoft al navegador que inició la autorización", async () => {
    mockedGetMicrosoftAuthUrl.mockResolvedValue("https://login.microsoftonline.com/common?state=microsoft_state");
    mockedHandleMicrosoftCallback.mockResolvedValue({ calendars: [] } as any);

    const start = await fastify.inject({ method: "GET", url: "/auth/microsoft" });
    expect(start.headers["set-cookie"]).toContain("alhabla_microsoft_calendar_oauth_state=microsoft_state");

    const rejected = await fastify.inject({
      method: "GET",
      url: "/auth/microsoft/callback?code=code&state=microsoft_state",
    });
    expect(rejected.headers.location).toContain("outlook_error=invalid_state");
    expect(mockedHandleMicrosoftCallback).not.toHaveBeenCalled();
  });
});

describe("GET /calendars", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedisClient.del.mockResolvedValue(1);
    mockedBusinessUpdate.mockResolvedValue({} as any);
    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(calendarRoutes);
  });

  it("devuelve el proveedor, el calendario elegido (sin default) y la lista", async () => {
    mockedBusinessFindUnique.mockResolvedValue(filaGoogleConectada() as any);
    mockedListarCalendarios.mockResolvedValue([
      { id: "primary", name: "Principal", primary: true },
    ]);

    const response = await fastify.inject({ method: "GET", url: "/calendars" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      provider: "google",
      selectedCalendarId: null,
      calendars: [{ id: "primary", name: "Principal", primary: true }],
    });
    expect(mockedListarCalendarios).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        credentials: { provider: "google", refreshToken: "google_refresh_token" },
      })
    );
  });

  it("responde 409 si el proveedor activo no está confirmado como conectado", async () => {
    mockedBusinessFindUnique.mockResolvedValue(
      filaGoogleConectada({ connected: false }) as any
    );

    const response = await fastify.inject({ method: "GET", url: "/calendars" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
      error: "Google Calendar is not connected",
    });
    expect(mockedListarCalendarios).not.toHaveBeenCalled();
  });

  it("ante reconexión requerida marca desconectado en modo panel (conserva el token), invalida la caché de voz y responde 409", async () => {
    mockedBusinessFindUnique.mockResolvedValue(filaGoogleConectada() as any);
    // Objeto plano con name/code: las rutas discriminan por duck typing, no
    // por instanceof.
    mockedListarCalendarios.mockRejectedValue(
      Object.assign(new Error("x"), {
        name: "CalendarBusinessError",
        code: "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
      })
    );

    const response = await fastify.inject({ method: "GET", url: "/calendars" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
      error: "x",
    });
    expect(mockedBusinessUpdate).toHaveBeenCalledTimes(1);
    const { where, data } = mockedBusinessUpdate.mock.calls[0][0] as any;
    expect(where).toEqual({ id: "biz_1" });
    // Modo "panel": desconectada con el motivo, pero SIN tocar las
    // credenciales (ni en la fila ni en el espejo de Business).
    expect(data).toEqual(
      expect.objectContaining({
        googleCalendarConnected: false,
        googleCalendarLastError: "x",
        googleCalendarDisconnectedAt: expect.any(Date),
        calendarConnections: {
          updateMany: {
            where: { provider: "google" },
            data: {
              connected: false,
              disconnectedAt: expect.any(Date),
              lastError: "x",
            },
          },
        },
      })
    );
    expect(data).not.toHaveProperty("googleRefreshToken");
    expect(mockRedisClient.del).toHaveBeenCalledWith("voice_config:biz_1");
  });

  it("responde 502 ante cualquier otro CalendarBusinessError sin tocar la conexión", async () => {
    mockedBusinessFindUnique.mockResolvedValue(filaGoogleConectada() as any);
    mockedListarCalendarios.mockRejectedValue(
      Object.assign(new Error("No se pudo obtener la lista de calendarios."), {
        name: "CalendarBusinessError",
        code: "BOOK_APPOINTMENT_FAILED",
      })
    );

    const response = await fastify.inject({ method: "GET", url: "/calendars" });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      code: "BOOK_APPOINTMENT_FAILED",
      error: "No se pudo obtener la lista de calendarios.",
    });
    expect(mockedBusinessUpdate).not.toHaveBeenCalled();
    expect(mockRedisClient.del).not.toHaveBeenCalled();
  });
});
