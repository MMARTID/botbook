import { google } from 'googleapis';
import { prisma } from '../../lib/prisma.js';
import { vapiAdapter } from '../../adapters/vapi/VapiAdapter.js';
import {
  retellAdapter,
  type RetellTool,
} from '../../adapters/retell/RetellAdapter.js';
import { getPublicWebhookBaseUrl } from '../../lib/serverUrl.js';
import {
  createMicrosoftCalendarEvent,
  exchangeMicrosoftCode,
  getMicrosoftAuthUrl,
  getMicrosoftProfile,
  listMicrosoftCalendars,
  listMicrosoftUpcomingEvents,
  refreshMicrosoftAccessToken,
  type MicrosoftCalendar,
} from '../../lib/microsoftGraph.js';

// Helper: create a new OAuth2 client per operation to avoid shared mutable state
function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export type CalendarBusinessErrorCode =
  | 'GOOGLE_CALENDAR_RECONNECT_REQUIRED'
  | 'OUTLOOK_CALENDAR_RECONNECT_REQUIRED'
  | 'BOOK_APPOINTMENT_FAILED';

export class CalendarBusinessError extends Error {
  code: CalendarBusinessErrorCode;
  constructor(code: CalendarBusinessErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'CalendarBusinessError';
  }
}

// Detecta errores de Google relacionados con invalid_grant
export function isGoogleInvalidGrantError(error: unknown): boolean {
  const e = error as any;

  // Google client libraries sometimes put details in e.response.data
  const status = e?.response?.status;
  const data = e?.response?.data;
  const message = String(e?.message || data?.error_description || data?.error || '').toLowerCase();

  if (status === 401 || status === 400) {
    if (data?.error === 'invalid_grant') return true;
    if (message.includes('invalid_grant')) return true;
  }

  if (message.includes('invalid_grant')) return true;

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
    code: typeof responseError === 'object' ? responseError.status ?? responseError.code : responseError,
    message:
      (typeof responseError === 'object' ? responseError.message : undefined) ??
      googleError.response?.data?.error_description ??
      googleError.message ??
      'Unknown Google Calendar error',
  };
}

// Usamos instancias por llamada; esto evita condiciones de carrera entre negocios
export class CalendarService {
  constructor() {}

