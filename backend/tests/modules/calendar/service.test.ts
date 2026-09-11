import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  calendarService,
  isGoogleInvalidGrantError,
  CalendarBusinessError,
} from "../../../src/modules/calendar/service.js";
import { prisma } from "../../../src/lib/prisma.js";
import { vapiAdapter } from "../../../src/adapters/vapi/VapiAdapter.js";
import { retellAdapter } from "../../../src/adapters/retell/RetellAdapter.js";
import { getPublicWebhookBaseUrl } from "../../../src/lib/serverUrl.js";
import { getRedis } from "../../../src/lib/redis.js";
import { google } from "googleapis";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    agent: {
      findMany: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../../src/adapters/vapi/VapiAdapter.js", () => ({
  vapiAdapter: {
    getAssistant: vi.fn(),
    updateAssistant: vi.fn(),
  },
}));

vi.mock("../../../src/adapters/retell/RetellAdapter.js", () => ({
  retellAdapter: {
    updateLlm: vi.fn(),
    getAgent: vi.fn(),
    createAgentVersion: vi.fn(),
    publishAgent: vi.fn(),
  },
}));

vi.mock("../../../src/lib/serverUrl.js", () => ({
  getPublicWebhookBaseUrl: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn(function OAuth2ClientMock() {
        return {
          setCredentials: vi.fn(),
          generateAuthUrl: vi.fn().mockReturnValue("https://accounts.google.com/o/oauth2/mock"),
          getToken: vi.fn().mockResolvedValue({ tokens: { refresh_token: "mock-refresh-token" } }),
        };
      }),
    },
    calendar: vi.fn().mockReturnValue({
      events: {
        insert: vi.fn(),
        list: vi.fn(),
      },
      calendarList: {
        list: vi.fn(),
      },
      freebusy: {
        query: vi.fn(),
      },
    }),
  },
}));

vi.mock("../../../src/lib/microsoftGraph.js", () => ({
  createMicrosoftCalendarEvent: vi.fn(),
  exchangeMicrosoftCode: vi.fn(),
  getMicrosoftAuthUrl: vi.fn(),
  getMicrosoftProfile: vi.fn(),
  listMicrosoftCalendars: vi.fn(),
  listMicrosoftUpcomingEvents: vi.fn(),
  listMicrosoftBusyIntervals: vi.fn(),
  refreshMicrosoftAccessToken: vi.fn(),
}));

vi.mock("../../../src/lib/redis.js", () => ({
  getRedis: vi.fn(),
}));

const mockedAgentFindMany = vi.mocked(prisma.agent.findMany);
const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedBusinessUpdate = vi.mocked(prisma.business.update);
const mockedVapiGetAssistant = vi.mocked(vapiAdapter.getAssistant);
const mockedVapiUpdateAssistant = vi.mocked(vapiAdapter.updateAssistant);
const mockedRetellUpdateLlm = vi.mocked(retellAdapter.updateLlm);
const mockedRetellGetAgent = vi.mocked(retellAdapter.getAgent);
const mockedRetellCreateAgentVersion = vi.mocked(
  retellAdapter.createAgentVersion
);
const mockedRetellPublishAgent = vi.mocked(retellAdapter.publishAgent);
const mockedGetPublicWebhookBaseUrl = vi.mocked(getPublicWebhookBaseUrl);
const mockedGoogleCalendar = vi.mocked(google.calendar);
const mockedGetRedis = vi.mocked(getRedis);

describe("isGoogleInvalidGrantError", () => {
  it("detecta invalid_grant en el mensaje del error", () => {
    expect(isGoogleInvalidGrantError(new Error("invalid_grant"))).toBe(true);
  });

  it("detecta invalid_grant en la respuesta de Google", () => {
    const error = {
      response: {
        status: 400,
        data: { error: "invalid_grant" },
      },
    };
    expect(isGoogleInvalidGrantError(error)).toBe(true);
  });

  it("rechaza errores no relacionados con invalid_grant", () => {
    expect(isGoogleInvalidGrantError(new Error("network error"))).toBe(false);
  });
});

