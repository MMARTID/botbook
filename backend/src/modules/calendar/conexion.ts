// ÚNICO fichero que conoce las columnas google*/outlook* de Business. Los
// consumidores (CalendarService, voiceTools, el job de reintentos, las rutas)
// reciben una CalendarConnection opaca y deciden con los predicados de aquí.
// El PR posterior de la tabla CalendarConnection reescribe este fichero y
// nada más. No importa el registro de adaptadores ni service.ts: así los
// tests de voiceTools/job/onboarding no cargan googleapis.
import type { Business, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { invalidarCacheDeVoz } from "../../lib/voiceConfigCache.js";
import {
  DESCRIPTORES_DE_PROVEEDOR,
  normalizarProveedorDeCalendario,
  type CalendarConnection,
  type CalendarCredentials,
  type CalendarProviderId,
  type CredencialesActivas,
  type CredencialesDe,
} from "../../adapters/calendar/CalendarProvider.js";
import type { CalendarOrigin } from "../../lib/availability.js";

/** Columnas que hace falta leer de Business para resolver la conexión. Se usa
 * con spread en los `select` de voiceTools, el job y calendar/routes. */
export const SELECT_CONEXION_DE_CALENDARIO = {
  calendarProvider: true,
  googleRefreshToken: true,
  googleCalendarId: true,
  googleCalendarConnected: true,
  outlookRefreshToken: true,
  outlookCalendarId: true,
  outlookCalendarConnected: true,
} as const satisfies Prisma.BusinessSelect;

/** Flags `boolean | null` a propósito: la caché voice_config guarda JSON
 * antiguo y BusinessVoiceConfig ya los declara así. */
export type FilaDeConexionDeCalendario = {
  calendarProvider: string | null;
  googleRefreshToken: string | null;
  googleCalendarId: string | null;
  googleCalendarConnected: boolean | null;
  outlookRefreshToken: string | null;
  outlookCalendarId: string | null;
  outlookCalendarConnected: boolean | null;
};

/** CalendarConnection + lo que los consumidores necesitan para decidir sin
 * mirar columnas. Se pasa tal cual a CalendarService (los campos extra son
 * inocuos). */
export type ConexionResuelta = CalendarConnection & {
  /** <p>CalendarId crudo sin default — para `selectedCalendarId` de
   * GET /calendar/calendars. */
  calendarIdConfigurado: string | null;
  /** <p>CalendarConnected tal cual (null si venía de una caché antigua). */
  marcadaConectada: boolean | null;
};

export function resolverConexionDeCalendario(
  business: FilaDeConexionDeCalendario | null | undefined,
  opciones: {
    /** Forzar proveedor (cancelar un Booking creado con otro proveedor). */
    provider?: CalendarProviderId;
    /** Sobrescribir el calendario (Booking.externalCalendarId).
     * undefined = columna del negocio. */
    calendarId?: string | null;
  } = {}
): ConexionResuelta {
  const provider =
    opciones.provider ??
    normalizarProveedorDeCalendario(business?.calendarProvider);
  // Ramas explícitas, no claves computadas: compila contra los tipos de
  // Prisma sin casts y son solo dos proveedores hasta que este fichero se
  // reescriba sobre la tabla CalendarConnection.
  const refreshToken =
    provider === "outlook"
      ? (business?.outlookRefreshToken ?? null)
      : (business?.googleRefreshToken ?? null);
  const columnaCalendarId =
    provider === "outlook"
      ? (business?.outlookCalendarId ?? null)
      : (business?.googleCalendarId ?? null);
  const marcadaConectada =
    provider === "outlook"
      ? (business?.outlookCalendarConnected ?? null)
      : (business?.googleCalendarConnected ?? null);
  const calendarIdConfigurado =
    opciones.calendarId !== undefined ? opciones.calendarId : columnaCalendarId;
  return {
    provider,
    // `||` y no `??`: "" también cae a "primary", como hasta ahora.
    calendarId:
      calendarIdConfigurado ||
      DESCRIPTORES_DE_PROVEEDOR[provider].calendarIdPorDefecto,
    credentials: refreshToken
      ? ({ provider, refreshToken } as CalendarCredentials)
      : null,
    calendarIdConfigurado,
    marcadaConectada,
  };
}

/** Estado tripartito que consume exigirConexionActiva del servicio. */
export type EstadoDeConexion = "ok" | "sin_credenciales" | "sin_calendario";
export function estadoDeConexion(c: CalendarConnection): EstadoDeConexion {
  if (!c.credentials) return "sin_credenciales";
  if (!c.calendarId) return "sin_calendario";
  return "ok";
}

// Predicados — una función por cada semántica de "¿está conectado?" que
// existe hoy. NO se unifican en este PR; solo se les pone nombre.
/** voiceTools (executeBookAppointment) y el job: token presente y flag
 * !== false. */
export const conexionOperativa = (c: ConexionResuelta): boolean =>
  c.credentials !== null && c.marcadaConectada !== false;
/** Caché de voz (=== true) y rutas del panel (flag && token, truthy). */
export const conexionConfirmada = (c: ConexionResuelta): boolean =>
  c.credentials !== null && c.marcadaConectada === true;
/** tieneCalendarioConectado de voiceTools: google = token; outlook = token +
 * calendarId. */
export const usaCalendarioExterno = (c: ConexionResuelta): boolean =>
  c.credentials !== null && c.calendarId !== null;
/** onboarding/routes.ts: solo el flag. */
export const marcadaComoConectada = (c: ConexionResuelta): boolean =>
  c.marcadaConectada === true;
/** calendarOriginForBusiness de voiceTools y el job. */
export const origenDeCalendario = (
  c: ConexionResuelta
): CalendarOrigin | null =>
  c.calendarId ? { provider: c.provider, calendarId: c.calendarId } : null;

/**
 * Persiste el refresh token de Outlook cuando Microsoft lo rota (lo hace
 * casi siempre). Sin esto se seguía usando indefinidamente el token original
 * de la conexión, que caduca por inactividad a los 90 días: meses después,
 * Outlook se desconectaba solo con invalid_grant y todas las reservas de ese
 * negocio pasaban a quedarse pendientes. updateMany por VALOR del token viejo
 * porque aquí no se conoce el businessId; en el PR de la tabla
 * CalendarConnection pasa a update por id.
 */
export async function persistirCredencialesRotadas(
  anteriores: CalendarCredentials,
  nuevas: CalendarCredentials
): Promise<void> {
  if (anteriores.provider !== "outlook" || nuevas.provider !== "outlook") {
    return;
  }
  if (nuevas.refreshToken === anteriores.refreshToken) return;
  try {
    await prisma.business.updateMany({
      where: { outlookRefreshToken: anteriores.refreshToken },
      data: { outlookRefreshToken: nuevas.refreshToken },
    });
  } catch (error) {
    // Que no se guarde no puede tumbar la operación en curso: el token
    // viejo sigue sirviendo hasta que caduque su ventana.
    console.error(
      "[Calendar] No se pudo guardar el refresh token rotado de Outlook:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

/** Solo la usa CalendarService: adjunta el callback de rotación a unas
 * credenciales antes de entregarlas al adaptador (el adaptador no persiste
 * nada). */
export function conCallbackDeRotacion<P extends CalendarProviderId>(
  credentials: CredencialesDe<P>
): CredencialesActivas<P> {
  return {
    credentials,
    alRotarCredenciales: (nuevas) =>
      persistirCredencialesRotadas(credentials, nuevas),
  };
}

/** Unión discriminada: imposible pasar motivo en modo revocar. */
export type ModoDeDesconexion =
  /** Panel (GET /calendar/calendars, /events/upcoming): conserva el refresh
   * token para que una reconexión de Google sin refresh_token nuevo no deje
   * al negocio sin credenciales (handleCallback solo escribe si llega);
   * guarda error.message. */
  | { modo: "panel"; motivo: string }
  /** Voz y job: el token ya fue rechazado con invalid_grant ⇒
   * <p>RefreshToken = null. */
  | { modo: "revocar" };

/** Única implementación de "marcar desconectado". Siempre best-effort (BD y
 * Redis en try/catch) y SIEMPRE invalida voice_config. */
export async function marcarCalendarioDesconectado(
  businessId: string,
  provider: CalendarProviderId,
  opciones: ModoDeDesconexion,
  log: { prefijo: string } = { prefijo: "[Calendar]" }
): Promise<void> {
  const ahora = new Date();
  const ultimoError =
    opciones.modo === "panel" ? opciones.motivo : "invalid_grant";
  const data: Prisma.BusinessUpdateInput =
    provider === "outlook"
      ? {
          outlookCalendarConnected: false,
          outlookCalendarDisconnectedAt: ahora,
          outlookCalendarLastError: ultimoError,
          ...(opciones.modo === "revocar" ? { outlookRefreshToken: null } : {}),
        }
      : {
          googleCalendarConnected: false,
          googleCalendarDisconnectedAt: ahora,
          googleCalendarLastError: ultimoError,
          ...(opciones.modo === "revocar" ? { googleRefreshToken: null } : {}),
        };
  try {
    await prisma.business.update({ where: { id: businessId }, data });
  } catch (dbErr) {
    console.error(
      `${log.prefijo} No se pudo actualizar el estado de ${DESCRIPTORES_DE_PROVEEDOR[provider].nombre} de ${businessId}:`,
      dbErr instanceof Error ? dbErr.message : dbErr
    );
  }
  await invalidarCacheDeVoz(businessId);
}

/** Escrituras de conexión (handleCallback, handleMicrosoftCallback,
 * connectMicrosoftCalendar, selectGoogleCalendar). Solo incluye en `data` las
 * claves recibidas: así selectGoogleCalendar produce EXACTAMENTE el objeto
 * que fija su test (toHaveBeenCalledWith estricto). */
export async function guardarConexionDeCalendario(
  businessId: string,
  datos: {
    provider: CalendarProviderId;
    refreshToken?: string;
    calendarId?: string;
    conectado: boolean;
    userEmail?: string | null;
  }
): Promise<Business> {
  const data: Prisma.BusinessUpdateInput =
    datos.provider === "outlook"
      ? {
          calendarProvider: "outlook",
          ...(datos.refreshToken !== undefined
            ? { outlookRefreshToken: datos.refreshToken }
            : {}),
          ...(datos.calendarId !== undefined
            ? { outlookCalendarId: datos.calendarId }
            : {}),
          outlookCalendarConnected: datos.conectado,
          outlookCalendarDisconnectedAt: null,
          outlookCalendarLastError: null,
          ...(datos.userEmail !== undefined
            ? { outlookUserEmail: datos.userEmail }
            : {}),
        }
      : {
          calendarProvider: "google",
          ...(datos.refreshToken !== undefined
            ? { googleRefreshToken: datos.refreshToken }
            : {}),
          ...(datos.calendarId !== undefined
            ? { googleCalendarId: datos.calendarId }
            : {}),
          googleCalendarConnected: datos.conectado,
          googleCalendarDisconnectedAt: null,
          googleCalendarLastError: null,
        };
  const business = await prisma.business.update({
    where: { id: businessId },
    data,
  });
  await invalidarCacheDeVoz(businessId);
  return business;
}
