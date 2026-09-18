// Adaptador CalDAV (RFC 4791) sobre tsdav. Pensado para iCloud (Apple ID +
// contraseña de aplicación), pero el servidor va en las credenciales, así que
// vale para Fastmail, Nextcloud, etc.
//
// Toda petición pasa por `fetchVigilado`: convierte 401/403/429/5xx en errores
// tipados ANTES de que tsdav los procese. Sin esto, un 401 en una consulta de
// ocupación devolvería una lista vacía —"agenda libre"— y la voz daría dobles
// reservas con un password revocado. Ese fetch es inyectable por constructor
// para los tests.
//
// Ids: `calendarId` es la URL absoluta del calendario; `externalEventId` es
// la URL absoluta del objeto .ics. Nunca importa prisma ni redis.
import {
  createAccount,
  createCalendarObject,
  deleteCalendarObject,
  fetchCalendarObjects,
  fetchCalendars,
  getBasicAuthHeaders,
} from "tsdav";
import type { DAVAccount } from "tsdav";
import type {
  CalendarBusyInterval,
  CalendarioDisponible,
  CalendarProvider,
  ConexionActiva,
  CredencialesActivas,
  EventoCreado,
  EventoProximo,
  NuevoEventoDeCalendario,
} from "../CalendarProvider.js";
import { CalendarBusinessError } from "../errors.js";
import { CALENDAR_REQUEST_TIMEOUT_MS } from "../eventoDeCalendario.js";
import {
  construirIcs,
  eventosProximosDesdeIcs,
  intervalosOcupadosDesdeIcs,
  nombreDeFichero,
  uidDeEvento,
} from "./ics.js";

type Fetch = typeof fetch;

/** Respuesta HTTP que tsdav habría tragado o malinterpretado. */
export class ErrorHttpCaldav extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string
  ) {
    super(`CalDAV respondió ${status} en ${url}`);
    this.name = "ErrorHttpCaldav";
  }
}

/** Envuelve fetch para que los fallos de autenticación, cuota y servidor
 * lleguen como excepción con su estado. 404/412 pasan: los flujos de borrar
 * y crear los interpretan. */
export function fetchVigilado(base: Fetch): Fetch {
  return async (entrada, init) => {
    const respuesta = await base(entrada, init);
    const url = typeof entrada === "string" ? entrada : entrada.toString();
    if (
      respuesta.status === 401 ||
      respuesta.status === 403 ||
      respuesta.status === 429 ||
      respuesta.status >= 500
    ) {
      throw new ErrorHttpCaldav(respuesta.status, url);
    }
    return respuesta;
  };
}

/** Ventana por defecto de "próximos eventos" para el panel. */
const DIAS_DE_PROXIMOS_EVENTOS = 30;

export class CaldavCalendarProvider implements CalendarProvider<"caldav"> {
  readonly id = "caldav" as const;
  private readonly fetch: Fetch;

  constructor(opciones: { fetch?: Fetch } = {}) {
    this.fetch = fetchVigilado(opciones.fetch ?? fetch);
  }

  /** Cabeceras y opciones comunes: Basic auth y timeout por debajo del de
   * Retell (20 s), como el resto de adaptadores. */
  private peticion(cuenta: CredencialesActivas<"caldav">) {
    const { username, appPassword } = cuenta.credentials;
    return {
      headers: getBasicAuthHeaders({ username, password: appPassword }),
      fetchOptions: {
        signal: AbortSignal.timeout(CALENDAR_REQUEST_TIMEOUT_MS),
      },
      fetch: this.fetch,
    };
  }

  /** Descubrimiento CalDAV (principal + calendar-home-set). Dos o tres
   * peticiones; solo hace falta para listar calendarios. */
  private async cuentaDav(
    cuenta: CredencialesActivas<"caldav">
  ): Promise<DAVAccount> {
    return createAccount({
      account: {
        serverUrl: cuenta.credentials.serverUrl,
        accountType: "caldav",
      },
      ...this.peticion(cuenta),
    });
  }

  async listarCalendarios(
    cuenta: CredencialesActivas<"caldav">
  ): Promise<CalendarioDisponible[]> {
    try {
      const account = await this.cuentaDav(cuenta);
      const calendarios = await fetchCalendars({
        account,
        ...this.peticion(cuenta),
      });
      return calendarios
        .filter((c) => {
          // Solo calendarios que admiten eventos (no listas de recordatorios).
          const componentes = c.components ?? [];
          return componentes.length === 0 || componentes.includes("VEVENT");
        })
        .map((c) => ({
          id: c.url,
          name:
            typeof c.displayName === "string" && c.displayName.trim()
              ? c.displayName
              : "Sin nombre",
          primary: false,
        }));
    } catch (error) {
      throw this.mapearError("listar", error);
    }
  }

