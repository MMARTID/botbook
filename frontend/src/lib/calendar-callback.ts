import type { MicrosoftCalendarOption } from "./types";

export type OutlookCalendarSelection = {
  calendars: MicrosoftCalendarOption[];
  email: string | null;
};

function isCalendarOption(value: unknown): value is MicrosoftCalendarOption {
  if (!value || typeof value !== "object") return false;
  const calendar = value as Partial<MicrosoftCalendarOption>;
  return (
    typeof calendar.id === "string" &&
    typeof calendar.name === "string" &&
    typeof calendar.canEdit === "boolean" &&
    typeof calendar.canShare === "boolean" &&
    (typeof calendar.ownerEmail === "string" || calendar.ownerEmail === null)
  );
}

/**
 * `URLSearchParams` ya decodifica la query string. Decodificarla de nuevo
 * rompe nombres de calendario con un `%` literal antes de poder mostrar el
 * selector tras el callback de Outlook.
 */
export function parseOutlookCalendarSelection(
  value: string | null,
): OutlookCalendarSelection | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<OutlookCalendarSelection>;
    if (
      !Array.isArray(parsed.calendars) ||
      !parsed.calendars.every(isCalendarOption) ||
      (typeof parsed.email !== "string" && parsed.email !== null)
    ) {
      return null;
    }

    return { calendars: parsed.calendars, email: parsed.email };
  } catch {
    return null;
  }
}

/** Lista que devuelve el callback de Google (misma idea que Outlook). */
export type GoogleCalendarSelection = {
  calendars: Array<{ id: string; name: string; primary: boolean }>;
  email: string | null;
};

function isGoogleCalendarOption(
  value: unknown
): value is GoogleCalendarSelection["calendars"][number] {
  if (!value || typeof value !== "object") return false;
  const calendar = value as Partial<GoogleCalendarSelection["calendars"][number]>;
  return (
    typeof calendar.id === "string" &&
    typeof calendar.name === "string" &&
    typeof calendar.primary === "boolean"
  );
}

export function parseGoogleCalendarSelection(
  value: string | null
): GoogleCalendarSelection | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<GoogleCalendarSelection>;
    if (
      !Array.isArray(parsed.calendars) ||
      parsed.calendars.length === 0 ||
      !parsed.calendars.every(isGoogleCalendarOption) ||
      (typeof parsed.email !== "string" && parsed.email !== null)
    ) {
      return null;
    }
    return { calendars: parsed.calendars, email: parsed.email };
  } catch {
    return null;
  }
}