  getAuthUrl(businessId: string): string {
    const oauth2Client = createOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
      state: businessId,
    });
    return url;
  }

  async handleCallback(code: string, businessId: string): Promise<any> {
    const oauth2Client = createOAuth2Client();

    const { tokens } = await oauth2Client.getToken(code);

    if (tokens.refresh_token) {
      await prisma.business.update({
        where: { id: businessId },
        data: {
          calendarProvider: 'google',
          googleRefreshToken: tokens.refresh_token,
          googleCalendarId: 'primary',
          googleCalendarConnected: true,
          googleCalendarDisconnectedAt: null,
          googleCalendarLastError: null,
        },
      });

      await this.syncCalendarToolsToAgents(businessId);
    }

    return tokens;
  }

  getMicrosoftAuthUrl(businessId: string): string {
    return getMicrosoftAuthUrl(businessId);
  }

  async handleMicrosoftCallback(code: string, businessId: string) {
    const tokens = await exchangeMicrosoftCode(code);
    const profile = await getMicrosoftProfile(tokens.access_token);
    const calendars = await listMicrosoftCalendars(tokens.access_token);

    await prisma.business.update({
      where: { id: businessId },
      data: {
        calendarProvider: 'outlook',
        outlookRefreshToken: tokens.refresh_token,
        outlookCalendarConnected: false,
        outlookCalendarDisconnectedAt: null,
        outlookCalendarLastError: null,
        outlookUserEmail: profile.mail ?? profile.userPrincipalName ?? null,
      },
    });

    return {
      calendars,
      email: profile.mail ?? profile.userPrincipalName ?? null,
    } satisfies { calendars: MicrosoftCalendar[]; email: string | null };
  }

  async connectMicrosoftCalendar(businessId: string, calendarId: string) {
    const business = await prisma.business.update({
      where: { id: businessId },
      data: {
        calendarProvider: 'outlook',
        outlookCalendarId: calendarId,
        outlookCalendarConnected: true,
        outlookCalendarDisconnectedAt: null,
        outlookCalendarLastError: null,
      },
    });

    await this.syncCalendarToolsToAgents(businessId);
    return business;
  }

  async listGoogleCalendars(googleRefreshToken: string) {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: googleRefreshToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    try {
      const response = await calendar.calendarList.list();
      return (response.data.items ?? [])
        .filter((item) => Boolean(item.id))
        .map((item) => ({
          id: item.id as string,
          name: item.summaryOverride || item.summary || 'Sin nombre',
          primary: item.primary === true,
        }));
    } catch (err) {
      if (isGoogleInvalidGrantError(err)) {
        throw new CalendarBusinessError('GOOGLE_CALENDAR_RECONNECT_REQUIRED', 'La conexión con Google ya no es válida.');
      }
      console.error('[Calendar] Failed to list calendars:', getGoogleErrorDetails(err));
      throw new CalendarBusinessError('BOOK_APPOINTMENT_FAILED', 'No se pudo obtener la lista de calendarios.');
    }
  }

  async listOutlookCalendars(outlookRefreshToken: string) {
    try {
      const { access_token } = await refreshMicrosoftAccessToken(outlookRefreshToken);
      const calendars = await listMicrosoftCalendars(access_token);
      return calendars.map((item) => ({ id: item.id, name: item.name, primary: false }));
    } catch (err) {
      console.error('[Calendar] Failed to list Outlook calendars:', err);
      throw new CalendarBusinessError('OUTLOOK_CALENDAR_RECONNECT_REQUIRED', 'La conexión con Outlook ya no es válida.');
    }
  }

  async selectGoogleCalendar(businessId: string, calendarId: string) {
    return prisma.business.update({
      where: { id: businessId },
      data: {
        calendarProvider: 'google',
        googleCalendarId: calendarId,
        googleCalendarConnected: true,
        googleCalendarDisconnectedAt: null,
        googleCalendarLastError: null,
      },
    });
  }

  private buildVapiCalendarTools(serverUrl: string): any[] {
    return [
      {
        type: 'function',
        messages: [
          { type: 'request-start', content: 'Un momento, compruebo el horario del negocio...' },
          { type: 'request-complete', content: 'Ya he comprobado el horario.' },
          { type: 'request-failed', content: 'No he podido comprobar el horario en este momento.' },
        ],
        function: {
          name: 'check_business_hours',
          description: 'Comprueba si una fecha y un intervalo completo están dentro del horario del negocio. Úsala SIEMPRE antes de ofrecer o confirmar una cita.',
          parameters: {
            type: 'object',
            properties: {
              startDateTime: { type: 'string', description: 'Inicio solicitado en formato ISO 8601, incluyendo zona horaria.' },
              durationMinutes: { type: 'number', description: 'Duración total de la cita en minutos.' },
            },
            required: ['startDateTime', 'durationMinutes'],
          },
        },
        server: { url: serverUrl },
      },
      {
        type: 'function',
        messages: [
          { type: 'request-start', content: 'Un momento, estoy comprobando disponibilidad teniendo en cuenta la capacidad y los profesionales libres...' },
          { type: 'request-complete', content: 'Ya he comprobado la disponibilidad.' },
          { type: 'request-failed', content: 'No he podido comprobar la disponibilidad en este momento.' },
        ],
        function: {
          name: 'check_availability',
          description: 'Comprueba si hay plazas y profesionales libres para una cita en una fecha y hora concretas. Úsala después de check_business_hours y antes de book_appointment.',
          parameters: {
            type: 'object',
            properties: {
              startDateTime: { type: 'string', description: 'Inicio solicitado en formato ISO 8601, incluyendo zona horaria.' },
              durationMinutes: { type: 'number', description: 'Duración total de la cita en minutos.' },
              serviceId: { type: 'string', description: 'ID del servicio solicitado (opcional). Si se proporciona, se verifica que haya un profesional asignado a ese servicio libre.' },
            },
            required: ['startDateTime', 'durationMinutes'],
          },
        },
        server: { url: serverUrl },
      },
      {
        type: 'function',
        messages: [
          { type: 'request-start', content: 'Un momento, estoy revisando el calendario para registrar tu cita...' },
          { type: 'request-complete', content: '¡Perfecto! Ya he agendado la cita en el calendario.' },
          { type: 'request-failed', content: 'Lo siento, hubo un error al intentar agendar la cita. ¿Podemos intentarlo de nuevo?' },
          { type: 'request-response-delayed', content: 'Esto está tardando un poco más de lo normal, sigo revisando el calendario...', timingMilliseconds: 1200 },
        ],
        function: {
          name: 'book_appointment',
          description: 'Agenda una cita en el calendario activo del negocio. Úsala solo después de confirmar con check_business_hours que el intervalo está dentro del horario y con check_availability que hay profesionales libres.',
          parameters: {
            type: 'object',
            properties: {
              clientName: { type: 'string', description: 'El nombre del cliente que hace la reserva' },
              clientEmail: { type: 'string', description: 'El correo electrónico del cliente, si lo proporciona (opcional)' },
              startDateTime: { type: 'string', description: 'La fecha y hora de inicio en formato ISO 8601 (ej. 2026-07-15T15:30:00Z)' },
              durationMinutes: { type: 'number', description: 'La duración de la cita en minutos. Por defecto asume 30 minutos si no se especifica.' },
              serviceId: { type: 'string', description: 'ID del servicio reservado (opcional).' },
              professionalId: { type: 'string', description: 'ID del profesional seleccionado (opcional). Si no se indica, se asigna el primer profesional libre.' },
            },
            required: ['clientName', 'startDateTime'],
          },
        },
        server: { url: serverUrl },
      },
    ];
  }

  private buildRetellCalendarTools(baseUrl: string, retellAgentId: string): RetellTool[] {
    const toolBaseUrl = `${baseUrl.replace(/\/$/, '')}/webhooks/retell/tools/${retellAgentId}`;
    return [
      {
        name: 'check_business_hours',
        description: 'Comprueba si una fecha y un intervalo completo están dentro del horario del negocio. Úsala SIEMPRE antes de ofrecer o confirmar una cita.',
        url: `${toolBaseUrl}/check_business_hours`,
        method: 'POST',
        args_at_root: false,
        parameters: {
          type: 'object',
          properties: {
            startDateTime: { type: 'string', description: 'Inicio solicitado en formato ISO 8601, incluyendo zona horaria.' },
            durationMinutes: { type: 'number', description: 'Duración total de la cita en minutos.' },
          },
          required: ['startDateTime', 'durationMinutes'],
        },
        speak_during_execution: true,
        speak_after_execution: true,
        timeout_ms: 20000,
      },
      {
        name: 'check_availability',
        description: 'Comprueba si hay plazas y profesionales libres para una cita en una fecha y hora concretas. Úsala después de check_business_hours y antes de book_appointment.',
        url: `${toolBaseUrl}/check_availability`,
        method: 'POST',
        args_at_root: false,
        parameters: {
          type: 'object',
          properties: {
            startDateTime: { type: 'string', description: 'Inicio solicitado en formato ISO 8601, incluyendo zona horaria.' },
            durationMinutes: { type: 'number', description: 'Duración total de la cita en minutos.' },
            serviceId: { type: 'string', description: 'ID del servicio solicitado (opcional). Si se proporciona, se verifica que haya un profesional asignado a ese servicio libre.' },
          },
          required: ['startDateTime', 'durationMinutes'],
        },
        speak_during_execution: true,
        speak_after_execution: true,
        timeout_ms: 20000,
      },
      {
        name: 'book_appointment',
        description: 'Agenda una cita en el calendario activo del negocio. Úsala solo después de confirmar con check_business_hours que el intervalo está dentro del horario y con check_availability que hay profesionales libres.',
        url: `${toolBaseUrl}/book_appointment`,
        method: 'POST',
        args_at_root: false,
        parameters: {
          type: 'object',
          properties: {
            clientName: { type: 'string', description: 'El nombre del cliente que hace la reserva' },
            clientEmail: { type: 'string', description: 'El correo electrónico del cliente, si lo proporciona (opcional)' },
            startDateTime: { type: 'string', description: 'La fecha y hora de inicio en formato ISO 8601 (ej. 2026-07-15T15:30:00Z)' },
            durationMinutes: { type: 'number', description: 'La duración de la cita en minutos. Por defecto asume 30 minutos si no se especifica.' },
            serviceId: { type: 'string', description: 'ID del servicio reservado (opcional).' },
            professionalId: { type: 'string', description: 'ID del profesional seleccionado (opcional). Si no se indica, se asigna el primer profesional libre.' },
          },
          required: ['clientName', 'startDateTime'],
        },
        speak_during_execution: true,
        speak_after_execution: true,
        timeout_ms: 20000,
      },
    ];
  }

  async syncCalendarToolsToAgents(businessId: string) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { orchestrator: true },
    });

    if (!business) {
      console.error(`[Calendar] No se encontró negocio ${businessId} para sincronizar tools`);
      return;
    }

    const orchestrator = business.orchestrator || 'retell';
    const agents = await prisma.agent.findMany({
      where: { businessId },
    });

    for (const agent of agents) {
      if (orchestrator === 'retell' && agent.retellLlmId) {
        if (!agent.retellAgentId) {
          console.error(`[Calendar] Agente ${agent.id} tiene retellLlmId pero no retellAgentId; no se pueden registrar tools`);
          continue;
        }

        const baseUrl = getPublicWebhookBaseUrl();
        if (!baseUrl) {
          console.error('[Calendar] No hay URL pública configurada (BASE_URL o ngrok); no se pueden sincronizar tools de Retell');
          continue;
        }

        try {
          const retellTools = this.buildRetellCalendarTools(baseUrl, agent.retellAgentId);
          await retellAdapter.updateLlm(agent.retellLlmId, { tools: retellTools });
          console.log(`[Calendar] Tools de calendario sincronizadas en Retell LLM ${agent.retellLlmId}`);
        } catch (e) {
          console.error(`[Calendar] Error inyectando tools de calendario en Retell LLM ${agent.retellLlmId}`, e);
        }

        continue;
      }

      // VAPI: inactivo, ningún negocio nuevo cae aquí (ver voiceOrchestrator.ts).
      if (orchestrator === 'vapi' && agent.vapiAssistantId) {
        const serverUrl = process.env.VAPI_WEBHOOK_URL || `${process.env.BASE_URL}/webhooks/vapi`;
        try {
          const assistant = await vapiAdapter.getAssistant(agent.vapiAssistantId);
          const assistantData = assistant as any;
          const existingTools = assistantData.model?.tools || assistantData.tools || [];
          const managedToolNames = new Set(['book_appointment', 'check_business_hours', 'check_availability']);
          const otherTools = existingTools.filter((tool: any) => !managedToolNames.has(tool?.function?.name));

          await vapiAdapter.updateAssistant(agent.vapiAssistantId, {
            model: {
              provider: agent.llmProvider,
              model: agent.llmModel,
              tools: [...otherTools, ...this.buildVapiCalendarTools(serverUrl)],
            },
          });
        } catch (e) {
          console.error(`[Calendar] Error inyectando tools de calendario en Vapi assistant ${agent.vapiAssistantId}`, e);
        }

        continue;
      }
    }
  }

  async getUpcomingEvents(
    provider: 'google' | 'outlook',
    options: {
      googleRefreshToken?: string | null;
      googleCalendarId?: string | null;
      outlookRefreshToken?: string | null;
      outlookCalendarId?: string | null;
    },
    maxResults: number = 5,
  ) {
    const safeMaxResults = Math.min(Math.max(Math.trunc(maxResults), 1), 15);

    if (provider === 'outlook') {
      if (!options.outlookRefreshToken || !options.outlookCalendarId) {
        throw new CalendarBusinessError('OUTLOOK_CALENDAR_RECONNECT_REQUIRED', 'El negocio no tiene conectado Outlook Calendar.');
      }

      try {
        const tokenResponse = await refreshMicrosoftAccessToken(options.outlookRefreshToken);
        return await listMicrosoftUpcomingEvents(
          tokenResponse.access_token,
          options.outlookCalendarId,
          safeMaxResults,
        );
      } catch (error) {
        throw new CalendarBusinessError('OUTLOOK_CALENDAR_RECONNECT_REQUIRED', 'La conexión con Outlook ya no es válida.');
      }
    }

    if (!options.googleRefreshToken) {
      throw new CalendarBusinessError('GOOGLE_CALENDAR_RECONNECT_REQUIRED', 'El negocio no tiene conectado Google Calendar.');
    }

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: options.googleRefreshToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calendarId = options.googleCalendarId || 'primary';

    try {
      const response = await calendar.events.list({
        calendarId,
        timeMin: new Date().toISOString(),
        maxResults: safeMaxResults,
        singleEvents: true,
        orderBy: 'startTime',
      });

      return (response.data.items || []).map((event) => ({
        id: event.id ?? null,
        summary: event.summary || 'Sin título',
        start: event.start?.dateTime || event.start?.date || null,
        end: event.end?.dateTime || event.end?.date || null,
        location: event.location || null,
        htmlLink: event.htmlLink || null,
      }));
    } catch (err) {
      if (isGoogleInvalidGrantError(err)) {
        throw new CalendarBusinessError('GOOGLE_CALENDAR_RECONNECT_REQUIRED', 'La conexión con Google ya no es válida.');
      }
      console.error('[Calendar] Failed to list upcoming events:', getGoogleErrorDetails(err));
      throw new CalendarBusinessError('BOOK_APPOINTMENT_FAILED', 'No se pudo obtener los eventos del calendario.');
    }
  }

  async bookAppointment(input: {
    clientName: string;
    startDateTime: string;
    durationMinutes?: number;
    clientEmail?: string;
    provider: 'google' | 'outlook';
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
      provider,
      googleRefreshToken,
      googleCalendarId,
      outlookRefreshToken,
      outlookCalendarId,
    } = input;

    const startTime = new Date(startDateTime);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

    if (provider === 'outlook') {
      if (!outlookRefreshToken) {
        throw new CalendarBusinessError('OUTLOOK_CALENDAR_RECONNECT_REQUIRED', 'El negocio no tiene conectado Outlook Calendar.');
      }
      if (!outlookCalendarId) {
        throw new CalendarBusinessError('BOOK_APPOINTMENT_FAILED', 'No se ha seleccionado un calendario de Outlook.');
      }

      try {
        const { access_token } = await refreshMicrosoftAccessToken(outlookRefreshToken);
        const event = await createMicrosoftCalendarEvent({
          accessToken: access_token,
          calendarId: outlookCalendarId,
          subject: `Reserva de ${clientName}`,
          startDateTime: startTime.toISOString(),
          endDateTime: endTime.toISOString(),
          attendeeEmail: clientEmail,
          description: 'Cita generada por asistente virtual de Alhabla.',
        });

        return event;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('401') || message.includes('403')) {
          throw new CalendarBusinessError('OUTLOOK_CALENDAR_RECONNECT_REQUIRED', 'La conexión con Outlook ha sido revocada o expiró.');
        }
        console.error('[Calendar] Failed to create Outlook appointment:', err);
        throw new CalendarBusinessError('BOOK_APPOINTMENT_FAILED', 'No se pudo crear el evento en Outlook Calendar.');
      }
    }

    if (!googleRefreshToken) {
      throw new CalendarBusinessError('GOOGLE_CALENDAR_RECONNECT_REQUIRED', 'El negocio no tiene conectado Google Calendar.');
    }

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: googleRefreshToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const event = {
      summary: `Reserva de ${clientName}`,
      description: `Cita generada por asistente virtual de Alhabla.`,
      start: { dateTime: startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
      attendees: clientEmail ? [{ email: clientEmail }] : [],
    };

    const calendarId = googleCalendarId || 'primary';

    try {
      const response = await calendar.events.insert({ calendarId, requestBody: event });
      return response.data;
    } catch (err) {
      if (isGoogleInvalidGrantError(err)) {
        throw new CalendarBusinessError('GOOGLE_CALENDAR_RECONNECT_REQUIRED', 'La conexión con Google ha sido revocada o expiró.');
      }
      console.error('[Calendar] Failed to create appointment:', getGoogleErrorDetails(err));
      throw new CalendarBusinessError('BOOK_APPOINTMENT_FAILED', 'No se pudo crear el evento en Google Calendar.');
    }
  }
}

export const calendarService = new CalendarService();