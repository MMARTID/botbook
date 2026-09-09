import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import { prisma } from "../../lib/prisma.js";
import { getRedis } from "../../lib/redis.js";
import { vapiAdapter } from "../../adapters/vapi/VapiAdapter.js";
import {
  retellAdapter,
  type RetellTool,
} from "../../adapters/retell/RetellAdapter.js";
import { getPublicWebhookBaseUrl } from "../../lib/serverUrl.js";
import {
  createMicrosoftCalendarEvent,
  exchangeMicrosoftCode,
  getMicrosoftAuthUrl,
  getMicrosoftProfile,
  listMicrosoftBusyIntervals,
  listMicrosoftCalendars,
  listMicrosoftUpcomingEvents,
  refreshMicrosoftAccessToken,
  type MicrosoftCalendar,
} from "../../lib/microsoftGraph.js";

/** Recordatorio nativo de la app de calendario (Google Calendar / Outlook en
 * el móvil) que dispara la notificación push al propietario 2h antes de la
 * cita — no requiere ningún job ni canal de notificación propio, ambas
 * plataformas lo gestionan solas a partir de este campo del evento. */
const REMINDER_MINUTES_BEFORE_START = 120;

/** Límite documentado de Google Calendar para reminders.overrides[].minutes
 * (4 semanas) — Microsoft Graph no impone uno menor para
 * reminderMinutesBeforeStart, así que reutilizarlo para ambos providers es
 * seguro. */
const MAX_REMINDER_MINUTES = 40_320;

/** Google Calendar no avisa al propietario de que se creó un evento nuevo
 * por el simple hecho de insertarlo en su propio calendario (confirmado con
 * la documentación oficial — solo notifica a invitados vía sendUpdates, o
 * mediante un reminder configurado). Para lograr el aviso inmediato que
 * REMINDER_MINUTES_BEFORE_START no cubre si la cita es para dentro de más de
 * 2h, se calcula un segundo reminder cuyo "minutos antes del evento" resulta
 * en que dispare casi en el instante de la creación — un reminder normal,
 * no una notificación push especial, así que ambas apps lo soportan igual.
 * Un evento cuya cita ya está a <1 minuto (o en el pasado, si el reloj del
 * cliente y el servidor difieren un poco) usa 0 en vez de un valor negativo,
 * que Google/Outlook rechazarían. Si la cita está a más de
 * MAX_REMINDER_MINUTES vista (nada en el código impone un máximo de
 * antelación de reserva — checkBookingRestrictions solo valida un mínimo),
 * ese "minutos antes" ya no cabe en el límite de la API y devolvemos null:
 * mejor omitir el aviso inmediato que hacer fallar la reserva entera
 * intentando mandar un valor que Google/Outlook van a rechazar. */
function buildImmediateReminderMinutes(startTime: Date): number | null {
  // Math.floor ya trunca hacia abajo (hasta ~1 minuto de margen natural: si
  // faltan 60.9 minutos da 60, no 61), así que no hace falta restar un
  // minuto extra encima — eso solo añadía otro minuto de espera innecesario.
  // Confirmado en una llamada real de prueba (2026-09-07): la notificación
  // tardó "casi un minuto" en llegar con el margen doble.
  const minutes = Math.max(
    0,
    Math.floor((startTime.getTime() - Date.now()) / 60_000)
  );
  return minutes <= MAX_REMINDER_MINUTES ? minutes : null;
}

/** Título y descripción del evento con todo lo que se conoce de la reserva.
 * Antes el evento solo llevaba "Reserva de <nombre>" y una frase genérica;
 * sin servicio, profesional ni teléfono, el propietario tenía que volver a
 * la app de Alhabla para saber de qué iba la cita. */
