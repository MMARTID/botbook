// ÚNICO fichero que sabe cómo se persiste la conexión de calendario de un
// negocio: la tabla CalendarConnection (una fila por proveedor), con
// Business.calendarProvider como puntero al proveedor activo. Las antiguas
// columnas google*/outlook* de Business ya no existen para el cliente Prisma;
// el frontend sigue recibiendo esos campos porque serializarBusiness los
// calcula desde las filas (ver camposDeCalendarioParaElPanel).
//
// Los consumidores (CalendarService, voiceTools, el job de reintentos, las
// rutas) reciben una CalendarConnection opaca y deciden con los predicados
// de aquí. No importa el registro de adaptadores ni service.ts: así los
// tests de voiceTools/job/onboarding no cargan googleapis.
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { invalidarCacheDeVoz } from "../../lib/voiceConfigCache.js";
import {
  cifrarJson,
  descifrarJson,
  esSobreCifrado,
} from "../../lib/cifradoDeCredenciales.js";
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

/** Descifra y valida el JSON de la fila contra la forma de
 * CalendarCredentials. Una fila manipulada, cifrada con otra clave, corrupta
 * o de otro proveedor se trata como "sin credenciales" (el consumidor pedirá
 * reconectar) y se deja constancia: nunca se lanza desde aquí porque el
 * resolver corre en el camino crítico de una llamada.
 *
 * Transitorio: acepta también credenciales en claro (filas anteriores al
 * cifrado, o escritas por la revisión anterior durante el despliegue) y lo
 * avisa; scripts/cifrar-credenciales-calendario.ts las recifra todas. */
