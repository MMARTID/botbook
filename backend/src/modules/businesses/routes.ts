import { getRedis } from "../../lib/redis.js";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { vapiAdapter } from "../../adapters/vapi/VapiAdapter.js";
import { BusinessScheduleSchema } from "../../lib/businessSchedule.js";
import { calendarService } from "../calendar/service.js";
import { AgentSettingsSchema, buildManagedAgentPrompt } from "../../lib/managedAgentPrompt.js";
import { isBusinessType } from "../../lib/businessType.js";
import { syncAgentNameWithBusinessType, syncAgentToRetell } from "../../lib/agentBootstrap.js";
import { E164_PHONE_REGEX } from "../../lib/phone.js";

const UpdateBusinessSchema = z.object({
  name: z.string().min(1).optional(),
  // Sin esto no había NINGÚN endpoint que permitiera cambiar el teléfono del
  // negocio: se crea en el registro con un placeholder (`TEMP-...`, ver
  // auth/routes.ts) y se quedaba así para siempre — descubierto al construir
  // el aviso por SMS al propietario en book_appointment, que manda el SMS a
  // business.phone. Formato E.164 exigido porque alimenta directamente el
  // campo `to` de Telnyx: sin esta validación, un número mal formateado
  // (sin prefijo de país, con espacios) haría fallar el SMS en silencio.
  phone: z.string().regex(E164_PHONE_REGEX, "El teléfono debe estar en formato internacional (ej. +34600123456)").optional(),
  timezone: z.string().optional(),
  schedule: BusinessScheduleSchema.optional(),
  systemPrompt: z.string().optional(),
  businessDetails: z.string().optional(),
  agentSettings: AgentSettingsSchema.optional(),
  googleCalendarId: z.string().optional().nullable(),
  outlookCalendarId: z.string().optional().nullable(),
  calendarProvider: z.enum(["google", "outlook"]).optional(),
  bookingCapacity: z.coerce.number().int().min(1).max(50).optional(),
  businessType: z.string().optional(),
  // null = sin restricción. Antelación tope de 1 semana, duración tope de 24h
  // — límites generosos, solo para evitar valores absurdos.
  minAdvanceBookingMinutes: z.coerce.number().int().min(0).max(10080).nullable().optional(),
  maxAppointmentDurationMinutes: z.coerce.number().int().min(1).max(1440).nullable().optional(),
});

const AgendaQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const DAY_MS = 24 * 60 * 60 * 1000;
const PENDING_BOOKING_LEAD_TYPE = "pending_booking";

/** `Lead.data` es Json libre: nada garantiza el tipo de cada campo. */
function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

type ResolvedService = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number | null;
};

/**
 * `Booking.serviceIds` es un array nativo de Postgres sin relación de Prisma
 * (ver el comentario del modelo), así que los nombres se resuelven aparte.
 * Se filtra por businessId además de por id para que un serviceIds manipulado
 * no pueda sacar servicios de otro negocio.
 */
async function resolveServices(
  businessId: string,
  serviceIds: string[]
): Promise<Map<string, ResolvedService>> {
  const unique = [...new Set(serviceIds)];
  if (unique.length === 0) return new Map();

  const services = await prisma.service.findMany({
    where: { businessId, id: { in: unique } },
    select: { id: true, name: true, durationMinutes: true, priceCents: true },
  });

  return new Map(services.map((service) => [service.id, service]));
}

type WindowStats = {
  calls: number;
  bookings: number;
  /** Céntimos; `null` si el negocio no tiene ningún precio configurado. */
  revenueCents: number | null;
  /** true si alguna cita del periodo incluye un servicio sin precio. */
  revenueIsPartial: boolean;
};

