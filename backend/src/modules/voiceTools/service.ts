import { prisma } from "../../lib/prisma.js";
import { randomUUID, createHash } from "node:crypto";
import { getRedis } from "../../lib/redis.js";
import {
  checkBusinessHours,
  checkBookingRestrictions,
  formatScheduleForPrompt,
} from "../../lib/businessSchedule.js";
import {
  checkAvailability,
  computeAvailabilityLookaheadMs,
  type ExternalBusyInterval,
} from "../../lib/availability.js";
import { calendarService } from "../calendar/service.js";
import { errorMessage } from "../../lib/logUtils.js";
import { enqueueRetryBookingJob, enqueueSmsJob } from "../../lib/cloudTasks.js";
import { isValidE164Phone } from "../../lib/phone.js";
import {
  acquireBookingLock,
  releaseBookingLock,
} from "../../lib/bookingLock.js";

export type VoiceToolName =
  | "get_catalog"
  | "check_business_hours"
  | "check_availability"
  | "book_appointment";

// Estados de SubscriptionStatus (schema.prisma) que significan "el negocio
// no está pagando ahora mismo" — no incluye TRIALING/ACTIVE (pagando de
// facto) ni INCOMPLETE/PAUSED (transitorios/ambiguos, no el caso que este
// fix ataja) para no bloquear de más. Ver hallazgo #9 de la auditoría.
const BLOCKED_SUBSCRIPTION_STATUSES = new Set([
  "CANCELED",
  "UNPAID",
  "PAST_DUE",
  "INCOMPLETE_EXPIRED",
]);

const AVAILABILITY_TOKEN_TTL_SECONDS = 5 * 60;
const MAX_CATALOG_ITEMS = 60;
const MAX_APPOINTMENT_DURATION_MINUTES = 24 * 60;

function isValidAppointmentDuration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_APPOINTMENT_DURATION_MINUTES
  );
}

function invalidDurationResult() {
  return {
    success: true,
    result: {
      success: false,
      code: "INVALID_DURATION",
      message: "La duración de la cita debe ser un número entero entre 1 minuto y 24 horas.",
    },
  };
}

type AvailabilityDraft = {
  businessId: string;
  callId?: string;
  startDateTime: string;
  durationMinutes: number;
  serviceIds: string[];
  professionalId?: string;
};

function availabilityDraftKey(token: string): string {
  return `availability_draft:${token}`;
}

async function createAvailabilityDraft(draft: AvailabilityDraft): Promise<string> {
  const token = randomUUID();
  await getRedis().set(
    availabilityDraftKey(token),
    JSON.stringify(draft),
    "EX",
    AVAILABILITY_TOKEN_TTL_SECONDS
  );
  return token;
}

async function readAvailabilityDraft(
  token: string,
  businessId: string,
  callId?: string
): Promise<AvailabilityDraft | null> {
  try {
    const raw = await getRedis().get(availabilityDraftKey(token));
    if (!raw) return null;
    const draft = JSON.parse(raw) as AvailabilityDraft;
    if (
      draft.businessId !== businessId ||
      (draft.callId && draft.callId !== callId)
    ) {
      return null;
    }
    return draft;
  } catch (error) {
    console.error(
      `[VoiceTools] No se pudo recuperar el token de disponibilidad: ${errorMessage(error)}`
    );
    return null;
  }
}

export interface ExecuteVoiceToolInput {
  businessId: string;
  toolName: VoiceToolName | string;
  params: Record<string, unknown>;
  callLabel?: string;
  /** ID de llamada del proveedor de voz (vapiCallId), para vincular reservas a la llamada exacta. */
  callId?: string;
}

interface BusinessVoiceConfig {
  id: string;
  schedule: unknown;
  timezone: string;
  bookingCapacity: number;
  calendarProvider: string | null;
  googleRefreshToken: string | null;
  googleCalendarId: string | null;
  googleCalendarConnected: boolean | null;
  outlookRefreshToken: string | null;
  outlookCalendarId: string | null;
  outlookCalendarConnected: boolean | null;
  minAdvanceBookingMinutes: number | null;
  maxAppointmentDurationMinutes: number | null;
  // Teléfono del propietario del negocio (no el número que usa Retell para
  // recibir llamadas) — destino del SMS de aviso de nueva reserva.
  phone: string;
  // Número Telnyx que el negocio ya tiene comprado para recibir llamadas;
  // se reutiliza como remitente del SMS en vez de comprar/gestionar un
  // segundo número solo para mensajería.
  telnyxPhoneNumber: string | null;
  // null = nunca pasó por Stripe (cuentas de prueba/demo creadas a mano) —
  // se trata como "permitido", no como "sin pagar". Solo se bloquea la
  // reserva ante un estado explícito de "no está pagando" (ver
  // executeBookAppointment) — hallazgo #9 de la auditoría.
  subscriptionStatus: string | null;
}

function calendarOriginForBusiness(
  business: Pick<
    BusinessVoiceConfig,
    "calendarProvider" | "googleCalendarId" | "outlookCalendarId"
  >
) {
  if (business.calendarProvider === "outlook") {
    return business.outlookCalendarId
      ? { provider: "outlook" as const, calendarId: business.outlookCalendarId }
      : null;
  }

  return {
    provider: "google" as const,
    calendarId: business.googleCalendarId || "primary",
  };
}

