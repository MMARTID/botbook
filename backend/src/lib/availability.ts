import { prisma } from "./prisma.js";
import { checkBusinessHours } from "./businessSchedule.js";

export type AvailableProfessional = {
  id: string;
  name: string;
};

/** Nivel de un profesional PARA los servicios pedidos en esta reserva. Sale
 * de sus filas de ProfessionalService: NO_SUGERIR si alguno de los servicios
 * pedidos lo tiene así, ESPECIALISTA si los tiene todos como especialidad, y
 * "normal" (lo hace) en el resto — incluido no tener fila, que es el estado
 * por defecto de cualquier profesional activo. */
export type ProfessionalTier = "especialista" | "normal" | "no_sugerir";

type ProfessionalServiceLink = {
  serviceId: string;
  /** Opcional para tolerar filas anteriores a la columna (mocks, datos
   * viejos): sin nivel se lee como especialidad, que es lo que significaba
   * la fila antes de existir el campo. */
  level?: "ESPECIALISTA" | "NO_SUGERIR" | null;
};

type RankedProfessional = AvailableProfessional & { tier: ProfessionalTier };

const TIER_RANK: Record<ProfessionalTier, number> = {
  especialista: 0,
  normal: 1,
  no_sugerir: 2,
};

export function professionalTierFor(
  links: ProfessionalServiceLink[],
  requestedServiceIds: string[]
): ProfessionalTier {
  if (requestedServiceIds.length === 0) return "normal";
  const levelByService = new Map(
    links.map((link) => [link.serviceId, link.level ?? "ESPECIALISTA"] as const)
  );
  if (requestedServiceIds.some((id) => levelByService.get(id) === "NO_SUGERIR")) {
    return "no_sugerir";
  }
  if (requestedServiceIds.every((id) => levelByService.get(id) === "ESPECIALISTA")) {
    return "especialista";
  }
  return "normal";
}

/** Fecha local del negocio (YYYY-MM-DD) para agrupar "las citas de ese día":
 * a las 23:30 en Madrid la fecha UTC ya es la del día siguiente. */
