// Tipos y constantes puras del dominio de calendario. PROHIBIDO importar
// googleapis, microsoftGraph, prisma o redis: este fichero lo cargan
// voiceTools y los jobs sin necesidad de arrastrar ningún SDK.

export const PROVEEDORES_DE_CALENDARIO = ["google", "outlook"] as const;
export type CalendarProviderId = (typeof PROVEEDORES_DE_CALENDARIO)[number];

export function esProveedorDeCalendario(
  valor: unknown
): valor is CalendarProviderId {
  return (PROVEEDORES_DE_CALENDARIO as readonly unknown[]).includes(valor);
}

/** Regla histórica y contrato con el frontend: "outlook" ⇒ outlook; cualquier
 * otro valor (null, "google", basura) ⇒ google. Con un tercer proveedor pasa a
 * ser "conocido ⇒ ese; desconocido ⇒ google". */
export function normalizarProveedorDeCalendario(
  valor: string | null | undefined
): CalendarProviderId {
  return esProveedorDeCalendario(valor) ? valor : "google";
}

/** Metadatos que los consumidores necesitan SIN cargar el adaptador. */
export const DESCRIPTORES_DE_PROVEEDOR: Record<
  CalendarProviderId,
  {
    /** "Google" / "Outlook" (mensajes de reconexión). */
    nombreCorto: string;
    /** "Google Calendar" / "Outlook Calendar". */
    nombre: string;
    /** "primary" en Google; null = hay que elegir uno. */
    calendarIdPorDefecto: string | null;
    /** Hueco para proveedores sin OAuth (p. ej. CalDAV con contraseña de aplicación). */
    tipoDeAutorizacion: "oauth" | "credenciales";
  }
> = {
  google: {
    nombreCorto: "Google",
    nombre: "Google Calendar",
    calendarIdPorDefecto: "primary",
    tipoDeAutorizacion: "oauth",
  },
  outlook: {
    nombreCorto: "Outlook",
    nombre: "Outlook Calendar",
    calendarIdPorDefecto: null,
    tipoDeAutorizacion: "oauth",
  },
};

export type GoogleCalendarCredentials = {
  provider: "google";
  refreshToken: string;
};
export type OutlookCalendarCredentials = {
  provider: "outlook";
  refreshToken: string;
};
// Futuro: { provider: "caldav"; serverUrl: string; username: string; appPassword: string }
export type CalendarCredentials =
  GoogleCalendarCredentials | OutlookCalendarCredentials;
export type CredencialesDe<P extends CalendarProviderId> = Extract<
  CalendarCredentials,
  { provider: P }
>;

/** Lo ÚNICO que CalendarService y los adaptadores saben de un negocio. */
export type CalendarConnection<
  P extends CalendarProviderId = CalendarProviderId,
> = {
  provider: P;
  /** Calendario efectivo con el default del proveedor ya aplicado ("primary"
   * en Google). null solo si el proveedor exige elegir uno y aún no se
   * eligió (Outlook sin outlookCalendarId). */
  calendarId: string | null;
  /** null = el negocio no tiene credenciales de este proveedor. */
  credentials: CredencialesDe<P> | null;
  /** Negocio dueño, si se conoce. Los adaptadores no lo reciben (ConexionActiva
   * no lo lleva); lo usa conexion.ts para persistir credenciales rotadas por
   * id en vez de por valor. */
  businessId?: string | null;
};

/** Credenciales listas para operar, con el callback de rotación inyectado
 * por conexion.ts (Outlook rota el refresh token en cada refresh; el
 * adaptador NO persiste nada). */
export type CredencialesActivas<
  P extends CalendarProviderId = CalendarProviderId,
> = {
  credentials: CredencialesDe<P>;
  alRotarCredenciales?: (nuevas: CredencialesDe<P>) => Promise<void>;
};

/** Conexión validada por CalendarService: credenciales + calendario presentes. */
export type ConexionActiva<P extends CalendarProviderId = CalendarProviderId> =
  CredencialesActivas<P> & { provider: P; calendarId: string };

export type CalendarioDisponible = {
  id: string;
  name: string;
  primary: boolean;
};

export type EventoProximo = {
  id: string | null;
  summary: string;
  start: string | null;
  end: string | null;
  location: string | null;
  htmlLink: string | null;
};

export type CalendarBusyInterval = {
  start: Date;
  end: Date;
  externalEventId?: string;
};

export type CalendarBusyIntervalsResult = {
  intervals: CalendarBusyInterval[];
  /** false cuando no se pudo consultar el calendario. */
  calendarAvailabilityKnown: boolean;
};

/** Evento ya traducido al dominio: el servicio calcula contenido,
 * recordatorios y digest UNA vez; cada adaptador lo mapea a su API. */
export type NuevoEventoDeCalendario = {
  summary: string;
  description: string;
  startTime: Date;
  endTime: Date;
  /** Estructurado para que cada adaptador decida qué datos del cliente usa. */
  cliente: { nombre: string; telefono: string | null; email: string | null };
  /** Minutos hasta la cita (>= 0) o null si supera MAX_REMINDER_MINUTES. */
  recordatorioInmediatoMinutos: number | null;
  /** REMINDER_MINUTES_BEFORE_START (120). */
  recordatorioPrevioMinutos: number;
  /** Zona del negocio; "Europe/Madrid" por defecto. INERTE para Google
   * (manda UTC) y Outlook (lib/microsoftGraph.ts la hardcodea); la
   * consumirá CalDAV. */
  zonaHoraria: string;
  /** sha256 hex de la idempotencyKey, o null. Cada adaptador lo formatea
   * (Google: "alhabla"+hex; Outlook: UUID; CalDAV: UID@alhabla.ai). */
  idempotencyDigest: string | null;
};

export type EventoCreado = { id: string | null; htmlLink: string | null };

export interface CalendarProvider<
  P extends CalendarProviderId = CalendarProviderId,
> {
  readonly id: P;
  /** Listado de calendarios de la cuenta (paso de selección; aún no hay
   * calendarId). Lanza CalendarBusinessError. */
  listarCalendarios(
    cuenta: CredencialesActivas<P>
  ): Promise<CalendarioDisponible[]>;
  /** maxResults ya acotado a [1,15] por el servicio. Lanza
   * CalendarBusinessError. */
  listarProximosEventos(
    conexion: ConexionActiva<P>,
    maxResults: number
  ): Promise<EventoProximo[]>;
  /** Puede lanzar CUALQUIER cosa: el servicio degrada a
   * { [], calendarAvailabilityKnown: false }. Devuelve intervalos YA
   * filtrados según la regla del proveedor (día completo, transparent...). */
  listarOcupacion(
    conexion: ConexionActiva<P>,
    ventana: { timeMin: Date; timeMax: Date }
  ): Promise<CalendarBusyInterval[]>;
  /** Idempotente por idempotencyDigest. Lanza CalendarBusinessError. */
  crearEvento(
    conexion: ConexionActiva<P>,
    evento: NuevoEventoDeCalendario
  ): Promise<EventoCreado>;
  /** Evento ya borrado = éxito. Lanza CalendarBusinessError. */
  borrarEvento(conexion: ConexionActiva<P>, eventId: string): Promise<void>;
}