function buildEventContent(input: {
  clientName: string;
  clientPhone?: string | null;
  serviceNames?: string[] | null;
  professionalName?: string | null;
}) {
  const services = input.serviceNames?.filter(Boolean) ?? [];
  const summary =
    services.length > 0
      ? `${services.join(" + ")} — ${input.clientName}`
      : `Reserva de ${input.clientName}`;

  const descriptionLines = [
    `Cliente: ${input.clientName}`,
    input.clientPhone ? `Teléfono: ${input.clientPhone}` : null,
    services.length > 0
      ? `Servicio${services.length > 1 ? "s" : ""}: ${services.join(", ")}`
      : null,
    input.professionalName ? `Profesional: ${input.professionalName}` : null,
    "",
    "Cita generada por el asistente virtual de Alhabla.",
  ].filter((line) => line !== null);

  return { summary, description: descriptionLines.join("\n") };
}

// Helper: create a new OAuth2 client per operation to avoid shared mutable state
function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export type CalendarBusinessErrorCode =
  | "GOOGLE_CALENDAR_RECONNECT_REQUIRED"
  | "OUTLOOK_CALENDAR_RECONNECT_REQUIRED"
  | "BOOK_APPOINTMENT_FAILED"
  | "CALENDAR_TIMEOUT"
  | "CALENDAR_RATE_LIMITED";

// Límite propio bajo el timeout de 20s que Retell aplica a cada tool call:
// así el backend corta la petición él mismo en vez de dejarla colgada
// respondiendo a nadie cuando Retell ya se rindió.
const CALENDAR_REQUEST_TIMEOUT_MS = 8000;

export class CalendarBusinessError extends Error {
  code: CalendarBusinessErrorCode;
  constructor(code: CalendarBusinessErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "CalendarBusinessError";
  }
}