describe("CalendarService.bookAppointment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = "client_id";
    process.env.GOOGLE_CLIENT_SECRET = "client_secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost/callback";
  });

  it("crea un evento en Google Calendar", async () => {
    const insertMock = vi.fn().mockResolvedValue({
      data: { id: "event_123", htmlLink: "https://calendar.google.com/event/1" },
    });
    mockedGoogleCalendar.mockReturnValue({
      events: { insert: insertMock, list: vi.fn() },
    } as any);

    const result = await calendarService.bookAppointment({
      clientName: "María",
      startDateTime: "2026-08-10T10:00:00Z",
      durationMinutes: 60,
      clientEmail: "maria@example.com",
      provider: "google",
      googleRefreshToken: "refresh_token_123",
      googleCalendarId: "primary",
    });

    expect(result.htmlLink).toBe("https://calendar.google.com/event/1");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "primary",
        requestBody: expect.objectContaining({
          summary: "Reserva de María",
          attendees: [{ email: "maria@example.com" }],
        }),
      }),
      expect.objectContaining({ timeout: expect.any(Number) })
    );
  });

  it("usa un ID estable y recupera el evento si el primer intento ya lo creó", async () => {
    const insertMock = vi.fn().mockRejectedValue({ code: 409 });
    const getMock = vi.fn().mockResolvedValue({
      data: { id: "existing-event", htmlLink: "https://calendar.google.com/event/existing" },
    });
    mockedGoogleCalendar.mockReturnValue({
      events: { insert: insertMock, get: getMock, list: vi.fn() },
    } as any);

    const result = await calendarService.bookAppointment({
      clientName: "María",
      startDateTime: "2026-08-10T10:00:00Z",
      durationMinutes: 60,
      provider: "google",
      googleRefreshToken: "refresh_token_123",
      googleCalendarId: "primary",
      idempotencyKey: "call_123:2026-08-10T10:00:00Z:60",
    });

    expect(result).toEqual({
      id: "existing-event",
      htmlLink: "https://calendar.google.com/event/existing",
    });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ id: expect.stringMatching(/^alhabla[0-9a-f]{64}$/) }),
      }),
      expect.anything(),
    );
    expect(getMock).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "primary",
        eventId: expect.stringMatching(/^alhabla[0-9a-f]{64}$/),
      }),
    );
  });

  it("enriquece título, descripción y recordatorio del evento de Google con servicio, profesional y teléfono", async () => {
    // Reloj fijo 1h antes de la cita: el recordatorio "inmediato" calculado
    // (minutos hasta la cita, truncados) da un valor determinista (60) en
    // vez de depender de cuándo se ejecute el test.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T09:00:00Z"));

    const insertMock = vi.fn().mockResolvedValue({
      data: { id: "event_123", htmlLink: "https://calendar.google.com/event/1" },
    });
    mockedGoogleCalendar.mockReturnValue({
      events: { insert: insertMock, list: vi.fn() },
    } as any);

    try {
      await calendarService.bookAppointment({
        clientName: "María",
        clientPhone: "+34600123456",
        serviceNames: ["Corte", "Tratamiento capilar"],
        professionalName: "Montse",
        startDateTime: "2026-08-10T10:00:00Z",
        durationMinutes: 60,
        provider: "google",
        googleRefreshToken: "refresh_token_123",
        googleCalendarId: "primary",
      });

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            summary: "Corte + Tratamiento capilar — María",
            description: [
              "Cliente: María",
              "Teléfono: +34600123456",
              "Servicios: Corte, Tratamiento capilar",
              "Profesional: Montse",
              "",
              "Cita generada por el asistente virtual de Alhabla.",
            ].join("\n"),
            reminders: {
              useDefault: false,
              overrides: [
                { method: "popup", minutes: 60 },
                { method: "popup", minutes: 120 },
              ],
            },
          }),
        }),
        expect.objectContaining({ timeout: expect.any(Number) })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("lanza GOOGLE_CALENDAR_RECONNECT_REQUIRED si no hay refresh token", async () => {
    await expect(
      calendarService.bookAppointment({
        clientName: "María",
        startDateTime: "2026-08-10T10:00:00Z",
        durationMinutes: 60,
        provider: "google",
      })
    ).rejects.toThrow(CalendarBusinessError);

    try {
      await calendarService.bookAppointment({
        clientName: "María",
        startDateTime: "2026-08-10T10:00:00Z",
        durationMinutes: 60,
        provider: "google",
      });
    } catch (error) {
      expect((error as CalendarBusinessError).code).toBe("GOOGLE_CALENDAR_RECONNECT_REQUIRED");
    }
  });

  it("lanza GOOGLE_CALENDAR_RECONNECT_REQUIRED ante invalid_grant", async () => {
    mockedGoogleCalendar.mockReturnValue({
      events: {
        insert: vi.fn().mockRejectedValue(new Error("invalid_grant")),
        list: vi.fn(),
      },
    } as any);

    await expect(
      calendarService.bookAppointment({
        clientName: "María",
        startDateTime: "2026-08-10T10:00:00Z",
        durationMinutes: 60,
        provider: "google",
        googleRefreshToken: "refresh_token_123",
      })
    ).rejects.toThrow(CalendarBusinessError);
  });

  it("lanza BOOK_APPOINTMENT_FAILED ante errores de Google", async () => {
    mockedGoogleCalendar.mockReturnValue({
      events: {
        insert: vi.fn().mockRejectedValue(new Error("Google Calendar API error")),
        list: vi.fn(),
      },
    } as any);

    await expect(
      calendarService.bookAppointment({
        clientName: "María",
        startDateTime: "2026-08-10T10:00:00Z",
        durationMinutes: 60,
        provider: "google",
        googleRefreshToken: "refresh_token_123",
      })
    ).rejects.toThrow(CalendarBusinessError);

    try {
      await calendarService.bookAppointment({
        clientName: "María",
        startDateTime: "2026-08-10T10:00:00Z",
        durationMinutes: 60,
        provider: "google",
        googleRefreshToken: "refresh_token_123",
      });
    } catch (error) {
      expect((error as CalendarBusinessError).code).toBe("BOOK_APPOINTMENT_FAILED");
    }
  });

  it("enriquece asunto, descripción y recordatorio del evento de Outlook con servicio, profesional y teléfono", async () => {
    // Reloj fijo 1h antes de la cita, igual que en el test de Google: hace
    // determinista el recordatorio "inmediato" calculado (60 en vez de 120,
    // ya que Outlook solo admite un valor y se prioriza el aviso inmediato).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T09:00:00Z"));

    const { createMicrosoftCalendarEvent, refreshMicrosoftAccessToken } = await import(
      "../../../src/lib/microsoftGraph.js"
    );
    vi.mocked(refreshMicrosoftAccessToken).mockResolvedValue({
      access_token: "access_token_123",
    } as any);
    vi.mocked(createMicrosoftCalendarEvent).mockResolvedValue({ id: "event_123" } as any);

    try {
      await calendarService.bookAppointment({
        clientName: "María",
        clientPhone: "+34600123456",
        serviceNames: ["Corte", "Tratamiento capilar"],
        professionalName: "Montse",
        startDateTime: "2026-08-10T10:00:00Z",
        durationMinutes: 60,
        provider: "outlook",
        outlookRefreshToken: "refresh_token_123",
        outlookCalendarId: "calendar_123",
      });

      expect(createMicrosoftCalendarEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Corte + Tratamiento capilar — María",
          description: [
            "Cliente: María",
            "Teléfono: +34600123456",
            "Servicios: Corte, Tratamiento capilar",
            "Profesional: Montse",
            "",
            "Cita generada por el asistente virtual de Alhabla.",
          ].join("\n"),
          reminderMinutesBeforeStart: 60,
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("el recordatorio inmediato nunca es negativo si la cita está a menos de 1 minuto o ya pasó", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T10:00:00Z"));

    const insertMock = vi.fn().mockResolvedValue({
      data: { id: "event_123", htmlLink: "https://calendar.google.com/event/1" },
    });
    mockedGoogleCalendar.mockReturnValue({
      events: { insert: insertMock, list: vi.fn() },
    } as any);

    try {
      // startDateTime igual al "ahora" fijado: 0 minutos hasta la cita.
      await calendarService.bookAppointment({
        clientName: "María",
        startDateTime: "2026-08-10T10:00:00Z",
        durationMinutes: 60,
        provider: "google",
        googleRefreshToken: "refresh_token_123",
        googleCalendarId: "primary",
      });

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            reminders: expect.objectContaining({
              overrides: expect.arrayContaining([{ method: "popup", minutes: 0 }]),
            }),
          }),
        }),
        expect.objectContaining({ timeout: expect.any(Number) })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("omite el recordatorio inmediato en Google (en vez de fallar la reserva) si la cita está a más de 4 semanas vista", async () => {
    // Nada en el código impone un máximo de antelación de reserva — sin
    // este tope, el "minutos antes" calculado superaría el límite de la API
    // de Google (40320) y la reserva entera fallaría.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T09:00:00Z"));

    const insertMock = vi.fn().mockResolvedValue({
      data: { id: "event_123", htmlLink: "https://calendar.google.com/event/1" },
    });
    mockedGoogleCalendar.mockReturnValue({
      events: { insert: insertMock, list: vi.fn() },
    } as any);

    try {
      await calendarService.bookAppointment({
        clientName: "María",
        startDateTime: "2026-10-01T10:00:00Z", // >4 semanas después del "ahora" fijado
        durationMinutes: 60,
        provider: "google",
        googleRefreshToken: "refresh_token_123",
        googleCalendarId: "primary",
      });

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            reminders: {
              useDefault: false,
              overrides: [{ method: "popup", minutes: 120 }],
            },
          }),
        }),
        expect.objectContaining({ timeout: expect.any(Number) })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("cae al recordatorio de 2h en Outlook si la cita está a más de 4 semanas vista para el aviso inmediato", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T09:00:00Z"));

    const { createMicrosoftCalendarEvent, refreshMicrosoftAccessToken } = await import(
      "../../../src/lib/microsoftGraph.js"
    );
    vi.mocked(refreshMicrosoftAccessToken).mockResolvedValue({
      access_token: "access_token_123",
    } as any);
    vi.mocked(createMicrosoftCalendarEvent).mockResolvedValue({ id: "event_123" } as any);

    try {
      await calendarService.bookAppointment({
        clientName: "María",
        startDateTime: "2026-10-01T10:00:00Z",
        durationMinutes: 60,
        provider: "outlook",
        outlookRefreshToken: "refresh_token_123",
        outlookCalendarId: "calendar_123",
      });

      expect(createMicrosoftCalendarEvent).toHaveBeenCalledWith(
        expect.objectContaining({ reminderMinutesBeforeStart: 120 })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconoce un invalid_grant real de Microsoft (400, no 401/403) como OUTLOOK_CALENDAR_RECONNECT_REQUIRED (hallazgo #22 de la auditoría)", async () => {
    const { refreshMicrosoftAccessToken } = await import("../../../src/lib/microsoftGraph.js");
    // Así es como microsoftGraph.ts construye el error real (createMicrosoftOAuthError):
    // sin "401" ni "403" en ningún sitio del mensaje.
    const invalidGrantError = Object.assign(
      new Error("Microsoft token refresh failed: 400 | invalid_grant | AADSTS700082"),
      { status: 400, oauthErrorCode: "invalid_grant" }
    );
    vi.mocked(refreshMicrosoftAccessToken).mockRejectedValue(invalidGrantError);

    try {
      await calendarService.bookAppointment({
        clientName: "María",
        startDateTime: "2026-08-10T10:00:00Z",
        durationMinutes: 60,
        provider: "outlook",
        outlookRefreshToken: "refresh_token_123",
        outlookCalendarId: "calendar_123",
      });
      expect.fail("debía lanzar");
    } catch (error) {
      expect((error as CalendarBusinessError).code).toBe("OUTLOOK_CALENDAR_RECONNECT_REQUIRED");
    }
  });

  it("no marca la conexión como rota ante un 429 al crear el evento — lanza CALENDAR_RATE_LIMITED", async () => {
    const { createMicrosoftCalendarEvent, refreshMicrosoftAccessToken } = await import(
      "../../../src/lib/microsoftGraph.js"
    );
    vi.mocked(refreshMicrosoftAccessToken).mockResolvedValue({ access_token: "access_123" } as any);
    const rateLimitError = Object.assign(new Error("Microsoft Graph request failed: 429"), { status: 429 });
    vi.mocked(createMicrosoftCalendarEvent).mockRejectedValue(rateLimitError);

    try {
      await calendarService.bookAppointment({
        clientName: "María",
        startDateTime: "2026-08-10T10:00:00Z",
        durationMinutes: 60,
        provider: "outlook",
        outlookRefreshToken: "refresh_token_123",
        outlookCalendarId: "calendar_123",
      });
      expect.fail("debía lanzar");
    } catch (error) {
      expect((error as CalendarBusinessError).code).toBe("CALENDAR_RATE_LIMITED");
    }
  });
});

describe("CalendarService.getUpcomingEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = "client_id";
    process.env.GOOGLE_CLIENT_SECRET = "client_secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost/callback";
  });

  it("devuelve eventos próximos de Google Calendar", async () => {
    mockedGoogleCalendar.mockReturnValue({
      events: {
        list: vi.fn().mockResolvedValue({
          data: {
            items: [
              {
                id: "evt_1",
                summary: "Cita 1",
                start: { dateTime: "2026-08-10T10:00:00Z" },
                end: { dateTime: "2026-08-10T11:00:00Z" },
                htmlLink: "https://calendar.google.com/event/1",
              },
            ],
          },
        }),
        insert: vi.fn(),
      },
    } as any);

    const events = await calendarService.getUpcomingEvents("google", {
      googleRefreshToken: "refresh_token_123",
      googleCalendarId: "primary",
    });

    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe("Cita 1");
  });

  it("lanza GOOGLE_CALENDAR_RECONNECT_REQUIRED si falta refresh token", async () => {
    await expect(
      calendarService.getUpcomingEvents("google", {})
    ).rejects.toThrow(CalendarBusinessError);
  });
});

