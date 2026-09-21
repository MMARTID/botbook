import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { calendarService } from "./service.js";
import {
  conexionConfirmada,
  marcarCalendarioDesconectado,
  resolverConexionDeCalendario,
  SELECT_CONEXION_DE_CALENDARIO,
  type ConexionResuelta,
  serializarBusiness,
} from "./conexion.js";
import {
  DESCRIPTORES_DE_PROVEEDOR,
  SERVIDOR_CALDAV_ICLOUD,
} from "../../adapters/calendar/CalendarProvider.js";
import {
  codigoDeReconexion,
  esCalendarBusinessError,
  proveedorDesdeErrorDeReconexion,
} from "../../adapters/calendar/errors.js";
import { z } from "zod";
import { appUrl } from "../../lib/urls.js";

const UpcomingEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(15).default(15),
});

/** Alta de un calendario CalDAV. El formulario del panel fija iCloud
 * (Apple ID + contraseña de aplicación); `serverUrl` queda para otros
 * servidores CalDAV por API. La contraseña de aplicación de Apple tiene la
 * forma xxxx-xxxx-xxxx-xxxx, pero no se valida el formato: otros servidores
 * usan otras. */
const ConnectCaldavSchema = z.object({
  username: z.string().trim().min(1, "Falta el usuario (Apple ID)."),
  appPassword: z
    .string()
    .trim()
    .min(1, "Falta la contraseña de aplicación."),
  serverUrl: z
    .string()
    .trim()
    .url("La URL del servidor no es válida.")
    .default(SERVIDOR_CALDAV_ICLOUD),
});

const ConnectMicrosoftCalendarSchema = z.object({
  calendarId: z.string().min(1),
});

const CALENDAR_OAUTH_STATE_TTL_SECONDS = 10 * 60;
const GOOGLE_CALENDAR_OAUTH_STATE_COOKIE = "alhabla_google_calendar_oauth_state";
const MICROSOFT_CALENDAR_OAUTH_STATE_COOKIE = "alhabla_microsoft_calendar_oauth_state";

function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return undefined;
  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator === -1) continue;
    if (cookie.slice(0, separator).trim() === name) {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    }
  }
  return undefined;
}

