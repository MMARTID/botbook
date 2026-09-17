import {
  esProveedorDeCalendario,
  type CalendarProviderId,
} from "./CalendarProvider.js";

/** Con CalendarProviderId = "google" | "outlook" esto es EXACTAMENTE la
 * unión histórica GOOGLE_/OUTLOOK_CALENDAR_RECONNECT_REQUIRED. */
export type CalendarReconnectErrorCode =
  `${Uppercase<CalendarProviderId>}_CALENDAR_RECONNECT_REQUIRED`;

export type CalendarBusinessErrorCode =
  | CalendarReconnectErrorCode
  | "BOOK_APPOINTMENT_FAILED"
  | "CANCEL_APPOINTMENT_FAILED"
  | "CALENDAR_TIMEOUT"
  | "CALENDAR_RATE_LIMITED";

export class CalendarBusinessError extends Error {
  code: CalendarBusinessErrorCode;
  /** Solo en errores de reconexión: evita parsear el código. */
  provider?: CalendarProviderId;
  constructor(
    code: CalendarBusinessErrorCode,
    message: string,
    provider?: CalendarProviderId
  ) {
    super(message);
    this.code = code;
    // voiceTools y retryFailedBooking discriminan por name, no por instanceof.
    this.name = "CalendarBusinessError";
    if (provider) this.provider = provider;
  }
}

export function codigoDeReconexion(
  provider: CalendarProviderId
): CalendarReconnectErrorCode {
  return `${provider.toUpperCase() as Uppercase<CalendarProviderId>}_CALENDAR_RECONNECT_REQUIRED`;
}

/** Duck typing a propósito: retryFailedBooking.test.ts lanza un Error plano
 * con {name, code}. Vale para instancias reales y para objetos planos. */
export function esCalendarBusinessError(e: unknown): e is {
  name: "CalendarBusinessError";
  code: CalendarBusinessErrorCode;
  message: string;
  provider?: CalendarProviderId;
} {
  const c = e as { name?: unknown; code?: unknown };
  return c?.name === "CalendarBusinessError" && typeof c.code === "string";
}

/** Proveedor cuya conexión hay que marcar como rota. Usa `provider` si viene
 * (instancias reales) y cae al parseo del código (objetos planos de los
 * tests). Devuelve null si el error no es de reconexión o el proveedor es
 * desconocido — NUNCA cae a "google": un futuro CALDAV_* no debe desconectar
 * Google. */
export function proveedorDesdeErrorDeReconexion(
  e: unknown
): CalendarProviderId | null {
  if (!esCalendarBusinessError(e)) return null;
  if (e.provider && esProveedorDeCalendario(e.provider)) return e.provider;
  const sufijo = "_CALENDAR_RECONNECT_REQUIRED";
  if (!e.code.endsWith(sufijo)) return null;
  const id = e.code.slice(0, -sufijo.length).toLowerCase();
  return esProveedorDeCalendario(id) ? id : null;
}
