import { z } from "zod";
import { syncAgentToRetell } from "../../lib/agentBootstrap.js";
import { syncAgentToTelnyx } from "../../lib/telnyxAgentSync.js";
import {
  getPlanLimits,
  PlanLimitError,
  resolvePlanId,
} from "../../lib/planFeatures.js";
import { prisma } from "../../lib/prisma.js";
import { getRedis } from "../../lib/redis.js";
import type { ProfessionalServiceLevel } from "@prisma/client";
import {
  ProfessionalSchema,
  type ProfessionalServiceLevelInput,
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
  professionals: Array<SerializedProfessional>;
};

export type SerializedProfessional = {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Solo los servicios con nivel explícito; ausencia = lo hace. */
  serviceLevels: Record<string, "especialista" | "no_sugerir">;
  /** Legado (= especialistas). El panel actual ya lee serviceLevels. */
  serviceIds: string[];
};

type ProfessionalWithServices = {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  serviceLinks: Array<{ serviceId: string; level?: ProfessionalServiceLevel | null }>;
};

export function serializeProfessional(
  professional: ProfessionalWithServices
): SerializedProfessional {
  const serviceLevels: Record<string, "especialista" | "no_sugerir"> = {};
  for (const link of professional.serviceLinks) {
    // Filas anteriores a la columna (mocks, datos viejos) eran la casilla
    // "especialidad": sin nivel se leen como especialista.
    serviceLevels[link.serviceId] =
      link.level === "NO_SUGERIR" ? "no_sugerir" : "especialista";
  }
  return {
    id: professional.id,
    name: professional.name,
    active: professional.active,
    createdAt: professional.createdAt,
    updatedAt: professional.updatedAt,
    serviceLevels,
    serviceIds: Object.entries(serviceLevels)
      .filter(([, level]) => level === "especialista")
      .map(([serviceId]) => serviceId),
  };
}

export const nonDeletedServiceLinks = {
  where: { service: { deletedAt: null } },
  select: { serviceId: true, level: true },
};

/** Normaliza lo que manda el panel a las filas que hay que guardar: solo
 * los dos extremos tienen fila; "normal" (lo hace) es no tener ninguna. Con
 * `serviceLevels` presente se ignora `serviceIds` (legado: cada id era la
 * casilla "especialidad"). Un Map de-duplica ids repetidos, que antes hacían
 * saltar la clave primaria compuesta. */
export function resolveServiceLinks(input: {
  serviceLevels?: Record<string, ProfessionalServiceLevelInput>;
  serviceIds?: string[];
}): Array<{ serviceId: string; level: ProfessionalServiceLevel }> {
  const filas = new Map<string, ProfessionalServiceLevel>();
  if (input.serviceLevels) {
    for (const [serviceId, level] of Object.entries(input.serviceLevels)) {
      if (level === "especialista") filas.set(serviceId, "ESPECIALISTA");
      else if (level === "no_sugerir") filas.set(serviceId, "NO_SUGERIR");
    }
  } else {
    for (const serviceId of input.serviceIds ?? []) filas.set(serviceId, "ESPECIALISTA");
  }
  return [...filas.entries()].map(([serviceId, level]) => ({ serviceId, level }));
}

/** Todos los ids que el panel menciona, incluidos los "normal": también
 * esos tienen que pertenecer al negocio aunque no generen fila. */
function serviceIdsMencionados(input: {
  serviceLevels?: Record<string, ProfessionalServiceLevelInput>;
  serviceIds?: string[];
}): string[] {
  return input.serviceLevels ? Object.keys(input.serviceLevels) : (input.serviceIds ?? []);
}

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
}

/**
 * Tras cambiar el catálogo: caché de voz fuera y la recepcionista al día en
 * los dos orquestadores. Exportada para que el Gestor (fase 2 del plan de
 * WhatsApp) sincronice UNA vez al final de un lote (`{ sync: false }` en
 * cada alta) en vez de una por servicio o profesional.
 */
export async function syncBookingConfiguration(businessId: string) {
  await invalidateBusinessAgentConfigCache(businessId);
  // También actualizamos los agentes temporalmente inactivos: se pueden
  // reactivar desde PATCH /agents/:id y deben recuperar el catálogo y el
  // análisis post-llamada vigentes en ese momento.  // Telnyx es el orquestador de todos los negocios: va primero, para que un
  // fallo de Retell (que lanza) no lo deje sin sincronizar.
  await syncAgentToTelnyx(businessId, prisma);
  await syncAgentToRetell(businessId, prisma);
}