function claveDeDiaLocal(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Nº de citas por profesional y día local, calculado una sola vez sobre las
 * reservas ya cargadas: es el desempate entre profesionales del mismo nivel
 * ("a quien tenga el día más despejado"). Los bloqueos del calendario
 * externo (professionalId null) no son de nadie y no cuentan. */
function cargaPorDiaYProfesional(
  bookings: Array<{ professionalId: string | null; programedAt: Date }>,
  timezone: string
): Map<string, Map<string, number>> {
  const carga = new Map<string, Map<string, number>>();
  for (const booking of bookings) {
    if (!booking.professionalId) continue;
    const dia = claveDeDiaLocal(new Date(booking.programedAt), timezone);
    const porProfesional = carga.get(dia) ?? new Map<string, number>();
    porProfesional.set(
      booking.professionalId,
      (porProfesional.get(booking.professionalId) ?? 0) + 1
    );
    carga.set(dia, porProfesional);
  }
  return carga;
}

/** Orden de asignación para un instante concreto: primero el nivel
 * (especialista antes que "lo hace"), después quien tenga menos citas ese
 * día, y a igualdad el orden en que se dieron de alta. Sort estable: la
 * lista de entrada ya viene por createdAt. */
function ordenarParaAsignar(
  professionals: RankedProfessional[],
  slotStart: Date,
  timezone: string,
  carga: Map<string, Map<string, number>>
): RankedProfessional[] {
  const dia = claveDeDiaLocal(slotStart, timezone);
  const cargaDelDia = carga.get(dia);
  const citasDe = (id: string) => cargaDelDia?.get(id) ?? 0;
  return [...professionals].sort(
    (a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || citasDe(a.id) - citasDe(b.id)
  );
}

function sinNivel(professional: RankedProfessional): AvailableProfessional {
  return { id: professional.id, name: professional.name };
}

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

/** Próximo hueco libre calculado por el backend cuando la hora pedida no
 * está disponible por capacidad, ocupación u horario (OUTSIDE_BUSINESS_HOURS
 * incluido desde 2026-09-15: cerrado ahora mismo no significa que no haya
 * nada en los próximos días) — nunca por
 * PROFESSIONAL_NOT_FOUND/NO_AVAILABLE_PROFESSIONAL, donde ningún
 * desplazamiento en el tiempo cambia que no hay a quién asignar la cita.
 * Existe para que el agente de voz no tenga que inventar una alternativa y
 * volver a llamar a la tool para comprobarla — round-trip que en una llamada
 * real de prueba (2026-09-07) llevó a ofrecer una segunda hora que tampoco
 * estaba libre. */
export type SuggestedSlot = {
  startDateTime: string;
  availableProfessionals: AvailableProfessional[];
};

/** Solo cuando el cliente pidió por su nombre a alguien marcado como "no
 * sugerir" para estos servicios y hay otro profesional del pool automático
 * libre a esa misma hora: es a quien el agente propone UNA vez. Si el
 * cliente insiste, se reserva con quien pidió (el resultado principal ya es
 * el de esa persona). Nunca lleva el motivo: el cliente no debe oír que a
 * alguien "no se le da bien". */
export type ProfessionalRecommendation = {
  professional: AvailableProfessional;
  /** Si el recomendado es especialista en todo lo pedido; deja al agente
   * decirlo en positivo. */
  isSpecialist: boolean;
};

export type AvailabilityResult =
  | {
      available: true;
      message: string;
      capacityUsed: number;
      capacityTotal: number;
      /** Ordenados para asignar: availableProfessionals[0] es a quien se da
       * la cita si el cliente no pidió a nadie. Sin professionalId nunca
       * incluye a los marcados "no sugerir". */
      availableProfessionals: AvailableProfessional[];
      /** IDs de availableProfessionals que son especialistas en TODO lo
       * pedido. Sirve para que la confirmación pueda decir "te he puesto con
       * Laura, nuestra especialista en color". */
      specialistIds?: string[];
      recommendedProfessional?: ProfessionalRecommendation;
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
      recommendedProfessional?: ProfessionalRecommendation;
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
/** 288 intentos × 15 min = 3 días hacia adelante como máximo. Antes eran 16
 * intentos (4h): bastaba para "está lleno ahora mismo, ¿libra algo en lo
 * que queda de turno?", pero dejaba sin sugerencia cualquier cierre real
 * (fin de la jornada, fin de semana) — justo el caso donde más falta hace
 * una alternativa, porque si no el agente tiene que colgar, adivinar un día
 * y volver a llamar a check_availability (el mismo round-trip que
 * SuggestedSlot ya evitaba para CAPACITY_REACHED). checkBusinessHours
 * corta cada intento cerrado en O(1) en memoria, así que 288 intentos no es
 * un coste real — el límite real es cuánto calendario externo se trae
 * (ver computeAvailabilityLookaheadMs, usada también por quien llama). */
const NEXT_SLOT_SEARCH_MAX_ATTEMPTS = 288;

/** Cuánto hacia atrás hay que mirar para no perderse una cita que empezó
 * antes de la ventana y todavía sigue ocupando al profesional. 24 h es
 * holgadísimo para cualquier servicio real y mantiene la consulta acotada. */
const OVERLAP_LOOKBACK_MS = 24 * 60 * 60 * 1000;

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
  /** Candidatos a la cita (sin professionalId pedido: ya sin los "no
   * sugerir"). Se reordenan por nivel y carga del día de CADA candidato,
   * porque el hueco alternativo puede caer otro día. */
  rankedProfessionals: RankedProfessional[];
  bookings: Array<{
    professionalId: string | null;
    programedAt: Date;
    durationMinutes: number | null;
  }>;
  cargaPorDia: Map<string, Map<string, number>>;
}): SuggestedSlot | null {
  const {
    schedule,
    timezone,
    bookingCapacity,
    startDateTime,
    durationMinutes,
    rankedProfessionals,
    bookings,
    cargaPorDia,
  } = input;

  if (rankedProfessionals.length === 0) {
    return null;
  }

  const originalStart = new Date(startDateTime);

  // Los límites de cada reserva se calculan una sola vez, no 288 veces: el
  // bucle de abajo recorre esta lista en cada intento y crear dos Date por
  // reserva y por intento era el grueso del coste de la búsqueda.
  const bookingsConLimites = bookings.map((booking) => {
    const startMs = new Date(booking.programedAt).getTime();
    return {
      ...booking,
      startMs,
      endMs: startMs + (booking.durationMinutes || 30) * 60_000,
    };
  });

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
    const candidateStartMs = candidateStart.getTime();
    const candidateEndMs = candidateEnd.getTime();
    const overlapping = bookingsConLimites.filter(
      (booking) =>
        booking.startMs < candidateEndMs && booking.endMs > candidateStartMs
    );

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
    const availableProfessionals = ordenarParaAsignar(
      rankedProfessionals.filter(
        (professional) => !busyProfessionalIds.has(professional.id)
      ),
      candidateStart,
      timezone,
      cargaPorDia
    ).map(sinNivel);

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

  // 1. Horario comercial. Un horario mal configurado no se arregla probando
  // otra hora, así que corta aquí; "cerrado ahora mismo" en cambio sí puede
  // tener una alternativa cercana — se decide más abajo, una vez calculados
  // profesionales y reservas (que la propia sugerencia necesita).
  const hoursResult = checkBusinessHours(
    schedule,
    timezone,
    startDateTime,
    durationMinutes
  );
  if (!hoursResult.success) {
    return {
      available: false,
      code: "BUSINESS_HOURS_NOT_CONFIGURED",
      message: hoursResult.message,
    };
  }
  const outsideBusinessHours = !hoursResult.isOpen;

  // 2. Profesionales activos del negocio. Se cargan TODOS aunque el cliente
  // haya pedido a alguien concreto: si esa persona está marcada "no sugerir"
  // para el servicio, hay que saber quién más está libre a esa hora para
  // recomendarlo. El filtro por professionalId se aplica en memoria.
  const todosLosProfesionales = await prisma.professional.findMany({
    where: { businessId, active: true, deletedAt: null },
    include: { serviceLinks: true },
    // Último desempate del ranking: el orden de alta. Sin orderBy el orden
    // era el que quisiera Postgres.
    orderBy: { createdAt: "asc" },
  });

  const requestedServiceIds = serviceIds?.filter(Boolean) ?? [];
  const conNivel: RankedProfessional[] = todosLosProfesionales.map((professional) => ({
    id: professional.id,
    name: professional.name,
    tier: professionalTierFor(professional.serviceLinks ?? [], requestedServiceIds),
  }));

  const pedido = professionalId
    ? conNivel.find((professional) => professional.id === professionalId)
    : undefined;

  if (professionalId && !pedido) {
    return {
      available: false,
      code: "PROFESSIONAL_NOT_FOUND",
      message: "No encuentro a ese profesional activo en el negocio.",
    };
  }

  if (conNivel.length === 0) {
    return {
      available: false,
      code: "NO_AVAILABLE_PROFESSIONAL",
      message: "No hay profesionales activos configurados en el negocio.",
    };
  }

  // Tres niveles por profesional y servicio (ver ProfessionalServiceLevel en
  // el esquema): el especialista se lleva la cita cuando el cliente no pide a
  // nadie; "lo hace" (sin fila) es el valor por defecto de cualquier
  // profesional activo; "no sugerir" nunca entra en la asignación
  // automática, pero sí se le reserva si el cliente lo pide por su nombre —
  // entonces es `pedido` y el pool automático solo sirve para recomendar.
  const poolAutomatico = conNivel.filter(
    (professional) => professional.tier !== "no_sugerir"
  );

  if (!pedido && poolAutomatico.length === 0) {
    return {
      available: false,
      code: "NO_AVAILABLE_PROFESSIONAL",
      message:
        "Ningún profesional está configurado para atender este servicio sin que el cliente lo pida por su nombre.",
    };
  }

  const candidatos: RankedProfessional[] = pedido ? [pedido] : poolAutomatico;

  // 3. Citas existentes en el slot — la ventana de la consulta ya cubre
  // también la búsqueda de un hueco alternativo (ver findNextAvailableSlot
  // más abajo), así que una sola query a Prisma sirve para ambos casos.
  const start = new Date(startDateTime);
  const end = new Date(start.getTime() + Math.max(0, durationMinutes) * 60_000);
  const nextSlotSearchWindowEnd = new Date(
    start.getTime() + computeAvailabilityLookaheadMs(durationMinutes)
  );

  // Las canceladas se traen aparte, solo para saber qué eventos del
  // calendario externo son restos nuestros: si el borrado del evento falló al
  // cancelar (Google caído, calendario reconectado a mano), ese evento
  // huérfano se contaba como ocupación ajena y bloqueaba el hueco PARA
  // SIEMPRE, sin que nada lo reconciliara nunca.
  const canceladasConEvento = await prisma.booking.findMany({
    where: {
      call: { businessId },
      isCancelled: true,
      externalEventId: { not: null },
      programedAt: {
        gte: new Date(start.getTime() - OVERLAP_LOOKBACK_MS),
        lt: nextSlotSearchWindowEnd,
      },
    },
    select: { externalEventId: true },
  });

  const localBookings = await prisma.booking.findMany({
    where: {
      call: { businessId },
      isCancelled: false,
      programedAt: {
        // Cota inferior imprescindible: sin ella esta consulta se traía TODAS
        // las reservas del negocio desde el principio de los tiempos en cada
        // tool call de voz (el cliente está al teléfono esperando). Una cita
        // que empezó hace más de un día no puede solaparse con nada de esta
        // ventana, y ningún servicio de un salón dura tanto.
        gte: new Date(start.getTime() - OVERLAP_LOOKBACK_MS),
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
    [
      ...reconciledLocalBookings.map((booking) => booking.externalEventId),
      // Un evento de una cita ya cancelada es basura nuestra, no ocupación
      // del negocio: no puede seguir bloqueando la hora.
      ...canceladasConEvento.map((booking) => booking.externalEventId),
    ].filter((eventId): eventId is string => Boolean(eventId))
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
  const cargaPorDia = cargaPorDiaYProfesional(reconciledLocalBookings, timezone);
  const buscarSiguienteHueco = () =>
    findNextAvailableSlot({
      schedule,
      timezone,
      bookingCapacity,
      startDateTime,
      durationMinutes,
      rankedProfessionals: candidatos,
      bookings: overlappingBookings,
      cargaPorDia,
    });

  // 4. Profesionales ocupados en el slot
  const busyProfessionalIds = new Set(
    activeBookings
      .map((booking) => booking.professionalId)
      .filter((id): id is string => Boolean(id))
  );
  const libres = (lista: RankedProfessional[]) =>
    ordenarParaAsignar(
      lista.filter((professional) => !busyProfessionalIds.has(professional.id)),
      start,
      timezone,
      cargaPorDia
    );

  // El cliente pidió por su nombre a alguien marcado "no sugerir" para estos
  // servicios: se le reserva igual si insiste, pero antes el agente propone
  // UNA vez a quien mejor lo hace y está libre a esa misma hora. Se calcula
  // también si el pedido está ocupado o fuera de horario: la recomendación
  // sigue siendo válida para la hora que el cliente quería.
  const recomendacion: ProfessionalRecommendation | undefined = (() => {
    if (!pedido || pedido.tier !== "no_sugerir" || outsideBusinessHours) return undefined;
    if (bookingsInSlot >= bookingCapacity) return undefined;
    const [mejorLibre] = libres(
      poolAutomatico.filter((professional) => professional.id !== pedido.id)
    );
    if (!mejorLibre) return undefined;
    return {
      professional: sinNivel(mejorLibre),
      isSpecialist: mejorLibre.tier === "especialista",
    };
  })();
  const conRecomendacion = recomendacion ? { recommendedProfessional: recomendacion } : {};

  if (outsideBusinessHours) {
    return {
      available: false,
      code: "OUTSIDE_BUSINESS_HOURS",
      message: hoursResult.message,
      suggestedNextSlot: buscarSiguienteHueco(),
    };
  }

  if (bookingsInSlot >= bookingCapacity) {
    return {
      available: false,
      code: "CAPACITY_REACHED",
      message: "El negocio ya tiene todas sus plazas ocupadas en ese horario.",
      capacityUsed: bookingsInSlot,
      capacityTotal: bookingCapacity,
      suggestedNextSlot: buscarSiguienteHueco(),
    };
  }

  const disponibles = libres(candidatos);

  if (disponibles.length === 0) {
    return {
      available: false,
      code: "ALL_PROFESSIONALS_BUSY",
      message:
        "Todos los profesionales que pueden hacer este servicio están ocupados en ese horario.",
      capacityUsed: bookingsInSlot,
      capacityTotal: bookingCapacity,
      suggestedNextSlot: buscarSiguienteHueco(),
      ...conRecomendacion,
    };
  }

  const specialistIds = disponibles
    .filter((professional) => professional.tier === "especialista")
    .map((professional) => professional.id);

  return {
    available: true,
    message: `Hay ${disponibles.length} profesional${disponibles.length === 1 ? "" : "es"} libre${disponibles.length === 1 ? "" : "s"} y quedan ${bookingCapacity - bookingsInSlot} plazas disponibles.`,
    capacityUsed: bookingsInSlot,
    capacityTotal: bookingCapacity,
    availableProfessionals: disponibles.map(sinNivel),
    ...(specialistIds.length > 0 ? { specialistIds } : {}),
    ...conRecomendacion,
  };
}
