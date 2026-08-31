import { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { CalendarBusinessError, calendarService } from "./service.js";
import { z } from "zod";

const UpcomingEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(15).default(15),
});

const ConnectMicrosoftCalendarSchema = z.object({
  calendarId: z.string().min(1),
});

export async function calendarRoutes(fastify: FastifyInstance) {
  
  // 1. Endpoint para que el frontend solicite la URL de autenticación
  fastify.get(
    "/auth/google",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const businessId = request.user!.businessId;
        const url = calendarService.getAuthUrl(businessId);
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
        const business = await prisma.business.findUnique({
          where: { id: businessId },
          select: {
            calendarProvider: true,
            googleRefreshToken: true,
            googleCalendarId: true,
            googleCalendarConnected: true,
            outlookRefreshToken: true,
            outlookCalendarId: true,
            outlookCalendarConnected: true,
          },
        });

        const provider = business?.calendarProvider === 'outlook' ? 'outlook' : 'google';
        const isConnected = provider === 'outlook'
          ? business?.outlookCalendarConnected && business.outlookRefreshToken
          : business?.googleCalendarConnected && business.googleRefreshToken;

        if (!isConnected) {
          return reply.status(409).send({
            code: provider === 'outlook' ? "OUTLOOK_CALENDAR_RECONNECT_REQUIRED" : "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
            error: `${provider === 'outlook' ? 'Outlook' : 'Google'} Calendar is not connected`,
          });
        }

        const events = await calendarService.getUpcomingEvents(
          provider,
          {
            googleRefreshToken: business?.googleRefreshToken,
            googleCalendarId: business?.googleCalendarId,
            outlookRefreshToken: business?.outlookRefreshToken,
            outlookCalendarId: business?.outlookCalendarId,
          },
          limit,
        );

        return reply.send({ events, provider });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ code: "INVALID_QUERY", error: error.errors });
        }

        if (error instanceof CalendarBusinessError) {
          if (error.code === "GOOGLE_CALENDAR_RECONNECT_REQUIRED") {
            const businessId = request.user!.businessId;
            await prisma.business.update({
              where: { id: businessId },
              data: {
                googleCalendarConnected: false,
                googleCalendarDisconnectedAt: new Date(),
                googleCalendarLastError: error.message,
              },
            });

            return reply.status(409).send({ code: error.code, error: error.message });
          }

          if (error.code === "OUTLOOK_CALENDAR_RECONNECT_REQUIRED") {
            const businessId = request.user!.businessId;
            await prisma.business.update({
              where: { id: businessId },
              data: {
                outlookCalendarConnected: false,
                outlookCalendarDisconnectedAt: new Date(),
                outlookCalendarLastError: error.message,
              },
            });

            return reply.status(409).send({ code: error.code, error: error.message });
          }

          return reply.status(502).send({ code: error.code, error: error.message });
        }

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
        const business = await prisma.business.findUnique({
          where: { id: businessId },
          select: {
            calendarProvider: true,
            googleRefreshToken: true,
            googleCalendarId: true,
            googleCalendarConnected: true,
            outlookRefreshToken: true,
            outlookCalendarId: true,
            outlookCalendarConnected: true,
          },
        });

        const provider = business?.calendarProvider === 'outlook' ? 'outlook' : 'google';
        const isConnected = provider === 'outlook'
          ? business?.outlookCalendarConnected && business.outlookRefreshToken
          : business?.googleCalendarConnected && business.googleRefreshToken;

        if (!isConnected) {
          return reply.status(409).send({
            code: provider === 'outlook' ? "OUTLOOK_CALENDAR_RECONNECT_REQUIRED" : "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
            error: `${provider === 'outlook' ? 'Outlook' : 'Google'} Calendar is not connected`,
          });
        }

        const calendars = provider === 'outlook'
          ? await calendarService.listOutlookCalendars(business!.outlookRefreshToken!)
          : await calendarService.listGoogleCalendars(business!.googleRefreshToken!);

        return reply.send({
          provider,
          selectedCalendarId: provider === 'outlook' ? business!.outlookCalendarId : business!.googleCalendarId,
          calendars,
        });
      } catch (error) {
        if (error instanceof CalendarBusinessError) {
          if (error.code === "GOOGLE_CALENDAR_RECONNECT_REQUIRED" || error.code === "OUTLOOK_CALENDAR_RECONNECT_REQUIRED") {
            const businessId = request.user!.businessId;
            const isGoogle = error.code === "GOOGLE_CALENDAR_RECONNECT_REQUIRED";
            await prisma.business.update({
              where: { id: businessId },
              data: isGoogle
                ? { googleCalendarConnected: false, googleCalendarDisconnectedAt: new Date(), googleCalendarLastError: error.message }
                : { outlookCalendarConnected: false, outlookCalendarDisconnectedAt: new Date(), outlookCalendarLastError: error.message },
            });

            return reply.status(409).send({ code: error.code, error: error.message });
          }

          return reply.status(502).send({ code: error.code, error: error.message });
        }

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
        const business = await prisma.business.findUnique({
          where: { id: businessId },
          select: { calendarProvider: true },
        });

        const updated = business?.calendarProvider === 'outlook'
          ? await calendarService.connectMicrosoftCalendar(businessId, calendarId)
          : await calendarService.selectGoogleCalendar(businessId, calendarId);

        const { googleRefreshToken, outlookRefreshToken, ...publicBusiness } = updated;
        void googleRefreshToken;
        void outlookRefreshToken;
        return reply.send(publicBusiness);
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
        const url = calendarService.getMicrosoftAuthUrl(businessId);
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
        const { googleRefreshToken, outlookRefreshToken, ...publicBusiness } = business;
        void googleRefreshToken;
        void outlookRefreshToken;
        return reply.send(publicBusiness);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.flatten() });
        }
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to connect Outlook calendar" });
      }
    },
  );

  // 2. Endpoint de Callback que Google llamará con el código
  // NOTA: Como la redirección de Google es un GET que ocurre en el navegador, 
  // normalmente no pasamos el token en la cabecera, así que el 'state' será nuestro identificador de seguridad.
  fastify.get(
    "/auth/google/callback",
    async (request: FastifyRequest<{ Querystring: { code: string; state: string; error?: string } }>, reply) => {
      try {
        const { code, state: businessId, error } = request.query;

        if (error) {
          return reply.redirect(`${process.env.FRONTEND_URL}/settings?calendar_error=${error}`);
        }

        if (!code || !businessId) {
          return reply.status(400).send({ error: "Missing code or state" });
        }

        // Procesar la conexión
        await calendarService.handleCallback(code, businessId);

        // Redirigir de vuelta al frontend indicando éxito
        return reply.redirect(`${process.env.FRONTEND_URL}/settings?calendar_success=true`);
      } catch (error) {
        fastify.log.error(error);
        return reply.redirect(`${process.env.FRONTEND_URL}/settings?calendar_error=true`);
      }
    }
  );

  fastify.get(
    "/auth/microsoft/callback",
    async (request: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string } }>, reply) => {
      try {
        const { code, state: businessId, error } = request.query;

        if (error) {
          return reply.redirect(`${process.env.FRONTEND_URL}/settings?outlook_error=${encodeURIComponent(error)}`);
        }

        if (!code || !businessId) {
          return reply.redirect(`${process.env.FRONTEND_URL}/settings?outlook_error=missing_code`);
        }

        const result = await calendarService.handleMicrosoftCallback(code, businessId);
        const payload = encodeURIComponent(JSON.stringify(result));
        return reply.redirect(`${process.env.FRONTEND_URL}/settings?outlook_calendars=${payload}`);
      } catch (error) {
        fastify.log.error(error);
        return reply.redirect(`${process.env.FRONTEND_URL}/settings?outlook_error=true`);
      }
    },
  );
}