export async function createService(
  businessId: string,
  input: z.infer<typeof ServiceSchema>,
  opciones: { sync?: boolean } = {}
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
  if (opciones.sync !== false) {
    await syncBookingConfiguration(businessId);
  }
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
  input: z.infer<typeof UpdateServiceSchema>,
  opciones: { sync?: boolean } = {}
) {
  const service = await getService(businessId, id);
  if (!service) return null;

  const updated = await prisma.service.update({
    where: { id: service.id },
    data: input,
  });
  if (opciones.sync !== false) {
    await syncBookingConfiguration(businessId);
  }
  return updated;
}

export async function deleteService(
  businessId: string,
  id: string,
  opciones: { sync?: boolean } = {}
) {
  const service = await getService(businessId, id);
  if (!service) return null;

  const deleted = await prisma.$transaction(async (tx) => {
    await tx.professionalService.deleteMany({ where: { serviceId: service.id } });
    return tx.service.update({
      where: { id: service.id },
      data: { active: false, deletedAt: new Date() },
    });
  });
  if (opciones.sync !== false) {
    await syncBookingConfiguration(businessId);
  }
  return deleted;
}

/**
 * Aplica el límite de profesionales activos del plan antes de añadir uno más
 * (creación o reactivación). Cuenta solo activos no borrados: retirar a
 * alguien libera su plaza.
 */
async function ensureProfessionalSlotAvailable(
  businessId: string,
  // Cliente de la transacción en curso: contar y crear tienen que ocurrir
  // dentro de la MISMA transacción serializable. Con dos peticiones a la vez
  // y una plaza libre, ambas contaban 2 < 3 y ambas creaban, dejando al
  // negocio con más profesionales de los que incluye su plan.
  client: Pick<typeof prisma, "business" | "professional"> = prisma
) {
  const business = await client.business.findUnique({
    where: { id: businessId },
    select: { plan: true, stripePriceId: true },
  });
  if (!business) return;

  const planId = resolvePlanId(business);
  const { maxProfessionals } = getPlanLimits(planId);
  if (maxProfessionals === null) return;

  const activeCount = await client.professional.count({
    where: { businessId, active: true, deletedAt: null },
  });
  if (activeCount >= maxProfessionals) {
    throw new PlanLimitError({
      code: "PLAN_LIMIT_PROFESSIONALS",
      planId,
      limit: maxProfessionals,
      message: `Tu plan incluye hasta ${maxProfessionals} profesionales activos.`,
    });
  }
}

export async function createProfessional(
  businessId: string,
  input: z.infer<typeof ProfessionalSchema>,
  opciones: { sync?: boolean } = {}
) {
  await ensureServicesBelongToBusiness(businessId, serviceIdsMencionados(input));
  const serviceLinks = resolveServiceLinks(input);

  const professional = await prisma.$transaction(
    async (tx) => {
      if (input.active !== false) {
        await ensureProfessionalSlotAvailable(businessId, tx);
      }
      return tx.professional.create({
        data: {
          businessId,
          name: input.name,
          active: input.active ?? true,
          serviceLinks: {
            create: serviceLinks,
          },
        },
        include: { serviceLinks: nonDeletedServiceLinks },
      });
    },
    { isolationLevel: "Serializable" }
  );
  if (opciones.sync !== false) {
    await syncBookingConfiguration(businessId);
  }
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
  input: z.infer<typeof UpdateProfessionalSchema>,
  opciones: { sync?: boolean } = {}
) {
  const professional = await prisma.professional.findFirst({
    where: { id, businessId, deletedAt: null },
  });
  if (!professional) return null;

  // Cualquiera de los dos campos reemplaza el conjunto completo de vínculos.
  const reemplazaVinculos = input.serviceLevels !== undefined || input.serviceIds !== undefined;
  if (reemplazaVinculos) {
    await ensureServicesBelongToBusiness(businessId, serviceIdsMencionados(input));
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Reactivar ocupa plaza igual que crear: la comprobación va dentro de la
    // transacción para que dos reactivaciones simultáneas no pasen las dos.
    if (input.active === true && !professional.active) {
      await ensureProfessionalSlotAvailable(businessId, tx);
    }

    if (reemplazaVinculos) {
      await tx.professionalService.deleteMany({
        where: { professionalId: professional.id },
      });

      const filas = resolveServiceLinks(input);
      if (filas.length > 0) {
        await tx.professionalService.createMany({
          data: filas.map((fila) => ({ professionalId: professional.id, ...fila })),
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
  }, { isolationLevel: "Serializable" });
  if (opciones.sync !== false) {
    await syncBookingConfiguration(businessId);
  }
  return serializeProfessional(updated);
}

export async function deleteProfessional(
  businessId: string,
  id: string,
  opciones: { sync?: boolean } = {}
) {
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
  if (opciones.sync !== false) {
    await syncBookingConfiguration(businessId);
  }
  return deleted;
}