describe("CalendarService.listGoogleCalendars", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = "client_id";
    process.env.GOOGLE_CLIENT_SECRET = "client_secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost/callback";
  });

  it("devuelve los calendarios de la cuenta con su nombre y marca de principal", async () => {
    const listMock = vi.fn().mockResolvedValue({
      data: {
        items: [
          { id: "primary_id", summary: "María", primary: true },
          { id: "secundario_id", summary: "Reservas", summaryOverride: "Reservas peluquería" },
        ],
      },
    });
    mockedGoogleCalendar.mockReturnValue({
      events: { insert: vi.fn(), list: vi.fn() },
      calendarList: { list: listMock },
    } as any);

    const calendars = await calendarService.listGoogleCalendars("refresh_token_123");

    expect(calendars).toEqual([
      { id: "primary_id", name: "María", primary: true },
      { id: "secundario_id", name: "Reservas peluquería", primary: false },
    ]);
    expect(listMock).toHaveBeenCalledOnce();
  });

  it("lanza GOOGLE_CALENDAR_RECONNECT_REQUIRED ante invalid_grant", async () => {
    mockedGoogleCalendar.mockReturnValue({
      events: { insert: vi.fn(), list: vi.fn() },
      calendarList: { list: vi.fn().mockRejectedValue(new Error("invalid_grant")) },
    } as any);

    await expect(
      calendarService.listGoogleCalendars("refresh_token_123")
    ).rejects.toThrow(CalendarBusinessError);

    try {
      await calendarService.listGoogleCalendars("refresh_token_123");
    } catch (error) {
      expect((error as CalendarBusinessError).code).toBe("GOOGLE_CALENDAR_RECONNECT_REQUIRED");
    }
  });
});

