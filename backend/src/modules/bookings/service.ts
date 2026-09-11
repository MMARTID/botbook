import { z } from "zod";
import { syncAgentToRetell } from "../../lib/agentBootstrap.js";
import { syncAgentToTelnyx } from "../../lib/telnyxAgentSync.js";
import { prisma } from "../../lib/prisma.js";
import { getRedis } from "../../lib/redis.js";
import {
  ProfessionalSchema,
  ServiceSchema,
  UpdateProfessionalSchema,
  UpdateServiceSchema,
} from "./schemas.js";

export type BookingSettingsPayload = {
  bookingCapacity: number;
  services: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    priceCents: number | null;
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

type ProfessionalWithServices = {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  serviceLinks: Array<{ serviceId: string }>;
};

function serializeProfessional(professional: ProfessionalWithServices) {
  return {
    id: professional.id,
    name: professional.name,
    active: professional.active,
    createdAt: professional.createdAt,
    updatedAt: professional.updatedAt,
    serviceIds: professional.serviceLinks.map((link) => link.serviceId),
  };
}

const nonDeletedServiceLinks = {
  where: { service: { deletedAt: null } },
  select: { serviceId: true },
};

export async function getBookingSettingsPayload(
  businessId: string
): Promise<BookingSettingsPayload> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      bookingCapacity: true,
      services: {
        where: { deletedAt: null },
        orderBy: [{ active: "desc" }, { name: "asc" }],
      },
      professionals: {
        where: { deletedAt: null },
        orderBy: [{ active: "desc" }, { name: "asc" }],
        include: { serviceLinks: nonDeletedServiceLinks },
      },
    },
  });

  if (!business) {
    throw new Error("Negocio no encontrado");
  }

  return {
    bookingCapacity: business.bookingCapacity,
    services: business.services,
    professionals: business.professionals.map(serializeProfessional),
  };
}

async function ensureServicesBelongToBusiness(
  businessId: string,
  serviceIds: string[]
) {
  if (serviceIds.length === 0) return;

  const count = await prisma.service.count({
    where: {
      businessId,
      id: { in: serviceIds },
      deletedAt: null,
    },
  });

  if (count !== new Set(serviceIds).size) {
    throw new Error("Uno o varios servicios no pertenecen a este negocio");
  }
}

export async function invalidateBusinessAgentConfigCache(businessId: string) {
  const redis = getRedis();

  try {
    await redis.del(`voice_config:${businessId}`);
  } catch (error) {
    console.error(
      `[Booking settings] No se pudo invalidar la caché para ${businessId}:`,
      error
    );
  }

  const agents = await prisma.agent.findMany({
    where: {
      businessId,
      deletedAt: null,
      vapiAssistantId: { not: null },
    },
    select: { vapiAssistantId: true },
  });

  if (agents.length === 0) return;

  const pipeline = redis.pipeline();
  for (const agent of agents) {
    if (agent.vapiAssistantId) {
      pipeline.del(`vapi_config:${agent.vapiAssistantId}`);
    }
  }
  await pipeline.exec();
}

async function syncBookingConfiguration(businessId: string) {
  await invalidateBusinessAgentConfigCache(businessId);
  // También actualizamos los agentes temporalmente inactivos: se pueden
  // reactivar desde PATCH /agents/:id y deben recuperar el catálogo y el
  // análisis post-llamada vigentes en ese momento.
  await syncAgentToRetell(businessId, prisma);
  await syncAgentToTelnyx(businessId, prisma);
}

export async function createService(
  businessId: string,
  input: z.infer<typeof ServiceSchema>
) {
  const service = await prisma.service.create({
    data: {
      businessId,
      name: input.name,
      durationMinutes: input.durationMinutes,
      priceCents: input.priceCents ?? null,
      active: input.active ?? true,
    },
  });
  await syncBookingConfiguration(businessId);
  return service;
}

export async function getService(businessId: string, id: string) {
  return prisma.service.findFirst({
    where: { id, businessId, deletedAt: null },
  });
}

export async function updateService(
  businessId: string,
  id: string,
  input: z.infer<typeof UpdateServiceSchema>
) {
  const service = await getService(businessId, id);
  if (!service) return null;

  const updated = await prisma.service.update({
    where: { id: service.id },
    data: input,
  });
  await syncBookingConfiguration(businessId);
  return updated;
}

export async function deleteService(businessId: string, id: string) {
  const service = await getService(businessId, id);
  if (!service) return null;

  const deleted = await prisma.$transaction(async (tx) => {
    await tx.professionalService.deleteMany({ where: { serviceId: service.id } });
    return tx.service.update({
      where: { id: service.id },
      data: { active: false, deletedAt: new Date() },
    });
  });
  await syncBookingConfiguration(businessId);
  return deleted;
}

export async function createProfessional(
  businessId: string,
  input: z.infer<typeof ProfessionalSchema>
) {
  await ensureServicesBelongToBusiness(businessId, input.serviceIds);

  const professional = await prisma.professional.create({
    data: {
      businessId,
      name: input.name,
      active: input.active ?? true,
      serviceLinks: {
        create: input.serviceIds.map((serviceId) => ({ serviceId })),
      },
    },
    include: { serviceLinks: nonDeletedServiceLinks },
  });
  await syncBookingConfiguration(businessId);
  return serializeProfessional(professional);
}

export async function getProfessional(businessId: string, id: string) {
  const professional = await prisma.professional.findFirst({
    where: { id, businessId, deletedAt: null },
    include: { serviceLinks: nonDeletedServiceLinks },
  });
  return professional ? serializeProfessional(professional) : null;
}

export async function updateProfessional(
  businessId: string,
  id: string,
  input: z.infer<typeof UpdateProfessionalSchema>
) {
  const professional = await prisma.professional.findFirst({
    where: { id, businessId, deletedAt: null },
  });
  if (!professional) return null;

  if (input.serviceIds !== undefined) {
    await ensureServicesBelongToBusiness(businessId, input.serviceIds);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.serviceIds !== undefined) {
      await tx.professionalService.deleteMany({
        where: { professionalId: professional.id },
      });

      if (input.serviceIds.length > 0) {
        await tx.professionalService.createMany({
          data: input.serviceIds.map((serviceId) => ({
            professionalId: professional.id,
            serviceId,
          })),
        });
      }
    }

    return tx.professional.update({
      where: { id: professional.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      include: { serviceLinks: nonDeletedServiceLinks },
    });
  });
  await syncBookingConfiguration(businessId);
  return serializeProfessional(updated);
}

export async function deleteProfessional(businessId: string, id: string) {
  const professional = await prisma.professional.findFirst({
    where: { id, businessId, deletedAt: null },
  });
  if (!professional) return null;

  const deleted = await prisma.$transaction(async (tx) => {
    await tx.professionalService.deleteMany({
      where: { professionalId: professional.id },
    });
    return tx.professional.update({
      where: { id: professional.id },
      data: { active: false, deletedAt: new Date() },
    });
  });
  await syncBookingConfiguration(businessId);
  return deleted;
}
