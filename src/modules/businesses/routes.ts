import { getRedis } from "../../lib/redis.js";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { vapiAdapter } from "../../adapters/vapi/VapiAdapter.js";
import { BusinessScheduleSchema } from "../../lib/businessSchedule.js";
import { calendarService } from "../calendar/service.js";
import { AgentSettingsSchema, buildManagedAgentPrompt } from "../../lib/managedAgentPrompt.js";
import { isBusinessType } from "../../lib/businessType.js";
import { syncAgentNameWithBusinessType } from "../../lib/agentBootstrap.js";

const UpdateBusinessSchema = z.object({
  name: z.string().min(1).optional(),
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
});

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
              orderBy: [{ active: 'desc' }, { name: 'asc' }],
            },
            professionals: {
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
          where: { businessId: request.user!.businessId }
        });

        // Mantiene el prompt libre del usuario y añade siempre el horario en un bloque estructurado estable.
        if (data.systemPrompt !== undefined || data.schedule !== undefined || data.agentSettings !== undefined || data.businessDetails !== undefined || data.name !== undefined) {
          const currentBusiness = await prisma.business.findUnique({
            where: { id: request.user!.businessId },
            select: { name: true, businessDetails: true, schedule: true, timezone: true, agentSettings: true },
          });
          const schedule = data.schedule ?? currentBusiness?.schedule ?? {};
          const timezone = data.timezone ?? currentBusiness?.timezone ?? "Europe/Madrid";
          const agentPrompt = buildManagedAgentPrompt({
            businessName: data.name ?? currentBusiness?.name ?? "el negocio",
            businessDetails: data.businessDetails ?? currentBusiness?.businessDetails,
            timezone,
            schedule,
            settings: data.agentSettings ?? currentBusiness?.agentSettings,
          });
          updateData.systemPrompt = agentPrompt;

          // Sincronizar en Vapi y en BD en paralelo para evitar timeouts
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
          data.businessDetails !== undefined
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

        return reply.send({ totalCalls, totalMinutes, leads });
      } catch (error) {
        return reply.status(500).send({ error: "Failed to fetch stats" });
      }
    }
  );
}