describe("CalendarService.listOutlookCalendars", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve los calendarios de Outlook normalizados", async () => {
    const { refreshMicrosoftAccessToken, listMicrosoftCalendars } = await import("../../../src/lib/microsoftGraph.js");
    vi.mocked(refreshMicrosoftAccessToken).mockResolvedValue({ access_token: "access_123" } as any);
    vi.mocked(listMicrosoftCalendars).mockResolvedValue([
      { id: "cal_1", name: "Calendario", canEdit: true, canShare: false, ownerEmail: "a@b.c" },
    ] as any);

    const calendars = await calendarService.listOutlookCalendars("refresh_token_123");

    expect(calendars).toEqual([{ id: "cal_1", name: "Calendario", primary: false }]);
  });

  it("lanza OUTLOOK_CALENDAR_RECONNECT_REQUIRED si el refresh falla", async () => {
    const { refreshMicrosoftAccessToken } = await import("../../../src/lib/microsoftGraph.js");
    vi.mocked(refreshMicrosoftAccessToken).mockRejectedValue(new Error("invalid_grant"));

    await expect(
      calendarService.listOutlookCalendars("refresh_token_123")
    ).rejects.toThrow(CalendarBusinessError);

    try {
      await calendarService.listOutlookCalendars("refresh_token_123");
    } catch (error) {
      expect((error as CalendarBusinessError).code).toBe("OUTLOOK_CALENDAR_RECONNECT_REQUIRED");
    }
  });

  it("no marca la conexión como rota ante un 429 de Graph — lanza CALENDAR_RATE_LIMITED (hallazgo #21 de la auditoría)", async () => {
    const { refreshMicrosoftAccessToken, listMicrosoftCalendars } = await import("../../../src/lib/microsoftGraph.js");
    vi.mocked(refreshMicrosoftAccessToken).mockResolvedValue({ access_token: "access_123" } as any);
    const rateLimitError = Object.assign(new Error("Microsoft Graph request failed: 429"), { status: 429 });
    vi.mocked(listMicrosoftCalendars).mockRejectedValue(rateLimitError);

    try {
      await calendarService.listOutlookCalendars("refresh_token_123");
      expect.fail("debía lanzar");
    } catch (error) {
      expect((error as CalendarBusinessError).code).toBe("CALENDAR_RATE_LIMITED");
    }
  });

  it("no marca la conexión como rota ante un 500 transitorio de Graph — lanza CALENDAR_TIMEOUT", async () => {
    const { refreshMicrosoftAccessToken, listMicrosoftCalendars } = await import("../../../src/lib/microsoftGraph.js");
    vi.mocked(refreshMicrosoftAccessToken).mockResolvedValue({ access_token: "access_123" } as any);
    const serverError = Object.assign(new Error("Microsoft Graph request failed: 503"), { status: 503 });
    vi.mocked(listMicrosoftCalendars).mockRejectedValue(serverError);

    try {
      await calendarService.listOutlookCalendars("refresh_token_123");
      expect.fail("debía lanzar");
    } catch (error) {
      expect((error as CalendarBusinessError).code).toBe("CALENDAR_TIMEOUT");
    }
  });
});