function setStateCookie(reply: FastifyReply, name: string, value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`,
  );
}

function stateFromAuthUrl(url: string) {
  const state = new URL(url).searchParams.get("state");
  if (!state) throw new Error("La URL de autorización no contiene state.");
  return state;
}

/** Conexión de calendario del negocio autenticado, resuelta por conexion.ts
 * (las rutas no conocen las columnas de Google ni de Outlook). */
async function cargarConexion(businessId: string): Promise<ConexionResuelta> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: SELECT_CONEXION_DE_CALENDARIO,
  });
  return resolverConexionDeCalendario(business);
}

/** 409 del panel cuando el proveedor activo no está confirmado como
 * conectado (flag && token). Mismo texto en inglés que siempre. */
function respuestaNoConectado(reply: FastifyReply, conexion: ConexionResuelta) {
  return reply.status(409).send({
    code: codigoDeReconexion(conexion.provider),
    error: `${DESCRIPTORES_DE_PROVEEDOR[conexion.provider].nombreCorto} Calendar is not connected`,
  });
}

/** Errores de calendario en las rutas del panel: reconexión requerida ⇒ se
 * marca desconectado (modo panel: conserva el refresh token, guarda el
 * motivo e invalida la caché de voz) y 409; cualquier otro
 * CalendarBusinessError ⇒ 502. Devuelve null si el error no es de
 * calendario para que la ruta siga con su 500. */
async function responderErrorDeCalendario(
  reply: FastifyReply,
  businessId: string,
  error: unknown
) {
  const proveedorRoto = proveedorDesdeErrorDeReconexion(error);
  if (proveedorRoto && esCalendarBusinessError(error)) {
    await marcarCalendarioDesconectado(businessId, proveedorRoto, {
      modo: "panel",
      motivo: error.message,
    });
    return reply.status(409).send({ code: error.code, error: error.message });
  }
  if (esCalendarBusinessError(error)) {
    return reply.status(502).send({ code: error.code, error: error.message });
  }
  return null;
}

export async function calendarRoutes(fastify: FastifyInstance) {
  
  // 1. Endpoint para que el frontend solicite la URL de autenticación
  fastify.get(
    "/auth/google",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const businessId = request.user!.businessId;
        const url = await calendarService.getAuthUrl(businessId);
        setStateCookie(
          reply,
          GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
          stateFromAuthUrl(url),
          CALENDAR_OAUTH_STATE_TTL_SECONDS,
        );
        return reply.send({ url });
      } catch (error) {
        return reply.status(500).send({ error: "Failed to generate Google Auth URL" });
      }
    }
  );

  fastify.get(
    "/events/upcoming",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply) => {
      try {
        const { limit } = UpcomingEventsQuerySchema.parse(request.query);
        const businessId = request.user!.businessId;
        const conexion = await cargarConexion(businessId);

        if (!conexionConfirmada(conexion)) {
          return respuestaNoConectado(reply, conexion);
        }

        const events = await calendarService.getUpcomingEvents(conexion, limit);

        return reply.send({ events, provider: conexion.provider });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ code: "INVALID_QUERY", error: error.errors });
        }

        const respondido = await responderErrorDeCalendario(
          reply,
          request.user!.businessId,
          error
        );
        if (respondido) return respondido;

        fastify.log.error(error);
        return reply.status(500).send({
          code: "CALENDAR_EVENTS_FAILED",
          error: "Failed to fetch upcoming calendar events",
        });
      }
    }
  );

  fastify.get(
    "/calendars",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const businessId = request.user!.businessId;
        const conexion = await cargarConexion(businessId);

        if (!conexionConfirmada(conexion)) {
          return respuestaNoConectado(reply, conexion);
        }

        const calendars = await calendarService.listarCalendarios(conexion);

        return reply.send({
          provider: conexion.provider,
          // El id crudo de la columna, sin el default del proveedor: el panel
          // distingue "no se ha elegido" de "primary".
          selectedCalendarId: conexion.calendarIdConfigurado,
          calendars,
        });
      } catch (error) {
        const respondido = await responderErrorDeCalendario(
          reply,
          request.user!.businessId,
          error
        );
        if (respondido) return respondido;

        fastify.log.error(error);
        return reply.status(500).send({
          code: "CALENDAR_LIST_FAILED",
          error: "Failed to fetch calendars",
        });
      }
    }
  );

  fastify.post(
    "/select",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest<{ Body: { calendarId: string } }>, reply) => {
      try {
        const { calendarId } = ConnectMicrosoftCalendarSchema.parse(request.body);
        const businessId = request.user!.businessId;
        const updated = await calendarService.seleccionarCalendario(
          businessId,
          calendarId
        );

        return reply.send(serializarBusiness(updated));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.flatten() });
        }
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to select calendar" });
      }
    },
  );

  fastify.get(
    "/auth/microsoft",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const businessId = request.user!.businessId;
        const url = await calendarService.getMicrosoftAuthUrl(businessId);
        setStateCookie(
          reply,
          MICROSOFT_CALENDAR_OAUTH_STATE_COOKIE,
          stateFromAuthUrl(url),
          CALENDAR_OAUTH_STATE_TTL_SECONDS,
        );
        return reply.send({ url });
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to generate Microsoft Auth URL" });
      }
    },
  );

  fastify.post(
    "/auth/microsoft/connect",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest<{ Body: { calendarId: string } }>, reply) => {
      try {
        const { calendarId } = ConnectMicrosoftCalendarSchema.parse(request.body);
        const business = await calendarService.connectMicrosoftCalendar(request.user!.businessId, calendarId);
        return reply.send(serializarBusiness(business));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.flatten() });
        }
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to connect Outlook calendar" });
      }
    },
  );

  // Alta sin OAuth: Apple/iCloud (CalDAV). Valida las credenciales contra el
  // servidor, guarda la conexión sin calendario elegido y devuelve la lista
  // de calendarios; el panel termina con POST /calendar/select.
  fastify.post(
    "/auth/caldav/connect",
    { preValidation: [fastify.authenticate] },
    async (
      request: FastifyRequest<{
        Body: { username: string; appPassword: string; serverUrl?: string };
      }>,
      reply
    ) => {
      try {
        const datos = ConnectCaldavSchema.parse(request.body);
        const resultado = await calendarService.conectarConCredenciales(
          request.user!.businessId,
          {
            provider: "caldav",
            serverUrl: datos.serverUrl,
            username: datos.username,
            appPassword: datos.appPassword,
          }
        );
        return reply.send(resultado);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.flatten() });
        }
        // Credenciales rechazadas por el servidor: error del usuario, no del
        // sistema (400 con mensaje hablable, sin marcar nada como
        // desconectado: todavía no hay conexión).
        if (
          esCalendarBusinessError(error) &&
          error.code === "CALDAV_CALENDAR_RECONNECT_REQUIRED"
        ) {
          return reply.status(400).send({
            code: "CALDAV_INVALID_CREDENTIALS",
            error:
              "Apple ID o contraseña de aplicación incorrectos. Genera una contraseña de aplicación en appleid.apple.com y vuelve a intentarlo.",
          });
        }
        if (esCalendarBusinessError(error)) {
          return reply.status(502).send({ code: error.code, error: error.message });
        }
        fastify.log.error(error);
        return reply
          .status(500)
          .send({ error: "No se pudo conectar el calendario de Apple" });
      }
    }
  );

  // 2. Endpoint de Callback que Google llamará con el código
  // NOTA: Como la redirección de Google es un GET que ocurre en el navegador, 
  // normalmente no pasamos el token en la cabecera, así que el 'state' será nuestro identificador de seguridad.
  fastify.get(
    "/auth/google/callback",
    async (request: FastifyRequest<{ Querystring: { code: string; state: string; error?: string } }>, reply) => {
      try {
        const { code, state, error } = request.query;
        const expectedState = readCookie(
          request.headers.cookie,
          GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
        );
        setStateCookie(reply, GOOGLE_CALENDAR_OAUTH_STATE_COOKIE, "", 0);

        if (!state || !expectedState || state !== expectedState) {
          return reply.redirect(`${appUrl()}/settings?calendar_error=invalid_state`);
        }

        if (error) {
          return reply.redirect(`${appUrl()}/settings?calendar_error=${error}`);
        }

        if (!code || !state) {
          return reply.status(400).send({ error: "Missing code or state" });
        }

        // Procesar la conexión — handleCallback verifica el `state` contra
        // Redis (ver comentario en calendar/service.ts) antes de asociar el
        // token de Google a ningún negocio.
        const result = await calendarService.handleCallback(code, state);
        if (result.calendars.length === 0) {
          // Sin lista (sin refresh token nuevo o fallo al listar): conectado
          // a «primary», como antes.
          return reply.redirect(`${appUrl()}/settings?calendar_success=true`);
        }
        // Como Outlook: el dueño elige el calendario en el panel.
        const payload = encodeURIComponent(JSON.stringify(result));
        return reply.redirect(`${appUrl()}/settings?google_calendars=${payload}`);
      } catch (error) {
        fastify.log.error(error);
        return reply.redirect(`${appUrl()}/settings?calendar_error=true`);
      }
    }
  );

  fastify.get(
    "/auth/microsoft/callback",
    async (request: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string } }>, reply) => {
      try {
        const { code, state, error } = request.query;
        const expectedState = readCookie(
          request.headers.cookie,
          MICROSOFT_CALENDAR_OAUTH_STATE_COOKIE,
        );
        setStateCookie(reply, MICROSOFT_CALENDAR_OAUTH_STATE_COOKIE, "", 0);

        if (!state || !expectedState || state !== expectedState) {
          return reply.redirect(`${appUrl()}/settings?outlook_error=invalid_state`);
        }

        if (error) {
          return reply.redirect(`${appUrl()}/settings?outlook_error=${encodeURIComponent(error)}`);
        }

        if (!code || !state) {
          return reply.redirect(`${appUrl()}/settings?outlook_error=missing_code`);
        }

        const result = await calendarService.handleMicrosoftCallback(code, state);
        const payload = encodeURIComponent(JSON.stringify(result));
        return reply.redirect(`${appUrl()}/settings?outlook_calendars=${payload}`);
      } catch (error) {
        fastify.log.error(error);
        return reply.redirect(`${appUrl()}/settings?outlook_error=true`);
      }
    },
  );
}
