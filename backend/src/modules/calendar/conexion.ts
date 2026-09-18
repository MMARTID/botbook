// ÚNICO fichero que sabe cómo se persiste la conexión de calendario de un
// negocio. Desde 2026-09-18 la fuente de verdad es la tabla
// CalendarConnection (una fila por proveedor); Business.calendarProvider
// sigue señalando el proveedor activo. Las columnas google*/outlook* de
// Business NO se leen ya: solo se escriben en espejo (ver espejoEnColumnas)
// para que la revisión anterior durante el despliegue, un rollback y el
// serializador que consume el frontend sigan funcionando hasta el PR
// "contract" que las borre.
//
// Los consumidores (CalendarService, voiceTools, el job de reintentos, las
// rutas) reciben una CalendarConnection opaca y deciden con los predicados
// de aquí. No importa el registro de adaptadores ni service.ts: así los
// tests de voiceTools/job/onboarding no cargan googleapis.
import { Prisma, type Business } from "@prisma/client";
import { z } from "zod";
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

/** Lo que hace falta leer de Business para resolver la conexión. Se usa con
 * spread en los `select` de voiceTools, el job y calendar/routes. `id` va
 * incluido para que la rotación de credenciales pueda escribir por id. */
export const SELECT_CONEXION_DE_CALENDARIO = {
  id: true,
  calendarProvider: true,
  calendarConnections: {
    select: {
      provider: true,
      calendarId: true,
      credentials: true,
      connected: true,
      disconnectedAt: true,
      lastError: true,
      accountEmail: true,
    },
  },
} as const satisfies Prisma.BusinessSelect;

/** Una fila de calendar_connections tal como la devuelve el select de
 * arriba. `credentials` es JSON sin tipar hasta que lo valida
 * parsearCredenciales; `disconnectedAt` admite string porque la caché
 * voice_config guarda el negocio serializado. */
export type FilaDeConexion = {
  provider: string;
  calendarId: string | null;
  credentials: unknown;
  connected: boolean;
  disconnectedAt?: Date | string | null;
  lastError?: string | null;
  accountEmail?: string | null;
};

/** `calendarConnections` opcional a propósito: la caché voice_config puede
 * traer un negocio serializado antes de esta tabla; sin filas se resuelve
 * como "sin credenciales" y la caché se descarta sola. */
export type FilaDeConexionDeCalendario = {
  id?: string;
  calendarProvider: string | null;
  calendarConnections?: FilaDeConexion[] | null;
};

/** CalendarConnection + lo que los consumidores necesitan para decidir sin
 * mirar la tabla. Se pasa tal cual a CalendarService (los campos extra son
 * inocuos). */
export type ConexionResuelta = CalendarConnection & {
  /** Negocio dueño de la conexión; null si la fila no traía id (caché
   * antigua, tests). Lo usa la rotación de credenciales para escribir por
   * id. */
  businessId: string | null;
  /** calendarId crudo sin default — para `selectedCalendarId` de
   * GET /calendar/calendars. */
  calendarIdConfigurado: string | null;
  /** `connected` de la fila; null si no hay fila para el proveedor. */
  marcadaConectada: boolean | null;
};

const CredencialesSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("google"), refreshToken: z.string().min(1) }),
  z.object({ provider: z.literal("outlook"), refreshToken: z.string().min(1) }),
]);

/** Valida el JSON de la fila contra la forma de CalendarCredentials. Una fila
 * corrupta o de otro proveedor se trata como "sin credenciales" (el
 * consumidor pedirá reconectar) y se deja constancia: nunca se lanza desde
 * aquí porque el resolver corre en el camino crítico de una llamada. */
function parsearCredenciales(
  provider: CalendarProviderId,
  json: unknown
): CalendarCredentials | null {
  if (json === null || json === undefined) return null;
  const resultado = CredencialesSchema.safeParse(json);
  if (!resultado.success || resultado.data.provider !== provider) {
    console.error(
      `[Calendar] Credenciales de ${provider} con forma inválida en calendar_connections; se tratan como ausentes`
    );
    return null;
  }
  return resultado.data;
}

