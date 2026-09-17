import { google } from "googleapis";
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
import { CALENDAR_REQUEST_TIMEOUT_MS } from "../eventoDeCalendario.js";

// Adaptador de Google Calendar. Es el único fichero del backend que habla con
// googleapis para operar sobre calendarios; CalendarService lo usa a través
// del registro y solo importa de aquí lo que necesita el flujo OAuth.
// PROHIBIDO importar prisma, redis o nada de modules/.

/** Cliente OAuth2 nuevo por operación: evita estado mutable compartido entre
 * negocios. Lee process.env en cada llamada (los tests fijan las variables
 * en beforeEach). También lo usa CalendarService para getAuthUrl y
 * handleCallback. */
export function crearClienteOAuthDeGoogle() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function googleEventIdDesdeDigest(digest: string): string {
  // El ID de Google Calendar solo admite caracteres base32hex en minúscula.
  return `alhabla${digest}`;
}

function isGoogleConflictError(error: unknown): boolean {
  const e = error as { code?: number; response?: { status?: number } };
  return e?.code === 409 || e?.response?.status === 409;
}

// Detecta timeouts o rate limiting de Google, distintos de un fallo de credencial.
function classifyGoogleTransientError(
  error: unknown
): "timeout" | "rate_limit" | null {
  const e = error as {
    code?: number | string;
    message?: unknown;
    response?: { status?: number };
  };
  const status = e?.response?.status ?? e?.code;
  const message = String(e?.message || "").toLowerCase();

  if (status === 429) return "rate_limit";
  if (
    message.includes("timeout") ||
    message.includes("etimedout") ||
    message.includes("esockettimedout") ||
    e?.code === "ECONNABORTED"
  ) {
    return "timeout";
  }
  return null;
}

// Detecta errores de Google relacionados con invalid_grant
export function isGoogleInvalidGrantError(error: unknown): boolean {
  const e = error as {
    message?: unknown;
    response?: {
      status?: number;
      data?: { error?: unknown; error_description?: unknown };
    };
  };

  // Google client libraries sometimes put details in e.response.data
  const status = e?.response?.status;
  const data = e?.response?.data;
  const message = String(
    e?.message || data?.error_description || data?.error || ""
  ).toLowerCase();

  if (status === 401 || status === 400) {
    if (data?.error === "invalid_grant") return true;
    if (message.includes("invalid_grant")) return true;
  }

  if (message.includes("invalid_grant")) return true;

  return false;
}

function getGoogleErrorDetails(error: unknown) {
  const googleError = error as {
    message?: string;
    code?: string | number;
    response?: {
      status?: number;
      data?: {
        error?: string | { code?: number; message?: string; status?: string };
        error_description?: string;
      };
    };
  };
  const responseError = googleError.response?.data?.error;

  return {
    status: googleError.response?.status ?? googleError.code,
    code:
      typeof responseError === "object"
        ? (responseError.status ?? responseError.code)
        : responseError,
    message:
      (typeof responseError === "object" ? responseError.message : undefined) ??
      googleError.response?.data?.error_description ??
      googleError.message ??
      "Unknown Google Calendar error",
  };
}

type OperacionDeGoogle = "listar" | "proximos" | "crear" | "borrar";

/** Tabla de errores por operación, idéntica a la que había repartida en
 * cuatro bloques catch de CalendarService: invalid_grant siempre es
 * RECONNECT (con el texto histórico de cada operación); los transitorios
 * (429/timeout) solo se clasifican al crear; el código y el mensaje
 * genéricos dependen de la operación. Google usa BOOK_APPOINTMENT_FAILED
 * también para fallos de lectura: se conserva porque el frontend lo recibe
 * como 502. */
const TABLA_DE_ERRORES: Record<
  OperacionDeGoogle,
  {
    mensajeDeReconexion: string;
    etiquetaDeLog: string;
    codigoGenerico: "BOOK_APPOINTMENT_FAILED" | "CANCEL_APPOINTMENT_FAILED";
    mensajeGenerico: string;
  }