async function loadBusinessConfig(
  businessId: string
): Promise<BusinessVoiceConfig | null> {
  return prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      schedule: true,
      timezone: true,
      bookingCapacity: true,
      calendarProvider: true,
      googleRefreshToken: true,
      googleCalendarId: true,
      googleCalendarConnected: true,
      outlookRefreshToken: true,
      outlookCalendarId: true,
      outlookCalendarConnected: true,
      minAdvanceBookingMinutes: true,
      maxAppointmentDurationMinutes: true,
      phone: true,
      telnyxPhoneNumber: true,
      subscriptionStatus: true,
    },
  });
}

function getVoiceConfigRedisKey(businessId: string): string {
  return `voice_config:${businessId}`;
}

async function getCachedVoiceConfig(
  businessId: string
): Promise<BusinessVoiceConfig | null> {
  const redis = getRedis();
  const redisKey = getVoiceConfigRedisKey(businessId);

  try {
    const cachedConfigStr = await redis.get(redisKey);
    if (cachedConfigStr) {
      const parsed = JSON.parse(cachedConfigStr) as BusinessVoiceConfig;
      const provider =
        parsed.calendarProvider === "outlook" ? "outlook" : "google";
      const hasToken =
        provider === "outlook"
          ? !!parsed.outlookRefreshToken
          : !!parsed.googleRefreshToken;
      const connectedFlag =
        provider === "outlook"
          ? parsed.outlookCalendarConnected === true
          : parsed.googleCalendarConnected === true;

      if (hasToken && connectedFlag) {
        return parsed;
      }

      try {
        await redis.del(redisKey);
      } catch (deleteErr) {
        console.warn(
          `[VoiceTools] No se pudo limpiar la caché de calendario: ${errorMessage(
            deleteErr
          )}`
        );
      }
    }
  } catch (err) {
    console.error(
      `[VoiceTools] Error leyendo la configuración de calendario: ${errorMessage(
        err
      )}`
    );
  }

  return null;
}

async function setCachedVoiceConfig(
  businessId: string,
  config: BusinessVoiceConfig
): Promise<void> {
  const redis = getRedis();
  try {
    await redis.set(
      getVoiceConfigRedisKey(businessId),
      JSON.stringify(config),
      "EX",
      3600
    );
  } catch (err) {
    console.error(
      `[VoiceTools] Error guardando la configuración de calendario: ${errorMessage(
        err
      )}`
    );
  }
}

async function getVoiceConfig(
  businessId: string
): Promise<BusinessVoiceConfig | null> {
  const cached = await getCachedVoiceConfig(businessId);
  if (cached) {
    return cached;
  }

  const business = await loadBusinessConfig(businessId);
  if (!business) {
    return null;
  }

  await setCachedVoiceConfig(businessId, business);
  return business;
}

async function executeCheckBusinessHours(
  business: BusinessVoiceConfig,
  params: Record<string, unknown>,
  callLabel: string
): Promise<{ success: boolean; result?: any }> {
  try {
    const startDateTime =
      typeof params?.startDateTime === "string" ? params.startDateTime : "";
    const durationMinutes =
      typeof params?.durationMinutes === "number" ? params.durationMinutes : 0;
    const hoursResult = checkBusinessHours(
      business.schedule,
      business.timezone,
      startDateTime,
      durationMinutes
    );

    if (hoursResult.success && hoursResult.isOpen) {
      const restrictions = checkBookingRestrictions(
        business,
        startDateTime,
        durationMinutes
      );
      if (!restrictions.success) {
        return {
          success: true,
          result: {
            ...hoursResult,
            isOpen: false,
            code: restrictions.code,
            message: restrictions.message,
          },
        };
      }
    }

    return { success: true, result: hoursResult };
  } catch (error) {
    console.error(
      `[VoiceTools] ${callLabel} no pudo comprobar el horario: ${errorMessage(
        error
      )}`
    );
    return {
      success: true,
      result: {
        success: false,
        code: "BUSINESS_HOURS_CHECK_FAILED",
        message: "No pude comprobar el horario del negocio.",
      },
    };
  }
}

/** Bloques ocupados del calendario REAL conectado (Google/Outlook) para el
 * negocio, no solo lo guardado en Postgres — ver hallazgo #5 de la
 * auditoría: antes checkAvailability solo consultaba Booking, así que una
 * cita metida a mano en el calendario del negocio no bloqueaba el hueco.
 * La ventana se calcula con la MISMA fórmula que usa internamente
 * checkAvailability (computeAvailabilityLookaheadMs) — un margen fijo
 * anterior (5h) se quedaba corto para cualquier servicio de más de 60 min,
 * dejando de comprobar el calendario real justo en el tramo final de la
 * búsqueda de hueco alternativo. calendarService.getBusyIntervals ya se
 * degrada sola a [] ante cualquier fallo (calendario caído, sin conexión,
 * etc.), así que no hace falta un try/catch aquí también. */
