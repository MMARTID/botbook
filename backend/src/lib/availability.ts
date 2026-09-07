import { prisma } from "./prisma.js";
import { checkBusinessHours } from "./businessSchedule.js";

export type AvailableProfessional = {
  id: string;
  name: string;
};

/** Próximo hueco libre ese mismo día, calculado por el backend cuando la
 * hora pedida no está disponible por capacidad u ocupación — nunca por
 * OUTSIDE_BUSINESS_HOURS/PROFESSIONAL_NOT_FOUND/NO_AVAILABLE_PROFESSIONAL,
 * donde no tiene sentido buscar un hueco cercano. Existe para que el agente
 * de voz no tenga que inventar una alternativa y volver a llamar a la tool
 * para comprobarla — round-trip que en una llamada real de prueba
 * (2026-09-07) llevó a ofrecer una segunda hora que tampoco estaba libre. */
export type SuggestedSlot = {
  startDateTime: string;
  availableProfessionals: AvailableProfessional[];
};

export type AvailabilityResult =
  | {
      available: true;
      message: string;
      capacityUsed: number;
      capacityTotal: number;
      availableProfessionals: AvailableProfessional[];
    }
  | {
      available: false;
      code: string;
      message: string;
      capacityUsed?: number;
      capacityTotal?: number;
      /** null si no se buscó (código no aplicable) o no quedó ningún hueco
       * libre en la ventana de búsqueda. */
      suggestedNextSlot?: SuggestedSlot | null;
    };

const NEXT_SLOT_SEARCH_INCREMENT_MINUTES = 15;
/** 16 intentos × 15 min = 4 horas hacia adelante como máximo. checkBusinessHours
 * corta antes si el horario del negocio termina primero. */
const NEXT_SLOT_SEARCH_MAX_ATTEMPTS = 16;

/** Busca el siguiente hueco libre a partir de `startDateTime`, en pasos de
 * 15 minutos, dentro del mismo horario comercial del día — nunca salta a
 * otro día. Reutiliza `bookings`, ya cargado por el caller para una ventana
 * que cubre toda la búsqueda, así que no hace ninguna consulta adicional. */
function findNextAvailableSlot(input: {
  schedule: unknown;
  timezone: string;
  bookingCapacity: number;
  startDateTime: string;
  durationMinutes: number;
  rankedProfessionals: AvailableProfessional[];
  bookings: Array<{ professionalId: string | null; programedAt: Date; durationMinutes: number | null }>;
}): SuggestedSlot | null {
  const { schedule, timezone, bookingCapacity, startDateTime, durationMinutes, rankedProfessionals, bookings } = input;

  if (rankedProfessionals.length === 0) {
    return null;
  }

  const originalStart = new Date(startDateTime);

  for (let attempt = 1; attempt <= NEXT_SLOT_SEARCH_MAX_ATTEMPTS; attempt++) {
    const candidateStart = new Date(
      originalStart.getTime() + attempt * NEXT_SLOT_SEARCH_INCREMENT_MINUTES * 60_000
    );
    const candidateISO = candidateStart.toISOString();

    const hoursCheck = checkBusinessHours(schedule, timezone, candidateISO, durationMinutes);
    if (!hoursCheck.success || !hoursCheck.isOpen) {
      // Se acabó el horario laboral del día — no tiene sentido seguir
      // probando horas más tardías.
      break;
    }

    const candidateEnd = new Date(candidateStart.getTime() + Math.max(0, durationMinutes) * 60_000);
    const overlapping = bookings.filter((booking) => {
      const bookingStart = new Date(booking.programedAt);
      const bookingEnd = new Date(bookingStart.getTime() + (booking.durationMinutes || 30) * 60_000);
      return bookingStart < candidateEnd && bookingEnd > candidateStart;
    });

    if (overlapping.length >= bookingCapacity) {
      continue;
    }

    const busyProfessionalIds = new Set(
      overlapping.map((booking) => booking.professionalId).filter((id): id is string => Boolean(id))
    );
    const availableProfessionals = rankedProfessionals.filter(
      (professional) => !busyProfessionalIds.has(professional.id)
    );

    if (availableProfessionals.length > 0) {
      return { startDateTime: candidateISO, availableProfessionals };
    }
  }

  return null;
}

