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
  refreshMicrosoftAccessToken: vi.fn(),
}));

const mockedAgentFindMany = vi.mocked(prisma.agent.findMany);
const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedBusinessUpdate = vi.mocked(prisma.business.update);
const mockedVapiGetAssistant = vi.mocked(vapiAdapter.getAssistant);
const mockedVapiUpdateAssistant = vi.mocked(vapiAdapter.updateAssistant);
const mockedRetellUpdateLlm = vi.mocked(retellAdapter.updateLlm);
const mockedGetPublicWebhookBaseUrl = vi.mocked(getPublicWebhookBaseUrl);
const mockedGoogleCalendar = vi.mocked(google.calendar);

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
});

describe("CalendarService.selectGoogleCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("guarda el calendario elegido y marca la conexión como activa", async () => {
    mockedBusinessUpdate.mockResolvedValue({ id: "business_123" } as any);

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
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: "check_business_hours",
            url: "https://example.com/webhooks/retell/tools/retell_agent_456/check_business_hours",
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