async function fetchExternalBusyIntervals(
  business: BusinessVoiceConfig,
  startDateTime: string,
  durationMinutes: number
): Promise<{
  intervals: ExternalBusyInterval[];
  calendarAvailabilityKnown: boolean;
}> {
  const start = new Date(startDateTime);
  if (Number.isNaN(start.getTime())) {
    return { intervals: [], calendarAvailabilityKnown: false };
  }
  const provider =
    business.calendarProvider === "outlook" ? "outlook" : "google";
  const result = await calendarService.getBusyIntervals({
    provider,
    googleRefreshToken: business.googleRefreshToken,
    googleCalendarId: business.googleCalendarId,
    outlookRefreshToken: business.outlookRefreshToken,
    outlookCalendarId: business.outlookCalendarId,
    timeMin: start,
    timeMax: new Date(
      start.getTime() + computeAvailabilityLookaheadMs(durationMinutes)
    ),
  });

  // Compatibilidad con mocks/implementaciones anteriores durante despliegues
  // graduales. Sin confirmación de lectura nunca reconciliamos contra vacío.
  return Array.isArray(result)
    ? { intervals: result, calendarAvailabilityKnown: false }
    : result;
}

async function executeCheckAvailability(
  business: BusinessVoiceConfig,
  params: Record<string, unknown>,
  callLabel: string,
  callId?: string
): Promise<{ success: boolean; result?: any }> {
  try {
    const startDateTime =
      typeof params?.startDateTime === "string" ? params.startDateTime : "";
    const durationMinutes =
      typeof params?.durationMinutes === "number" ? params.durationMinutes : 0;
    if (!isValidAppointmentDuration(durationMinutes)) {
      return invalidDurationResult();
    }
    const serviceIds = Array.isArray(params?.serviceIds)
      ? params.serviceIds.filter((id): id is string => typeof id === "string")
      : undefined;
    const professionalId =
      typeof params?.professionalId === "string"
        ? params.professionalId
        : undefined;

    const externalBusy = await fetchExternalBusyIntervals(
      business,
      startDateTime,
      durationMinutes
    );
    const availability = await checkAvailability({
      businessId: business.id,
      schedule: business.schedule,
      timezone: business.timezone,
      bookingCapacity: business.bookingCapacity,
      startDateTime,
      durationMinutes,
      serviceIds,
      professionalId,
      externalBusyIntervals: externalBusy.intervals,
      calendarAvailabilityKnown: externalBusy.calendarAvailabilityKnown,
      calendarOrigin: calendarOriginForBusiness(business),
    });

    if (availability.available) {
      const availabilityToken = await createAvailabilityDraft({
        businessId: business.id,
        callId,
        startDateTime,
        durationMinutes,
        serviceIds: serviceIds ?? [],
        professionalId: professionalId ?? availability.availableProfessionals[0]?.id,
      });
      return { success: true, result: { ...availability, availabilityToken } };
    }

    if (availability.suggestedNextSlot) {
      const suggestedToken = await createAvailabilityDraft({
        businessId: business.id,
        callId,
        startDateTime: availability.suggestedNextSlot.startDateTime,
        durationMinutes,
        serviceIds: serviceIds ?? [],
        professionalId: professionalId ?? availability.suggestedNextSlot.availableProfessionals[0]?.id,
      });
      return {
        success: true,
        result: {
          ...availability,
          suggestedNextSlot: {
            ...availability.suggestedNextSlot,
            availabilityToken: suggestedToken,
          },
        },
      };
    }

    return { success: true, result: availability };
  } catch (error) {
    console.error(
      `[VoiceTools] ${callLabel} no pudo comprobar disponibilidad: ${errorMessage(
        error
      )}`
    );
    return {
      success: true,
      result: {
        available: false,
        code: "AVAILABILITY_CHECK_FAILED",
        message: "No pude comprobar la disponibilidad en este momento.",
      },
    };
  }
}