async function buildWindowStats(
  businessId: string,
  from: Date,
  to: Date,
  hasAnyPrice: boolean
): Promise<WindowStats> {
  const [calls, bookings] = await Promise.all([
    prisma.call.count({
      where: { businessId, startedAt: { gte: from, lt: to } },
    }),
    // Cuenta por fecha de creación, no por fecha de la cita: la pregunta que
    // responde el panel es qué ha conseguido la recepcionista este periodo,
    // no cuánta gente viene.
    prisma.booking.findMany({
      where: {
        isCancelled: false,
        createdAt: { gte: from, lt: to },
        call: { businessId },
      },
      select: { serviceIds: true },
    }),
  ]);

  if (!hasAnyPrice) {
    return {
      calls,
      bookings: bookings.length,
      revenueCents: null,
      revenueIsPartial: false,
    };
  }

  const services = await resolveServices(
    businessId,
    bookings.flatMap((booking) => booking.serviceIds)
  );

  let revenueCents = 0;
  let revenueIsPartial = false;

  for (const booking of bookings) {
    if (booking.serviceIds.length === 0) {
      revenueIsPartial = true;
      continue;
    }
    for (const serviceId of booking.serviceIds) {
      const price = services.get(serviceId)?.priceCents;
      if (price == null) {
        revenueIsPartial = true;
        continue;
      }
      revenueCents += price;
    }
  }

  return { calls, bookings: bookings.length, revenueCents, revenueIsPartial };
}

/**
 * Ventana móvil de 7 días contra los 7 anteriores. Móvil y no semana natural
 * a propósito: un lunes por la mañana una semana natural compara dos días
 * contra siete y siempre parece una caída.
 */
async function buildWeeklyStats(businessId: string) {
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * DAY_MS);
  const previousStart = new Date(now.getTime() - 14 * DAY_MS);

  const hasAnyPrice =
    (await prisma.service.count({
      where: { businessId, priceCents: { not: null } },
    })) > 0;

  const [current, previous, pendingBookings] = await Promise.all([
    buildWindowStats(businessId, weekStart, now, hasAnyPrice),
    buildWindowStats(businessId, previousStart, weekStart, hasAnyPrice),
    prisma.lead.count({
      where: {
        type: PENDING_BOOKING_LEAD_TYPE,
        resolvedAt: null,
        call: { businessId },
      },
    }),
  ]);

  return {
    from: weekStart.toISOString(),
    to: now.toISOString(),
    ...current,
    pendingBookings,
    previous: {
      calls: previous.calls,
      bookings: previous.bookings,
      revenueCents: previous.revenueCents,
    },
  };
}