describe("CalendarService.getBusyIntervals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Google: consulta eventos ocupados con IDs y devuelve los bloques como Date", async () => {
    const timeMin = new Date("2026-08-10T09:00:00+02:00");
    const timeMax = new Date("2026-08-10T14:00:00+02:00");
    const listMock = vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: "calendar-event-1",
            start: { dateTime: "2026-08-10T10:00:00+02:00" },
            end: { dateTime: "2026-08-10T10:30:00+02:00" },
          },
        ],
      },
    });
    mockedGoogleCalendar.mockReturnValue({
      events: { insert: vi.fn(), list: listMock },
      calendarList: { list: vi.fn() },
    } as any);

    const busy = await calendarService.getBusyIntervals({
      provider: "google",
      googleRefreshToken: "refresh_token_123",
      googleCalendarId: null,
      timeMin,
      timeMax,
    });

    expect(busy).toEqual({
      calendarAvailabilityKnown: true,
      intervals: [{
        externalEventId: "calendar-event-1",
        start: new Date("2026-08-10T10:00:00+02:00"),
        end: new Date("2026-08-10T10:30:00+02:00"),
      }],
    });
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "primary",
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
      }),
      expect.anything()
    );
  });

  it("Google: se degrada sin reconciliar contra vacío si listar eventos falla", async () => {
    mockedGoogleCalendar.mockReturnValue({
      events: { insert: vi.fn(), list: vi.fn().mockRejectedValue(new Error("ETIMEDOUT")) },
      calendarList: { list: vi.fn() },
    } as any);

    const busy = await calendarService.getBusyIntervals({
      provider: "google",
      googleRefreshToken: "refresh_token_123",
      googleCalendarId: null,
      timeMin: new Date(),
      timeMax: new Date(),
    });

    expect(busy).toEqual({ intervals: [], calendarAvailabilityKnown: false });
  });

  it("Google: devuelve [] sin llamar a la API si el negocio no tiene refresh token", async () => {
    const busy = await calendarService.getBusyIntervals({
      provider: "google",
      googleRefreshToken: null,
      googleCalendarId: null,
      timeMin: new Date(),
      timeMax: new Date(),
    });

    expect(busy).toEqual({ intervals: [], calendarAvailabilityKnown: false });
  });

  it("Outlook: consulta listMicrosoftBusyIntervals con el access token renovado", async () => {
    const { refreshMicrosoftAccessToken, listMicrosoftBusyIntervals } = await import("../../../src/lib/microsoftGraph.js");
    vi.mocked(refreshMicrosoftAccessToken).mockResolvedValue({ access_token: "access_123" } as any);
    const busyResult = [{ start: new Date("2026-08-10T10:00:00Z"), end: new Date("2026-08-10T10:30:00Z") }];
    vi.mocked(listMicrosoftBusyIntervals).mockResolvedValue(busyResult);

    const timeMin = new Date("2026-08-10T09:00:00Z");
    const timeMax = new Date("2026-08-10T14:00:00Z");
    const busy = await calendarService.getBusyIntervals({
      provider: "outlook",
      outlookRefreshToken: "refresh_token_123",
      outlookCalendarId: "calendar_1",
      timeMin,
      timeMax,
    });

    expect(busy).toEqual({ intervals: busyResult, calendarAvailabilityKnown: true });
    expect(vi.mocked(listMicrosoftBusyIntervals)).toHaveBeenCalledWith("access_123", "calendar_1", timeMin, timeMax);
  });

  it("Outlook: devuelve [] sin llamar a Graph si no hay calendario conectado", async () => {
    const busy = await calendarService.getBusyIntervals({
      provider: "outlook",
      outlookRefreshToken: null,
      outlookCalendarId: null,
      timeMin: new Date(),
      timeMax: new Date(),
    });

    expect(busy).toEqual({ intervals: [], calendarAvailabilityKnown: false });
  });

  it("Outlook: se degrada a [] (nunca lanza) si la renovación del token falla", async () => {
    const { refreshMicrosoftAccessToken } = await import("../../../src/lib/microsoftGraph.js");
    vi.mocked(refreshMicrosoftAccessToken).mockRejectedValue(new Error("invalid_grant"));

    const busy = await calendarService.getBusyIntervals({
      provider: "outlook",
      outlookRefreshToken: "refresh_token_123",
      outlookCalendarId: "calendar_1",
      timeMin: new Date(),
      timeMax: new Date(),
    });

    expect(busy).toEqual({ intervals: [], calendarAvailabilityKnown: false });
  });
});