function parsearCredenciales(
  provider: CalendarProviderId,
  json: unknown
): CalendarCredentials | null {
  if (json === null || json === undefined) return null;
  let enClaro: unknown = json;
  if (esSobreCifrado(json)) {
    try {
      enClaro = descifrarJson(json);
    } catch (error) {
      console.error(
        `[Calendar] No se pudieron descifrar las credenciales de ${provider} en calendar_connections (¿clave distinta o fila manipulada?); se tratan como ausentes:`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  } else {
    console.warn(
      `[Calendar] Credenciales de ${provider} guardadas SIN cifrar en calendar_connections; ejecuta scripts/cifrar-credenciales-calendario.ts`
    );
  }
  const resultado = CredencialesSchema.safeParse(enClaro);
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

/** JSON que se guarda en calendar_connections.credentials: SIEMPRE un sobre
 * cifrado (lib/cifradoDeCredenciales.ts). Exportada para el script de
 * recifrado. */
export function credencialesComoJson(
  credenciales: CalendarCredentials
): Prisma.InputJsonObject {
  return cifrarJson(credenciales) as unknown as Prisma.InputJsonObject;
}

/**
 * Persiste el refresh token de Outlook cuando Microsoft lo rota (lo hace
 * casi siempre). Sin esto se seguía usando indefinidamente el token original
 * de la conexión, que caduca por inactividad a los 90 días: meses después,
 * Outlook se desconectaba solo con invalid_grant y todas las reservas de ese
 * negocio pasaban a quedarse pendientes. Escribe por id de negocio; sin
 * businessId (wrappers @deprecated que solo reciben el token) no hay forma
 * de localizar la fila —las credenciales van cifradas, no se puede buscar
 * por valor— y se deja constancia.
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
  if (!businessId) {
    console.warn(
      "[Calendar] Outlook rotó el refresh token pero no se conoce el negocio (llamada sin businessId); no se persiste"
    );
    return;
  }
  try {
    await prisma.calendarConnection.updateMany({
      where: { businessId, provider: "outlook" },
      data: { credentials: credencialesComoJson(nuevas) },
    });
  } catch (error) {
    // Que no se guarde no puede tumbar la operación en curso: el token
    // viejo sigue sirviendo hasta que caduque su ventana.
    console.error(
      `[Calendar] No se pudo guardar el refresh token rotado de Outlook del negocio ${businessId}:`,
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
  try {
    await prisma.calendarConnection.updateMany({
      where: { businessId, provider },
      data: {
        connected: false,
        disconnectedAt: ahora,
        lastError: ultimoError,
        ...(revocar ? { credentials: Prisma.DbNull } : {}),
      },
    });
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

/** Business con sus filas de conexión, tal como lo devuelven las escrituras
 * de aquí para que la ruta lo serialice con serializarBusiness. */
export type BusinessConConexiones = Prisma.BusinessGetPayload<{
  include: {
    calendarConnections: typeof INCLUDE_CONEXIONES.calendarConnections;
  };
}>;

/** `include` para cargar las filas junto a un Business completo (rutas que
 * devuelven el negocio al panel). Mismo select que
 * SELECT_CONEXION_DE_CALENDARIO. */
export const INCLUDE_CONEXIONES = {
  calendarConnections: SELECT_CONEXION_DE_CALENDARIO.calendarConnections,
} as const satisfies Prisma.BusinessInclude;

/** Escrituras de conexión (handleCallback, handleMicrosoftCallback,
 * connectMicrosoftCalendar, selectGoogleCalendar). Crea o actualiza la fila
 * del proveedor y lo marca como activo, en una única query (nested upsert).
 * Solo toca los campos recibidos: p. ej. seleccionar calendario no pisa las
 * credenciales. */
export async function guardarConexionDeCalendario(
  businessId: string,
  datos: {
    provider: CalendarProviderId;
    refreshToken?: string;
    calendarId?: string;
    conectado: boolean;
    userEmail?: string | null;
  }
): Promise<BusinessConConexiones> {
  const { provider } = datos;
  const credentials =
    datos.refreshToken !== undefined
      ? credencialesComoJson({
          provider,
          refreshToken: datos.refreshToken,
        } as CalendarCredentials)
      : undefined;
  const business = await prisma.business.update({
    where: { id: businessId },
    data: {
      calendarProvider: provider,
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
    include: INCLUDE_CONEXIONES,
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
  await prisma.calendarConnection.updateMany({
    where: { businessId, provider },
    data: { calendarId },
  });
}

/** Campos de calendario con la forma que el panel lleva leyendo desde
 * siempre (`googleCalendarConnected`, `outlookUserEmail`, ...), calculados
 * desde las filas. Mantiene el contrato de GET/PATCH /business/me,
 * POST /calendar/select y POST /calendar/auth/microsoft/connect sin que el
 * frontend tenga que cambiar. Nunca incluye credenciales. */
export function camposDeCalendarioParaElPanel(
  conexiones: FilaDeConexion[] | null | undefined
) {
  const fila = (provider: CalendarProviderId) =>
    conexiones?.find((c) => c.provider === provider) ?? null;
  const google = fila("google");
  const outlook = fila("outlook");
  return {
    googleCalendarId: google?.calendarId ?? null,
    googleCalendarConnected: google?.connected ?? false,
    googleCalendarDisconnectedAt: google?.disconnectedAt ?? null,
    googleCalendarLastError: google?.lastError ?? null,
    outlookCalendarId: outlook?.calendarId ?? null,
    outlookCalendarConnected: outlook?.connected ?? false,
    outlookCalendarDisconnectedAt: outlook?.disconnectedAt ?? null,
    outlookCalendarLastError: outlook?.lastError ?? null,
    outlookUserEmail: outlook?.accountEmail ?? null,
  };
}

/** Forma pública de un Business para el panel: quita `calendarConnections`
 * (lleva las credenciales) y añade los campos de calendario históricos. Es
 * la ÚNICA manera correcta de devolver un Business al cliente. */
export function serializarBusiness<
  T extends { calendarConnections?: FilaDeConexion[] | null },
>(
  business: T
): Omit<T, "calendarConnections"> &
  ReturnType<typeof camposDeCalendarioParaElPanel> {
  const { calendarConnections, ...resto } = business;
  return { ...resto, ...camposDeCalendarioParaElPanel(calendarConnections) };
}