  async listarProximosEventos(
    conexion: ConexionActiva<"caldav">,
    maxResults: number
  ): Promise<EventoProximo[]> {
    const timeMin = new Date();
    const timeMax = new Date(
      timeMin.getTime() + DIAS_DE_PROXIMOS_EVENTOS * 24 * 60 * 60 * 1000
    );
    try {
      const objetos = await this.objetosEnVentana(conexion, {
        timeMin,
        timeMax,
      });
      return eventosProximosDesdeIcs(objetos, { timeMin, timeMax }, maxResults);
    } catch (error) {
      throw this.mapearError("proximos", error);
    }
  }

  /** Deja pasar cualquier error: el servicio degrada a "disponibilidad
   * desconocida", que es lo correcto ante un password revocado. */
  async listarOcupacion(
    conexion: ConexionActiva<"caldav">,
    ventana: { timeMin: Date; timeMax: Date }
  ): Promise<CalendarBusyInterval[]> {
    const objetos = await this.objetosEnVentana(conexion, ventana);
    return intervalosOcupadosDesdeIcs(objetos, ventana);
  }

  async crearEvento(
    conexion: ConexionActiva<"caldav">,
    evento: NuevoEventoDeCalendario
  ): Promise<EventoCreado> {
    const uid = uidDeEvento(evento.idempotencyDigest);
    const fichero = nombreDeFichero(uid);
    const href = new URL(fichero, conexion.calendarId).toString();
    try {
      const respuesta = await createCalendarObject({
        calendar: { url: conexion.calendarId },
        filename: fichero,
        iCalString: construirIcs(evento, uid),
        // Idempotencia: si un reintento llega con el mismo UID, el servidor
        // responde 412 y el evento que ya existe es el bueno.
        headers: {
          ...this.peticion(conexion).headers,
          "If-None-Match": "*",
        },
        fetchOptions: this.peticion(conexion).fetchOptions,
        fetch: this.fetch,
      });
      if (respuesta.ok || respuesta.status === 412) {
        return { id: href, htmlLink: null };
      }
      throw new ErrorHttpCaldav(respuesta.status, href);
    } catch (error) {
      throw this.mapearError("crear", error);
    }
  }

  async borrarEvento(
    conexion: ConexionActiva<"caldav">,
    eventId: string
  ): Promise<void> {
    try {
      const respuesta = await deleteCalendarObject({
        calendarObject: { url: eventId, etag: "" },
        ...this.peticion(conexion),
      });
      // Ya borrado (o nunca existió) = objetivo cumplido.
      if (
        respuesta.ok ||
        respuesta.status === 404 ||
        respuesta.status === 410
      ) {
        return;
      }
      throw new ErrorHttpCaldav(respuesta.status, eventId);
    } catch (error) {
      throw this.mapearError("borrar", error);
    }
  }

  private async objetosEnVentana(
    conexion: ConexionActiva<"caldav">,
    ventana: { timeMin: Date; timeMax: Date }
  ): Promise<Array<{ url: string; data: string }>> {
    const objetos = await fetchCalendarObjects({
      calendar: { url: conexion.calendarId },
      timeRange: {
        start: ventana.timeMin.toISOString(),
        end: ventana.timeMax.toISOString(),
      },
      // El servidor expande recurrencias si sabe; ics.ts las expande si no.
      expand: true,
      ...this.peticion(conexion),
    });
    return objetos
      .filter((o) => typeof o.data === "string" && o.data.length > 0)
      .map((o) => ({ url: o.url, data: o.data as string }));
  }

  private mapearError(
    operacion: "listar" | "proximos" | "crear" | "borrar",
    error: unknown
  ): CalendarBusinessError {
    if (error instanceof CalendarBusinessError) return error;
    const status = error instanceof ErrorHttpCaldav ? error.status : null;
    if (status === 401 || status === 403) {
      return new CalendarBusinessError(
        "CALDAV_CALENDAR_RECONNECT_REQUIRED",
        "El calendario de Apple ha rechazado el usuario o la contraseña de aplicación.",
        "caldav"
      );
    }
    if (status === 429) {
      return new CalendarBusinessError(
        "CALENDAR_RATE_LIMITED",
        "El calendario de Apple está limitando las peticiones en este momento."
      );
    }
    const nombre = error instanceof Error ? error.name : "";
    if (
      (status !== null && status >= 500) ||
      nombre === "TimeoutError" ||
      nombre === "AbortError"
    ) {
      return new CalendarBusinessError(
        "CALENDAR_TIMEOUT",
        "El calendario de Apple está tardando más de lo normal en responder."
      );
    }
    console.error(
      `[Calendar] Error CalDAV al ${operacion}:`,
      error instanceof Error ? error.message : error
    );
    return new CalendarBusinessError(
      operacion === "borrar"
        ? "CANCEL_APPOINTMENT_FAILED"
        : "BOOK_APPOINTMENT_FAILED",
      operacion === "borrar"
        ? "No se pudo cancelar el evento en el calendario de Apple."
        : operacion === "crear"
          ? "No se pudo crear el evento en el calendario de Apple."
          : operacion === "proximos"
            ? "No se pudo obtener los eventos del calendario."
            : "No se pudo obtener la lista de calendarios."
    );
  }
}
