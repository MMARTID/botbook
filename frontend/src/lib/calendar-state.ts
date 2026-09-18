import type { Business, CalendarProviderId } from "./types";

/** Estado del calendario de un negocio tal como lo necesita el panel: quién
 * es el proveedor activo, si está conectado, si la conexión caducó, y cómo
 * llamarlo. Única fuente de esta regla (antes estaba copiada en cuatro
 * componentes como `=== "outlook" ? ... : ...`, que no sabía pintar Apple). */
export type CalendarState = {
  provider: CalendarProviderId;
  /** Nombre completo: "Google Calendar", "Outlook Calendar", "Calendario de Apple". */
  label: string;
  /** Nombre corto para frases: "Google", "Outlook", "Apple". */
  shortLabel: string;
  connected: boolean;
  /** Hubo una conexión y se rompió (token caducado, contraseña revocada). */
  expired: boolean;
  /** Cuenta conectada cuando el proveedor la da (Outlook, Apple). */
  accountEmail: string | null;
  /** Dónde abre el negocio su agenda en el navegador. */
  webUrl: string;
};

export const CALENDAR_PROVIDER_INFO: Record<
  CalendarProviderId,
  { label: string; shortLabel: string; webUrl: string }
> = {
  google: {
    label: "Google Calendar",
    shortLabel: "Google",
    webUrl: "https://calendar.google.com/calendar/u/0/r/agenda",
  },
  outlook: {
    label: "Outlook Calendar",
    shortLabel: "Outlook",
    webUrl: "https://outlook.office.com/calendar/",
  },
  caldav: {
    label: "Calendario de Apple",
    shortLabel: "Apple",
    webUrl: "https://www.icloud.com/calendar/",
  },
};

export function normalizeCalendarProvider(
  value: string | null | undefined
): CalendarProviderId {
  return value === "outlook" || value === "caldav" ? value : "google";
}

/** Usa `activeCalendar` (contrato nuevo) y, si la respuesta aún no lo trae,
 * cae a los campos google* y outlook* antiguos. */
export function getCalendarState(
  business: Pick<
    Business,
    | "calendarProvider"
    | "activeCalendar"
    | "googleCalendarConnected"
    | "googleCalendarDisconnectedAt"
    | "outlookCalendarConnected"
    | "outlookCalendarDisconnectedAt"
    | "outlookUserEmail"
  >
): CalendarState {
  const provider = normalizeCalendarProvider(business.calendarProvider);
  const info = CALENDAR_PROVIDER_INFO[provider];

  if (business.activeCalendar !== undefined) {
    const active = business.activeCalendar;
    return {
      provider,
      label: info.label,
      shortLabel: info.shortLabel,
      connected: active?.connected === true,
      expired: active?.disconnectedAt != null,
      accountEmail: active?.accountEmail ?? null,
      webUrl: info.webUrl,
    };
  }

  const legacy =
    provider === "outlook"
      ? {
          connected: business.outlookCalendarConnected === true,
          expired: business.outlookCalendarDisconnectedAt != null,
          accountEmail: business.outlookUserEmail ?? null,
        }
      : provider === "google"
        ? {
            connected: business.googleCalendarConnected === true,
            expired: business.googleCalendarDisconnectedAt != null,
            accountEmail: null,
          }
        : { connected: false, expired: false, accountEmail: null };
  return {
    provider,
    label: info.label,
    shortLabel: info.shortLabel,
    webUrl: info.webUrl,
    ...legacy,
  };
}

/** Proveedor al que apunta un código *_CALENDAR_RECONNECT_REQUIRED. */
export function providerFromReconnectCode(
  code: string | undefined
): CalendarProviderId {
  if (!code) return "google";
  const id = code.replace(/_CALENDAR_RECONNECT_REQUIRED$/, "").toLowerCase();
  return normalizeCalendarProvider(id);
}
