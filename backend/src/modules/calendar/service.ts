// Fachada del calendario. Aquí viven el flujo OAuth (Google y Microsoft), la
// selección de calendario, la sincronización de tools con los agentes de voz
// y las operaciones genéricas (ocupación, reservar, cancelar, próximos
// eventos, listar calendarios), que se delegan al adaptador del proveedor vía
// adapters/calendar/registry.ts. No hay ramas por proveedor: cualquier cosa
// específica de Google u Outlook va en su adaptador, y cualquier cosa que
// dependa de las columnas google*/outlook* de Business va en ./conexion.ts.
import { randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { getRedis } from "../../lib/redis.js";
import {
  retellAdapter,
  type RetellTool,
} from "../../adapters/retell/RetellAdapter.js";
import { getPublicWebhookBaseUrl } from "../../lib/serverUrl.js";
import { syncAgentToTelnyx } from "../../lib/telnyxAgentSync.js";
import { buildTelnyxVoiceTools } from "../../lib/telnyxAssistantPayload.js";
import {
  exchangeMicrosoftCode,
  getMicrosoftAuthUrl,
  getMicrosoftProfile,
  listMicrosoftCalendars,
  type MicrosoftCalendar,
} from "../../lib/microsoftGraph.js";
import {
  CalendarBusinessError,
  codigoDeReconexion,
  type CalendarBusinessErrorCode,
} from "../../adapters/calendar/errors.js";
import {
  DESCRIPTORES_DE_PROVEEDOR,
  normalizarProveedorDeCalendario,
  type CalendarBusyInterval,
  type CalendarBusyIntervalsResult,
  type CalendarConnection,
  type CalendarioDisponible,
  type ConexionActiva,
  type EventoCreado,
  type EventoProximo,
} from "../../adapters/calendar/CalendarProvider.js";
import {
  buildEventContent,
  buildImmediateReminderMinutes,
  hashDeIdempotencia,
  REMINDER_MINUTES_BEFORE_START,
} from "../../adapters/calendar/eventoDeCalendario.js";
import {
  crearClienteOAuthDeGoogle,
  isGoogleInvalidGrantError,
} from "../../adapters/calendar/google/GoogleCalendarProvider.js";
import { obtenerProveedorDeCalendario } from "../../adapters/calendar/registry.js";
import {
  conCallbackDeRotacion,
  estadoDeConexion,
  guardarConexionDeCalendario,
} from "./conexion.js";

// Re-exports de compatibilidad: calendar/routes.ts y los tests importan estos
// nombres desde aquí; su definición vive ahora en adapters/calendar/.
export { CalendarBusinessError, isGoogleInvalidGrantError };
export type {
  CalendarBusinessErrorCode,
  CalendarBusyInterval,
  CalendarBusyIntervalsResult,
};

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

/** Las operaciones reciben la conexión ya resuelta por conexion.ts: los
 * consumidores (voiceTools, el job, calendar/routes) no conocen columnas. */
type EntradaConConexion = { conexion: CalendarConnection };

/** Guardas comunes a las operaciones. Reproducen exactamente los textos y
 * códigos que antes tenía cada rama por proveedor:
 *  - sin credenciales → <P>_CALENDAR_RECONNECT_REQUIRED
 *    "El negocio no tiene conectado <nombre>."
 *  - sin calendario (solo posible con calendarIdPorDefecto null, hoy Outlook):
 *    reservar → BOOK_APPOINTMENT_FAILED
 *      "No se ha seleccionado un calendario de <nombreCorto>."
 *    resto → RECONNECT "El negocio no tiene conectado <nombre>." */
function exigirConexionActiva(
  conexion: CalendarConnection,
  operacion: "reservar" | "cancelar" | "proximos"
): ConexionActiva {
  const { nombre, nombreCorto } = DESCRIPTORES_DE_PROVEEDOR[conexion.provider];
  const errorDeReconexion = () =>
    new CalendarBusinessError(
      codigoDeReconexion(conexion.provider),
      `El negocio no tiene conectado ${nombre}.`,
      conexion.provider
    );
  // Mismos tres estados que estadoDeConexion(); se comprueban en línea para
  // que TypeScript estreche credentials/calendarId sin casts.
  if (!conexion.credentials) {
    throw errorDeReconexion();
  }
  if (!conexion.calendarId) {
    if (operacion === "reservar") {
      throw new CalendarBusinessError(
        "BOOK_APPOINTMENT_FAILED",
        `No se ha seleccionado un calendario de ${nombreCorto}.`
      );
    }
    throw errorDeReconexion();
  }
  return {
    provider: conexion.provider,
    calendarId: conexion.calendarId,
    ...conCallbackDeRotacion(conexion.credentials),
  } as ConexionActiva;
}

export class CalendarService {
  constructor() {}

  async getAuthUrl(businessId: string): Promise<string> {
    const state = await createCalendarOAuthState("google", businessId);
    const oauth2Client = crearClienteOAuthDeGoogle();
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

    const oauth2Client = crearClienteOAuthDeGoogle();

    const { tokens } = await oauth2Client.getToken(code);

    if (tokens.refresh_token) {
      await guardarConexionDeCalendario(businessId, {
        provider: "google",
        refreshToken: tokens.refresh_token,
        calendarId: "primary",
        conectado: true,
      });
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

    await guardarConexionDeCalendario(businessId, {
      provider: "outlook",
      refreshToken: tokens.refresh_token,
      conectado: false,
      userEmail: profile.mail ?? profile.userPrincipalName ?? null,
    });

    return {
      calendars,
      email: profile.mail ?? profile.userPrincipalName ?? null,
    } satisfies { calendars: MicrosoftCalendar[]; email: string | null };
  }

  async connectMicrosoftCalendar(businessId: string, calendarId: string) {
    const business = await guardarConexionDeCalendario(businessId, {
      provider: "outlook",
      calendarId,
      conectado: true,
    });
    await this.syncCalendarToolsToAgents(businessId);
    return business;
  }

  /** Calendarios de la cuenta conectada (paso de selección: aún puede no
   * haber calendarId). Sin credenciales lanza el RECONNECT del proveedor. */
  async listarCalendarios(
    conexion: CalendarConnection
  ): Promise<CalendarioDisponible[]> {
    if (!conexion.credentials) {
      throw new CalendarBusinessError(
        codigoDeReconexion(conexion.provider),
        `El negocio no tiene conectado ${DESCRIPTORES_DE_PROVEEDOR[conexion.provider].nombre}.`,
        conexion.provider
      );
    }
    return obtenerProveedorDeCalendario(conexion.provider).listarCalendarios(
      conCallbackDeRotacion(conexion.credentials)
    );
  }

  /** @deprecated Usa listarCalendarios(conexion); se conserva por los tests
   * antiguos de service.test.ts. */
  async listGoogleCalendars(googleRefreshToken: string) {
    return obtenerProveedorDeCalendario("google").listarCalendarios(
      conCallbackDeRotacion({
        provider: "google",
        refreshToken: googleRefreshToken,
      })
    );
  }

  /** @deprecated Usa listarCalendarios(conexion); se conserva por los tests
   * antiguos de service.test.ts. */
  async listOutlookCalendars(outlookRefreshToken: string) {
    return obtenerProveedorDeCalendario("outlook").listarCalendarios(
      conCallbackDeRotacion({
        provider: "outlook",
        refreshToken: outlookRefreshToken,
      })
    );
  }

  /** Despacho de POST /calendar/select por el proveedor guardado del negocio.
   * Conserva la asimetría: Outlook resincroniza las tools, Google no. */
  async seleccionarCalendario(businessId: string, calendarId: string) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { calendarProvider: true },
    });
    return normalizarProveedorDeCalendario(business?.calendarProvider) ===
      "outlook"
      ? this.connectMicrosoftCalendar(businessId, calendarId)
      : this.selectGoogleCalendar(businessId, calendarId);
  }

  /** A diferencia de connectMicrosoftCalendar, no resincroniza las tools de
   * los agentes (asimetría histórica que se conserva a propósito). */
  async selectGoogleCalendar(businessId: string, calendarId: string) {
    return guardarConexionDeCalendario(businessId, {
      provider: "google",
      calendarId,
      conectado: true,
    });
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
          "Comprueba una cita en una fecha y hora concretas: valida horario, restricciones, capacidad, profesionales y calendario real. Úsala antes de book_appointment y conserva el availabilityToken que devuelve. Si el cliente no pide a nadie, no envíes professionalId: el sistema asigna a quien mejor hace el servicio y lo devuelve en assignedProfessional. Si devuelve recommendation, propón UNA vez a esa persona siguiendo sus instructions.",
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
                "ID exacto de get_catalog solo si el cliente pidió a un profesional concreto por su nombre (opcional). Déjalo vacío si no lo nombró: nunca elijas tú a nadie.",
            },
            professionalConfirmed: {
              type: "boolean",
              description:
                "true SOLO si ya propusiste una vez a la persona que recomendó la herramienta y el cliente insistió en la que pidió por su nombre. Nunca lo envíes en la primera comprobación.",
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
              smsConsent: {
                type: "boolean",
                description:
                  "true si el cliente confirmó por voz que puedes enviarle la confirmación (y un recordatorio) por SMS a este número; false si dijo que no o no se le preguntó.",
              },
              professionalConfirmed: {
                type: "boolean",
                description:
                  "true SOLO si check_availability devolvió una recomendación, la propusiste una vez y el cliente insistió en la persona que pidió. Sin esto, la reserva se frena hasta que lo hayas propuesto.",
              },
            },
          required: ["clientName", "availabilityToken"],
        },
        speak_during_execution: true,
        speak_after_execution: true,
        timeout_ms: 20000,
      },
      {
        // Estas tres existían solo en Telnyx, pero el prompt gestionado es el
        // MISMO para los dos orquestadores y le dice al agente que las use:
        // en Retell el agente prometía localizar o cancelar una cita con una
        // herramienta que su LLM no tenía, y acababa improvisando o creando
        // una cita nueva encima de la que el cliente quería cambiar.
        name: "find_my_appointment",
        description:
          "Busca la próxima cita del negocio asociada al número desde el que llama. Devuelve también clientName (el nombre con el que se reservó; puede venir vacío en citas antiguas) — úsalo si el cliente quiere recrear la cita al mismo nombre. Úsala solo si quien llama pide cambiar o cancelar una cita existente y no te ha dado datos concretos.",
        url: `${toolBaseUrl}/find_my_appointment`,
        method: "POST",
        args_at_root: false,
        parameters: {
          type: "object",
          properties: {},
        },
        speak_during_execution: true,
        speak_after_execution: true,
        timeout_ms: 20000,
      },
      {
        name: "cancel_appointment",
        description:
          "Cancela la cita cuyo id devolvió find_my_appointment. Úsala solo tras confirmación explícita del cliente. Para 'modificar' una cita: cancélala con esta tool y reserva la nueva con check_availability + book_appointment.",
        url: `${toolBaseUrl}/cancel_appointment`,
        method: "POST",
        args_at_root: false,
        parameters: {
          type: "object",
          properties: {
            bookingId: {
              type: "string",
              description: "El id de la cita devuelto por find_my_appointment.",
            },
          },
          required: ["bookingId"],
        },
        speak_during_execution: true,
        speak_after_execution: true,
        timeout_ms: 20000,
      },
      {
        name: "notify_when_available",
        description:
          "Guarda el aviso de que el cliente quiere que le escribamos por WhatsApp si se libera la hora que pidió y no estaba disponible. Válido tanto si el cliente se va sin reservar nada más como si reserva otra hora igualmente. Úsala solo cuando lo pida explícitamente y haya dado consentimiento para WhatsApp a este número.",
        url: `${toolBaseUrl}/notify_when_available`,
        method: "POST",
        args_at_root: false,
        parameters: {
          type: "object",
          properties: {
            startDateTime: {
              type: "string",
              description:
                "La hora exacta que el cliente quería y no estaba disponible, en formato ISO 8601 en hora local del negocio con su offset explícito (nunca UTC).",
            },
            durationMinutes: {
              type: "number",
              description: "Duración en minutos de la cita que quería.",
            },
            serviceIds: {
              type: "array",
              items: { type: "string" },
              description: "IDs de los servicios que pidió, si los mencionó (opcional).",
            },
            professionalId: {
              type: "string",
              description:
                "ID del profesional concreto que pidió, si lo mencionó (opcional).",
            },
          },
          required: ["startDateTime", "durationMinutes"],
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

  /**
   * `end_call` no hace falta aquí: `buildTelnyxAssistantPayload` ya añade
   * la tool `hangup` nativa de Telnyx a todos los assistants por defecto
   * (ver telnyxAssistantPayload.ts).
   *
   * `call_control_id` llega por un header custom templado con la variable
   * de sistema `{{call_control_id}}` — confirmado con una reserva real de
   * punta a punta el 2026-09-12 (ver server.ts, ruta de tools). Se probó
   * también por query string a la vez por si el header no se resolvía;
   * como el header sí funcionó, se quitó la query string para no mandar
   * dos veces el mismo dato.
   */
  async syncCalendarToolsToAgents(
    businessId: string,
    options?: { strict?: boolean }
  ) {
    const errors: Error[] = [];
    const recordError = (message: string, error?: unknown) => {
      if (!options?.strict) return;
      errors.push(
        error instanceof Error ? error : new Error(message)
      );
    };

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });

    if (!business) {
      const message = `[Calendar] No se encontró negocio ${businessId} para sincronizar tools`;
      console.error(message);
      recordError(message);
      if (errors.length > 0) {
        throw new AggregateError(errors, message);
      }
      return;
    }

    const agents = await prisma.agent.findMany({
      where: { businessId, deletedAt: null },
    });

    for (const agent of agents) {
      // Retell es siempre el fallback caliente (plan Telnyx-orquestador
      // §6), sin depender de cuál sea el primary — se sincroniza tanto si
      // orchestrator es "retell" como "telnyx". Mismo criterio ya aplicado
      // en syncAgentToRetell (agentBootstrap.ts).
      if (agent.retellLlmId) {
        if (!agent.retellAgentId) {
          const message = `[Calendar] Agente ${agent.id} tiene retellLlmId pero no retellAgentId; no se pueden registrar tools`;
          console.error(message);
          recordError(message);
          continue;
        }

        const baseUrl = getPublicWebhookBaseUrl();
        if (!baseUrl) {
          const message =
            "[Calendar] No hay URL pública configurada (BASE_URL o ngrok); no se pueden sincronizar tools de Retell";
          console.error(message);
          recordError(message);
          continue;
        }

        try {
          const retellTools = this.buildRetellCalendarTools(
            baseUrl,
            agent.retellAgentId
          );
          // Las versiones publicadas de Retell son inmutables. Al reconectar
          // un calendario (o al regenerar sus tools) hay que trabajar sobre
          // un borrador y publicarlo después; actualizar el LLM almacenado en
          // la BD sin versión intentaba modificar la versión publicada y
          // Retell lo rechazaba con 400.
          const currentAgent = await retellAdapter.getAgent(
            agent.retellAgentId
          );
          const editableAgent = currentAgent.is_published
            ? await retellAdapter.createAgentVersion(
                agent.retellAgentId,
                currentAgent.version
              )
            : currentAgent;

          if (!Number.isInteger(editableAgent.version)) {
            throw new Error(
              `Retell no devolvió una versión editable para el agente ${agent.retellAgentId}.`
            );
          }
          if (editableAgent.response_engine.type !== "retell-llm") {
            throw new Error(
              `El agente ${agent.retellAgentId} no usa un Retell LLM editable.`
            );
          }

          await retellAdapter.updateLlm(editableAgent.response_engine.llm_id, {
            tools: retellTools,
            version: editableAgent.response_engine.version ?? undefined,
          });

          if (!editableAgent.is_published) {
            await retellAdapter.publishAgent(
              agent.retellAgentId,
              editableAgent.version,
              "Herramientas de calendario gestionadas por Alhabla"
            );
            const publishedAgent = await retellAdapter.getAgent(
              agent.retellAgentId,
              editableAgent.version
            );
            if (!publishedAgent.is_published) {
              throw new Error(
                `Retell no confirmó la publicación de las tools en la versión ${editableAgent.version} del agente ${agent.retellAgentId}.`
              );
            }
          }

          console.log(
            `[Calendar] Tools de calendario publicadas y verificadas en Retell LLM ${editableAgent.response_engine.llm_id}`
          );
        } catch (e) {
          console.error(
            `[Calendar] Error inyectando tools de calendario en Retell LLM ${agent.retellLlmId}`,
            e
          );
          recordError(
            `[Calendar] Error inyectando tools de calendario en Retell LLM ${agent.retellLlmId}`,
            e
          );
        }

        continue;
      }
    }

    // Telnyx se sincroniza una sola vez para todo el negocio, fuera del
    // bucle por agente: syncAgentToTelnyx ya recorre internamente todos los
    // agentes con telnyxAssistantId (a diferencia de Retell, que
    // necesitan una llamada de API por agente). Se ejecuta
    // independientemente de `orchestrator` — un negocio en backfill
    // (assistant creado pero todavía sin cutover) también debe llegar con
    // las tools al día.
    const telnyxAgents = agents.filter((agent) => agent.telnyxAssistantId);
    if (telnyxAgents.length > 0) {
      const baseUrl = getPublicWebhookBaseUrl();
      if (!baseUrl) {
        const message = `[Calendar] No hay URL pública configurada (BASE_URL o ngrok); no se pueden sincronizar tools de Telnyx para ${businessId}`;
        console.error(message);
        recordError(message);
      } else {
        const telnyxTools = buildTelnyxVoiceTools(baseUrl);
        // syncAgentToTelnyx nunca lanza (un fallo de Telnyx no debe poder
        // bloquear este flujo) — en modo strict se comprueba
        // telnyxSyncError después para no dar por buena una sincronización
        // que en realidad falló en silencio.
        await syncAgentToTelnyx(businessId, prisma, { tools: telnyxTools });
        console.log(
          `[Calendar] Tools de calendario sincronizadas en Telnyx para el negocio ${businessId}`
        );

        if (options?.strict) {
          const refreshed = await prisma.agent.findMany({
            where: { id: { in: telnyxAgents.map((agent) => agent.id) } },
            select: { id: true, telnyxSyncError: true },
          });
          for (const agent of refreshed) {
            if (agent.telnyxSyncError) {
              const message = `[Calendar] Fallo sincronizando tools de Telnyx en el agente ${agent.id}: ${agent.telnyxSyncError}`;
              console.error(message);
              recordError(message);
            }
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `No se pudieron sincronizar las tools de calendario de ${errors.length} agente(s).`
      );
    }
  }

  async getUpcomingEvents(
    conexion: CalendarConnection,
    maxResults = 5
  ): Promise<EventoProximo[]> {
    const safeMaxResults = Math.min(Math.max(Math.trunc(maxResults), 1), 15);
    const activa = exigirConexionActiva(conexion, "proximos");
    return obtenerProveedorDeCalendario(activa.provider).listarProximosEventos(
      activa,
      safeMaxResults
    );
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
   * sigue siendo la red de seguridad mínima en ese caso. NUNCA lanza.
   */
  async getBusyIntervals(
    input: EntradaConConexion & { timeMin: Date; timeMax: Date }
  ): Promise<CalendarBusyIntervalsResult> {
    const { conexion } = input;
    if (estadoDeConexion(conexion) !== "ok") {
      return { intervals: [], calendarAvailabilityKnown: false };
    }
    try {
      const activa = exigirConexionActiva(conexion, "proximos");
      const intervals = await obtenerProveedorDeCalendario(
        activa.provider
      ).listarOcupacion(activa, {
        timeMin: input.timeMin,
        timeMax: input.timeMax,
      });
      return { intervals, calendarAvailabilityKnown: true };
    } catch (err) {
      console.error(
        "[Calendar] No se pudo consultar la ocupación real del calendario, se ignora para esta comprobación:",
        err instanceof Error ? err.message : err
      );
      return { intervals: [], calendarAvailabilityKnown: false };
    }
  }

  async bookAppointment(
    input: EntradaConConexion & {
      clientName: string;
      startDateTime: string;
      durationMinutes?: number;
      clientEmail?: string;
      clientPhone?: string | null;
      serviceNames?: string[] | null;
      professionalName?: string | null;
      /** Zona del negocio; "Europe/Madrid" por defecto. Inerte para Google
       * (manda UTC) y Outlook (lib/microsoftGraph.ts la hardcodea). */
      timezone?: string;
      /** Clave estable por llamada/reserva para que un timeout no cree dos
       * eventos externos. */
      idempotencyKey?: string;
    }
  ): Promise<EventoCreado> {
    const activa = exigirConexionActiva(input.conexion, "reservar");
    const startTime = new Date(input.startDateTime);
    const endTime = new Date(
      startTime.getTime() + (input.durationMinutes ?? 30) * 60000
    );
    const { summary, description } = buildEventContent(input);

    return obtenerProveedorDeCalendario(activa.provider).crearEvento(activa, {
      summary,
      description,
      startTime,
      endTime,
      cliente: {
        nombre: input.clientName,
        telefono: input.clientPhone ?? null,
        email: input.clientEmail ?? null,
      },
      recordatorioInmediatoMinutos: buildImmediateReminderMinutes(startTime),
      recordatorioPrevioMinutos: REMINDER_MINUTES_BEFORE_START,
      zonaHoraria: input.timezone ?? "Europe/Madrid",
      idempotencyDigest: input.idempotencyKey
        ? hashDeIdempotencia(input.idempotencyKey)
        : null,
    });
  }

  /** Cancela el evento externo de una cita ya reservada (voz: ver
   * executeCancelAppointment en voiceTools/service.ts). Un evento ya
   * borrado se trata como éxito idempotente — puede haberlo borrado ya un
   * reintento anterior o el propio propietario a mano. */
  async cancelAppointment(
    input: EntradaConConexion & { eventId: string }
  ): Promise<void> {
    const activa = exigirConexionActiva(input.conexion, "cancelar");
    await obtenerProveedorDeCalendario(activa.provider).borrarEvento(
      activa,
      input.eventId
    );
  }
}

export const calendarService = new CalendarService();
