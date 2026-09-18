import { describe, it, expect } from "vitest";
import {
  getCalendarState,
  normalizeCalendarProvider,
  providerFromReconnectCode,
} from "@/lib/calendar-state";

describe("normalizeCalendarProvider", () => {
  it("conserva google, outlook y caldav; lo demás cae a google", () => {
    expect(normalizeCalendarProvider("caldav")).toBe("caldav");
    expect(normalizeCalendarProvider("outlook")).toBe("outlook");
    expect(normalizeCalendarProvider("google")).toBe("google");
    expect(normalizeCalendarProvider(null)).toBe("google");
    expect(normalizeCalendarProvider("basura")).toBe("google");
  });
});

describe("getCalendarState con activeCalendar (contrato nuevo)", () => {
  it("Apple conectado: etiqueta, cuenta y enlace a iCloud", () => {
    const estado = getCalendarState({
      calendarProvider: "caldav",
      activeCalendar: {
        provider: "caldav",
        connected: true,
        calendarId: "https://p01-caldav.icloud.com/1/calendars/a/",
        accountEmail: "pelu@icloud.com",
        disconnectedAt: null,
        lastError: null,
      },
    });
    expect(estado).toEqual({
      provider: "caldav",
      label: "Calendario de Apple",
      shortLabel: "Apple",
      connected: true,
      expired: false,
      accountEmail: "pelu@icloud.com",
      webUrl: "https://www.icloud.com/calendar/",
    });
  });

  it("conexión caducada: connected false y expired true", () => {
    const estado = getCalendarState({
      calendarProvider: "google",
      activeCalendar: {
        provider: "google",
        connected: false,
        calendarId: "primary",
        accountEmail: null,
        disconnectedAt: "2026-09-18T10:00:00.000Z",
        lastError: "invalid_grant",
      },
    });
    expect(estado.connected).toBe(false);
    expect(estado.expired).toBe(true);
    expect(estado.label).toBe("Google Calendar");
  });

  it("activeCalendar null (sin ninguna conexión) → no conectado, no caducado", () => {
    const estado = getCalendarState({
      calendarProvider: null,
      activeCalendar: null,
    });
    expect(estado).toMatchObject({
      provider: "google",
      connected: false,
      expired: false,
      accountEmail: null,
    });
  });

  it("activeCalendar manda aunque los campos antiguos digan otra cosa", () => {
    const estado = getCalendarState({
      calendarProvider: "google",
      activeCalendar: {
        provider: "google",
        connected: false,
        calendarId: null,
        accountEmail: null,
        disconnectedAt: null,
        lastError: null,
      },
      googleCalendarConnected: true,
    });
    expect(estado.connected).toBe(false);
  });
});

describe("getCalendarState sin activeCalendar (respuesta antigua)", () => {
  it("Outlook con los campos antiguos", () => {
    const estado = getCalendarState({
      calendarProvider: "outlook",
      outlookCalendarConnected: true,
      outlookUserEmail: "barber@outlook.com",
    });
    expect(estado).toMatchObject({
      provider: "outlook",
      connected: true,
      accountEmail: "barber@outlook.com",
      label: "Outlook Calendar",
    });
  });

  it("Google caducado con los campos antiguos", () => {
    const estado = getCalendarState({
      calendarProvider: "google",
      googleCalendarConnected: false,
      googleCalendarDisconnectedAt: "2026-09-18T10:00:00.000Z",
    });
    expect(estado).toMatchObject({ connected: false, expired: true });
  });

  it("caldav sin activeCalendar no puede saberse: no conectado", () => {
    expect(getCalendarState({ calendarProvider: "caldav" }).connected).toBe(
      false
    );
  });
});

describe("providerFromReconnectCode", () => {
  it("resuelve el proveedor del código *_CALENDAR_RECONNECT_REQUIRED", () => {
    expect(
      providerFromReconnectCode("CALDAV_CALENDAR_RECONNECT_REQUIRED")
    ).toBe("caldav");
    expect(
      providerFromReconnectCode("OUTLOOK_CALENDAR_RECONNECT_REQUIRED")
    ).toBe("outlook");
    expect(
      providerFromReconnectCode("GOOGLE_CALENDAR_RECONNECT_REQUIRED")
    ).toBe("google");
    expect(providerFromReconnectCode(undefined)).toBe("google");
  });
});