export function resolverConexionDeCalendario(
  business: FilaDeConexionDeCalendario | null | undefined,
  opciones: {
    /** Forzar proveedor (cancelar un Booking creado con otro proveedor). */
    provider?: CalendarProviderId;
    /** Sobrescribir el calendario (Booking.externalCalendarId).
     * undefined = el de la conexión. */
    calendarId?: string | null;
  } = {}
): ConexionResuelta {
  const provider =
    opciones.provider ??
    normalizarProveedorDeCalendario(business?.calendarProvider);
  const fila =
    business?.calendarConnections?.find((f) => f.provider === provider) ?? null;
  const calendarIdConfigurado =
    opciones.calendarId !== undefined
      ? opciones.calendarId
      : (fila?.calendarId ?? null);
  return {
    provider,
    // `||` y no `??`: "" también cae a "primary", como hasta ahora.
    calendarId:
      calendarIdConfigurado ||
      DESCRIPTORES_DE_PROVEEDOR[provider].calendarIdPorDefecto,
    credentials: fila ? parsearCredenciales(provider, fila.credentials) : null,
    businessId: business?.id ?? null,
    calendarIdConfigurado,
    marcadaConectada: fila?.connected ?? null,
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
// existe hoy. NO se unifican; solo tienen nombre.
/** voiceTools (executeBookAppointment) y el job: credenciales presentes y
 * flag !== false. */
export const conexionOperativa = (c: ConexionResuelta): boolean =>
  c.credentials !== null && c.marcadaConectada !== false;
/** Caché de voz (=== true) y rutas del panel (flag && credenciales). */
export const conexionConfirmada = (c: ConexionResuelta): boolean =>
  c.credentials !== null && c.marcadaConectada === true;
/** tieneCalendarioConectado de voiceTools: credenciales + calendario (Google
 * siempre tiene calendario por el default "primary"). */
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

/** Cambios de una conexión expresados en el dominio; espejoEnColumnas los
 * traduce a las columnas google* y outlook* de Business. `undefined` = no
 * tocar ese campo. */
type CambiosDeConexion = {
  refreshToken?: string | null;
  calendarId?: string | null;
  connected?: boolean;
  disconnectedAt?: Date | null;
  lastError?: string | null;
  accountEmail?: string | null;
};

/** Espejo TEMPORAL en las columnas antiguas de Business. Solo incluye las
 * claves recibidas. Un proveedor sin columnas propias (el futuro CalDAV)
 * simplemente no se espeja. Desaparece con el PR "contract". */
function espejoEnColumnas(
  provider: CalendarProviderId,
  cambios: CambiosDeConexion
): Prisma.BusinessUpdateInput {
  const definido = <T>(valor: T | undefined): valor is T => valor !== undefined;
  if (provider === "google") {
    return {
      ...(definido(cambios.refreshToken)
        ? { googleRefreshToken: cambios.refreshToken }
        : {}),
      ...(definido(cambios.calendarId)
        ? { googleCalendarId: cambios.calendarId }
        : {}),
      ...(definido(cambios.connected)
        ? { googleCalendarConnected: cambios.connected }
        : {}),
      ...(definido(cambios.disconnectedAt)
        ? { googleCalendarDisconnectedAt: cambios.disconnectedAt }
        : {}),
      ...(definido(cambios.lastError)
        ? { googleCalendarLastError: cambios.lastError }
        : {}),
    };
  }
  if (provider === "outlook") {
    return {
      ...(definido(cambios.refreshToken)
        ? { outlookRefreshToken: cambios.refreshToken }
        : {}),
      ...(definido(cambios.calendarId)
        ? { outlookCalendarId: cambios.calendarId }
        : {}),
      ...(definido(cambios.connected)
        ? { outlookCalendarConnected: cambios.connected }
        : {}),
      ...(definido(cambios.disconnectedAt)
        ? { outlookCalendarDisconnectedAt: cambios.disconnectedAt }
        : {}),
      ...(definido(cambios.lastError)
        ? { outlookCalendarLastError: cambios.lastError }
        : {}),
      ...(definido(cambios.accountEmail)
        ? { outlookUserEmail: cambios.accountEmail }
        : {}),
    };
  }
  return {};
}

/** JSON que se guarda en calendar_connections.credentials. */
function credencialesComoJson(
  provider: CalendarProviderId,
  refreshToken: string
): Prisma.InputJsonObject {
  return { provider, refreshToken };
}

/**
 * Persiste el refresh token de Outlook cuando Microsoft lo rota (lo hace
 * casi siempre). Sin esto se seguía usando indefinidamente el token original
 * de la conexión, que caduca por inactividad a los 90 días: meses después,
 * Outlook se desconectaba solo con invalid_grant y todas las reservas de ese
 * negocio pasaban a quedarse pendientes. Con businessId escribe por id; sin
 * él (wrappers @deprecated que solo reciben el token) busca por valor del
 * token viejo. En ambos casos actualiza también el espejo de Business.
 */
export async function persistirCredencialesRotadas(
  anteriores: CalendarCredentials,
  nuevas: CalendarCredentials,
  businessId: string | null = null
): Promise<void> {
  if (anteriores.provider !== "outlook" || nuevas.provider !== "outlook") {
    return;
  }
  if (nuevas.refreshToken === anteriores.refreshToken) return;
  const credentials = credencialesComoJson("outlook", nuevas.refreshToken);
  try {
    await prisma.$transaction([
      prisma.calendarConnection.updateMany({
        where: businessId
          ? { businessId, provider: "outlook" }
          : {
              provider: "outlook",
              credentials: {
                path: ["refreshToken"],
                equals: anteriores.refreshToken,
              },
            },
        data: { credentials },
      }),
      prisma.business.updateMany({
        where: businessId
          ? { id: businessId }
          : { outlookRefreshToken: anteriores.refreshToken },
        data: { outlookRefreshToken: nuevas.refreshToken },
      }),
    ]);
  } catch (error) {
    // Que no se guarde no puede tumbar la operación en curso: el token
    // viejo sigue sirviendo hasta que caduque su ventana.
    console.error(
      `[Calendar] No se pudo guardar el refresh token rotado de Outlook${businessId ? ` del negocio ${businessId}` : ""}:`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/** Solo la usa CalendarService: adjunta el callback de rotación a unas
 * credenciales antes de entregarlas al adaptador (el adaptador no persiste
 * nada). */
export function conCallbackDeRotacion<P extends CalendarProviderId>(
  credentials: CredencialesDe<P>,
  businessId: string | null = null
): CredencialesActivas<P> {
  return {
    credentials,
    alRotarCredenciales: (nuevas) =>
      persistirCredencialesRotadas(credentials, nuevas, businessId),
  };
}

/** Unión discriminada: imposible pasar motivo en modo revocar. */
export type ModoDeDesconexion =
  /** Panel (GET /calendar/calendars, /events/upcoming): conserva las
   * credenciales para que una reconexión de Google sin refresh_token nuevo no
   * deje al negocio sin ellas (handleCallback solo escribe si llega); guarda
   * error.message. */
  | { modo: "panel"; motivo: string }
  /** Voz y job: el token ya fue rechazado con invalid_grant ⇒ credenciales a
   * null. */
  | { modo: "revocar" };

/** Única implementación de "marcar desconectado". Siempre best-effort (BD y
 * Redis en try/catch) y SIEMPRE invalida voice_config.
 *
 * Best-effort NO significa silencioso: una desconexión es un evento raro e
 * importante, así que se deja constancia siempre (warn), y si la BD falla se
 * loguea como error con todos los identificadores. En ese caso el negocio
 * sigue figurando como conectado en BD y, al haberse invalidado la caché de
 * voz, la siguiente llamada volverá a chocar con el token rechazado y a pasar
 * por aquí: el fallo se repite en los logs en vez de perderse. */
export async function marcarCalendarioDesconectado(
  businessId: string,
  provider: CalendarProviderId,
  opciones: ModoDeDesconexion,
  log: { prefijo: string } = { prefijo: "[Calendar]" }
): Promise<void> {
  const ahora = new Date();
  const ultimoError =
    opciones.modo === "panel" ? opciones.motivo : "invalid_grant";
  const nombreProveedor = DESCRIPTORES_DE_PROVEEDOR[provider].nombre;
  console.warn(
    `${log.prefijo} Marcando ${nombreProveedor} como desconectado para el negocio ${businessId} (modo=${opciones.modo}, motivo=${ultimoError})`
  );
  const revocar = opciones.modo === "revocar";
  const data: Prisma.BusinessUpdateInput = {
    ...espejoEnColumnas(provider, {
      connected: false,
      disconnectedAt: ahora,
      lastError: ultimoError,
      ...(revocar ? { refreshToken: null } : {}),
    }),
    calendarConnections: {
      updateMany: {
        where: { provider },
        data: {
          connected: false,
          disconnectedAt: ahora,
          lastError: ultimoError,
          ...(revocar ? { credentials: Prisma.DbNull } : {}),
        },
      },
    },
  };
  try {
    await prisma.business.update({ where: { id: businessId }, data });
  } catch (dbErr) {
    // Se traga a propósito (la respuesta al cliente no depende de esto), pero
    // con el error completo: si esto falla en silencio, la voz seguiría
    // intentando reservar contra un token revocado sin que nadie lo vea.
    console.error(
      `${log.prefijo} FALLO AL MARCAR CALENDARIO DESCONECTADO: ${nombreProveedor} del negocio ${businessId} sigue figurando como conectado en BD (modo=${opciones.modo}, motivo=${ultimoError}). Requiere revisión manual.`,
      dbErr
    );
  }
  await invalidarCacheDeVoz(businessId);
}

/** Escrituras de conexión (handleCallback, handleMicrosoftCallback,
 * connectMicrosoftCalendar, selectGoogleCalendar). Crea o actualiza la fila
 * del proveedor, lo marca como activo y actualiza el espejo. Solo toca los
 * campos recibidos: p. ej. seleccionar calendario no pisa las credenciales.
 * Una única query (nested upsert), así fila y espejo no pueden divergir. */
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
  const { provider } = datos;
  const credentials =
    datos.refreshToken !== undefined
      ? credencialesComoJson(provider, datos.refreshToken)
      : undefined;
  const business = await prisma.business.update({
    where: { id: businessId },
    data: {
      calendarProvider: provider,
      ...espejoEnColumnas(provider, {
        refreshToken: datos.refreshToken,
        calendarId: datos.calendarId,
        connected: datos.conectado,
        disconnectedAt: null,
        lastError: null,
        accountEmail: datos.userEmail,
      }),
      calendarConnections: {
        upsert: {
          where: { businessId_provider: { businessId, provider } },
          create: {
            provider,
            calendarId: datos.calendarId ?? null,
            ...(credentials !== undefined ? { credentials } : {}),
            connected: datos.conectado,
            accountEmail: datos.userEmail ?? null,
          },
          update: {
            ...(datos.calendarId !== undefined
              ? { calendarId: datos.calendarId }
              : {}),
            ...(credentials !== undefined ? { credentials } : {}),
            connected: datos.conectado,
            disconnectedAt: null,
            lastError: null,
            ...(datos.userEmail !== undefined
              ? { accountEmail: datos.userEmail }
              : {}),
          },
        },
      },
    },
  });
  await invalidarCacheDeVoz(businessId);
  return business;
}

/** PATCH /business/me todavía admite `googleCalendarId`/`outlookCalendarId`
 * (contrato público, aunque el frontend no los envía). Cambia solo el
 * calendario de esa conexión sin tocar credenciales ni estado; si no hay
 * fila para el proveedor no crea nada (no hay credenciales que guardar). */
export async function actualizarCalendarioDeConexion(
  businessId: string,
  provider: CalendarProviderId,
  calendarId: string | null
): Promise<void> {
  await prisma.business.update({
    where: { id: businessId },
    data: {
      ...espejoEnColumnas(provider, { calendarId }),
      calendarConnections: {
        updateMany: { where: { provider }, data: { calendarId } },
      },
    },
  });
}