> = {
  listar: {
    mensajeDeReconexion: "La conexión con Google ya no es válida.",
    etiquetaDeLog: "[Calendar] Failed to list calendars:",
    codigoGenerico: "BOOK_APPOINTMENT_FAILED",
    mensajeGenerico: "No se pudo obtener la lista de calendarios.",
  },
  proximos: {
    mensajeDeReconexion: "La conexión con Google ya no es válida.",
    etiquetaDeLog: "[Calendar] Failed to list upcoming events:",
    codigoGenerico: "BOOK_APPOINTMENT_FAILED",
    mensajeGenerico: "No se pudo obtener los eventos del calendario.",
  },
  crear: {
    mensajeDeReconexion: "La conexión con Google ha sido revocada o expiró.",
    etiquetaDeLog: "[Calendar] Failed to create appointment:",
    codigoGenerico: "BOOK_APPOINTMENT_FAILED",
    mensajeGenerico: "No se pudo crear el evento en Google Calendar.",
  },
  borrar: {
    mensajeDeReconexion: "La conexión con Google ha sido revocada o expiró.",
    etiquetaDeLog: "[Calendar] Failed to cancel appointment:",
    codigoGenerico: "CANCEL_APPOINTMENT_FAILED",
    mensajeGenerico: "No se pudo cancelar el evento en Google Calendar.",
  },
};

function mapearError(
  operacion: OperacionDeGoogle,
  err: unknown
): CalendarBusinessError {
  const fila = TABLA_DE_ERRORES[operacion];
  if (isGoogleInvalidGrantError(err)) {
    return new CalendarBusinessError(
      "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
      fila.mensajeDeReconexion,
      "google"
    );
  }
  if (operacion === "crear") {
    const transient = classifyGoogleTransientError(err);
    if (transient === "rate_limit") {
      return new CalendarBusinessError(
        "CALENDAR_RATE_LIMITED",
        "Google Calendar está limitando las peticiones en este momento."
      );
    }
    if (transient === "timeout") {
      return new CalendarBusinessError(
        "CALENDAR_TIMEOUT",
        "Google Calendar está tardando más de lo normal en responder."
      );
    }
  }
  console.error(fila.etiquetaDeLog, getGoogleErrorDetails(err));
  return new CalendarBusinessError(fila.codigoGenerico, fila.mensajeGenerico);
}

/** Cliente de la API v3 nuevo por operación (nada se cachea en módulo ni en
 * el constructor: el mock de googleapis de los tests devuelve un objeto
 * distinto por test). */