// Detecta timeouts o rate limiting de Google, distintos de un fallo de credencial.
function classifyGoogleTransientError(
  error: unknown
): "timeout" | "rate_limit" | null {
  const e = error as any;
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
  const e = error as any;

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

// El callback de OAuth es un endpoint público (Google/Microsoft lo llaman
// por redirect del navegador, sin nuestro JWT) — el `state` es la única
// defensa contra que alguien complete SU PROPIO código de autorización con
// el `state` (antes, businessId en claro) de OTRO negocio, sustituyendo su
// calendario conectado por el del atacante. Se genera un token opaco de un
// solo uso, ligado al businessId en Redis, y se consume (getdel) en el
// callback — un `state` reutilizado, caducado o inventado no resuelve a
// ningún negocio.
const CALENDAR_OAUTH_STATE_TTL_SECONDS = 10 * 60;

function calendarOAuthStateRedisKey(
  provider: "google" | "microsoft",
  state: string
): string {
  return `calendar_oauth_state:${provider}:${state}`;
}

async function createCalendarOAuthState(
  provider: "google" | "microsoft",
  businessId: string
): Promise<string> {
  const state = randomBytes(32).toString("base64url");
  await getRedis().set(
    calendarOAuthStateRedisKey(provider, state),
    businessId,
    "EX",
    CALENDAR_OAUTH_STATE_TTL_SECONDS
  );
  return state;
}

async function consumeCalendarOAuthState(
  provider: "google" | "microsoft",
  state: string
): Promise<string | null> {
  return getRedis().getdel(calendarOAuthStateRedisKey(provider, state));
}

/** voice_config:<businessId> (voiceTools/service.ts) cachea calendarProvider
 * y las credenciales de calendario hasta 1h — sin invalidar aquí, una
 * llamada de voz dentro de esa hora sigue usando el proveedor o la cuenta
 * anteriores aunque el panel ya muestre la nueva conexión (hallazgo #8 de la
 * auditoría). Se llama tras cualquier escritura que toque
 * calendarProvider/refreshToken/calendarId de un negocio. */
async function invalidateVoiceConfigCache(businessId: string): Promise<void> {
  try {
    await getRedis().del(`voice_config:${businessId}`);
  } catch (err) {
    console.error(
      `[Calendar] No se pudo invalidar la caché de configuración de voz para ${businessId}:`,
      err
    );
  }
}

// Usamos instancias por llamada; esto evita condiciones de carrera entre negocios
export class CalendarService {
  constructor() {}

  async getAuthUrl(businessId: string): Promise<string> {
    const state = await createCalendarOAuthState("google", businessId);
    const oauth2Client = createOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
      ],
      state,
    });
    return url;
  }

  async handleCallback(code: string, state: string): Promise<any> {
    const businessId = await consumeCalendarOAuthState("google", state);
    if (!businessId) {
      throw new Error(
        "El enlace de autorización de Google ha caducado, ya se usó, o no es válido."
      );
    }

    const oauth2Client = createOAuth2Client();

    const { tokens } = await oauth2Client.getToken(code);

    if (tokens.refresh_token) {
      await prisma.business.update({
        where: { id: businessId },
        data: {
          calendarProvider: "google",
          googleRefreshToken: tokens.refresh_token,
          googleCalendarId: "primary",
          googleCalendarConnected: true,
          googleCalendarDisconnectedAt: null,
          googleCalendarLastError: null,
        },
      });

      await invalidateVoiceConfigCache(businessId);
      await this.syncCalendarToolsToAgents(businessId);
    }

    return tokens;
  }

  async getMicrosoftAuthUrl(businessId: string): Promise<string> {
    const state = await createCalendarOAuthState("microsoft", businessId);
    return getMicrosoftAuthUrl(state);
  }

  async handleMicrosoftCallback(code: string, state: string) {
    const businessId = await consumeCalendarOAuthState("microsoft", state);
    if (!businessId) {
      throw new Error(
        "El enlace de autorización de Microsoft ha caducado, ya se usó, o no es válido."
      );
    }

    const tokens = await exchangeMicrosoftCode(code);
    const profile = await getMicrosoftProfile(tokens.access_token);
    const calendars = await listMicrosoftCalendars(tokens.access_token);

    await prisma.business.update({
      where: { id: businessId },
      data: {
        calendarProvider: "outlook",
        outlookRefreshToken: tokens.refresh_token,
        outlookCalendarConnected: false,
        outlookCalendarDisconnectedAt: null,
        outlookCalendarLastError: null,
        outlookUserEmail: profile.mail ?? profile.userPrincipalName ?? null,
      },
    });
    await invalidateVoiceConfigCache(businessId);

    return {
      calendars,
      email: profile.mail ?? profile.userPrincipalName ?? null,
    } satisfies { calendars: MicrosoftCalendar[]; email: string | null };
  }

  async connectMicrosoftCalendar(businessId: string, calendarId: string) {
    const business = await prisma.business.update({
      where: { id: businessId },
      data: {
        calendarProvider: "outlook",
        outlookCalendarId: calendarId,
        outlookCalendarConnected: true,
        outlookCalendarDisconnectedAt: null,
        outlookCalendarLastError: null,
      },
    });

    await invalidateVoiceConfigCache(businessId);
    await this.syncCalendarToolsToAgents(businessId);
    return business;
  }

  async listGoogleCalendars(googleRefreshToken: string) {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: googleRefreshToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    try {
      const response = await calendar.calendarList.list();
      return (response.data.items ?? [])
        .filter((item) => Boolean(item.id))
        .map((item) => ({
          id: item.id as string,
          name: item.summaryOverride || item.summary || "Sin nombre",
          primary: item.primary === true,
        }));
    } catch (err) {
      if (isGoogleInvalidGrantError(err)) {
        throw new CalendarBusinessError(
          "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
          "La conexión con Google ya no es válida."
        );
      }
      console.error(
        "[Calendar] Failed to list calendars:",
        getGoogleErrorDetails(err)
      );
      throw new CalendarBusinessError(
        "BOOK_APPOINTMENT_FAILED",
        "No se pudo obtener la lista de calendarios."
      );
    }
  }

  async listOutlookCalendars(outlookRefreshToken: string) {
    try {
      const { access_token } =
        await refreshMicrosoftAccessToken(outlookRefreshToken);
      const calendars = await listMicrosoftCalendars(access_token);
      return calendars.map((item) => ({
        id: item.id,
        name: item.name,
        primary: false,
      }));
    } catch (err) {
      const transient = classifyMicrosoftTransientError(err);
      if (transient === "rate_limit") {
        throw new CalendarBusinessError(
          "CALENDAR_RATE_LIMITED",
          "Outlook Calendar está limitando las peticiones en este momento."
        );
      }
      if (transient === "timeout") {
        throw new CalendarBusinessError(
          "CALENDAR_TIMEOUT",
          "Outlook Calendar está tardando más de lo normal en responder."
        );
      }
      console.error("[Calendar] Failed to list Outlook calendars:", err);
      throw new CalendarBusinessError(
        "OUTLOOK_CALENDAR_RECONNECT_REQUIRED",
        "La conexión con Outlook ya no es válida."
      );
    }
  }

  async selectGoogleCalendar(businessId: string, calendarId: string) {
    const business = await prisma.business.update({
      where: { id: businessId },
      data: {
        calendarProvider: "google",
        googleCalendarId: calendarId,
        googleCalendarConnected: true,
        googleCalendarDisconnectedAt: null,
        googleCalendarLastError: null,
      },
    });
    await invalidateVoiceConfigCache(businessId);
    return business;
  }

  private buildVapiCalendarTools(serverUrl: string): any[] {
    return [
      {
        type: "function",
        messages: [
          {
            type: "request-start",
            content: "Un momento, lo consulto.",
          },
          {
            type: "request-failed",
            content: "No he podido consultar esa información en este momento.",
          },
        ],
        function: {
          name: "get_catalog",
          description:
            "Obtiene servicios con IDs y duraciones, profesionales y horario. Úsala cuando el cliente pregunte por ellos o antes de comprobar una cita si necesitas esos datos.",
          parameters: {
            type: "object",
            properties: {},
          },
        },
        server: { url: serverUrl },
      },
      {
        type: "function",
        messages: [
          {
            type: "request-start",
            content:
              "Un momento, estoy comprobando disponibilidad teniendo en cuenta la capacidad y los profesionales libres...",
          },
          {
            type: "request-complete",
            content: "Ya he comprobado la disponibilidad.",
          },
          {
            type: "request-failed",
            content:
              "No he podido comprobar la disponibilidad en este momento.",
          },
        ],
        function: {
          name: "check_availability",
          description:
            "Comprueba una cita y valida horario, restricciones, capacidad, profesionales y calendario real. Conserva el availabilityToken que devuelve para reservar.",
          parameters: {
            type: "object",
            properties: {
              startDateTime: {
                type: "string",
                description:
                  "Inicio solicitado en formato ISO 8601, incluyendo zona horaria.",
              },
              durationMinutes: {
                type: "number",
                description: "Duración total de la cita en minutos.",
              },
              serviceIds: {
                type: "array",
                items: { type: "string" },
                description:
                  "IDs de los servicios pedidos (opcional; puede ser más de uno si el cliente pide varios servicios en la misma cita, ej. corte y mechas). Se prioriza al profesional que domine todos esos servicios.",
              },
            },
            required: ["startDateTime", "durationMinutes"],
          },
        },
        server: { url: serverUrl },
      },
      {
        type: "function",
        messages: [
          {
            type: "request-start",
            content:
              "Un momento, estoy revisando el calendario para registrar tu cita...",
          },
          {
            type: "request-complete",
            content: "¡Perfecto! Ya he agendado la cita en el calendario.",
          },
          {
            type: "request-failed",
            content:
              "Lo siento, hubo un error al intentar agendar la cita. ¿Podemos intentarlo de nuevo?",
          },
          {
            type: "request-response-delayed",
            content:
              "Esto está tardando un poco más de lo normal, sigo revisando el calendario...",
            timingMilliseconds: 1200,
          },
        ],
        function: {
          name: "book_appointment",
          description:
            "Agenda una cita. Úsala solo tras confirmación explícita y con el availabilityToken de check_availability.",
          parameters: {
            type: "object",
            properties: {
              clientName: {
                type: "string",
                description: "El nombre del cliente que hace la reserva",
              },
              clientEmail: {
                type: "string",
                description:
                  "El correo electrónico del cliente, si lo proporciona (opcional)",
              },
              clientPhone: {
                type: "string",
                description:
                  "Teléfono de contacto solo si el cliente elige uno distinto (opcional).",
              },
              availabilityToken: {
                type: "string",
                description:
                  "Token exacto devuelto por check_availability.",
              },
            },
            required: ["clientName", "availabilityToken"],
          },
        },
        server: { url: serverUrl },
      },
    ];
  }

  private buildRetellCalendarTools(
    baseUrl: string,
    retellAgentId: string
  ): RetellTool[] {
    const toolBaseUrl = `${baseUrl.replace(/\/$/, "")}/webhooks/retell/tools/${retellAgentId}`;
    return [
      {
        name: "get_catalog",
        description:
          "Obtiene los servicios activos con sus IDs y duraciones, los profesionales y el horario del negocio. Úsala cuando el cliente pregunte por ellos o antes de comprobar/reservar si necesitas un ID o duración.",
        url: `${toolBaseUrl}/get_catalog`,
        method: "POST",
        args_at_root: false,
        parameters: {
          type: "object",
          properties: {},
        },
        speak_during_execution: false,
        speak_after_execution: true,
        timeout_ms: 20000,
      },
      {
        name: "check_availability",
        description:
          "Comprueba una cita en una fecha y hora concretas: valida horario, restricciones, capacidad, profesionales y calendario real. Úsala antes de book_appointment y conserva el availabilityToken que devuelve.",
        url: `${toolBaseUrl}/check_availability`,
        method: "POST",
        args_at_root: false,
        parameters: {
          type: "object",
          properties: {
            startDateTime: {
              type: "string",
              description:
                "Inicio solicitado en formato ISO 8601, incluyendo zona horaria.",
            },
            durationMinutes: {
              type: "number",
              description: "Duración total de la cita en minutos.",
            },
            serviceIds: {
              type: "array",
              items: { type: "string" },
              description:
                "IDs de los servicios pedidos (opcional; puede ser más de uno si el cliente pide varios servicios en la misma cita, ej. corte y mechas). Se prioriza al profesional que domine todos esos servicios.",
            },
            professionalId: {
              type: "string",
              description:
                "ID exacto de EMPLEADOS si el cliente pidió un profesional concreto por nombre (opcional). Déjalo vacío si no.",
            },
          },
          required: ["startDateTime", "durationMinutes"],
        },
        // Retell habla mientras la consulta está en curso, de modo que no
        // hay un turno del LLM previo solo para decir "un momento".
        speak_during_execution: true,
        speak_after_execution: true,
        timeout_ms: 20000,
      },
      {
        name: "book_appointment",
        description:
          "Agenda una cita en el calendario activo. Úsala solo tras confirmación explícita y con el availabilityToken de check_availability.",
        url: `${toolBaseUrl}/book_appointment`,
        method: "POST",
        args_at_root: false,
        parameters: {
          type: "object",
          properties: {
            clientName: {
              type: "string",
              description: "El nombre del cliente que hace la reserva",
            },
            clientEmail: {
              type: "string",
              description:
                "El correo electrónico del cliente, si lo proporciona (opcional)",
            },
              clientPhone: {
                type: "string",
                description:
                  "Teléfono de contacto solo si el cliente eligió uno distinto a {{user_number}} (opcional).",
              },
              availabilityToken: {
                type: "string",
                description:
                  "Token exacto devuelto por check_availability para la opción confirmada.",
              },
            },
          required: ["clientName", "availabilityToken"],
        },
        speak_during_execution: true,
        speak_after_execution: true,
        timeout_ms: 20000,
      },
      {
        // Sin esta tool el agente no tiene ninguna forma de colgar: tras
        // despedirse sigue contestando indefinidamente y la llamada solo
        // termina cuando cuelga el cliente o se agota max_call_duration_ms,
        // facturando mientras tanto. Detectado con la batería de simulación
        // el 2026-09-06 (las despedidas encadenadas hacían que Retell
        // abortara la conversación por bucle).
        type: "end_call",
        name: "end_call",
        description:
          "Cuelga la llamada. Úsala solo después de despedirte, cuando la conversación ha terminado: la cita ha quedado confirmada, has tomado el recado, o el cliente se despide o dice que no necesita nada más. No la uses mientras siga habiendo algo pendiente.",
      },
    ];
  }

  async syncCalendarToolsToAgents(businessId: string) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { orchestrator: true },
    });

    if (!business) {
      console.error(
        `[Calendar] No se encontró negocio ${businessId} para sincronizar tools`
      );
      return;
    }

    const orchestrator = business.orchestrator || "retell";
    const agents = await prisma.agent.findMany({
      where: { businessId },
    });

    for (const agent of agents) {
      if (orchestrator === "retell" && agent.retellLlmId) {
        if (!agent.retellAgentId) {
          console.error(
            `[Calendar] Agente ${agent.id} tiene retellLlmId pero no retellAgentId; no se pueden registrar tools`
          );
          continue;
        }

        const baseUrl = getPublicWebhookBaseUrl();
        if (!baseUrl) {
          console.error(
            "[Calendar] No hay URL pública configurada (BASE_URL o ngrok); no se pueden sincronizar tools de Retell"
          );
          continue;
        }

        try {
          const retellTools = this.buildRetellCalendarTools(
            baseUrl,
            agent.retellAgentId
          );
          await retellAdapter.updateLlm(agent.retellLlmId, {
            tools: retellTools,
          });
          console.log(
            `[Calendar] Tools de calendario sincronizadas en Retell LLM ${agent.retellLlmId}`
          );
        } catch (e) {
          console.error(
            `[Calendar] Error inyectando tools de calendario en Retell LLM ${agent.retellLlmId}`,
            e
          );
        }

        continue;
      }

      // VAPI: inactivo, ningún negocio nuevo cae aquí (ver voiceOrchestrator.ts).
      if (orchestrator === "vapi" && agent.vapiAssistantId) {
        const serverUrl =
          process.env.VAPI_WEBHOOK_URL ||
          `${process.env.BASE_URL}/webhooks/vapi`;
        try {
          const assistant = await vapiAdapter.getAssistant(
            agent.vapiAssistantId
          );
          const assistantData = assistant as any;
          const existingTools =
            assistantData.model?.tools || assistantData.tools || [];
          const managedToolNames = new Set([
            "book_appointment",
            "get_catalog",
            "check_availability",
          ]);
          const otherTools = existingTools.filter(
            (tool: any) => !managedToolNames.has(tool?.function?.name)
          );

          await vapiAdapter.updateAssistant(agent.vapiAssistantId, {
            model: {
              provider: agent.llmProvider,
              model: agent.llmModel,
              tools: [...otherTools, ...this.buildVapiCalendarTools(serverUrl)],
            },
          });
        } catch (e) {
          console.error(
            `[Calendar] Error inyectando tools de calendario en Vapi assistant ${agent.vapiAssistantId}`,
            e
          );
        }

        continue;
      }
    }
  }

  async getUpcomingEvents(
    provider: "google" | "outlook",
    options: {
      googleRefreshToken?: string | null;
      googleCalendarId?: string | null;
      outlookRefreshToken?: string | null;
      outlookCalendarId?: string | null;
    },
    maxResults: number = 5
  ) {
    const safeMaxResults = Math.min(Math.max(Math.trunc(maxResults), 1), 15);

    if (provider === "outlook") {
      if (!options.outlookRefreshToken || !options.outlookCalendarId) {
        throw new CalendarBusinessError(
          "OUTLOOK_CALENDAR_RECONNECT_REQUIRED",
          "El negocio no tiene conectado Outlook Calendar."
        );
      }

      try {
        const tokenResponse = await refreshMicrosoftAccessToken(
          options.outlookRefreshToken
        );
        return await listMicrosoftUpcomingEvents(
          tokenResponse.access_token,
          options.outlookCalendarId,
          safeMaxResults
        );
      } catch (error) {
        const transient = classifyMicrosoftTransientError(error);
        if (transient === "rate_limit") {
          throw new CalendarBusinessError(
            "CALENDAR_RATE_LIMITED",
            "Outlook Calendar está limitando las peticiones en este momento."
          );
        }
        if (transient === "timeout") {
          throw new CalendarBusinessError(
            "CALENDAR_TIMEOUT",
            "Outlook Calendar está tardando más de lo normal en responder."
          );
        }
        throw new CalendarBusinessError(
          "OUTLOOK_CALENDAR_RECONNECT_REQUIRED",
          "La conexión con Outlook ya no es válida."
        );
      }
    }

    if (!options.googleRefreshToken) {
      throw new CalendarBusinessError(
        "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
        "El negocio no tiene conectado Google Calendar."
      );
    }

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: options.googleRefreshToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const calendarId = options.googleCalendarId || "primary";

    try {
      const response = await calendar.events.list({
        calendarId,
        timeMin: new Date().toISOString(),
        maxResults: safeMaxResults,
        singleEvents: true,
        orderBy: "startTime",
      });

      return (response.data.items || []).map((event) => ({
        id: event.id ?? null,
        summary: event.summary || "Sin título",
        start: event.start?.dateTime || event.start?.date || null,
        end: event.end?.dateTime || event.end?.date || null,
        location: event.location || null,
        htmlLink: event.htmlLink || null,
      }));
    } catch (err) {
      if (isGoogleInvalidGrantError(err)) {
        throw new CalendarBusinessError(
          "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
          "La conexión con Google ya no es válida."
        );
      }
      console.error(
        "[Calendar] Failed to list upcoming events:",
        getGoogleErrorDetails(err)
      );
      throw new CalendarBusinessError(
        "BOOK_APPOINTMENT_FAILED",
        "No se pudo obtener los eventos del calendario."
      );
    }
  }

  /**
   * Bloques ocupados del calendario REALMENTE conectado dentro de
   * [timeMin, timeMax) — la disponibilidad (checkAvailability en
   * availability.ts) solo consultaba las reservas guardadas en Postgres,
   * nunca el calendario en sí: una cita metida a mano en Google/Outlook no
   * bloqueaba el hueco, y cancelar una reserva desde el propio calendario
   * tampoco la liberaba aquí. Se degrada a "sin bloqueos" (array vacío) ante
   * cualquier fallo — nunca debe poder bloquear TODAS las reservas porque el
   * calendario esté lento o caído un momento; el propio Booking de Postgres
   * sigue siendo la red de seguridad mínima en ese caso.
   */
  async getBusyIntervals(input: {
    provider: "google" | "outlook";
    googleRefreshToken?: string | null;
    googleCalendarId?: string | null;
    outlookRefreshToken?: string | null;
    outlookCalendarId?: string | null;
    timeMin: Date;
    timeMax: Date;
  }): Promise<Array<{ start: Date; end: Date }>> {
    try {
      if (input.provider === "outlook") {
        if (!input.outlookRefreshToken || !input.outlookCalendarId) {
          return [];
        }
        const { access_token } = await refreshMicrosoftAccessToken(
          input.outlookRefreshToken
        );
        return await listMicrosoftBusyIntervals(
          access_token,
          input.outlookCalendarId,
          input.timeMin,
          input.timeMax
        );
      }

      if (!input.googleRefreshToken) {
        return [];
      }

      const oauth2Client = createOAuth2Client();
      oauth2Client.setCredentials({ refresh_token: input.googleRefreshToken });
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      const calendarId = input.googleCalendarId || "primary";

      const response = await calendar.freebusy.query(
        {
          requestBody: {
            timeMin: input.timeMin.toISOString(),
            timeMax: input.timeMax.toISOString(),
            items: [{ id: calendarId }],
          },
        },
        { timeout: CALENDAR_REQUEST_TIMEOUT_MS }
      );

      const busy = response.data.calendars?.[calendarId]?.busy ?? [];
      return busy
        .filter((interval): interval is { start: string; end: string } =>
          Boolean(interval.start && interval.end)
        )
        .map((interval) => ({
          start: new Date(interval.start),
          end: new Date(interval.end),
        }));
    } catch (err) {
      console.error(
        "[Calendar] No se pudo consultar la ocupación real del calendario, se ignora para esta comprobación:",
        getGoogleErrorDetails(err)
      );
      return [];
    }
  }

  async bookAppointment(input: {
    clientName: string;
    startDateTime: string;
    durationMinutes?: number;
    clientEmail?: string;
    clientPhone?: string | null;
    serviceNames?: string[] | null;
    professionalName?: string | null;
    provider: "google" | "outlook";
    googleRefreshToken?: string | null;
    googleCalendarId?: string | null;
    outlookRefreshToken?: string | null;
    outlookCalendarId?: string | null;
  }) {
    const {
      clientName,
      startDateTime,
      durationMinutes = 30,
      clientEmail,
      clientPhone,
      serviceNames,
      professionalName,
      provider,
      googleRefreshToken,
      googleCalendarId,
      outlookRefreshToken,
      outlookCalendarId,
    } = input;

    const startTime = new Date(startDateTime);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
    const { summary, description } = buildEventContent({
      clientName,
      clientPhone,
      serviceNames,
      professionalName,
    });

    if (provider === "outlook") {
      if (!outlookRefreshToken) {
        throw new CalendarBusinessError(
          "OUTLOOK_CALENDAR_RECONNECT_REQUIRED",
          "El negocio no tiene conectado Outlook Calendar."
        );
      }
      if (!outlookCalendarId) {
        throw new CalendarBusinessError(
          "BOOK_APPOINTMENT_FAILED",
          "No se ha seleccionado un calendario de Outlook."
        );
      }

      try {
        const { access_token } =
          await refreshMicrosoftAccessToken(outlookRefreshToken);
        const event = await createMicrosoftCalendarEvent({
          accessToken: access_token,
          calendarId: outlookCalendarId,
          subject: summary,
          startDateTime: startTime.toISOString(),
          endDateTime: endTime.toISOString(),
          attendeeEmail: clientEmail,
          description,
          // Microsoft Graph solo admite un único reminderMinutesBeforeStart
          // por evento (a diferencia de Google, que acepta varios overrides)
          // — se prioriza el aviso inmediato porque es el que resuelve el
          // problema real reportado (el propietario no se enteraba de que
          // había una reserva nueva), a costa de perder el aviso a 2h antes
          // en Outlook. Si la cita está demasiado lejos para que el aviso
          // inmediato sea válido (ver MAX_REMINDER_MINUTES), cae al de 2h.
          reminderMinutesBeforeStart:
            buildImmediateReminderMinutes(startTime) ??
            REMINDER_MINUTES_BEFORE_START,
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
            "La conexión con Outlook ha sido revocada o expiró."
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

    if (!googleRefreshToken) {
      throw new CalendarBusinessError(
        "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
        "El negocio no tiene conectado Google Calendar."
      );
    }

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: googleRefreshToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const event = {
      summary,
      description,
      start: { dateTime: startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
      attendees: clientEmail ? [{ email: clientEmail }] : [],
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
                minutes: buildImmediateReminderMinutes(startTime),
              },
              { method: "popup", minutes: REMINDER_MINUTES_BEFORE_START },
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

    const calendarId = googleCalendarId || "primary";

    try {
      const response = await calendar.events.insert(
        { calendarId, requestBody: event },
        { timeout: CALENDAR_REQUEST_TIMEOUT_MS }
      );
      return response.data;
    } catch (err) {
      if (isGoogleInvalidGrantError(err)) {
        throw new CalendarBusinessError(
          "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
          "La conexión con Google ha sido revocada o expiró."
        );
      }
      const transient = classifyGoogleTransientError(err);
      if (transient === "rate_limit") {
        throw new CalendarBusinessError(
          "CALENDAR_RATE_LIMITED",
          "Google Calendar está limitando las peticiones en este momento."
        );
      }
      if (transient === "timeout") {
        throw new CalendarBusinessError(
          "CALENDAR_TIMEOUT",
          "Google Calendar está tardando más de lo normal en responder."
        );
      }
      console.error(
        "[Calendar] Failed to create appointment:",
        getGoogleErrorDetails(err)
      );
      throw new CalendarBusinessError(
        "BOOK_APPOINTMENT_FAILED",
        "No se pudo crear el evento en Google Calendar."
      );
    }
  }
}

export const calendarService = new CalendarService();