export async function businessesRoutes(fastify: FastifyInstance) {
  // Get my business
  fastify.get(
    "/business/me",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const business = await prisma.business.findUnique({
          where: { id: request.user!.businessId },
          include: {
            agents: {
              where: { deletedAt: null },
              select: {
                id: true,
                name: true,
                vapiAssistantId: true,
                files: true,
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
            services: {
              where: { deletedAt: null },
              orderBy: [{ active: 'desc' }, { name: 'asc' }],
            },
            professionals: {
              where: { deletedAt: null },
              orderBy: [{ active: 'desc' }, { name: 'asc' }],
              include: {
                serviceLinks: {
                  select: {
                    serviceId: true,
                  },
                },
              },
            },
          },
        });

        if (!business) {
          return reply.status(404).send({ error: "Business not found" });
        }

        const { googleRefreshToken, outlookRefreshToken, professionals, ...publicBusiness } = business;
        void googleRefreshToken;
        void outlookRefreshToken;
        return reply.send({
          ...publicBusiness,
          professionals: professionals.map((professional) => ({
            id: professional.id,
            name: professional.name,
            active: professional.active,
            createdAt: professional.createdAt,
            updatedAt: professional.updatedAt,
            serviceIds: professional.serviceLinks.map((link) => link.serviceId),
          })),
        });
      } catch (error) {
        fastify.log.error({ err: error }, "[Business] Failed to fetch /business/me");
        return reply.status(500).send({ error: "Failed to fetch business" });
      }
    }
  );

  // Update my business
  fastify.patch<{ Body: z.infer<typeof UpdateBusinessSchema> }>(
    "/business/me",
    { preValidation: [fastify.authenticate] },
    async (
      request: FastifyRequest<{
        Body: z.infer<typeof UpdateBusinessSchema>;
      }>,
      reply
    ) => {
      try {
        const data = UpdateBusinessSchema.parse(request.body);

        const updateData: any = { ...data };
        if (data.schedule) {
            updateData.schedule = data.schedule as any;
        }

        if (data.businessType !== undefined) {
          if (!isBusinessType(data.businessType)) {
            return reply.status(400).send({ error: 'Tipo de negocio no válido' });
          }
          updateData.businessType = data.businessType;
          await syncAgentNameWithBusinessType({
            businessId: request.user!.businessId,
            businessType: data.businessType,
            businessName: data.name,
          });
        }

        const agents = await prisma.agent.findMany({
          where: {
            businessId: request.user!.businessId,
            deletedAt: null,
          },
        });

        // Mantiene el prompt libre del usuario y añade siempre el horario en un bloque estructurado estable.
        const shouldResyncPrompt =
          data.systemPrompt !== undefined ||
          data.schedule !== undefined ||
          data.agentSettings !== undefined ||
          data.businessDetails !== undefined ||
          data.name !== undefined ||
          data.businessType !== undefined ||
          data.minAdvanceBookingMinutes !== undefined ||
          data.maxAppointmentDurationMinutes !== undefined;

        if (shouldResyncPrompt) {
          const currentBusiness = await prisma.business.findUnique({
            where: { id: request.user!.businessId },
            select: { name: true, businessDetails: true, agentSettings: true },
          });
          const agentPrompt = buildManagedAgentPrompt({
            businessName: data.name ?? currentBusiness?.name ?? "el negocio",
            businessDetails: data.businessDetails ?? currentBusiness?.businessDetails,
            settings: data.agentSettings ?? currentBusiness?.agentSettings,
          });
          updateData.systemPrompt = agentPrompt;

          // Sincronizar en Vapi y en BD en paralelo para evitar timeouts.
          // VAPI: inactivo, solo se ejecuta si el agente ya tiene vapiAssistantId.
          await Promise.all(
            agents.map(async (agent) => {
              // Actualizar en Vapi si tiene ID
              if (agent.vapiAssistantId) {
                const vapiUpdatePayload = {
                  model: {
                    provider: agent.llmProvider,
                    model: agent.llmModel,
                    messages: [
                      {
                        role: "system" as const,
                        content: agentPrompt,
                      },
                    ],
                  },
                };

                try {
                  fastify.log.info(`Syncing business system prompt to Vapi agent ${agent.vapiAssistantId}`);
                  await vapiAdapter.updateAssistant(agent.vapiAssistantId, vapiUpdatePayload);
                } catch (vapiError) {
                  fastify.log.error({ err: vapiError }, `Failed to update Vapi assistant ${agent.vapiAssistantId}`);
                  // No fallamos todo el request si solo falla Vapi
                }
              }

              // Actualizar el agente en la BD para mantener la consistencia
              await prisma.agent.update({
                where: { id: agent.id },
                data: { systemPrompt: agentPrompt },
              });
            })
          );
        }

        const business = await prisma.business.update({
          where: { id: request.user!.businessId },
          data: updateData,
        });

        // Empuja el prompt gestionado + post_call_analysis_data a Retell.
        // Sin esto, editar tono/objetivo/horario/nicho en el dashboard solo
        // actualizaba la BD (y Vapi, inactivo) sin afectar a la llamada real.
        if (shouldResyncPrompt) {
          await syncAgentToRetell(request.user!.businessId);
        }

        if (data.schedule !== undefined) {
          await calendarService.syncCalendarToolsToAgents(request.user!.businessId);
        }

        if (
          data.googleCalendarId !== undefined ||
          data.outlookCalendarId !== undefined ||
          data.calendarProvider !== undefined ||
          data.bookingCapacity !== undefined ||
          data.schedule !== undefined ||
          data.timezone !== undefined ||
          data.agentSettings !== undefined ||
          data.businessDetails !== undefined ||
          data.minAdvanceBookingMinutes !== undefined ||
          data.maxAppointmentDurationMinutes !== undefined ||
          // phone está en BusinessVoiceConfig (voiceTools/service.ts) —
          // sin invalidar, el SMS de aviso seguiría yendo al teléfono
          // antiguo hasta que el caché de 1h expire por su cuenta.
          data.phone !== undefined
        ) {
          try {
            await getRedis().del(`voice_config:${request.user!.businessId}`);
          } catch (err) {
            fastify.log.error({ err }, 'Failed to invalidate Redis cache for business voice config');
          }
        }

        const { googleRefreshToken, outlookRefreshToken, ...publicBusiness } = business;
        void googleRefreshToken;
        void outlookRefreshToken;
        return reply.send(publicBusiness);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        return reply
          .status(500)
          .send({ error: "Failed to update business" });
      }
    }
  );

  // Get my stats
  fastify.get(
    "/business/me/stats",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const businessId = request.user!.businessId;

        const totalCalls = await prisma.call.count({
          where: { businessId },
        });

        const calls = await prisma.call.findMany({
          where: { businessId },
          select: { durationSecs: true },
        });

        const totalMinutes = Math.ceil(
          calls.reduce((acc, call) => acc + (call.durationSecs || 0), 0) / 60
        );

        const leads = await prisma.lead.count({
          where: {
            call: {
              businessId,
            },
            isLead: true,
          },
        });

        const bookings = await prisma.booking.count({
          where: {
            isCancelled: false,
            call: {
              businessId,
            },
          },
        });

        const week = await buildWeeklyStats(businessId);

        return reply.send({ totalCalls, totalMinutes, leads, bookings, week });
      } catch (error) {
        fastify.log.error({ err: error }, "[Business] Failed to fetch stats");
        return reply.status(500).send({ error: "Failed to fetch stats" });
      }
    }
  );

  // Próximas citas reservadas por el agente. El panel enseñaba eventos crudos
  // de Google Calendar (cadenas opacas del tipo "Corte + color"); esto sirve
  // la reserva real, con cliente, servicios y profesional ya resueltos.
  fastify.get<{ Querystring: z.infer<typeof AgendaQuerySchema> }>(
    "/business/me/agenda",
    { preValidation: [fastify.authenticate] },
    async (
      request: FastifyRequest<{
        Querystring: z.infer<typeof AgendaQuerySchema>;
      }>,
      reply
    ) => {
      try {
        const { days, limit } = AgendaQuerySchema.parse(request.query);
        const businessId = request.user!.businessId;

        const from = new Date();
        const until = new Date(from.getTime() + days * DAY_MS);

        const bookings = await prisma.booking.findMany({
          where: {
            isCancelled: false,
            programedAt: { gte: from, lte: until },
            call: { businessId },
          },
          include: {
            professional: { select: { id: true, name: true } },
            call: { select: { id: true, fromNumber: true } },
          },
          orderBy: { programedAt: "asc" },
          take: limit,
        });

        const services = await resolveServices(
          businessId,
          bookings.flatMap((booking) => booking.serviceIds)
        );

        return reply.send({
          from: from.toISOString(),
          until: until.toISOString(),
          bookings: bookings.map((booking) => ({
            id: booking.id,
            callId: booking.callId,
            programedAt: booking.programedAt.toISOString(),
            durationMinutes: booking.durationMinutes,
            numberPeople: booking.numberPeople,
            // El teléfono propio de la reserva solo existe si el cliente pidió
            // otro distinto al de la llamada; si no, el útil es el de origen.
            clientPhone: booking.clientPhone ?? booking.call.fromNumber,
            professional: booking.professional,
            services: booking.serviceIds
              .map((id) => services.get(id))
              .filter((service) => service !== undefined),
            externalEventId: booking.externalEventId,
            externalCalendarProvider: booking.externalCalendarProvider,
          })),
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        fastify.log.error({ err: error }, "[Business] Failed to fetch agenda");
        return reply.status(500).send({ error: "Failed to fetch agenda" });
      }
    }
  );

  // Citas que el cliente pidió por teléfono y no llegaron a reservarse por un
  // fallo técnico, sin resolver por el reintento en segundo plano. Son las
  // únicas que exigen que el negocio llame de vuelta a mano.
  fastify.get(
    "/business/me/pending-bookings",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const businessId = request.user!.businessId;

        const pending = await prisma.lead.findMany({
          where: {
            type: PENDING_BOOKING_LEAD_TYPE,
            resolvedAt: null,
            call: { businessId },
          },
          include: {
            call: { select: { id: true, fromNumber: true, startedAt: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        });

        return reply.send({
          pendingBookings: pending.map((lead) => {
            const data = (lead.data ?? {}) as Record<string, unknown>;
            return {
              id: lead.id,
              callId: lead.callId,
              createdAt: lead.createdAt.toISOString(),
              clientName: asOptionalString(data.clientName),
              clientPhone:
                asOptionalString(data.clientPhone) ?? lead.call.fromNumber,
              requestedAt: asOptionalString(data.startDateTime),
              failureCode: asOptionalString(data.failureCode),
            };
          }),
        });
      } catch (error) {
        fastify.log.error(
          { err: error },
          "[Business] Failed to fetch pending bookings"
        );
        return reply
          .status(500)
          .send({ error: "Failed to fetch pending bookings" });
      }
    }
  );
}