function clienteDeCalendario(cuenta: CredencialesActivas<"google">) {
  const oauth2Client = crearClienteOAuthDeGoogle();
  oauth2Client.setCredentials({
    refresh_token: cuenta.credentials.refreshToken,
  });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

export class GoogleCalendarProvider implements CalendarProvider<"google"> {
  readonly id = "google" as const;

  async listarCalendarios(
    cuenta: CredencialesActivas<"google">
  ): Promise<CalendarioDisponible[]> {
    const calendar = clienteDeCalendario(cuenta);

    try {
      const response = await calendar.calendarList.list(
        {},
        { timeout: CALENDAR_REQUEST_TIMEOUT_MS }
      );
      return (response.data.items ?? [])
        .filter((item) => Boolean(item.id))
        .map((item) => ({
          id: item.id as string,
          name: item.summaryOverride || item.summary || "Sin nombre",
          primary: item.primary === true,
        }));
    } catch (err) {
      throw mapearError("listar", err);
    }
  }

  async listarProximosEventos(
    conexion: ConexionActiva<"google">,
    maxResults: number
  ): Promise<EventoProximo[]> {
    const calendar = clienteDeCalendario(conexion);

    try {
      const response = await calendar.events.list(
        {
          calendarId: conexion.calendarId,
          timeMin: new Date().toISOString(),
          maxResults,
          singleEvents: true,
          orderBy: "startTime",
        },
        { timeout: CALENDAR_REQUEST_TIMEOUT_MS }
      );

      return (response.data.items || []).map((event) => ({
        id: event.id ?? null,
        summary: event.summary || "Sin título",
        start: event.start?.dateTime || event.start?.date || null,
        end: event.end?.dateTime || event.end?.date || null,
        location: event.location || null,
        htmlLink: event.htmlLink || null,
      }));
    } catch (err) {
      throw mapearError("proximos", err);
    }
  }

  /** Deja pasar el error crudo: CalendarService degrada a "sin bloqueos". */
  async listarOcupacion(
    conexion: ConexionActiva<"google">,
    ventana: { timeMin: Date; timeMax: Date }
  ): Promise<CalendarBusyInterval[]> {
    const calendar = clienteDeCalendario(conexion);

    const response = await calendar.events.list(
      {
        calendarId: conexion.calendarId,
        timeMin: ventana.timeMin.toISOString(),
        timeMax: ventana.timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        showDeleted: false,
        maxResults: 2500,
      },
      { timeout: CALENDAR_REQUEST_TIMEOUT_MS }
    );

    return (response.data.items ?? [])
      .filter((event) => {
        if (event.status === "cancelled") return false;
        // Google marca los eventos de día completo como "Libre"
        // (transparency: transparent) por defecto, así que el "VACACIONES"
        // que el dueño pone de todo el día se descartaba en silencio y el
        // día seguía reservable. Un evento de día completo (viene con
        // start.date, no start.dateTime) significa siempre "ese día no
        // trabajo": cuenta como ocupado aunque figure como libre.
        const esDeDiaCompleto = Boolean(event.start?.date);
        if (esDeDiaCompleto) return true;
        return event.transparency !== "transparent";
      })
      .map(
        (
          event
        ): {
          start: Date | null;
          end: Date | null;
          externalEventId?: string;
        } => {
          const start = event.start?.dateTime ?? event.start?.date;
          const end = event.end?.dateTime ?? event.end?.date;
          return {
            start: start ? new Date(start) : null,
            end: end ? new Date(end) : null,
            externalEventId: event.id ?? undefined,
          };
        }
      )
      .filter((interval): interval is CalendarBusyInterval =>
        Boolean(
          interval.start &&
          interval.end &&
          !Number.isNaN(interval.start.getTime()) &&
          !Number.isNaN(interval.end.getTime())
        )
      );
  }

  async crearEvento(
    conexion: ConexionActiva<"google">,
    evento: NuevoEventoDeCalendario
  ): Promise<EventoCreado> {
    const calendar = clienteDeCalendario(conexion);
    const { calendarId } = conexion;
    const digest = evento.idempotencyDigest;

    const requestBody = {
      ...(digest ? { id: googleEventIdDesdeDigest(digest) } : {}),
      summary: evento.summary,
      description: evento.description,
      start: { dateTime: evento.startTime.toISOString() },
      end: { dateTime: evento.endTime.toISOString() },
      attendees: evento.cliente.email ? [{ email: evento.cliente.email }] : [],
      // Google sí admite varios reminders por evento: uno casi inmediato
      // (avisa de la reserva nueva nada más crearse) y el de 2h antes de la
      // cita — el inmediato se omite (no ambos) si la cita está demasiado
      // lejos para que ese valor quepa en el límite de la API (ver
      // MAX_REMINDER_MINUTES). Set para no duplicar el mismo par
      // método+minutos si ambos coinciden (cita a ~121 minutos vista).
      reminders: {
        useDefault: false,
        overrides: Array.from(
          new Map(
            [
              {
                method: "popup",
                minutes: evento.recordatorioInmediatoMinutos,
              },
              { method: "popup", minutes: evento.recordatorioPrevioMinutos },
            ]
              .filter(
                (reminder): reminder is { method: string; minutes: number } =>
                  reminder.minutes !== null
              )
              .map((reminder) => [
                `${reminder.method}:${reminder.minutes}`,
                reminder,
              ])
          ).values()
        ),
      },
    };

    try {
      const response = await calendar.events.insert(
        { calendarId, requestBody },
        { timeout: CALENDAR_REQUEST_TIMEOUT_MS }
      );
      return {
        id: response.data.id ?? null,
        htmlLink: response.data.htmlLink ?? null,
      };
    } catch (err) {
      // Google devuelve 409 si el primer intento creó el evento pero se
      // perdió su respuesta. Recuperarlo convierte el retry en idempotente.
      if (digest && isGoogleConflictError(err)) {
        try {
          const existing = await calendar.events.get(
            { calendarId, eventId: googleEventIdDesdeDigest(digest) },
            // Este get corre dentro de la ruta de voz y justo cuando Google
            // está dando problemas: sin tope podía comerse el presupuesto
            // entero de la tool call.
            { timeout: CALENDAR_REQUEST_TIMEOUT_MS }
          );
          return {
            id: existing.data.id ?? null,
            htmlLink: existing.data.htmlLink ?? null,
          };
        } catch (getError) {
          // Se loguea y se sigue con el mapeo del error ORIGINAL.
          console.error(
            "[Calendar] El evento idempotente de Google existe pero no se pudo recuperar:",
            getGoogleErrorDetails(getError)
          );
        }
      }
      throw mapearError("crear", err);
    }
  }

  /** Un evento ya borrado (404/410) se trata como éxito idempotente — puede
   * haberlo borrado ya un reintento anterior o el propietario a mano. */
  async borrarEvento(
    conexion: ConexionActiva<"google">,
    eventId: string
  ): Promise<void> {
    const calendar = clienteDeCalendario(conexion);

    try {
      await calendar.events.delete(
        { calendarId: conexion.calendarId, eventId },
        { timeout: CALENDAR_REQUEST_TIMEOUT_MS }
      );
    } catch (err) {
      const status = (err as { code?: number })?.code;
      if (status === 404 || status === 410) return;
      throw mapearError("borrar", err);
    }
  }
}
