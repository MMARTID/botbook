import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { getRedis } from "../../lib/redis.js";

type BookingSettingsPayload = {
  bookingCapacity: number;
  services: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>;
  professionals: Array<{
    id: string;
    name: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    serviceIds: string[];
  }>;
};

const CapacitySchema = z.object({
  bookingCapacity: z.coerce.number().int().min(1).max(50),
});

const ServiceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  durationMinutes: z.coerce.number().int().min(5).max(480),
  active: z.boolean().optional(),
});

const UpdateServiceSchema = ServiceSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

const ProfessionalSchema = z.object({
  name: z.string().trim().min(1).max(80),
  active: z.boolean().optional(),
  serviceIds: z.array(z.string().min(1)).default([]),
});

const UpdateProfessionalSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    active: z.boolean().optional(),
    serviceIds: z.array(z.string().min(1)).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

async function getBookingSettingsPayload(businessId: string): Promise<BookingSettingsPayload> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      bookingCapacity: true,
      services: {
        orderBy: [{ active: "desc" }, { name: "asc" }],
      },
      professionals: {
        orderBy: [{ active: "desc" }, { name: "asc" }],
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
    throw new Error("Business not found");
  }

  return {
    bookingCapacity: business.bookingCapacity,
    services: business.services,
    professionals: business.professionals.map((professional) => ({
      id: professional.id,
      name: professional.name,
      active: professional.active,
      createdAt: professional.createdAt,
      updatedAt: professional.updatedAt,
      serviceIds: professional.serviceLinks.map((link) => link.serviceId),
    })),
  };
}

async function ensureServicesBelongToBusiness(businessId: string, serviceIds: string[]) {
  if (serviceIds.length === 0) return;

  const count = await prisma.service.count({
    where: {
      businessId,
      id: { in: serviceIds },
    },
  });

  if (count !== new Set(serviceIds).size) {
    throw new Error("One or more services do not belong to this business");
  }
}

async function invalidateBusinessAgentConfigCache(businessId: string) {
  const agents = await prisma.agent.findMany({
    where: { businessId, vapiAssistantId: { not: null } },
    select: { vapiAssistantId: true },
  });

  if (!agents.length) return;

  const redis = getRedis();
  const pipeline = redis.pipeline();
  for (const agent of agents) {
    if (agent.vapiAssistantId) {
      pipeline.del(`vapi_config:${agent.vapiAssistantId}`);
    }
  }
  await pipeline.exec();
}

export async function bookingSettingsRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/",
    { preValidation: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const payload = await getBookingSettingsPayload(request.user!.businessId);
        return reply.send(payload);
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to fetch booking settings" });
      }
    },
  );

  fastify.patch<{ Body: z.infer<typeof CapacitySchema> }>(
    "/",
    { preValidation: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { bookingCapacity } = CapacitySchema.parse(request.body);
        await prisma.business.update({
          where: { id: request.user!.businessId },
          data: { bookingCapacity },
        });
        await invalidateBusinessAgentConfigCache(request.user!.businessId);
        return reply.send(await getBookingSettingsPayload(request.user!.businessId));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to update booking capacity" });
      }
    },
  );

  fastify.post<{ Body: z.infer<typeof ServiceSchema> }>(
    "/services",
    { preValidation: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const data = ServiceSchema.parse(request.body);
        const service = await prisma.service.create({
          data: {
            businessId: request.user!.businessId,
            name: data.name,
            durationMinutes: data.durationMinutes,
            active: data.active ?? true,
          },
        });
        await invalidateBusinessAgentConfigCache(request.user!.businessId);
        return reply.status(201).send(service);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to create service" });
      }
    },
  );

  fastify.patch<{
    Params: { serviceId: string };
    Body: z.infer<typeof UpdateServiceSchema>;
  }>(
    "/services/:serviceId",
    { preValidation: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const data = UpdateServiceSchema.parse(request.body);
        const service = await prisma.service.findFirst({
          where: {
            id: request.params.serviceId,
            businessId: request.user!.businessId,
          },
        });

        if (!service) {
          return reply.status(404).send({ error: "Service not found" });
        }

        const updated = await prisma.service.update({
          where: { id: service.id },
          data,
        });
        await invalidateBusinessAgentConfigCache(request.user!.businessId);
        return reply.send(updated);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to update service" });
      }
    },
  );

  fastify.post<{ Body: z.infer<typeof ProfessionalSchema> }>(
    "/professionals",
    { preValidation: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const data = ProfessionalSchema.parse(request.body);
        await ensureServicesBelongToBusiness(request.user!.businessId, data.serviceIds);

        const professional = await prisma.professional.create({
          data: {
            businessId: request.user!.businessId,
            name: data.name,
            active: data.active ?? true,
            serviceLinks: {
              create: data.serviceIds.map((serviceId) => ({ serviceId })),
            },
          },
          include: {
            serviceLinks: {
              select: {
                serviceId: true,
              },
            },
          },
        });

        await invalidateBusinessAgentConfigCache(request.user!.businessId);
        return reply.status(201).send({
          id: professional.id,
          name: professional.name,
          active: professional.active,
          createdAt: professional.createdAt,
          updatedAt: professional.updatedAt,
          serviceIds: professional.serviceLinks.map((link) => link.serviceId),
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        if (error instanceof Error && error.message.includes("services do not belong")) {
          return reply.status(400).send({ error: error.message });
        }
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to create professional" });
      }
    },
  );

  fastify.patch<{
    Params: { professionalId: string };
    Body: z.infer<typeof UpdateProfessionalSchema>;
  }>(
    "/professionals/:professionalId",
    { preValidation: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const data = UpdateProfessionalSchema.parse(request.body);
        const professional = await prisma.professional.findFirst({
          where: {
            id: request.params.professionalId,
            businessId: request.user!.businessId,
          },
          include: {
            serviceLinks: true,
          },
        });

        if (!professional) {
          return reply.status(404).send({ error: "Professional not found" });
        }

        if (data.serviceIds) {
          await ensureServicesBelongToBusiness(request.user!.businessId, data.serviceIds);
        }

        const updated = await prisma.$transaction(async (tx) => {
          if (data.serviceIds) {
            await tx.professionalService.deleteMany({
              where: { professionalId: professional.id },
            });

            if (data.serviceIds.length > 0) {
              await tx.professionalService.createMany({
                data: data.serviceIds.map((serviceId) => ({
                  professionalId: professional.id,
                  serviceId,
                })),
              });
            }
          }

          return tx.professional.update({
            where: { id: professional.id },
            data: {
              ...(data.name !== undefined ? { name: data.name } : {}),
              ...(data.active !== undefined ? { active: data.active } : {}),
            },
            include: {
              serviceLinks: {
                select: {
                  serviceId: true,
                },
              },
            },
          });
        });

        await invalidateBusinessAgentConfigCache(request.user!.businessId);
        return reply.send({
          id: updated.id,
          name: updated.name,
          active: updated.active,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
          serviceIds: updated.serviceLinks.map((link) => link.serviceId),
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: error.errors });
        }
        if (error instanceof Error && error.message.includes("services do not belong")) {
          return reply.status(400).send({ error: error.message });
        }
        fastify.log.error(error);
        return reply.status(500).send({ error: "Failed to update professional" });
      }
    },
  );
}