describe("CalendarService.selectGoogleCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("guarda el calendario elegido, marca la conexión como activa e invalida la caché de voz (hallazgo #8)", async () => {
    mockedBusinessUpdate.mockResolvedValue({ id: "business_123" } as any);
    const del = vi.fn().mockResolvedValue(1);
    mockedGetRedis.mockReturnValue({ del } as any);

    await calendarService.selectGoogleCalendar("business_123", "secundario_id");

    expect(mockedBusinessUpdate).toHaveBeenCalledWith({
      where: { id: "business_123" },
      data: {
        calendarProvider: "google",
        googleCalendarId: "secundario_id",
        googleCalendarConnected: true,
        googleCalendarDisconnectedAt: null,
        googleCalendarLastError: null,
      },
    });
    // voice_config:<businessId> cachea el calendarProvider/credenciales
    // hasta 1h (voiceTools/service.ts) — sin invalidarla, una llamada de voz
    // dentro de esa hora seguiría reservando en el calendario anterior.
    expect(del).toHaveBeenCalledWith("voice_config:business_123");
  });
});

describe("CalendarService OAuth state (hijack protection)", () => {
  let redisStore: Map<string, string>;
  let del: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    redisStore = new Map();
    del = vi.fn().mockResolvedValue(1);
    mockedGetRedis.mockReturnValue({
      set: vi.fn(async (key: string, value: string) => {
        redisStore.set(key, value);
        return "OK";
      }),
      getdel: vi.fn(async (key: string) => {
        const value = redisStore.get(key) ?? null;
        redisStore.delete(key);
        return value;
      }),
      del,
    } as any);
  });

  it("getAuthUrl genera un state opaco (no el businessId en claro) y lo guarda en Redis", async () => {
    const url = await calendarService.getAuthUrl("business_victima");

    // El businessId nunca debe viajar en claro en la URL de autorización —
    // es precisamente lo que permitía sustituir el calendario de otro
    // negocio antes de este fix.
    expect(url).not.toContain("business_victima");
    expect(redisStore.size).toBe(1);
    expect([...redisStore.values()]).toEqual(["business_victima"]);
  });

  it("handleCallback rechaza un state que no existe en Redis (inventado, caducado o ya usado)", async () => {
    await expect(
      calendarService.handleCallback("some-code", "state-que-no-existe")
    ).rejects.toThrow();
    expect(mockedBusinessUpdate).not.toHaveBeenCalled();
  });

  it("handleCallback acepta un state válido, resuelve el businessId correcto y lo consume (un solo uso)", async () => {
    mockedBusinessUpdate.mockResolvedValue({ id: "business_real" } as any);
    mockedAgentFindMany.mockResolvedValue([]);

    await calendarService.getAuthUrl("business_real");
    const state = [...redisStore.keys()][0].split(":").pop()!;

    await calendarService.handleCallback("some-code", state);

    expect(mockedBusinessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "business_real" } })
    );
    // Cache de voice_config invalidada tras conectar (hallazgo #8).
    expect(del).toHaveBeenCalledWith("voice_config:business_real");

    // Un segundo intento con el mismo state ya no debe funcionar (getdel = un solo uso).
    mockedBusinessUpdate.mockClear();
    await expect(calendarService.handleCallback("some-code", state)).rejects.toThrow();
    expect(mockedBusinessUpdate).not.toHaveBeenCalled();
  });

  it("un state válido para OTRO negocio nunca conecta el calendario del negocio equivocado", async () => {
    mockedBusinessUpdate.mockResolvedValue({ id: "business_A" } as any);
    mockedAgentFindMany.mockResolvedValue([]);

    await calendarService.getAuthUrl("business_A");
    const stateForA = [...redisStore.keys()][0].split(":").pop()!;

    // Un atacante que intenta colar el state de A junto con el código de
    // otra sesión sigue resolviendo al businessId real de A (el vínculo
    // vive en Redis, no en lo que el atacante controla en la URL) — nunca a
    // un business_id arbitrario que el atacante intente pasar por su cuenta.
    await calendarService.handleCallback("attacker-code", stateForA);

    expect(mockedBusinessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "business_A" } })
    );
  });
});