export async function checkAvailability(input: {
  businessId: string;
  schedule: unknown;
  timezone: string;
  bookingCapacity: number;
  startDateTime: string;
  durationMinutes: number;
  /** Uno o varios servicios pedidos en la misma reserva (ej. "corte y
   * mechas"). Nunca se usa para excluir profesionales, solo para priorizar
   * — ver comentario más abajo. */
  serviceIds?: string[] | null;
  /** Si se indica, solo se comprueba disponibilidad para este profesional
   * (ya escopado a businessId en la consulta, por lo que un ID de otro
   * negocio simplemente no encuentra resultados). */
  professionalId?: string | null;
}): Promise<AvailabilityResult> {
  const { businessId, schedule, timezone, bookingCapacity, startDateTime, durationMinutes, serviceIds, professionalId } = input;

  // 1. Horario comercial
  const hoursResult = checkBusinessHours(schedule, timezone, startDateTime, durationMinutes);
  if (!hoursResult.success || !hoursResult.isOpen) {
    return {
      available: false,
      code: hoursResult.success ? "OUTSIDE_BUSINESS_HOURS" : "BUSINESS_HOURS_NOT_CONFIGURED",
      message: hoursResult.message,
    };
  }

  // 2. Profesionales que pueden atender el servicio
  const professionals = await prisma.professional.findMany({
    where: {
      businessId,
      active: true,
      ...(professionalId ? { id: professionalId } : {}),
    },
    include: {
      serviceLinks: true,
    },
  });

  if (professionalId && professionals.length === 0) {
    return {
      available: false,
      code: "PROFESSIONAL_NOT_FOUND",
      message: "No encuentro a ese profesional activo en el negocio.",
    };
  }

  if (professionals.length === 0) {
    return {
      available: false,
      code: "NO_AVAILABLE_PROFESSIONAL",
      message: "No hay profesionales activos configurados en el negocio.",
    };
  }

  // Los servicios marcados en un profesional son una preferencia de
  // especialidad, no una restricción: cualquier profesional activo puede
  // atender cualquier servicio (un profesional sin ningún servicio marcado
  // puede hacerlos todos, sin prioridad frente a los demás). Cuando se piden
  // uno o varios servicios sin especificar profesional, se prioriza a quien
  // los tenga TODOS marcados como especialidad — el resto sigue contando
  // como alternativa si nadie cubre todos los servicios o los especialistas
  // están ocupados.
  const requestedServiceIds = serviceIds?.filter(Boolean) ?? [];
  const rankedProfessionals = requestedServiceIds.length > 0
    ? [...professionals].sort((a, b) => {
        const aCoversAll = requestedServiceIds.every((id) =>
          a.serviceLinks.some((link) => link.serviceId === id)
        ) ? 0 : 1;
        const bCoversAll = requestedServiceIds.every((id) =>
          b.serviceLinks.some((link) => link.serviceId === id)
        ) ? 0 : 1;
        return aCoversAll - bCoversAll;
      })
    : professionals;

  // 3. Citas existentes en el slot — la ventana de la consulta ya cubre
  // también la búsqueda de un hueco alternativo (ver findNextAvailableSlot
  // más abajo), así que una sola query a Prisma sirve para ambos casos.
  const start = new Date(startDateTime);
  const end = new Date(start.getTime() + Math.max(0, durationMinutes) * 60_000);
  const nextSlotSearchWindowEnd = new Date(
    start.getTime() +
      NEXT_SLOT_SEARCH_MAX_ATTEMPTS * NEXT_SLOT_SEARCH_INCREMENT_MINUTES * 60_000 +
      Math.max(0, durationMinutes) * 60_000
  );

  const overlappingBookings = await prisma.booking.findMany({
    where: {
      call: { businessId },
      isCancelled: false,
      programedAt: {
        lt: nextSlotSearchWindowEnd,
      },
    },
    select: {
      professionalId: true,
      programedAt: true,
      durationMinutes: true,
    },
  });

  const activeBookings = overlappingBookings.filter((booking) => {
    const bookingStart = new Date(booking.programedAt);
    const bookingEnd = new Date(bookingStart.getTime() + (booking.durationMinutes || 30) * 60_000);
    return bookingStart < end && bookingEnd > start;
  });

  const bookingsInSlot = activeBookings.length;
  const rankedProfessionalsForSearch = rankedProfessionals.map((professional) => ({
    id: professional.id,
    name: professional.name,
  }));

  if (bookingsInSlot >= bookingCapacity) {
    return {
      available: false,
      code: "CAPACITY_REACHED",
      message: "El negocio ya tiene todas sus plazas ocupadas en ese horario.",
      capacityUsed: bookingsInSlot,
      capacityTotal: bookingCapacity,
      suggestedNextSlot: findNextAvailableSlot({
        schedule,
        timezone,
        bookingCapacity,
        startDateTime,
        durationMinutes,
        rankedProfessionals: rankedProfessionalsForSearch,
        bookings: overlappingBookings,
      }),
    };
  }

  // 4. Profesionales ocupados en el slot
  const busyProfessionalIds = new Set(
    activeBookings
      .map((booking) => booking.professionalId)
      .filter((id): id is string => Boolean(id))
  );

  const availableProfessionals = rankedProfessionals
    .filter((professional) => !busyProfessionalIds.has(professional.id))
    .map((professional) => ({ id: professional.id, name: professional.name }));

  if (availableProfessionals.length === 0) {
    return {
      available: false,
      code: "ALL_PROFESSIONALS_BUSY",
      message: "Todos los profesionales que pueden hacer este servicio están ocupados en ese horario.",
      capacityUsed: bookingsInSlot,
      capacityTotal: bookingCapacity,
      suggestedNextSlot: findNextAvailableSlot({
        schedule,
        timezone,
        bookingCapacity,
        startDateTime,
        durationMinutes,
        rankedProfessionals: rankedProfessionalsForSearch,
        bookings: overlappingBookings,
      }),
    };
  }

  return {
    available: true,
    message: `Hay ${availableProfessionals.length} profesional${availableProfessionals.length === 1 ? "" : "es"} libre${availableProfessionals.length === 1 ? "" : "s"} y quedan ${bookingCapacity - bookingsInSlot} plazas disponibles.`,
    capacityUsed: bookingsInSlot,
    capacityTotal: bookingCapacity,
    availableProfessionals,
  };
}
