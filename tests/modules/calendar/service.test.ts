import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  calendarService,
  isGoogleInvalidGrantError,
  CalendarBusinessError,
} from "../../../src/modules/calendar/service.js";
import { prisma } from "../../../src/lib/prisma.js";
import { vapiAdapter } from "../../../src/adapters/vapi/VapiAdapter.js";
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
    }),
  },
}));

const mockedAgentFindMany = vi.mocked(prisma.agent.findMany);
const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedVapiGetAssistant = vi.mocked(vapiAdapter.getAssistant);
const mockedVapiUpdateAssistant = vi.mocked(vapiAdapter.updateAssistant);
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
      })
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
});