describe("CalendarService.connectMicrosoftCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("guarda el calendario de Outlook elegido e invalida la caché de voz (hallazgo #8)", async () => {
    mockedBusinessUpdate.mockResolvedValue({ id: "business_123" } as any);
    mockedAgentFindMany.mockResolvedValue([]);
    const del = vi.fn().mockResolvedValue(1);
    mockedGetRedis.mockReturnValue({ del } as any);

    await calendarService.connectMicrosoftCalendar("business_123", "outlook_cal_1");

    expect(mockedBusinessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "business_123" },
        data: expect.objectContaining({ outlookCalendarId: "outlook_cal_1", outlookCalendarConnected: true }),
      })
    );
    expect(del).toHaveBeenCalledWith("voice_config:business_123");
  });
});

describe("CalendarService.syncCalendarToolsToAgents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VAPI_WEBHOOK_URL = "https://example.com/webhooks/vapi";
    mockedBusinessFindUnique.mockResolvedValue({
      id: "business_123",
      orchestrator: "vapi",
    } as any);
    mockedRetellGetAgent.mockImplementation(async (_agentId, version) => ({
      version: version ?? 3,
      is_published: true,
      response_engine: {
        type: "retell-llm",
        llm_id: "retell_llm_789",
        version: version ?? 3,
      },
    }) as any);
    mockedRetellCreateAgentVersion.mockResolvedValue({
      version: 4,
      is_published: false,
      response_engine: {
        type: "retell-llm",
        llm_id: "retell_llm_789",
        version: 4,
      },
    } as any);
    mockedRetellPublishAgent.mockResolvedValue(undefined);
  });

  it("actualiza los agentes con las herramientas de calendario", async () => {
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent_123",
        businessId: "business_123",
        vapiAssistantId: "assistant_123",
        llmProvider: "groq",
        llmModel: "openai/gpt-oss-20b",
      },
    ] as any);
    mockedVapiGetAssistant.mockResolvedValue({
      model: { tools: [] },
    } as any);
    mockedVapiUpdateAssistant.mockResolvedValue({ id: "assistant_123" } as any);

    await calendarService.syncCalendarToolsToAgents("business_123");

    expect(mockedVapiGetAssistant).toHaveBeenCalledWith("assistant_123");
    expect(mockedVapiUpdateAssistant).toHaveBeenCalledWith(
      "assistant_123",
      expect.objectContaining({
        model: expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              function: expect.objectContaining({ name: "book_appointment" }),
            }),
          ]),
        }),
      })
    );
  });

  it("no actualiza agentes sin vapiAssistantId", async () => {
    mockedAgentFindMany.mockResolvedValue([
      { id: "agent_123", businessId: "business_123", vapiAssistantId: null },
    ] as any);

    await calendarService.syncCalendarToolsToAgents("business_123");

    expect(mockedVapiGetAssistant).not.toHaveBeenCalled();
  });

  it("registra las tools de Retell con el retellAgentId en la propia URL", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: "business_123",
      orchestrator: "retell",
    } as any);
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent_123",
        businessId: "business_123",
        retellAgentId: "retell_agent_456",
        retellLlmId: "retell_llm_789",
      },
    ] as any);
    mockedGetPublicWebhookBaseUrl.mockReturnValue("https://example.com");
    mockedRetellUpdateLlm.mockResolvedValue({} as any);

    await calendarService.syncCalendarToolsToAgents("business_123");

    expect(mockedRetellUpdateLlm).toHaveBeenCalledWith(
      "retell_llm_789",
      expect.objectContaining({
        version: 4,
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: "get_catalog",
            url: "https://example.com/webhooks/retell/tools/retell_agent_456/get_catalog",
            args_at_root: false,
          }),
          expect.objectContaining({
            name: "book_appointment",
            url: "https://example.com/webhooks/retell/tools/retell_agent_456/book_appointment",
            args_at_root: false,
          }),
        ]),
      })
    );
    expect(mockedRetellCreateAgentVersion).toHaveBeenCalledWith(
      "retell_agent_456",
      3
    );
    expect(mockedRetellPublishAgent).toHaveBeenCalledWith(
      "retell_agent_456",
      4,
      "Herramientas de calendario gestionadas por Alhabla"
    );
    expect(mockedRetellGetAgent).toHaveBeenLastCalledWith(
      "retell_agent_456",
      4
    );
  });

  it("falla en modo estricto si Retell no confirma que publicó las tools", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: "business_123",
      orchestrator: "retell",
    } as any);
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent_123",
        businessId: "business_123",
        retellAgentId: "retell_agent_456",
        retellLlmId: "retell_llm_789",
      },
    ] as any);
    mockedGetPublicWebhookBaseUrl.mockReturnValue("https://example.com");
    mockedRetellUpdateLlm.mockResolvedValue({} as any);
    mockedRetellGetAgent.mockImplementation(async (_agentId, version) => ({
      version: version ?? 3,
      is_published: version === undefined,
      response_engine: {
        type: "retell-llm",
        llm_id: "retell_llm_789",
        version: version ?? 3,
      },
    }) as any);

    await expect(
      calendarService.syncCalendarToolsToAgents("business_123", { strict: true })
    ).rejects.toThrow("No se pudieron sincronizar las tools de calendario");
  });

  it("habla durante disponibilidad y reserva, sin narrar la lectura del catálogo", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: "business_123",
      orchestrator: "retell",
    } as any);
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent_123",
        businessId: "business_123",
        retellAgentId: "retell_agent_456",
        retellLlmId: "retell_llm_789",
      },
    ] as any);
    mockedGetPublicWebhookBaseUrl.mockReturnValue("https://example.com");
    mockedRetellUpdateLlm.mockResolvedValue({} as any);

    await calendarService.syncCalendarToolsToAgents("business_123");

    const [, payload] = mockedRetellUpdateLlm.mock.calls[0];
    const tools = (payload as { tools: Array<{ name: string; speak_during_execution?: boolean }> }).tools;
    expect(tools.find((t) => t.name === "get_catalog")?.speak_during_execution).toBe(false);
    expect(tools.find((t) => t.name === "check_availability")?.speak_during_execution).toBe(true);
    expect(tools.find((t) => t.name === "book_appointment")?.speak_during_execution).toBe(true);
  });

  it("no registra tools de Retell si el agente no tiene retellAgentId", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      id: "business_123",
      orchestrator: "retell",
    } as any);
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent_123",
        businessId: "business_123",
        retellAgentId: null,
        retellLlmId: "retell_llm_789",
      },
    ] as any);

    await calendarService.syncCalendarToolsToAgents("business_123");

    expect(mockedRetellUpdateLlm).not.toHaveBeenCalled();
  });
});
