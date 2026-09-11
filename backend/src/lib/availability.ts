import { prisma } from "./prisma.js";
import { checkBusinessHours } from "./businessSchedule.js";

export type AvailableProfessional = {
  id: string;
  name: string;
};

export type ExternalBusyInterval = {
  start: Date;
  end: Date;
  /** ID del evento en el calendario conectado, cuando el proveedor lo
   * devuelve. Permite reconciliarlo con nuestro Booking y no contarlo dos
   * veces. */
  externalEventId?: string;
};

export type CalendarOrigin = {
  provider: "google" | "outlook";
  calendarId: string;
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

/** Nº máximo de reservas activas al mismo tiempo, en cualquier instante
 * dentro de [intervalStart, intervalEnd) — no el nº de reservas que
 * simplemente TOCAN el intervalo. Dos citas consecutivas sin solaparse entre
 * sí (09:00–09:30 y 09:30–10:00) ambas tocan la ventana 09:00–10:00, pero
 * nunca coinciden en el mismo instante: contarlas como "2 a la vez" bloqueaba
 * reservas con capacidad de sobra (confirmado: capacidad 2, esas dos citas ya
 * impedían reservar un tercer profesional libre en esa misma ventana).
 * Barrido de línea: +1 en cada inicio (recortado a intervalStart), -1 en cada
 * fin (recortado a intervalEnd), máximo acumulado del barrido. Los finales se
 * procesan antes que los inicios en el mismo instante para no contar como
 * simultáneas dos citas que solo se tocan en el límite (mismo criterio que
 * el solape `bookingStart < end && bookingEnd > start`, con desigualdades
 * estrictas). */
function maxConcurrentBookings(
  intervalStart: Date,
  intervalEnd: Date,
  bookings: Array<{ programedAt: Date; durationMinutes: number | null }>
): number {
  const intervalStartMs = intervalStart.getTime();
  const intervalEndMs = intervalEnd.getTime();
  const events: Array<{ time: number; delta: 1 | -1 }> = [];

  for (const booking of bookings) {
    const bookingStartMs = new Date(booking.programedAt).getTime();
    const bookingEndMs =
      bookingStartMs + (booking.durationMinutes || 30) * 60_000;
    const clippedStart = Math.max(bookingStartMs, intervalStartMs);
    const clippedEnd = Math.min(bookingEndMs, intervalEndMs);
    if (clippedStart < clippedEnd) {
      events.push({ time: clippedStart, delta: 1 });
      events.push({ time: clippedEnd, delta: -1 });
    }
  }

  events.sort((a, b) => a.time - b.time || a.delta - b.delta);

  let running = 0;
  let peak = 0;
  for (const event of events) {
    running += event.delta;
    peak = Math.max(peak, running);
  }
  return peak;
}

const NEXT_SLOT_SEARCH_INCREMENT_MINUTES = 15;
/** 16 intentos × 15 min = 4 horas hacia adelante como máximo. checkBusinessHours
 * corta antes si el horario del negocio termina primero. */
const NEXT_SLOT_SEARCH_MAX_ATTEMPTS = 16;

/**
 * Milisegundos que checkAvailability mira hacia delante desde
 * startDateTime — la ventana de búsqueda de findNextAvailableSlot (4h) MÁS
 * la propia duración de la cita (una cita de 90 min que empezara casi al
 * final de esas 4h necesita hasta 90 min más para comprobar su propio
 * hueco). Exportada para que quien calcule por su cuenta la ocupación
 * externa del calendario (fetchExternalBusyIntervals en voiceTools/service.ts,
 * y el equivalente en retryFailedBooking.ts) consulte exactamente la misma
 * ventana que esta función usa — antes usaban un margen fijo de 5h que se
 * quedaba corto para cualquier servicio de más de 60 min, dejando de
 * comprobar el calendario real justo en el tramo final de la búsqueda de
 * hueco alternativo (hallazgo de la revisión posterior a la auditoría).
 */
export function computeAvailabilityLookaheadMs(durationMinutes: number): number {
  return (
    NEXT_SLOT_SEARCH_MAX_ATTEMPTS * NEXT_SLOT_SEARCH_INCREMENT_MINUTES * 60_000 +
    Math.max(0, durationMinutes) * 60_000
  );
}

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
  bookings: Array<{
    professionalId: string | null;
    programedAt: Date;
    durationMinutes: number | null;
  }>;
}): SuggestedSlot | null {
  const {
    schedule,
    timezone,
    bookingCapacity,
    startDateTime,
    durationMinutes,
    rankedProfessionals,
    bookings,
  } = input;

  if (rankedProfessionals.length === 0) {
    return null;
  }

  const originalStart = new Date(startDateTime);

  for (let attempt = 1; attempt <= NEXT_SLOT_SEARCH_MAX_ATTEMPTS; attempt++) {
    const candidateStart = new Date(
      originalStart.getTime() +
        attempt * NEXT_SLOT_SEARCH_INCREMENT_MINUTES * 60_000
    );
    const candidateISO = candidateStart.toISOString();

    const hoursCheck = checkBusinessHours(
      schedule,
      timezone,
      candidateISO,
      durationMinutes
    );
    if (!hoursCheck.success) {
      // Horario mal configurado, no un simple "cerrado a esta hora" — no
      // hay ninguna hora en la que probar de nuevo vaya a dar otro
      // resultado, así que no tiene sentido seguir intentando.
      break;
    }
    if (!hoursCheck.isOpen) {
      // Cerrado en ESTE candidato concreto no significa que el día haya
      // terminado — un horario partido (ej. 09:00–13:00 y 16:00–20:00) sigue
      // teniendo hueco más tarde ese mismo día. Antes esto cortaba la
      // búsqueda entera al primer descanso entre turnos, dando por hecho
      // (incorrectamente) que ya no quedaba nada libre en lo que restaba del
      // día — hallazgo #18 de la auditoría. Seguir probando cada 15 min
      // hasta agotar la ventana de búsqueda es más caro pero correcto.
      continue;
    }

    const candidateEnd = new Date(
      candidateStart.getTime() + Math.max(0, durationMinutes) * 60_000
    );
    const overlapping = bookings.filter((booking) => {
      const bookingStart = new Date(booking.programedAt);
      const bookingEnd = new Date(
        bookingStart.getTime() + (booking.durationMinutes || 30) * 60_000
      );
      return bookingStart < candidateEnd && bookingEnd > candidateStart;
    });

    if (
      maxConcurrentBookings(candidateStart, candidateEnd, overlapping) >=
      bookingCapacity
    ) {
      continue;
    }

    const busyProfessionalIds = new Set(
      overlapping
        .map((booking) => booking.professionalId)
        .filter((id): id is string => Boolean(id))
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
  /** Bloques ocupados leídos del calendario REAL conectado (Google/Outlook),
   * no de Postgres — ver calendarService.getBusyIntervals. El caller los
   * calcula (necesita las credenciales del negocio, que este módulo no
   * conoce) y los pasa aquí para que cuenten igual que una reserva propia:
   * una cita metida a mano en el calendario debe bloquear el hueco, y no
   * puede atribuirse a ningún profesional concreto (professionalId: null),
   * así que solo resta capacidad — nunca marca a un profesional como
   * ocupado. Opcional: si no se pasa, el comportamiento es el de siempre
   * (solo Postgres). */
  externalBusyIntervals?: ExternalBusyInterval[];
  /** true solo si se pudo leer el calendario correctamente. Con este dato
   * podemos liberar una reserva local cuyo evento se canceló manualmente,
   * sin confundir una caída del proveedor con una agenda vacía. */
  calendarAvailabilityKnown?: boolean;
  /** Calendario del que proceden externalBusyIntervals. Solo ese calendario
   * puede confirmar que un evento propio fue borrado manualmente. */
  calendarOrigin?: CalendarOrigin | null;
}): Promise<AvailabilityResult> {
  const {
    businessId,
    schedule,
    timezone,
    bookingCapacity,
    startDateTime,
    durationMinutes,
    serviceIds,
    professionalId,
    externalBusyIntervals,
    calendarAvailabilityKnown = false,
    calendarOrigin,
  } = input;

  // 1. Horario comercial
  const hoursResult = checkBusinessHours(
    schedule,
    timezone,
    startDateTime,
    durationMinutes
  );
  if (!hoursResult.success || !hoursResult.isOpen) {
    return {
      available: false,
      code: hoursResult.success
        ? "OUTSIDE_BUSINESS_HOURS"
        : "BUSINESS_HOURS_NOT_CONFIGURED",
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
  const rankedProfessionals =
    requestedServiceIds.length > 0
      ? [...professionals].sort((a, b) => {
          const aCoversAll = requestedServiceIds.every((id) =>
            a.serviceLinks.some((link) => link.serviceId === id)
          )
            ? 0
            : 1;
          const bCoversAll = requestedServiceIds.every((id) =>
            b.serviceLinks.some((link) => link.serviceId === id)
          )
            ? 0
            : 1;
          return aCoversAll - bCoversAll;
        })
      : professionals;

  // 3. Citas existentes en el slot — la ventana de la consulta ya cubre
  // también la búsqueda de un hueco alternativo (ver findNextAvailableSlot
  // más abajo), así que una sola query a Prisma sirve para ambos casos.
  const start = new Date(startDateTime);
  const end = new Date(start.getTime() + Math.max(0, durationMinutes) * 60_000);
  const nextSlotSearchWindowEnd = new Date(
    start.getTime() + computeAvailabilityLookaheadMs(durationMinutes)
  );

  const localBookings = await prisma.booking.findMany({
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
      externalEventId: true,
      externalCalendarProvider: true,
      externalCalendarId: true,
    },
  });

  const externalIntervals = externalBusyIntervals ?? [];
  const externalIntervalsById = new Map(
    externalIntervals
      .filter((interval) => Boolean(interval.externalEventId))
      .map((interval) => [interval.externalEventId!, interval])
  );

  // Una consulta correcta puede liberar una reserva local solo si inspecciona
  // exactamente el mismo calendario que creó su evento. Al cambiar de
  // calendario/proveedor, la ausencia del ID anterior no significa que la
  // cita se haya cancelado: se mantiene como bloqueo conservador.
  // Los Bookings históricos sin origen también se conservan por seguridad.
  const reconciledLocalBookings = localBookings.flatMap((booking) => {
    const belongsToCurrentCalendar =
      calendarOrigin &&
      booking.externalCalendarProvider === calendarOrigin.provider &&
      booking.externalCalendarId === calendarOrigin.calendarId;
    if (
      !calendarAvailabilityKnown ||
      !booking.externalEventId ||
      !belongsToCurrentCalendar
    ) {
      return [booking];
    }

    const externalInterval = externalIntervalsById.get(booking.externalEventId);
    if (!externalInterval) {
      return [];
    }

    return [{
      ...booking,
      programedAt: externalInterval.start,
      durationMinutes: Math.max(
        0,
        (externalInterval.end.getTime() - externalInterval.start.getTime()) / 60_000
      ),
    }];
  });

  const localExternalEventIds = new Set(
    reconciledLocalBookings
      .map((booking) => booking.externalEventId)
      .filter((eventId): eventId is string => Boolean(eventId))
  );

  // professionalId: null a propósito (ver comentario en el parámetro) — un
  // bloqueo externo resta capacidad pero nunca marca a un profesional
  // concreto como ocupado, porque no sabemos a cuál corresponde. Los eventos
  // que ya tienen un Booking local se omiten aquí: ya cuentan una sola vez
  // arriba, conservando además el profesional asignado.
  const externalBookings = externalIntervals
    .filter(
      (interval) => interval.start.getTime() < nextSlotSearchWindowEnd.getTime()
    )
    .filter(
      (interval) =>
        !interval.externalEventId ||
        !localExternalEventIds.has(interval.externalEventId)
    )
    .map((interval) => ({
      professionalId: null as string | null,
      programedAt: interval.start,
      durationMinutes: Math.max(
        0,
        (interval.end.getTime() - interval.start.getTime()) / 60_000
      ),
    }));

  const overlappingBookings = [...reconciledLocalBookings, ...externalBookings];

  const activeBookings = overlappingBookings.filter((booking) => {
    const bookingStart = new Date(booking.programedAt);
    const bookingEnd = new Date(
      bookingStart.getTime() + (booking.durationMinutes || 30) * 60_000
    );
    return bookingStart < end && bookingEnd > start;
  });

  const bookingsInSlot = maxConcurrentBookings(start, end, activeBookings);
  const rankedProfessionalsForSearch = rankedProfessionals.map(
    (professional) => ({
      id: professional.id,
      name: professional.name,
    })
  );

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
      message:
        "Todos los profesionales que pueden hacer este servicio están ocupados en ese horario.",
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
