import {
  createMicrosoftCalendarEvent,
  deleteMicrosoftCalendarEvent,
  listMicrosoftBusyIntervals,
  listMicrosoftCalendars,
  listMicrosoftUpcomingEvents,
  refreshMicrosoftAccessToken,
} from "../../../lib/microsoftGraph.js";
import type {
  CalendarBusyInterval,
  CalendarProvider,
  CalendarioDisponible,
  ConexionActiva,
  CredencialesActivas,
  EventoCreado,
  EventoProximo,
  NuevoEventoDeCalendario,
} from "../CalendarProvider.js";
import { CalendarBusinessError } from "../errors.js";

// Adaptador de Outlook Calendar: envuelve lib/microsoftGraph.ts (que no se
// toca; sus exports nominales son el contrato del mock de los tests). El
// flujo OAuth (exchangeMicrosoftCode, getMicrosoftProfile,
// getMicrosoftAuthUrl) sigue en CalendarService: no es una operación de
// calendario. PROHIBIDO importar prisma, redis o nada de modules/.

function uuidDesdeDigest(digest: string): string {
  // UUID determinista (variante RFC 4122), formato que Graph acepta para
  // transactionId y que hace idempotente la creación durante 24h.
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

// Equivalente Microsoft de classifyGoogleTransientError — antes,
// listOutlookCalendars y la rama Outlook de getUpcomingEvents convertían
// CUALQUIER error (429, timeout, un 500 de Graph) en
// OUTLOOK_CALENDAR_RECONNECT_REQUIRED sin distinguir, y las rutas que
// atrapan ese código marcan la conexión como desconectada en la BD — un
// simple hipo de Graph desconectaba el calendario del negocio sin motivo
// (hallazgo #21 de la auditoría). Usa el `.status` estructurado que
// microsoftGraph.ts ahora adjunta a sus errores (ver createMicrosoftOAuthError
// / graphFetch) en vez de buscar substrings en el mensaje.
function classifyMicrosoftTransientError(
  error: unknown
): "timeout" | "rate_limit" | null {
  const e = error as { status?: number; name?: string; message?: string };
  if (e?.status === 429) return "rate_limit";
  if (e?.status !== undefined && e.status >= 500) return "timeout";
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "timeout";
  const message = String(e?.message || "").toLowerCase();
  if (message.includes("timeout") || message.includes("etimedout"))
    return "timeout";
  return null;
}

// Detecta errores de Microsoft relacionados con invalid_grant (refresh
// token revocado o caducado) — antes, bookAppointment solo reconocía como
// "hay que reconectar" un mensaje que contuviera literalmente "401" o "403"
// como substring, pero el invalid_grant real de Microsoft llega como HTTP
// 400 con body {error: "invalid_grant"}, así que nunca coincidía: el fallo
// más común de reconexión de Outlook se trataba como error genérico
// (hallazgo #22 de la auditoría).
function isMicrosoftInvalidGrantError(error: unknown): boolean {
  const e = error as {
    status?: number;
    oauthErrorCode?: string;
    message?: string;
  };
  if (e?.oauthErrorCode === "invalid_grant") return true;
  const message = String(e?.message || "").toLowerCase();
  return message.includes("invalid_grant");
}

/** Mapeo de errores de las operaciones de lectura (listar calendarios y
 * próximos eventos): transitorio ⇒ CALENDAR_RATE_LIMITED / CALENDAR_TIMEOUT;
 * cualquier otro ⇒ RECONNECT (comportamiento histórico, más agresivo que el
 * de Google; se conserva a propósito). */
function errorDeLectura(err: unknown): CalendarBusinessError {
  const transient = classifyMicrosoftTransientError(err);
  if (transient === "rate_limit") {
    return new CalendarBusinessError(
      "CALENDAR_RATE_LIMITED",
      "Outlook Calendar está limitando las peticiones en este momento."
    );
  }
  if (transient === "timeout") {
    return new CalendarBusinessError(
      "CALENDAR_TIMEOUT",
      "Outlook Calendar está tardando más de lo normal en responder."
    );
  }
  return new CalendarBusinessError(
    "OUTLOOK_CALENDAR_RECONNECT_REQUIRED",
    "La conexión con Outlook ya no es válida.",
    "outlook"
  );
}

/**
 * Refresca el token de Outlook y AVISA si Microsoft lo rota (lo hace casi
 * siempre) para que quien inyectó las credenciales lo persista. Sin esto se
 * seguía usando indefinidamente el token original de la conexión, que caduca
 * por inactividad a los 90 días: meses después, Outlook se desconectaba solo
 * con invalid_grant y todas las reservas de ese negocio pasaban a quedarse
 * pendientes. El adaptador no persiste nada: el callback (que ya traga su
 * propio error) es responsabilidad de CalendarService.
 */
async function refrescarToken(cuenta: CredencialesActivas<"outlook">) {
  const refreshToken = cuenta.credentials.refreshToken;
  const respuesta = await refreshMicrosoftAccessToken(refreshToken);
  if (respuesta.refresh_token && respuesta.refresh_token !== refreshToken) {
    await cuenta.alRotarCredenciales?.({
      provider: "outlook",
      refreshToken: respuesta.refresh_token,
    });
  }
  return respuesta;
}

export class OutlookCalendarProvider implements CalendarProvider<"outlook"> {
  readonly id = "outlook" as const;

  async listarCalendarios(
    cuenta: CredencialesActivas<"outlook">
  ): Promise<CalendarioDisponible[]> {
    try {
      const { access_token } = await refrescarToken(cuenta);
      const calendars = await listMicrosoftCalendars(access_token);
      return calendars.map((item) => ({
        id: item.id,
        name: item.name,
        primary: false,
      }));
    } catch (err) {
      const error = errorDeLectura(err);
      if (error.code === "OUTLOOK_CALENDAR_RECONNECT_REQUIRED") {
        console.error("[Calendar] Failed to list Outlook calendars:", err);
      }
      throw error;
    }
  }

  async listarProximosEventos(
    conexion: ConexionActiva<"outlook">,
    maxResults: number
  ): Promise<EventoProximo[]> {
    try {
      const tokenResponse = await refrescarToken(conexion);
      return await listMicrosoftUpcomingEvents(
        tokenResponse.access_token,
        conexion.calendarId,
        maxResults
      );
    } catch (error) {
      throw errorDeLectura(error);
    }
  }

  /** Deja pasar el error crudo: CalendarService degrada a "sin bloqueos".
   * Devuelve el array de Graph tal cual (sin regla de día completo ni filtro
   * de NaN: asimetría con Google conservada a propósito). */
  async listarOcupacion(
    conexion: ConexionActiva<"outlook">,
    ventana: { timeMin: Date; timeMax: Date }
  ): Promise<CalendarBusyInterval[]> {
    const { access_token } = await refrescarToken(conexion);
    return listMicrosoftBusyIntervals(
      access_token,
      conexion.calendarId,
      ventana.timeMin,
      ventana.timeMax
    );
  }

  async crearEvento(
    conexion: ConexionActiva<"outlook">,
    evento: NuevoEventoDeCalendario
  ): Promise<EventoCreado> {
    try {
      const { access_token } = await refrescarToken(conexion);
      const event = await createMicrosoftCalendarEvent({
        accessToken: access_token,
        calendarId: conexion.calendarId,
        subject: evento.summary,
        startDateTime: evento.startTime.toISOString(),
        endDateTime: evento.endTime.toISOString(),
        attendeeEmail: evento.cliente.email ?? undefined,
        description: evento.description,
        transactionId: evento.idempotencyDigest
          ? uuidDesdeDigest(evento.idempotencyDigest)
          : undefined,
        // Microsoft Graph solo admite un único reminderMinutesBeforeStart
        // por evento (a diferencia de Google, que acepta varios overrides)
        // — se prioriza el aviso inmediato porque es el que resuelve el
        // problema real reportado (el propietario no se enteraba de que
        // había una reserva nueva), a costa de perder el aviso a 2h antes
        // en Outlook. Si la cita está demasiado lejos para que el aviso
        // inmediato sea válido (ver MAX_REMINDER_MINUTES), cae al de 2h.
        reminderMinutesBeforeStart:
          evento.recordatorioInmediatoMinutos ??
          evento.recordatorioPrevioMinutos,
      });

      return event;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // isMicrosoftInvalidGrantError primero: el 400+invalid_grant real de
      // Microsoft (refresh token revocado) no contiene "401" ni "403" en
      // ningún sitio del mensaje, así que antes caía siempre al genérico
      // BOOK_APPOINTMENT_FAILED — el fallo de reconexión de Outlook más
      // común quedaba encolado para reintentos que nunca podrían funcionar
      // hasta que el negocio reconectara a mano (hallazgo #22).
      if (
        isMicrosoftInvalidGrantError(err) ||
        message.includes("401") ||
        message.includes("403")
      ) {
        throw new CalendarBusinessError(
          "OUTLOOK_CALENDAR_RECONNECT_REQUIRED",
          "La conexión con Outlook ha sido revocada o expiró.",
          "outlook"
        );
      }
      const transient = classifyMicrosoftTransientError(err);
      if (
        transient === "timeout" ||
        (err instanceof Error && err.name === "TimeoutError")
      ) {
        throw new CalendarBusinessError(
          "CALENDAR_TIMEOUT",
          "Outlook Calendar está tardando más de lo normal en responder."
        );
      }
      if (transient === "rate_limit" || message.includes("429")) {
        throw new CalendarBusinessError(
          "CALENDAR_RATE_LIMITED",
          "Outlook Calendar está limitando las peticiones en este momento."
        );
      }
      console.error("[Calendar] Failed to create Outlook appointment:", err);
      throw new CalendarBusinessError(
        "BOOK_APPOINTMENT_FAILED",
        "No se pudo crear el evento en Outlook Calendar."
      );
    }
  }

  /** Un evento ya borrado (404) se trata como éxito idempotente. Sin 410 ni
   * clasificación de transitorios: como hasta ahora. */
  async borrarEvento(
    conexion: ConexionActiva<"outlook">,
    eventId: string
  ): Promise<void> {
    try {
      const { access_token } = await refrescarToken(conexion);
      await deleteMicrosoftCalendarEvent(
        access_token,
        conexion.calendarId,
        eventId
      );
    } catch (err) {
      if ((err as { status?: number })?.status === 404) return;
      if (isMicrosoftInvalidGrantError(err)) {
        throw new CalendarBusinessError(
          "OUTLOOK_CALENDAR_RECONNECT_REQUIRED",
          "La conexión con Outlook ha sido revocada o expiró.",
          "outlook"
        );
      }
      console.error("[Calendar] Failed to cancel Outlook appointment:", err);
      throw new CalendarBusinessError(
        "CANCEL_APPOINTMENT_FAILED",
        "No se pudo cancelar el evento en Outlook Calendar."
      );
    }
  }
}
