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
  prisma: {
    business: { findUnique: vi.fn(), update: vi.fn() },
    calendarConnection: { updateMany: vi.fn() },
  },
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
    conectarConCredenciales: vi.fn(),
  },
}));

const mockedGetAuthUrl = vi.mocked(calendarService.getAuthUrl);
const mockedGetMicrosoftAuthUrl = vi.mocked(
  calendarService.getMicrosoftAuthUrl
);
const mockedHandleCallback = vi.mocked(calendarService.handleCallback);
const mockedHandleMicrosoftCallback = vi.mocked(
  calendarService.handleMicrosoftCallback
);
const mockedListarCalendarios = vi.mocked(calendarService.listarCalendarios);
const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedBusinessUpdate = vi.mocked(prisma.business.update);
const mockedConnectionUpdateMany = vi.mocked(
  prisma.calendarConnection.updateMany
);

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
    mockedGetAuthUrl.mockResolvedValue(
      "https://accounts.google.com/o/oauth2?state=google_state"
    );

    const start = await fastify.inject({ method: "GET", url: "/auth/google" });
    expect(start.statusCode).toBe(200);
    expect(start.headers["set-cookie"]).toContain(
      "alhabla_google_calendar_oauth_state=google_state"
    );

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
    mockedGetMicrosoftAuthUrl.mockResolvedValue(
      "https://login.microsoftonline.com/common?state=microsoft_state"
    );
    mockedHandleMicrosoftCallback.mockResolvedValue({ calendars: [] } as any);

    const start = await fastify.inject({
      method: "GET",
      url: "/auth/microsoft",
    });
    expect(start.headers["set-cookie"]).toContain(
      "alhabla_microsoft_calendar_oauth_state=microsoft_state"
    );

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
        credentials: {
          provider: "google",
          refreshToken: "google_refresh_token",
        },
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
    // Modo "panel": desconectada con el motivo, pero SIN tocar las
    // credenciales de la fila.
    expect(mockedConnectionUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockedConnectionUpdateMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1", provider: "google" },
      data: {
        connected: false,
        disconnectedAt: expect.any(Date),
        lastError: "x",
      },
    });
    expect(mockedBusinessUpdate).not.toHaveBeenCalled();
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

describe("POST /auth/caldav/connect (alta de Apple/iCloud)", () => {
  let fastify: ReturnType<typeof Fastify>;
  const mockedConectar = vi.mocked(calendarService.conectarConCredenciales);

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(calendarRoutes);
  });

  it("valida contra el servidor, guarda y devuelve la lista de calendarios (iCloud por defecto)", async () => {
    mockedConectar.mockResolvedValue({
      calendars: [
        { id: "https://p01/cal/abc/", name: "Peluquería", primary: false },
      ],
      email: "pelu@icloud.com",
    });

    const response = await fastify.inject({
      method: "POST",
      url: "/auth/caldav/connect",
      payload: {
        username: " pelu@icloud.com ",
        appPassword: "abcd-efgh-ijkl-mnop",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      calendars: [
        { id: "https://p01/cal/abc/", name: "Peluquería", primary: false },
      ],
      email: "pelu@icloud.com",
    });
    // Siempre el businessId del JWT, nunca del body; serverUrl por defecto iCloud.
    expect(mockedConectar).toHaveBeenCalledWith("biz_1", {
      provider: "caldav",
      serverUrl: "https://caldav.icloud.com",
      username: "pelu@icloud.com",
      appPassword: "abcd-efgh-ijkl-mnop",
    });
  });

  it("admite otro servidor CalDAV por serverUrl", async () => {
    mockedConectar.mockResolvedValue({
      calendars: [],
      email: "u@fastmail.com",
    });
    await fastify.inject({
      method: "POST",
      url: "/auth/caldav/connect",
      payload: {
        username: "u@fastmail.com",
        appPassword: "x",
        serverUrl: "https://caldav.fastmail.com/",
      },
    });
    expect(mockedConectar.mock.calls[0][1]).toMatchObject({
      serverUrl: "https://caldav.fastmail.com/",
    });
  });

  it("400 con mensaje hablable si el servidor rechaza las credenciales (no marca nada como desconectado)", async () => {
    mockedConectar.mockRejectedValue(
      Object.assign(new Error("rechazado"), {
        name: "CalendarBusinessError",
        code: "CALDAV_CALENDAR_RECONNECT_REQUIRED",
      })
    );

    const response = await fastify.inject({
      method: "POST",
      url: "/auth/caldav/connect",
      payload: { username: "pelu@icloud.com", appPassword: "mala" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "CALDAV_INVALID_CREDENTIALS",
    });
    expect(response.json().error).toContain("contraseña de aplicación");
    expect(mockedBusinessUpdate).not.toHaveBeenCalled();
    expect(
      vi.mocked(prisma.calendarConnection.updateMany)
    ).not.toHaveBeenCalled();
  });

  it("400 de validación si faltan campos o la URL no es válida", async () => {
    let response = await fastify.inject({
      method: "POST",
      url: "/auth/caldav/connect",
      payload: { username: "pelu@icloud.com" },
    });
    expect(response.statusCode).toBe(400);
    response = await fastify.inject({
      method: "POST",
      url: "/auth/caldav/connect",
      payload: { username: "u", appPassword: "p", serverUrl: "no-es-url" },
    });
    expect(response.statusCode).toBe(400);
    expect(mockedConectar).not.toHaveBeenCalled();
  });

  it("502 ante otro CalendarBusinessError (servidor caído) y 500 ante un error inesperado", async () => {
    mockedConectar.mockRejectedValue(
      Object.assign(new Error("tarda"), {
        name: "CalendarBusinessError",
        code: "CALENDAR_TIMEOUT",
      })
    );
    let response = await fastify.inject({
      method: "POST",
      url: "/auth/caldav/connect",
      payload: { username: "u", appPassword: "p" },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      code: "CALENDAR_TIMEOUT",
      error: "tarda",
    });

    mockedConectar.mockRejectedValue(new Error("boom"));
    response = await fastify.inject({
      method: "POST",
      url: "/auth/caldav/connect",
      payload: { username: "u", appPassword: "p" },
    });
    expect(response.statusCode).toBe(500);
    expect(JSON.stringify(response.json())).not.toContain("boom");
  });
});