async function executeGetCatalog(
  business: BusinessVoiceConfig,
  callLabel: string
): Promise<{ success: boolean; result?: any }> {
  try {
    const [services, professionals] = await Promise.all([
      prisma.service.findMany({
        where: { businessId: business.id, active: true, deletedAt: null },
        select: { id: true, name: true, durationMinutes: true },
        orderBy: { name: "asc" },
        take: MAX_CATALOG_ITEMS,
      }),
      prisma.professional.findMany({
        where: { businessId: business.id, active: true, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: MAX_CATALOG_ITEMS,
      }),
    ]);

    return {
      success: true,
      result: {
        services: services.length
          ? services.map((service) => `[${service.id}] ${service.name} (${service.durationMinutes} min)`).join("\n")
          : "No hay servicios configurados.",
        professionals: professionals.length
          ? professionals.map((professional) => `[${professional.id}] ${professional.name}`).join("\n")
          : "No hay profesionales individuales configurados.",
        schedule: formatScheduleForPrompt(business.schedule),
      },
    };
  } catch (error) {
    console.error(
      `[VoiceTools] ${callLabel} no pudo obtener el catálogo: ${errorMessage(error)}`
    );
    return {
      success: true,
      result: {
        success: false,
        code: "CATALOG_UNAVAILABLE",
        message: "No pude consultar esa información en este momento.",
      },
    };
  }
}

/**
 * Resuelve la fila Call a la que vincular una reserva o un lead pendiente:
 * por callId cuando se conoce (viene del sobre del webhook de Retell, no del
 * LLM) y, si su fila aún no existe por una carrera con call_started, cae al
 * heurístico de "llamada más reciente del negocio" como red de seguridad.
 */
async function resolveCallForBusiness(
  callId: string | undefined,
  businessId: string,
  callLabel: string
): Promise<{ id: string; fromNumber: string | null } | null> {
  const exactCall = callId
    ? await prisma.call.findUnique({
        where: { vapiCallId: callId },
        select: { id: true, fromNumber: true },
      })
    : null;

  if (exactCall) {
    return exactCall;
  }

  if (callId) {
    console.warn(
      `[VoiceTools] ${callLabel} no encontró la fila Call para callId=${callId}; usando heurístico de llamada más reciente`
    );
  }

  // status: IN_PROGRESS a propósito — sin este filtro, si la llamada
  // anterior de este negocio ya colgó y terminó de procesarse (call_ended
  // llegó y la marcó COMPLETED/FAILED, posiblemente ya con su propia
  // reserva), el heurístico la elegiría igualmente por ser "la más
  // reciente" y el upsert de más abajo sobrescribiría LA RESERVA DE ESE
  // OTRO CLIENTE con los datos de la llamada actual. Filtrar a IN_PROGRESS
  // reduce el heurístico a su caso de uso real: la fila de la llamada
  // actual, que solo tarda un instante en llegar por la carrera con
  // call_started, sigue "en curso" durante esa ventana.
  const fallbackCall = await prisma.call.findFirst({
    where: { businessId, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });

  if (!fallbackCall) {
    return null;
  }

  // fromNumber: null a propósito. El heurístico de "llamada más reciente"
  // solo sirve para vincular el Booking a *alguna* llamada — con dos
  // llamadas simultáneas al mismo negocio puede devolver la de otro
  // cliente, así que su fromNumber nunca debe usarse como teléfono de
  // contacto de esta reserva.
  return { id: fallbackCall.id, fromNumber: null };
}

/**
 * Guarda la intención de reserva como un Lead cuando book_appointment falla,
 * para que el negocio nunca pierda los datos del cliente aunque el calendario
 * haya fallado. Devuelve el id del lead o null si no se pudo guardar (p. ej.
 * si no hay ninguna llamada a la que vincularlo).
 */
async function capturePendingBookingLead(args: {
  // Resuelto una sola vez por el caller (executeBookAppointment ya lo
  // necesita para el teléfono de contacto del evento) en vez de que esta
  // función repita la misma consulta a Call en cada uno de sus tres puntos
  // de llamada.
  resolvedCall: { id: string } | null;
  businessId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  startDateTime: string;
  durationMinutes: number;
  serviceIds?: string[];
  professionalId?: string;
  failureCode: string;
  callLabel: string;
}): Promise<string | null> {
  try {
    const call = args.resolvedCall;
    if (!call) {
      console.error(
        `[VoiceTools] ${args.callLabel} no pudo guardar la reserva pendiente: no hay ninguna llamada asociada`
      );
      return null;
    }

    const lead = await prisma.lead.create({
      data: {
        callId: call.id,
        type: "pending_booking",
        isLead: false,
        data: {
          clientName: args.clientName,
          clientEmail: args.clientEmail ?? null,
          clientPhone: args.clientPhone ?? null,
          startDateTime: args.startDateTime,
          durationMinutes: args.durationMinutes,
          serviceIds: args.serviceIds ?? [],
          professionalId: args.professionalId ?? null,
          failureCode: args.failureCode,
        },
      },
      select: { id: true },
    });

    return lead.id;
  } catch (error) {
    console.error(
      `[VoiceTools] ${args.callLabel} no pudo guardar la reserva pendiente: ${errorMessage(error)}`
    );
    return null;
  }
}

/** Solo se llama para fallos que pueden ser transitorios (no para
 * reconexión de calendario requerida, que no se arregla sola reintentando). */
async function enqueueRetryFailedBooking(leadId: string): Promise<void> {
  try {
    await enqueueRetryBookingJob({ leadId }, `retry-failed-booking-${leadId}`);
  } catch (error) {
    console.error(
      `[VoiceTools] No se pudo encolar el reintento de reserva para el lead ${leadId}: ${errorMessage(error)}`
    );
  }
}

/** Texto corto (pensado para caber en un único segmento SMS) con lo esencial
 * de la reserva para el propietario del negocio. */
function buildBookingSmsText(input: {
  clientName: string;
  startDateTime: string;
  timezone: string;
  serviceNames?: string[] | null;
  professionalName?: string | null;
}): string {
  const formattedDateTime = new Intl.DateTimeFormat("es-ES", {
    timeZone: input.timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(input.startDateTime));

  const services = input.serviceNames?.filter(Boolean) ?? [];
  const parts = [
    "Nueva reserva",
    input.clientName,
    services.length > 0 ? services.join(" + ") : null,
    formattedDateTime,
    input.professionalName ? `con ${input.professionalName}` : null,
  ].filter(Boolean);

  return parts.join(" — ");
}

function buildCalendarIdempotencyKey(input: {
  callId: string;
  startDateTime: string;
  durationMinutes: number;
}): string {
  // No exponemos ni reutilizamos el identificador de llamada directamente en
  // el proveedor. El hash mantiene una clave determinista, opaca y estable
  // para el mismo intento de reserva.
  return createHash("sha256")
    .update(`${input.callId}\u0000${input.startDateTime}\u0000${input.durationMinutes}`)
    .digest("hex");
}

async function executeBookAppointment(
  business: BusinessVoiceConfig,
  params: Record<string, unknown>,
  callLabel: string,
  callId?: string
): Promise<{ success: boolean; result?: any }> {
  const rawParams = params as {
    clientName?: string;
    startDateTime?: string;
    durationMinutes?: number;
    clientEmail?: string;
    clientPhone?: string;
    serviceIds?: string[];
    professionalId?: string;
    availabilityToken?: string;
  };
  const clientName = rawParams.clientName;
  const clientEmail = rawParams.clientEmail;
  const clientPhone = rawParams.clientPhone;
  const draft = typeof rawParams.availabilityToken === "string"
    ? await readAvailabilityDraft(
      rawParams.availabilityToken,
      business.id,
      callId
    )
    : null;

  if (rawParams.availabilityToken && !draft) {
    return {
      success: true,
      result: {
        success: false,
        code: "AVAILABILITY_TOKEN_EXPIRED",
        message: "La comprobación de disponibilidad caducó. Vuelvo a comprobar la hora que prefieras.",
      },
    };
  }

  const startDateTime = draft?.startDateTime ?? rawParams.startDateTime;
  const durationMinutes = draft?.durationMinutes ?? rawParams.durationMinutes;
  const professionalId = draft?.professionalId ?? rawParams.professionalId;
  const requestedServiceIds = draft?.serviceIds ?? (Array.isArray(rawParams.serviceIds)
    ? rawParams.serviceIds.filter((id): id is string => typeof id === "string")
    : []);

  if (!clientName || !startDateTime) {
    return {
      success: true,
      result: {
        success: false,
        code: "BOOK_APPOINTMENT_FAILED",
        message: "Faltan datos obligatorios para agendar la cita.",
      },
    };
  }

  if (durationMinutes !== undefined && !isValidAppointmentDuration(durationMinutes)) {
    return invalidDurationResult();
  }

  // Un negocio cancelado o impagado podía seguir creando reservas
  // indefinidamente: nada comprobaba el estado de la suscripción antes de
  // reservar (hallazgo #9 de la auditoría). null (cuentas de prueba/demo
  // sin Stripe) se trata como permitido a propósito — solo se bloquea ante
  // un estado explícito de "no está pagando".
  if (
    business.subscriptionStatus &&
    BLOCKED_SUBSCRIPTION_STATUSES.has(business.subscriptionStatus)
  ) {
    console.warn(
      `[VoiceTools] ${callLabel} no puede reservar: suscripción en estado ${business.subscriptionStatus}`
    );
    return {
      success: true,
      result: {
        success: false,
        code: "SUBSCRIPTION_INACTIVE",
        message:
          "No puedo agendar la cita en este momento. Por favor, contacta con el negocio directamente.",
      },
    };
  }

  try {
    // Nunca confiar en un serviceId/professionalId que venga del LLM sin
    // comprobar que pertenece a este negocio — si no coincide (o no existe),
    // se trata como si no se hubiera indicado en vez de fallar la reserva
    // entera o dejar que se cuele el de otro negocio. Puede haber varios
    // (ej. "corte y mechas" en la misma cita) — se descarta cada id inválido
    // por separado, no toda la lista.
    let verifiedServiceIds: string[] = [];
    let verifiedServiceNames: string[] = [];
    let verifiedServicesDurationMinutes = 0;
    if (requestedServiceIds.length > 0) {
      const services = await prisma.service.findMany({
        where: {
          id: { in: requestedServiceIds },
          businessId: business.id,
          active: true,
          deletedAt: null,
        },
        select: { id: true, name: true, durationMinutes: true },
      });
      // findMany({ id: { in } }) no garantiza devolver las filas en el orden
      // de requestedServiceIds — Postgres las da en su propio orden de
      // almacenamiento/índice. Antes solo importaba para sumar duraciones
      // (conmutativo), pero ahora también alimenta el título/descripción
      // visibles del evento de calendario, así que hay que reordenar
      // explícitamente según lo que pidió el cliente.
      const serviceById = new Map(services.map((s) => [s.id, s]));
      for (const id of requestedServiceIds) {
        if (!serviceById.has(id)) {
          console.warn(
            `[VoiceTools] ${callLabel} recibió un serviceId no válido para este negocio (${id}); se ignora`
          );
        }
      }
      const orderedServices = requestedServiceIds
        .map((id) => serviceById.get(id))
        .filter((s): s is (typeof services)[number] => Boolean(s));
      verifiedServiceIds = orderedServices.map((s) => s.id);
      verifiedServiceNames = orderedServices.map((s) => s.name);
      verifiedServicesDurationMinutes = orderedServices.reduce(
        (sum, s) => sum + s.durationMinutes,
        0
      );
    }
    // La suma de duraciones de los servicios verificados manda sobre lo que
    // diga el LLM — evita que una suma mental mal hecha en la conversación
    // desemboque en una cita más corta o más larga de lo real.
    const effectiveDuration =
      verifiedServiceIds.length > 0
        ? verifiedServicesDurationMinutes
        : durationMinutes || 30;

    if (!isValidAppointmentDuration(effectiveDuration)) {
      return invalidDurationResult();
    }

    const provider =
      business.calendarProvider === "outlook" ? "outlook" : "google";
    const hasCalendarConnection =
      provider === "outlook"
        ? !!business.outlookRefreshToken &&
          business.outlookCalendarConnected !== false
        : !!business.googleRefreshToken &&
          business.googleCalendarConnected !== false;

    // Resuelto aquí arriba, antes de cualquier punto de fallo, para no
    // repetir la misma consulta a Call en cada uno de los tres sitios que
    // pueden necesitarla (capturePendingBookingLead) — y para usar
    // fromNumber como fallback del teléfono de contacto del evento cuando
    // el cliente no pidió uno distinto (ver resolveCallForBusiness).
    const call = await resolveCallForBusiness(callId, business.id, callLabel);
    const effectiveClientPhone = clientPhone || call?.fromNumber || undefined;

    if (!hasCalendarConnection) {
      const reconnectCode =
        provider === "outlook"
          ? "OUTLOOK_CALENDAR_RECONNECT_REQUIRED"
          : "GOOGLE_CALENDAR_RECONNECT_REQUIRED";
      const providerLabel =
        provider === "outlook" ? "Outlook Calendar" : "Google Calendar";
      console.warn(
        `[VoiceTools] ${callLabel} no puede reservar: ${providerLabel} requiere reconexión`
      );
      await capturePendingBookingLead({
        resolvedCall: call,
        businessId: business.id,
        clientName,
        clientEmail,
        clientPhone,
        startDateTime,
        durationMinutes: effectiveDuration,
        serviceIds: requestedServiceIds,
        professionalId,
        failureCode: reconnectCode,
        callLabel,
      });
      return {
        success: true,
        result: {
          success: false,
          code: reconnectCode,
          message: `El negocio debe reconectar ${providerLabel} antes de agendar citas. He tomado nota de tu solicitud para confirmártela en cuanto se resuelva.`,
        },
      };
    }

    const businessHours = checkBusinessHours(
      business.schedule,
      business.timezone || "Europe/Madrid",
      startDateTime,
      effectiveDuration
    );
    if (!businessHours.success || !businessHours.isOpen) {
      return {
        success: true,
        result: {
          success: false,
          code: businessHours.code,
          message: businessHours.message,
          businessHours,
        },
      };
    }

    const restrictions = checkBookingRestrictions(
      business,
      startDateTime,
      effectiveDuration
    );
    if (!restrictions.success) {
      return {
        success: true,
        result: {
          success: false,
          code: restrictions.code,
          message: restrictions.message,
        },
      };
    }

    let verifiedProfessionalId: string | undefined;
    let verifiedProfessionalName: string | undefined;
    if (professionalId) {
      const professional = await prisma.professional.findFirst({
        where: {
          id: professionalId,
          businessId: business.id,
          active: true,
          deletedAt: null,
        },
        select: { id: true, name: true },
      });
      if (professional) {
        verifiedProfessionalId = professional.id;
        verifiedProfessionalName = professional.name;
      } else {
        console.warn(
          `[VoiceTools] ${callLabel} recibió un professionalId no válido para este negocio (${professionalId}); se ignora`
        );
      }
    }

    // Serializa por negocio desde aquí (justo antes de comprobar
    // disponibilidad) hasta que la reserva quede guardada — ver comentario
    // en acquireBookingLock. Si no se consigue el lock a tiempo, se trata
    // igual que cualquier otro fallo transitorio: se guarda el lead y se
    // reintenta en segundo plano, en vez de arriesgar una doble reserva.
    const bookingLockToken = await acquireBookingLock(business.id);
    if (!bookingLockToken) {
      console.warn(
        `[VoiceTools] ${callLabel} no pudo adquirir el lock de reserva de ${business.id} a tiempo`
      );
      const leadId = await capturePendingBookingLead({
        resolvedCall: call,
        businessId: business.id,
        clientName,
        clientEmail,
        clientPhone,
        startDateTime,
        durationMinutes: effectiveDuration,
        serviceIds: verifiedServiceIds,
        professionalId: verifiedProfessionalId,
        failureCode: "BOOKING_LOCK_TIMEOUT",
        callLabel,
      });
      if (leadId) {
        await enqueueRetryFailedBooking(leadId);
      }
      return {
        success: true,
        result: {
          success: false,
          code: "BOOKING_LOCK_TIMEOUT",
          message:
            "Hay otra reserva de este negocio en curso justo ahora. He tomado nota de tus datos y te confirmaremos en breve.",
        },
      };
    }

    try {
      // Comprueba disponibilidad SIEMPRE, se haya indicado profesional o no —
      // antes esto se saltaba por completo cuando professionalId venía
      // verificado, así que se podía confirmar una reserva para un profesional
      // ya ocupado en ese hueco, o por encima de la capacidad del negocio
      // (checkAvailability ya soporta filtrar por professionalId; solo hacía
      // falta pasarlo también en este camino).
      const externalBusy = await fetchExternalBusyIntervals(
        business,
        startDateTime,
        effectiveDuration
      );
      const availability = await checkAvailability({
        businessId: business.id,
        schedule: business.schedule,
        timezone: business.timezone || "Europe/Madrid",
        bookingCapacity: business.bookingCapacity,
        startDateTime,
        durationMinutes: effectiveDuration,
        serviceIds: verifiedServiceIds,
        professionalId: verifiedProfessionalId,
        externalBusyIntervals: externalBusy.intervals,
        calendarAvailabilityKnown: externalBusy.calendarAvailabilityKnown,
        calendarOrigin: calendarOriginForBusiness(business),
      });

      if (!availability.available) {
        return {
          success: true,
          result: {
            success: false,
            code: availability.code,
            message: availability.message,
          },
        };
      }

      const resolvedProfessionalId =
        verifiedProfessionalId ?? availability.availableProfessionals[0]?.id;
      const resolvedProfessionalName = verifiedProfessionalId
        ? verifiedProfessionalName
        : availability.availableProfessionals[0]?.name;

      // Idempotencia: si esta llamada YA tiene un Booking con un evento
      // externo creado para esta misma fecha/duración exactas (Retell
      // reintentando el tool call tras un timeout, por ejemplo), no se crea
      // un segundo evento — se confirma reutilizando el que ya existe. Una
      // fecha/duración distinta sigue tratándose como un cambio de opinión
      // legítimo del cliente (nueva reserva sobre la misma llamada), no
      // como un reintento.
      if (call) {
        const existingBooking = await prisma.booking.findUnique({
          where: { callId: call.id },
          select: {
            externalEventId: true,
            programedAt: true,
            durationMinutes: true,
          },
        });
        if (
          existingBooking?.externalEventId &&
          existingBooking.programedAt.getTime() ===
            new Date(startDateTime).getTime() &&
          existingBooking.durationMinutes === effectiveDuration
        ) {
          console.log(
            `[VoiceTools] ${callLabel} ya tenía un evento creado para esta reserva exacta (${existingBooking.externalEventId}); no se crea uno nuevo`
          );
          return {
            success: true,
            result: {
              success: true,
              message: "Cita agendada correctamente.",
              professionalId: resolvedProfessionalId,
            },
          };
        }
      }

      try {
        const result = await calendarService.bookAppointment({
          clientName,
          startDateTime,
          durationMinutes: effectiveDuration,
          clientEmail,
          clientPhone: effectiveClientPhone,
          serviceNames: verifiedServiceNames,
          professionalName: resolvedProfessionalName,
          provider,
          googleRefreshToken: business.googleRefreshToken,
          googleCalendarId: business.googleCalendarId,
          outlookRefreshToken: business.outlookRefreshToken,
          outlookCalendarId: business.outlookCalendarId,
          idempotencyKey: call
            ? buildCalendarIdempotencyKey({
                callId: call.id,
                startDateTime,
                durationMinutes: effectiveDuration,
              })
            : undefined,
        });

        // Persist booking in database, vinculada a la llamada exacta cuando se
        // conoce su callId (ver resolveCallForBusiness).
        if (call) {
          await prisma.booking.upsert({
            where: { callId: call.id },
            create: {
              callId: call.id,
              programedAt: new Date(startDateTime),
              durationMinutes: effectiveDuration,
              numberPeople: 1,
              professionalId: resolvedProfessionalId ?? undefined,
              serviceIds: verifiedServiceIds,
              clientPhone: clientPhone || undefined,
              externalEventId: (result as { id?: string })?.id ?? undefined,
              externalCalendarProvider: provider,
              externalCalendarId:
                provider === "outlook"
                  ? business.outlookCalendarId
                  : business.googleCalendarId || "primary",
            },
            update: {
              programedAt: new Date(startDateTime),
              durationMinutes: effectiveDuration,
              professionalId: resolvedProfessionalId ?? undefined,
              serviceIds: verifiedServiceIds,
              clientPhone: clientPhone || undefined,
              externalEventId: (result as { id?: string })?.id ?? undefined,
              externalCalendarProvider: provider,
              externalCalendarId:
                provider === "outlook"
                  ? business.outlookCalendarId
                  : business.googleCalendarId || "primary",
            },
          });
        }

        console.log(`[VoiceTools] ${callLabel} agendó la cita correctamente`);

        // Aviso al propietario por SMS (Telnyx), no por email: nunca puede
        // hacer fallar la reserva en sí (try/catch propio). Dos guardas antes
        // de intentarlo: (1) el negocio necesita su propio número Telnyx: sin
        // él no hay remitente; (2) business.phone válido en formato E.164 —
        // nace como placeholder ("TEMP-...", ver auth/routes.ts) hasta que el
        // negocio lo edita explícitamente vía PATCH /business/me, así que sin
        // esta comprobación cualquier negocio que aún no lo haya hecho
        // encolaría un SMS destinado a fallar en cada reserva.
        // Sí se espera (await): en producción enqueueSmsJob solo crea una
        // tarea de Cloud Tasks (una llamada rápida, no el envío del SMS en
        // sí) — no esperarla es peligroso en Cloud Run, que solo garantiza
        // CPU mientras dura la petición y puede congelar el proceso justo
        // después de responder al tool call, dejando esa tarea sin crear
        // silenciosamente.
        if (business.telnyxPhoneNumber && isValidE164Phone(business.phone)) {
          try {
            await enqueueSmsJob({
              fromNumber: business.telnyxPhoneNumber,
              toNumber: business.phone,
              text: buildBookingSmsText({
                clientName,
                startDateTime,
                timezone: business.timezone || "Europe/Madrid",
                serviceNames: verifiedServiceNames,
                professionalName: resolvedProfessionalName,
              }),
            });
          } catch (smsError) {
            console.error(
              `[VoiceTools] ${callLabel} no pudo encolar el SMS de aviso: ${errorMessage(smsError)}`
            );
          }
        }

        return {
          success: true,
          result: {
            success: true,
            message: "Cita agendada correctamente.",
            eventLink: (result as { htmlLink?: string })?.htmlLink,
            professionalId: resolvedProfessionalId,
          },
        };
      } catch (error) {
        const e = error as any;
        if (
          e?.name === "CalendarBusinessError" &&
          (e?.code === "GOOGLE_CALENDAR_RECONNECT_REQUIRED" ||
            e?.code === "OUTLOOK_CALENDAR_RECONNECT_REQUIRED")
        ) {
          const errorProvider =
            e?.code === "OUTLOOK_CALENDAR_RECONNECT_REQUIRED"
              ? "outlook"
              : "google";
          try {
            await prisma.business.update({
              where: { id: business.id },
              data:
                errorProvider === "outlook"
                  ? {
                      outlookCalendarConnected: false,
                      outlookRefreshToken: null,
                      outlookCalendarDisconnectedAt: new Date(),
                      outlookCalendarLastError: "invalid_grant",
                    }
                  : {
                      googleCalendarConnected: false,
                      googleRefreshToken: null,
                      googleCalendarDisconnectedAt: new Date(),
                      googleCalendarLastError: "invalid_grant",
                    },
            });
          } catch (dbErr) {
            console.error(
              `[VoiceTools] No se pudo actualizar el estado de ${
                errorProvider === "outlook"
                  ? "Outlook Calendar"
                  : "Google Calendar"
              }: ${errorMessage(dbErr)}`
            );
          }

          try {
            await getRedis().del(getVoiceConfigRedisKey(business.id));
          } catch (redisErr) {
            console.error(
              `[VoiceTools] No se pudo invalidar la caché de calendario: ${errorMessage(
                redisErr
              )}`
            );
          }

          // Reconectar el calendario requiere una acción manual del negocio:
          // guardamos la solicitud pero NO la reintentamos sola en segundo plano.
          await capturePendingBookingLead({
            resolvedCall: call,
            businessId: business.id,
            clientName,
            clientEmail,
            clientPhone,
            startDateTime,
            durationMinutes: effectiveDuration,
            serviceIds: verifiedServiceIds,
            professionalId: resolvedProfessionalId,
            failureCode: e.code,
            callLabel,
          });

          return {
            success: true,
            result: {
              success: false,
              code: e.code,
              message:
                (errorProvider === "outlook"
                  ? "No pude acceder al calendario del negocio porque la conexión con Outlook expiró o fue revocada."
                  : "No pude acceder al calendario del negocio porque la conexión con Google expiró o fue revocada.") +
                " He tomado nota de tu solicitud para confirmártela en cuanto el negocio la reconecte.",
            },
          };
        }

        // Cualquier otro fallo (BOOK_APPOINTMENT_FAILED, timeout, rate limit, o
        // un error inesperado): nunca rompemos la llamada con un 500 — siempre
        // degradamos a un mensaje hablable y dejamos la solicitud guardada para
        // reintento automático en segundo plano, porque estos sí pueden ser
        // transitorios.
        const code =
          e?.name === "CalendarBusinessError"
            ? e.code
            : "BOOK_APPOINTMENT_UNEXPECTED_ERROR";
        const baseMessage =
          e?.name === "CalendarBusinessError" && typeof e.message === "string"
            ? e.message
            : "No pude agendar la cita en este momento.";
        console.error(
          `[VoiceTools] ${callLabel} no pudo agendar la cita (${code}): ${errorMessage(error)}`
        );

        const leadId = await capturePendingBookingLead({
          resolvedCall: call,
          businessId: business.id,
          clientName,
          clientEmail,
          clientPhone,
          startDateTime,
          durationMinutes: effectiveDuration,
          serviceIds: verifiedServiceIds,
          professionalId: resolvedProfessionalId,
          failureCode: code,
          callLabel,
        });
        if (leadId) {
          await enqueueRetryFailedBooking(leadId);
        }

        return {
          success: true,
          result: {
            success: false,
            code,
            message: `${baseMessage} He tomado nota de tus datos y te confirmaremos en breve.`,
          },
        };
      }
    } finally {
      await releaseBookingLock(business.id, bookingLockToken);
    }
  } catch (error) {
    console.error(
      `[VoiceTools] ${callLabel} no pudo ejecutar book_appointment: ${errorMessage(
        error
      )}`
    );
    return {
      success: true,
      result: {
        success: false,
        code: "BOOK_APPOINTMENT_UNEXPECTED_ERROR",
        message:
          "No pude completar la reserva en este momento. Por favor, indícame tus datos y te confirmaremos en breve.",
      },
    };
  }
}

/**
 * Ejecuta una tool de voz de forma neutral al orquestador.
 * Recibe el businessId ya resuelto y los parámetros de la tool.
 */
export async function executeVoiceTool(
  input: ExecuteVoiceToolInput
): Promise<{ success: boolean; result?: any }> {
  const { businessId, toolName, params, callLabel = "llamada", callId } = input;

  const business = await getVoiceConfig(businessId);
  if (!business) {
    console.error(
      `[VoiceTools] ${callLabel} no encontró configuración para el negocio ${businessId}`
    );
    return {
      success: false,
      result: {
        success: false,
        error: "Business not found",
      },
    };
  }

  switch (toolName) {
    case "get_catalog":
      return executeGetCatalog(business, callLabel);
    case "check_business_hours":
      return executeCheckBusinessHours(business, params, callLabel);
    case "check_availability":
      return executeCheckAvailability(business, params, callLabel, callId);
    case "book_appointment":
      return executeBookAppointment(business, params, callLabel, callId);
    default:
      console.warn(`[VoiceTools] Tool desconocida: ${toolName}`);
      return { success: true };
  }
}
