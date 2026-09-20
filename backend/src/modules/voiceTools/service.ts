import { prisma } from "../../lib/prisma.js";
import { randomUUID } from "node:crypto";
import { getRedis } from "../../lib/redis.js";
import { claveDeCacheDeVoz } from "../../lib/voiceConfigCache.js";
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
import {
  conexionConfirmada,
  conexionOperativa,
  marcarCalendarioDesconectado,
  origenDeCalendario,
  resolverConexionDeCalendario,
  SELECT_CONEXION_DE_CALENDARIO,
  usaCalendarioExterno,
  type FilaDeConexionDeCalendario,
} from "../calendar/conexion.js";
import {
  DESCRIPTORES_DE_PROVEEDOR,
  normalizarProveedorDeCalendario,
} from "../../adapters/calendar/CalendarProvider.js";
import {
  codigoDeReconexion,
  esCalendarBusinessError,
  proveedorDesdeErrorDeReconexion,
} from "../../adapters/calendar/errors.js";
import { normalizeVoiceToolDateTime } from "../../lib/voiceDateTime.js";
import { errorMessage } from "../../lib/logUtils.js";
import { pendingBookingAlertEmail } from "../../lib/emailTemplates.js";
import {
  enqueueEmailJob,
  enqueueRetryBookingJob,
  enqueueSmsJob,
} from "../../lib/cloudTasks.js";
import { whatsappAdapter } from "../../adapters/whatsapp/WhatsAppAdapter.js";
import {
  avisarCitaPendiente,
  avisarNuevaReserva,
} from "../whatsapp/avisosNegocio.js";
import {
  programarMensajesAlCliente,
  REMINDER_LEAD_HOURS,
  sanearNombre,
} from "../whatsapp/mensajesCliente.js";
import { cancelarReserva } from "../bookings/cancelacion.js";
import { isValidE164Phone } from "../../lib/phone.js";
import { procesarInformeFinal } from "../whatsapp/recados.js";
import {
  ESTADOS_DE_SUSCRIPCION_BLOQUEADOS,
  planAllows,
  resolvePlanId,
} from "../../lib/planFeatures.js";
import {
  acquireBookingLock,
  releaseBookingLock,
} from "../../lib/bookingLock.js";
import { buildCalendarIdempotencyKey } from "../../lib/calendarIdempotency.js";

export type VoiceToolName =
  | "get_catalog"
  | "check_business_hours"
  | "check_availability"
  | "book_appointment"
  | "find_my_appointment"
  | "cancel_appointment";

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
  /** true solo si el cliente pidió a ese profesional por su nombre. Cuando el
   * hueco se preasignó al primero libre, este campo va a false y la reserva
   * NO lo usa como filtro: si mientras el cliente daba sus datos ese
   * profesional se ocupó, seguía habiendo hueco con otro y el agente decía
   * que no quedaba nada. */
  professionalRequested?: boolean;
  /** El profesional pedido está marcado "no sugerir" para estos servicios y
   * check_availability devolvió una recomendación. book_appointment con este
   * token exige `professionalConfirmed: true` (el cliente insistió tras oír
   * la propuesta): es la red de seguridad para que un prompt antiguo no
   * reserve con esa persona sin haber propuesto antes a la recomendada. */
  recommendationOffered?: {
    professionalId: string;
    professionalName: string;
    availabilityToken: string;
  };
};

/** Lo que el agente lee cuando hay alguien mejor que proponer. Lleva su
 * propio token para que "vale, con Laura" se reserve sin otra comprobación. */
type RecommendationForAgent = {
  professional: { id: string; name: string };
  isSpecialist: boolean;
  availabilityToken: string;
  instructions: string;
};

function instruccionesDeRecomendacion(
  recomendado: string,
  pedido: string,
  isSpecialist: boolean
): string {
  const porQue = isSpecialist
    ? `${recomendado} es quien más hace este servicio`
    : `${recomendado} es la persona más indicada`;
  return `Propón UNA sola vez, en positivo, reservar con ${recomendado} (${porQue} y tiene hueco a esa hora); reserva con su availabilityToken si el cliente acepta. Si el cliente insiste en ${pedido}, reserva con el availabilityToken principal y professionalConfirmed: true, sin explicar nada. Nunca digas ni insinúes que ${pedido} no hace o no domina este servicio.`;
}

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
  /** ID de llamada del proveedor de voz (callId), para vincular reservas a la llamada exacta. */
  callId?: string;
}

/** Las columnas de calendario vienen de FilaDeConexionDeCalendario: aquí
 * nunca se leen por nombre, se pasan a resolverConexionDeCalendario. */
type BusinessVoiceConfig = FilaDeConexionDeCalendario & {
  id: string;
  name: string;
  schedule: unknown;
  timezone: string;
  bookingCapacity: number;
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
};

async function loadBusinessConfig(
  businessId: string
): Promise<BusinessVoiceConfig | null> {
  return prisma.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      schedule: true,
      timezone: true,
      bookingCapacity: true,
      // Incluye `id` y la relación calendarConnections.
      ...SELECT_CONEXION_DE_CALENDARIO,
      minAdvanceBookingMinutes: true,
      maxAppointmentDurationMinutes: true,
      phone: true,
      telnyxPhoneNumber: true,
      subscriptionStatus: true,
    },
  });
}

async function getCachedVoiceConfig(
  businessId: string
): Promise<BusinessVoiceConfig | null> {
  const redis = getRedis();
  const redisKey = claveDeCacheDeVoz(businessId);

  try {
    const cachedConfigStr = await redis.get(redisKey);
    if (cachedConfigStr) {
      const parsed = JSON.parse(cachedConfigStr) as BusinessVoiceConfig;
      // Token presente y flag === true: una entrada cacheada con el
      // calendario roto se descarta para releer de BD.
      if (conexionConfirmada(resolverConexionDeCalendario(parsed))) {
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
      claveDeCacheDeVoz(businessId),
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
      typeof params?.startDateTime === "string"
        ? normalizeVoiceToolDateTime(params.startDateTime, business.timezone || "Europe/Madrid")
        : "";
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
  const result = await calendarService.getBusyIntervals({
    conexion: resolverConexionDeCalendario(business),
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
    // Normaliza la hora ANTES de tocar horario/calendario — ver
    // voiceDateTime.ts: una hora hablada marcada como UTC por el LLM
    // rechazaba citas perfectamente válidas (OUTSIDE_BUSINESS_HOURS) y el
    // draft de disponibilidad guardaba ese instante desplazado.
    const startDateTime =
      typeof params?.startDateTime === "string"
        ? normalizeVoiceToolDateTime(params.startDateTime, business.timezone || "Europe/Madrid")
        : "";
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
    // true solo cuando el cliente ya oyó la recomendación e insistió en la
    // persona que pidió: entonces no se vuelve a proponer a nadie.
    const professionalConfirmed = params?.professionalConfirmed === true;

    // El LLM puede corromper un ID largo al copiarlo (llamada real del
    // 2026-09-14: envió "cmu1h326w001ts601zp5xut70", un híbrido de dos IDs
    // reales del catálogo). Ignorarlo en silencio acaba en reservas sin
    // servicio o con el profesional equivocado — mejor un error explícito
    // que el modelo sabe corregir volviendo a get_catalog.
    if (serviceIds?.length) {
      const knownServices = await prisma.service.findMany({
        where: {
          id: { in: serviceIds },
          businessId: business.id,
          active: true,
          deletedAt: null,
        },
        select: { id: true },
      });
      const knownIds = new Set(knownServices.map((service) => service.id));
      const unknownIds = serviceIds.filter((id) => !knownIds.has(id));
      if (unknownIds.length > 0) {
        return {
          success: true,
          result: {
            available: false,
            code: "UNKNOWN_SERVICE_ID",
            message:
              "Algún serviceId no existe en este negocio. Vuelve a consultar get_catalog y copia los IDs exactamente, carácter a carácter.",
          },
        };
      }
    }
    let requestedProfessionalName = "la persona que pidió";
    if (professionalId) {
      const knownProfessional = await prisma.professional.findFirst({
        where: {
          id: professionalId,
          businessId: business.id,
          active: true,
          deletedAt: null,
        },
        select: { id: true, name: true },
      });
      if (knownProfessional?.name) requestedProfessionalName = knownProfessional.name;
      if (!knownProfessional) {
        return {
          success: true,
          result: {
            available: false,
            code: "UNKNOWN_PROFESSIONAL_ID",
            message:
              "Ese professionalId no existe en este negocio. Vuelve a consultar get_catalog y copia el ID exactamente; si el cliente no pidió un profesional concreto, no envíes professionalId.",
          },
        };
      }
    }

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
      calendarOrigin: origenDeCalendario(
        resolverConexionDeCalendario(business)
      ),
    });

    // Lo que se le devuelve al LLM no lleva los campos internos del ranking
    // (specialistIds, recommendedProfessional): se traducen a cosas que puede
    // decir. Un profesional "no sugerir" nunca aparece como tal.
    const { recommendedProfessional, ...sinRecomendacion } = availability;
    const specialistIds = availability.available ? availability.specialistIds : undefined;
    const paraElAgente: Omit<typeof sinRecomendacion, "specialistIds"> = Object.fromEntries(
      Object.entries(sinRecomendacion).filter(([clave]) => clave !== "specialistIds")
    ) as Omit<typeof sinRecomendacion, "specialistIds">;

    // El cliente pidió por su nombre a alguien marcado "no sugerir" y hay
    // alguien mejor libre a esa hora: se le propone UNA vez, con su propio
    // token. Si el cliente ya insistió (professionalConfirmed), no se
    // vuelve a proponer.
    const recommendation: RecommendationForAgent | undefined =
      recommendedProfessional && !professionalConfirmed
        ? {
            professional: recommendedProfessional.professional,
            isSpecialist: recommendedProfessional.isSpecialist,
            availabilityToken: await createAvailabilityDraft({
              businessId: business.id,
              callId,
              startDateTime,
              durationMinutes,
              serviceIds: serviceIds ?? [],
              professionalId: recommendedProfessional.professional.id,
              professionalRequested: true,
            }),
            instructions: instruccionesDeRecomendacion(
              recommendedProfessional.professional.name,
              requestedProfessionalName,
              recommendedProfessional.isSpecialist
            ),
          }
        : undefined;
    const conRecomendacion = recommendation ? { recommendation } : {};

    if (availability.available) {
      const asignado = availability.availableProfessionals[0];
      const availabilityToken = await createAvailabilityDraft({
        businessId: business.id,
        callId,
        startDateTime,
        durationMinutes,
        serviceIds: serviceIds ?? [],
        professionalId: professionalId ?? asignado?.id,
        professionalRequested: Boolean(professionalId),
        ...(recommendation && professionalId
          ? {
              recommendationOffered: {
                professionalId: recommendation.professional.id,
                professionalName: recommendation.professional.name,
                availabilityToken: recommendation.availabilityToken,
              },
            }
          : {}),
      });
      // Sin profesional pedido, el hueco va a availableProfessionals[0]: el
      // agente puede decir con quién queda y, si es especialista, decirlo en
      // positivo al confirmar.
      const assignedProfessional =
        !professionalId && asignado
          ? {
              assignedProfessional: {
                ...asignado,
                isSpecialist: specialistIds?.includes(asignado.id) ?? false,
              },
            }
          : {};
      return {
        success: true,
        result: { ...paraElAgente, availabilityToken, ...assignedProfessional, ...conRecomendacion },
      };
    }

    if (availability.suggestedNextSlot) {
      const suggestedToken = await createAvailabilityDraft({
        businessId: business.id,
        callId,
        startDateTime: availability.suggestedNextSlot.startDateTime,
        durationMinutes,
        serviceIds: serviceIds ?? [],
        professionalId:
          professionalId ?? availability.suggestedNextSlot.availableProfessionals[0]?.id,
        professionalRequested: Boolean(professionalId),
      });
      return {
        success: true,
        result: {
          ...paraElAgente,
          suggestedNextSlot: {
            ...availability.suggestedNextSlot,
            availabilityToken: suggestedToken,
          },
          ...conRecomendacion,
        },
      };
    }

    return { success: true, result: { ...paraElAgente, ...conRecomendacion } };
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

/** El agente cuelga a los 10 minutos (maxCallDurationMs), así que una
 * llamada "en curso" más antigua que esto es un zombi, no la llamada actual. */
const MAX_CALL_AGE_FOR_FALLBACK_MS = 15 * 60 * 1000;

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
        where: { callId },
        select: { id: true, fromNumber: true, businessId: true },
      })
    : null;

  if (exactCall) {
    // El callId viene del sobre del webhook y el negocio se deriva del agente
    // de la URL: son dos datos independientes. Si no coinciden, vincular la
    // fila ajena metería esta reserva en la agenda de otro negocio, así que
    // se corta aquí en vez de caer al heurístico.
    if (exactCall.businessId !== businessId) {
      console.error(
        `[VoiceTools] ${callLabel}: la llamada ${callId} pertenece a otro negocio; no se vincula`
      );
      return null;
    }
    return { id: exactCall.id, fromNumber: exactCall.fromNumber };
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
  // Acotado también en el tiempo: una llamada que el proveedor nunca cerró
  // se queda IN_PROGRESS hasta que pasa el barrido de zombis, y el heurístico
  // podía elegirla y sobrescribir la reserva de aquel cliente con los datos
  // del que llama ahora. Ninguna llamada real dura más que el tope del agente.
  const fallbackCall = await prisma.call.findFirst({
    where: {
      businessId,
      status: "IN_PROGRESS",
      startedAt: { gte: new Date(Date.now() - MAX_CALL_AGE_FOR_FALLBACK_MS) },
    },
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
 * Lo que el agente le dice al cliente cuando la reserva no ha salido. Si el
 * lead no se ha podido guardar, NADIE tiene sus datos: prometerle que le
 * confirmaremos en breve es mentirle, y el cliente no vuelve a llamar porque
 * cree que está resuelto. En ese caso se le da el teléfono del negocio.
 */
function mensajeDeSeguimiento(
  leadId: string | null,
  businessPhone: string | null | undefined
): string {
  if (leadId) {
    return " He tomado nota de tus datos y te confirmaremos en breve.";
  }
  return businessPhone && isValidE164Phone(businessPhone)
    ? ` No he podido dejar registrada tu solicitud, así que llama directamente al ${businessPhone} para confirmarla.`
    : " No he podido dejar registrada tu solicitud: vuelve a llamar en unos minutos, por favor.";
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

    // El negocio tiene que enterarse el mismo día, no el lunes siguiente: sin
    // este aviso, una cita caída solo aparecía en un contador del panel que
    // nadie mira el fin de semana, y el cliente se presentaba sin cita. Por
    // WhatsApp (aviso #3, con botones) y, si no es posible, por email.
    const negocio = await prisma.business.findUnique({
      where: { id: args.businessId },
      select: { name: true, timezone: true },
    });
    const fechaCita = new Date(args.startDateTime);
    if (negocio && !Number.isNaN(fechaCita.getTime())) {
      await avisarCitaPendiente({
        businessId: args.businessId,
        businessName: negocio.name,
        timezone: negocio.timezone || "Europe/Madrid",
        leadId: lead.id,
        clientName: args.clientName,
        startDateTime: fechaCita,
        failureCode: args.failureCode,
        email: () =>
          avisarDeReservaPendiente({
            businessId: args.businessId,
            clientName: args.clientName,
            clientPhone: args.clientPhone ?? null,
            startDateTime: args.startDateTime,
          }),
      });
    } else {
      void avisarDeReservaPendiente({
        businessId: args.businessId,
        clientName: args.clientName,
        clientPhone: args.clientPhone ?? null,
        startDateTime: args.startDateTime,
      });
    }

    return lead.id;
  } catch (error) {
    console.error(
      `[VoiceTools] ${args.callLabel} no pudo guardar la reserva pendiente: ${errorMessage(error)}`
    );
    return null;
  }
}

/**
 * Email al propietario cuando una cita se queda sin llegar al calendario.
 * Con antirrebote de una hora por negocio: si el calendario está caído, se
 * avisa una vez, no una por cada llamada que entre esa tarde.
 */
async function avisarDeReservaPendiente(args: {
  businessId: string;
  clientName: string;
  clientPhone: string | null;
  startDateTime: string;
}): Promise<void> {
  try {
    const clave = `pending_booking_alert:${args.businessId}`;
    const primero = await getRedis().set(clave, "1", "EX", 3600, "NX");
    if (primero !== "OK") {
      return;
    }

    const business = await prisma.business.findUnique({
      where: { id: args.businessId },
      select: {
        name: true,
        timezone: true,
        users: { select: { email: true }, take: 1 },
      },
    });
    const email = business?.users[0]?.email;
    if (!business || !email) {
      return;
    }

    const frontendUrl = (
      process.env.FRONTEND_URL || "http://localhost:3001"
    ).replace(/\/$/, "");
    const formattedDateTime = new Intl.DateTimeFormat("es-ES", {
      timeZone: business.timezone || "Europe/Madrid",
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(args.startDateTime));

    const { subject, html } = pendingBookingAlertEmail({
      businessName: business.name,
      clientName: args.clientName,
      clientPhone: args.clientPhone,
      formattedDateTime,
      panelUrl: `${frontendUrl}/`,
    });

    await enqueueEmailJob({ fromAlias: "support", toAddress: email, subject, html });
  } catch (error) {
    // Un aviso que no sale no puede tumbar la captura del lead, que es lo
    // que de verdad salva la cita.
    console.error(
      `[VoiceTools] No se pudo avisar de la reserva pendiente: ${errorMessage(error)}`
    );
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

/**
 * Remitente a usar en el campo `from` del envío de SMS. Con
 * TELNYX_SMS_SENDER_ID configurado (el Alphanumeric Sender ID de Telnyx,
 * ej. "ALHABLA", pendiente de aprobación — issue #21) se envía directamente
 * con ese texto: la documentación oficial de Telnyx confirma que un Sender
 * ID alfanumérico va en `from` en vez de un número, y se resuelve por su
 * propio Messaging Profile — no depende de que business.telnyxPhoneNumber
 * esté dado de alta para mensajería (el bloqueo 40323/40305 que hoy nos
 * impide enviar). Sin la variable, se sigue usando el número Telnyx del
 * negocio como hasta ahora (mismo bloqueo, sin cambios).
 */
function resolveSmsFromAddress(business: Pick<BusinessVoiceConfig, "telnyxPhoneNumber">): string | null {
  return process.env.TELNYX_SMS_SENDER_ID || business.telnyxPhoneNumber;
}

/**
 * `messaging_profile_id` es opcional al enviar desde un número normal, pero
 * la propia API de Telnyx lo exige al enviar con un Alphanumeric Sender ID
 * ("Required if sending via number pool or with an alphanumeric sender ID"),
 * así que solo se resuelve cuando ese es el remitente activo — un long-code
 * normal sigue sin necesitarlo.
 */
function resolveSmsMessagingProfileId(): string | undefined {
  return process.env.TELNYX_SMS_SENDER_ID
    ? process.env.TELNYX_MESSAGING_PROFILE_ID
    : undefined;
}

/**
 * Confirmación y recordatorio al cliente por SMS: solo cuando WhatsApp no
 * está configurado (ver `programarMensajesAlCliente` para el camino de
 * WhatsApp). Hoy el SMS no sale (40323, ver AGENTS.md e issue #21): este
 * bloque deja el pipeline listo para cuando se apruebe el Sender ID.
 */
async function enviarMensajesAlClientePorSms(
  business: BusinessVoiceConfig,
  input: {
    bookingId: string | undefined;
    toNumber: string;
    startDateTime: string;
    serviceNames: string[];
    callLabel: string;
  }
): Promise<void> {
  const smsInput = {
    businessName: business.name,
    businessPhone: business.telnyxPhoneNumber ?? "",
    startDateTime: input.startDateTime,
    timezone: business.timezone || "Europe/Madrid",
    serviceNames: input.serviceNames,
  };
  const base = {
    fromNumber: resolveSmsFromAddress(business)!,
    toNumber: input.toNumber,
    messagingProfileId: resolveSmsMessagingProfileId(),
  };
  try {
    await enqueueSmsJob(
      { ...base, text: buildClientConfirmationSmsText(smsInput) },
      input.bookingId ? { taskId: `confirm-sms-${input.bookingId}` } : undefined
    );
  } catch (smsError) {
    console.error(
      `[VoiceTools] ${input.callLabel} no pudo encolar la confirmación al cliente: ${errorMessage(smsError)}`
    );
  }
  const reminderAt = new Date(
    new Date(input.startDateTime).getTime() - REMINDER_LEAD_HOURS * 60 * 60 * 1000
  );
  // El recordatorio es feature de Pro/Scale; se lee de la BD, no de la
  // caché de voice_config, que puede ser anterior a un cambio de plan.
  const planFields = await prisma.business.findUnique({
    where: { id: business.id },
    select: { plan: true, stripePriceId: true },
  });
  const reminderAllowed =
    planFields !== null &&
    planAllows(resolvePlanId(planFields), "recordatorios_cita");
  if (input.bookingId && reminderAllowed && reminderAt.getTime() > Date.now()) {
    try {
      await enqueueSmsJob(
        { ...base, text: buildClientReminderSmsText(smsInput) },
        { taskId: `reminder-sms-${input.bookingId}`, scheduleTime: reminderAt }
      );
    } catch (smsError) {
      console.error(
        `[VoiceTools] ${input.callLabel} no pudo encolar el recordatorio al cliente: ${errorMessage(smsError)}`
      );
    }
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

/** Confirmación al cliente tras reservar — solo se manda si dio
 * consentimiento (smsConsent) para usar ese número. */
function buildClientConfirmationSmsText(input: {
  businessName: string;
  businessPhone: string;
  startDateTime: string;
  timezone: string;
  serviceNames?: string[] | null;
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
    `Cita confirmada en ${input.businessName}`,
    services.length > 0 ? services.join(" + ") : null,
    formattedDateTime,
    `Para cambiarla o cancelarla, llama al ${input.businessPhone}`,
  ].filter(Boolean);

  return parts.join(" — ");
}

/** Recordatorio programado (REMINDER_LEAD_HOURS antes de la cita). */
function buildClientReminderSmsText(input: {
  businessName: string;
  businessPhone: string;
  startDateTime: string;
  timezone: string;
  serviceNames?: string[] | null;
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
    `Recordatorio: tienes una cita en ${input.businessName}`,
    services.length > 0 ? services.join(" + ") : null,
    formattedDateTime,
    `Para cambiarla o cancelarla, llama al ${input.businessPhone}`,
  ].filter(Boolean);

  return parts.join(" — ");
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
    smsConsent?: boolean;
    professionalConfirmed?: boolean;
  };
  const clientName = rawParams.clientName;
  const clientEmail = rawParams.clientEmail;
  const clientPhone = rawParams.clientPhone;
  const smsConsent = rawParams.smsConsent === true;
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

  // check_availability propuso a alguien mejor para este servicio y el
  // agente intenta reservar con la persona pedida sin decir que el cliente
  // insistió. Se frena una vez: o el cliente acepta a quien se le propuso
  // (token de la recomendación) o insiste (professionalConfirmed). Es la red
  // de seguridad para prompts editados a mano que no conocen la regla.
  if (draft?.recommendationOffered && rawParams.professionalConfirmed !== true) {
    const recomendado = draft.recommendationOffered;
    return {
      success: true,
      result: {
        success: false,
        code: "PROFESSIONAL_CONFIRMATION_REQUIRED",
        recommendation: {
          professional: { id: recomendado.professionalId, name: recomendado.professionalName },
          availabilityToken: recomendado.availabilityToken,
        },
        message: `Antes de reservar, propón una sola vez reservar con ${recomendado.professionalName}, que tiene hueco a esa hora (usa su availabilityToken si el cliente acepta). Si el cliente insiste en la persona que pidió, repite book_appointment con este mismo availabilityToken y professionalConfirmed: true. No expliques el motivo ni digas que alguien no hace este servicio.`,
      },
    };
  }

  // El draft ya se guardó normalizado en check_availability; la ruta sin
  // token (rawParams) necesita la misma corrección de zona horaria — la
  // normalización es idempotente, así que aplicarla al valor resuelto cubre
  // ambos caminos (ver voiceDateTime.ts).
  const rawStartDateTime = draft?.startDateTime ?? rawParams.startDateTime;
  const startDateTime =
    typeof rawStartDateTime === "string"
      ? normalizeVoiceToolDateTime(rawStartDateTime, business.timezone || "Europe/Madrid")
      : rawStartDateTime;
  const durationMinutes = draft?.durationMinutes ?? rawParams.durationMinutes;
  // Un profesional preasignado por el draft es una preferencia, no una
  // condición: se usa para la reserva si sigue libre, pero no se le pasa a
  // checkAvailability como filtro duro.
  const professionalPreasignado =
    draft !== null && draft.professionalRequested === false
      ? draft.professionalId
      : undefined;
  const professionalId = professionalPreasignado
    ? undefined
    : draft?.professionalId ?? rawParams.professionalId;
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
    ESTADOS_DE_SUSCRIPCION_BLOQUEADOS.has(business.subscriptionStatus)
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

    const conexion = resolverConexionDeCalendario(business);
    const hasCalendarConnection = conexionOperativa(conexion);

    // Resuelto aquí arriba, antes de cualquier punto de fallo, para no
    // repetir la misma consulta a Call en cada uno de los tres sitios que
    // pueden necesitarla (capturePendingBookingLead) — y para usar
    // fromNumber como fallback del teléfono de contacto del evento cuando
    // el cliente no pidió uno distinto (ver resolveCallForBusiness).
    const call = await resolveCallForBusiness(callId, business.id, callLabel);
    const effectiveClientPhone = clientPhone || call?.fromNumber || undefined;

    if (!hasCalendarConnection) {
      const reconnectCode = codigoDeReconexion(conexion.provider);
      const providerLabel = DESCRIPTORES_DE_PROVEEDOR[conexion.provider].nombre;
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
        calendarOrigin: origenDeCalendario(
          resolverConexionDeCalendario(business)
        ),
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

      // El negocio tiene calendario conectado pero no hemos podido leerlo
      // (5xx de Google, timeout). Confirmar aquí es reservar a ciegas: si el
      // dueño había metido una cita a mano en ese hueco, acabamos con dos
      // clientes a la misma hora. Se guarda como pendiente y se reintenta.
      // ¿El negocio trabaja con un calendario externo? Distingue el "no hay
      // nada que leer" (negocio sin calendario, funciona solo con nuestra
      // agenda) del "no he podido leerlo", que es una caída y no un permiso.
      if (
        usaCalendarioExterno(conexion) &&
        !externalBusy.calendarAvailabilityKnown
      ) {
        console.warn(
          `[VoiceTools] ${callLabel}: no se pudo leer el calendario del negocio; la reserva se guarda como pendiente en vez de confirmarse a ciegas`
        );
        const leadCalendarioIlegible = await capturePendingBookingLead({
          resolvedCall: call,
          businessId: business.id,
          clientName,
          clientEmail,
          clientPhone,
          startDateTime,
          durationMinutes: effectiveDuration,
          serviceIds: verifiedServiceIds,
          professionalId:
            verifiedProfessionalId ??
            availability.availableProfessionals[0]?.id,
          failureCode: "CALENDAR_UNAVAILABLE",
          callLabel,
        });
        if (leadCalendarioIlegible) {
          await enqueueRetryFailedBooking(leadCalendarioIlegible);
        }
        return {
          success: true,
          result: {
            success: false,
            code: "CALENDAR_UNAVAILABLE",
            message:
              "No he podido comprobar la agenda del negocio en este momento." +
              mensajeDeSeguimiento(leadCalendarioIlegible, business.phone),
          },
        };
      }

      // Si el hueco se había preasignado a alguien y sigue libre, se
      // respeta (el cliente ya oyó ese nombre); si se ocupó, se coge a
      // cualquier otro profesional disponible en vez de rechazar la cita.
      const preferido = professionalPreasignado
        ? availability.availableProfessionals.find(
            (profesional) => profesional.id === professionalPreasignado
          )
        : undefined;
      const elegido = preferido ?? availability.availableProfessionals[0];
      const resolvedProfessionalId = verifiedProfessionalId ?? elegido?.id;
      const resolvedProfessionalName = verifiedProfessionalId
        ? verifiedProfessionalName
        : elegido?.name;

      // Idempotencia: si esta llamada YA tiene un Booking con un evento
      // externo creado para esta misma fecha/duración exactas (Retell
      // reintentando el tool call tras un timeout, por ejemplo), no se crea
      // un segundo evento — se confirma reutilizando el que ya existe. Una
      // fecha/duración distinta sigue tratándose como un cambio de opinión
      // legítimo del cliente (nueva reserva sobre la misma llamada), no
      // como un reintento.
      let reservaPrevia: {
        externalEventId: string | null;
        externalCalendarProvider: string | null;
        externalCalendarId: string | null;
        isCancelled: boolean;
        cancelledAt: Date | null;
      } | null = null;
      if (call) {
        const existingBooking = await prisma.booking.findUnique({
          where: { callId: call.id },
          select: {
            id: true,
            externalEventId: true,
            externalCalendarProvider: true,
            externalCalendarId: true,
            programedAt: true,
            durationMinutes: true,
            isCancelled: true,
            cancelledAt: true,
          },
        });
        reservaPrevia = existingBooking;
        // Una reserva cancelada en esta misma llamada NO es un reintento: su
        // evento ya se borró al cancelar, así que hay que crear uno nuevo y
        // reactivar la fila (el `update` del upsert de abajo).
        if (
          existingBooking?.externalEventId &&
          !existingBooking.isCancelled &&
          existingBooking.programedAt.getTime() ===
            new Date(startDateTime).getTime() &&
          existingBooking.durationMinutes === effectiveDuration
        ) {
          console.log(
            `[VoiceTools] ${callLabel} ya tenía un evento creado para esta reserva exacta (${existingBooking.externalEventId}); no se crea uno nuevo`
          );
          // Reintento del tool call: los mensajes al cliente ya quedaron
          // programados (idempotentes por clave), pero el LLM solo ve ESTA
          // respuesta, así que se vuelve a calcular `mensajeCliente`.
          let mensajeClienteRepetido: "whatsapp" | "ninguno" = "ninguno";
          if (whatsappAdapter.isConfigured()) {
            const programado = await programarMensajesAlCliente({
              bookingId: existingBooking.id,
              etiqueta: callLabel,
            });
            mensajeClienteRepetido =
              programado.confirmacion === "programada" ? "whatsapp" : "ninguno";
          }
          return {
            success: true,
            result: {
              success: true,
              message: "Cita agendada correctamente.",
              professionalId: resolvedProfessionalId,
              professionalName: resolvedProfessionalName ?? null,
              mensajeCliente: mensajeClienteRepetido,
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
          conexion,
          timezone: business.timezone,
          // Tras cancelar en la misma llamada la clave cambia (`distintivo`):
          // con la misma, Google respondería 409 y el adaptador devolvería
          // el evento CANCELADO como si fuera nuevo (invisible en la agenda
          // y descartado al reconciliar: doble reserva).
          idempotencyKey: call
            ? buildCalendarIdempotencyKey({
                callId: call.id,
                startDateTime,
                durationMinutes: effectiveDuration,
                distintivo: reservaPrevia?.isCancelled
                  ? `reactivada:${reservaPrevia.cancelledAt?.getTime() ?? "sin-fecha"}`
                  : undefined,
              })
            : undefined,
        });

        // Persist booking in database, vinculada a la llamada exacta cuando se
        // conoce su callId (ver resolveCallForBusiness).
        let reservaGuardadaId: string | null = null;
        if (call) {
          try {
          const reservaGuardada = await prisma.booking.upsert({
            where: { callId: call.id },
            create: {
              callId: call.id,
              programedAt: new Date(startDateTime),
              durationMinutes: effectiveDuration,
              numberPeople: 1,
              professionalId: resolvedProfessionalId ?? undefined,
              serviceIds: verifiedServiceIds,
              clientName,
              clientPhone: clientPhone || undefined,
              smsConsent,
              createdVia: "voice",
              externalEventId: (result as { id?: string })?.id ?? undefined,
              externalCalendarProvider: conexion.provider,
              externalCalendarId: conexion.calendarId,
            },
            update: {
              programedAt: new Date(startDateTime),
              durationMinutes: effectiveDuration,
              professionalId: resolvedProfessionalId ?? undefined,
              serviceIds: verifiedServiceIds,
              clientName,
              clientPhone: clientPhone || undefined,
              smsConsent,
              externalEventId: (result as { id?: string })?.id ?? undefined,
              externalCalendarProvider: conexion.provider,
              externalCalendarId: conexion.calendarId,
              // Cancelar y volver a reservar en la misma llamada reactiva la
              // fila: sin esto quedaba cancelada con la hora nueva y el job
              // de confirmación la descartaba (RESERVA_CANCELADA).
              isCancelled: false,
              cancelledAt: null,
              cancelledBy: null,
            },
            select: { id: true },
          });
          reservaGuardadaId = reservaGuardada?.id ?? null;
          } catch (errorAlGuardar) {
            // El evento ya está en el calendario del negocio pero la reserva
            // no se ha podido guardar. Si lo dejáramos así, el dueño vería una
            // cita que para nosotros no existe: ni cuenta para la
            // disponibilidad ni se puede cancelar por voz. Se borra el evento
            // y se sigue por el camino de "no he podido agendarla", que guarda
            // los datos del cliente para reintentarlo.
            const eventoHuerfano = (result as { id?: string })?.id;
            if (eventoHuerfano) {
              try {
                await calendarService.cancelAppointment({
                  conexion,
                  eventId: eventoHuerfano,
                });
              } catch (errorAlBorrar) {
                console.error(
                  `[VoiceTools] ${callLabel} no pudo deshacer el evento ${eventoHuerfano} tras fallar el guardado: ${errorMessage(errorAlBorrar)}`
                );
              }
            }
            throw errorAlGuardar;
          }
        }

        // El cliente cambió de hora dentro de la misma llamada: la reserva
        // anterior se sobrescribe en la base de datos, pero su evento seguía
        // vivo en el calendario del negocio. Además de duplicar la cita a
        // ojos del dueño, ese evento huérfano bloqueaba ese hueco para
        // siempre, porque ya no quedaba ninguna reserva local que lo
        // reconciliara.
        // Si la reserva previa estaba cancelada, su evento ya lo borró
        // `cancelarReserva`: no hay nada que limpiar.
        const eventoNuevoId = (result as { id?: string })?.id;
        if (
          reservaPrevia?.externalEventId &&
          !reservaPrevia.isCancelled &&
          reservaPrevia.externalEventId !== eventoNuevoId
        ) {
          try {
            // `|| undefined`: sin calendario guardado en la reserva previa
            // se cae a la columna del negocio, como siempre.
            await calendarService.cancelAppointment({
              conexion: resolverConexionDeCalendario(business, {
                provider: normalizarProveedorDeCalendario(
                  reservaPrevia.externalCalendarProvider
                ),
                calendarId: reservaPrevia.externalCalendarId || undefined,
              }),
              eventId: reservaPrevia.externalEventId,
            });
          } catch (error) {
            // No se le cuenta al cliente: su cita nueva está confirmada. Se
            // registra para que quede rastro del evento que hay que borrar.
            console.error(
              `[VoiceTools] ${callLabel} no pudo borrar el evento anterior ${reservaPrevia.externalEventId}:`,
              error
            );
          }
        }

        console.log(`[VoiceTools] ${callLabel} agendó la cita correctamente`);

        // Aviso #1 al dueño por WhatsApp (PLAN-CANAL-DUENO.md § 4). Nunca
        // lanza y es idempotente por reserva; se espera por la misma razón
        // que el SMS de abajo (Cloud Run congela el proceso al responder).
        if (reservaGuardadaId) {
          await avisarNuevaReserva({
            businessId: business.id,
            businessName: business.name,
            timezone: business.timezone || "Europe/Madrid",
            bookingId: reservaGuardadaId,
            clientName,
            startDateTime: new Date(startDateTime),
            serviceNames: verifiedServiceNames,
            professionalName: resolvedProfessionalName ?? null,
          });
        }

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
              fromNumber: resolveSmsFromAddress(business)!,
              toNumber: business.phone,
              text: buildBookingSmsText({
                clientName,
                startDateTime,
                timezone: business.timezone || "Europe/Madrid",
                serviceNames: verifiedServiceNames,
                professionalName: resolvedProfessionalName,
              }),
              messagingProfileId: resolveSmsMessagingProfileId(),
            });
          } catch (smsError) {
            console.error(
              `[VoiceTools] ${callLabel} no pudo encolar el SMS de aviso: ${errorMessage(smsError)}`
            );
          }
        }

        // Confirmación (y recordatorio) al cliente. Por WhatsApp cuando está
        // configurado: `programarMensajesAlCliente` (mensajesCliente.ts)
        // encola los jobs por propósito, que releen la reserva al enviar y
        // eligen la plantilla aprobada; devuelve si la confirmación quedó
        // programada para que la recepcionista solo la prometa si va a
        // salir (`mensajeCliente`). Si no, cae a SMS como hasta ahora. Nunca
        // tumba la reserva y se espera (Cloud Run congela el proceso al
        // responder al tool call).
        let mensajeCliente: "whatsapp" | "ninguno" = "ninguno";
        if (reservaGuardadaId && whatsappAdapter.isConfigured()) {
          const programado = await programarMensajesAlCliente({
            bookingId: reservaGuardadaId,
            etiqueta: callLabel,
          });
          mensajeCliente =
            programado.confirmacion === "programada" ? "whatsapp" : "ninguno";
        } else if (
          smsConsent &&
          business.telnyxPhoneNumber &&
          effectiveClientPhone &&
          isValidE164Phone(effectiveClientPhone)
        ) {
          await enviarMensajesAlClientePorSms(business, {
            bookingId: reservaGuardadaId ?? undefined,
            toNumber: effectiveClientPhone,
            startDateTime,
            serviceNames: verifiedServiceNames,
            callLabel,
          });
        }

        return {
          success: true,
          result: {
            success: true,
            message: "Cita agendada correctamente.",
            eventLink: (result as { htmlLink?: string })?.htmlLink,
            professionalId: resolvedProfessionalId,
            // Para que la confirmación pueda decir con quién queda la cita
            // (el preasignado puede haber cambiado si se ocupó entre medias).
            professionalName: resolvedProfessionalName ?? null,
            // "whatsapp" solo si la confirmación por WhatsApp quedó
            // programada de verdad: el prompt condiciona el anuncio a esto.
            mensajeCliente,
          },
        };
      } catch (error) {
        const proveedorRoto = proveedorDesdeErrorDeReconexion(error);
        if (proveedorRoto) {
          // El token ya fue rechazado (invalid_grant): se marca desconectado,
          // se anula el refresh token y se invalida la caché de voz.
          await marcarCalendarioDesconectado(
            business.id,
            proveedorRoto,
            { modo: "revocar" },
            { prefijo: "[VoiceTools]" }
          );
          const codigoReconexion = codigoDeReconexion(proveedorRoto);

          // Reconectar el calendario requiere una acción manual del negocio:
          // guardamos la solicitud pero NO la reintentamos sola en segundo plano.
          const leadReconexion = await capturePendingBookingLead({
            resolvedCall: call,
            businessId: business.id,
            clientName,
            clientEmail,
            clientPhone,
            startDateTime,
            durationMinutes: effectiveDuration,
            serviceIds: verifiedServiceIds,
            professionalId: resolvedProfessionalId,
            failureCode: codigoReconexion,
            callLabel,
          });

          return {
            success: true,
            result: {
              success: false,
              code: codigoReconexion,
              message:
                `No pude acceder al calendario del negocio porque la conexión con ${DESCRIPTORES_DE_PROVEEDOR[proveedorRoto].nombreCorto} expiró o fue revocada.` +
                (leadReconexion
                  ? " He tomado nota de tu solicitud para confirmártela en cuanto el negocio la reconecte."
                  : mensajeDeSeguimiento(null, business.phone)),
            },
          };
        }

        // Cualquier otro fallo (BOOK_APPOINTMENT_FAILED, timeout, rate limit, o
        // un error inesperado): nunca rompemos la llamada con un 500 — siempre
        // degradamos a un mensaje hablable y dejamos la solicitud guardada para
        // reintento automático en segundo plano, porque estos sí pueden ser
        // transitorios.
        const code = esCalendarBusinessError(error)
          ? error.code
          : "BOOK_APPOINTMENT_UNEXPECTED_ERROR";
        const baseMessage =
          esCalendarBusinessError(error) && typeof error.message === "string"
            ? error.message
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
            message: `${baseMessage}${mensajeDeSeguimiento(leadId, business.phone)}`,
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
 * Localiza la próxima cita del negocio asociada al número desde el que llama
 * quien marca — solo si esa cita se reservó con smsConsent=true (consentimiento
 * explícito para usar ese número, dado por voz durante la reserva original).
 * Sin ese consentimiento, aunque exista una cita con ese número, se responde
 * como si no se hubiera encontrado nada: no se filtra información de una
 * reserva que el cliente no autorizó a asociar a su número.
 */
async function executeFindMyAppointment(
  business: BusinessVoiceConfig,
  callLabel: string,
  callId?: string
): Promise<{ success: boolean; result?: any }> {
  const call = await resolveCallForBusiness(callId, business.id, callLabel);
  const callerNumber = call?.fromNumber;

  const notFoundResult = {
    success: true,
    result: {
      success: false,
      code: "APPOINTMENT_NOT_FOUND",
      message:
        "No encuentro ninguna cita con este número. ¿Puedes darme el nombre con el que reservaste?",
    },
  };

  if (!callerNumber) {
    return notFoundResult;
  }

  const booking = await prisma.booking.findFirst({
    where: {
      call: { businessId: business.id },
      isCancelled: false,
      programedAt: { gte: new Date() },
      // Ya no se exige smsConsent. Ese campo dice "puedes escribirme", no
      // "esta cita es mía": quien dijo que no a los mensajes seguía siendo el
      // titular, pero el agente no encontraba su cita, y el prompt le
      // empujaba entonces a reservar una nueva — el negocio acababa con dos
      // citas y una silla vacía. La identidad la da el número entrante.
      OR: [
        { clientPhone: callerNumber },
        { clientPhone: null, call: { fromNumber: callerNumber } },
      ],
    },
    orderBy: { programedAt: "asc" },
    select: {
      id: true,
      programedAt: true,
      serviceIds: true,
      clientName: true,
      professional: { select: { name: true } },
    },
  });

  if (!booking) {
    return notFoundResult;
  }

  const services =
    booking.serviceIds.length > 0
      ? await prisma.service.findMany({
          where: { id: { in: booking.serviceIds } },
          select: { name: true },
        })
      : [];

  const formattedDateTime = new Intl.DateTimeFormat("es-ES", {
    timeZone: business.timezone || "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(booking.programedAt);

  return {
    success: true,
    result: {
      success: true,
      bookingId: booking.id,
      formattedDateTime,
      serviceNames: services.map((s) => s.name),
      professionalName: booking.professional?.name ?? null,
      // Sin este campo, al "cambiar la cita al mismo nombre" el LLM no tenía
      // forma de saber el nombre original y llegó a reservar literalmente a
      // nombre de "titular anterior" (llamada real del 2026-09-15). Puede
      // venir null en reservas anteriores a la columna Booking.clientName.
      clientName: booking.clientName ?? null,
    },
  };
}

/**
 * Guarda que un cliente quiere que le avisemos por WhatsApp si se libera la
 * hora que pidió y no estaba disponible — tanto si se fue sin reservar nada
 * como si reservó otra hora igualmente (ambos casos válidos, ver
 * notify_when_available en telnyxAssistantPayload.ts). Se resuelve por
 * evento (executeCancelAppointment, la única forma hoy de que un hueco se
 * libere) en vez de por un job periódico: más inmediato y sin infraestructura
 * de scheduler nueva. No cubre huecos liberados por edición manual del
 * calendario externo (fuera de cancel_appointment) — pendiente si hace falta
 * más adelante.
 */
async function executeNotifyWhenAvailable(
  business: BusinessVoiceConfig,
  params: Record<string, unknown>,
  callLabel: string,
  callId?: string
): Promise<{ success: boolean; result?: any }> {
  const startDateTime =
    typeof params?.startDateTime === "string"
      ? normalizeVoiceToolDateTime(params.startDateTime, business.timezone || "Europe/Madrid")
      : "";
  const durationMinutes =
    typeof params?.durationMinutes === "number" ? params.durationMinutes : 0;
  if (!startDateTime || !isValidAppointmentDuration(durationMinutes)) {
    return {
      success: true,
      result: {
        success: false,
        code: "INVALID_PARAMS",
        message: "Me faltan datos para guardar el aviso.",
      },
    };
  }

  const serviceIds = Array.isArray(params?.serviceIds)
    ? params.serviceIds.filter((id): id is string => typeof id === "string")
    : [];
  const professionalId =
    typeof params?.professionalId === "string" ? params.professionalId : undefined;
  // Para reservar a su nombre si se libera la hora (lista de espera, PR 4).
  const clientName = sanearNombre(params?.clientName);

  const call = await resolveCallForBusiness(callId, business.id, callLabel);
  const clientPhone = call?.fromNumber;
  if (!clientPhone || !isValidE164Phone(clientPhone)) {
    return {
      success: true,
      result: {
        success: false,
        code: "NO_PHONE",
        message: "No tengo un número válido al que avisar.",
      },
    };
  }
  if (!call) {
    return {
      success: true,
      result: {
        success: false,
        code: "CALL_NOT_FOUND",
        message: "No he podido guardar el aviso ahora mismo.",
      },
    };
  }

  try {
    await prisma.lead.create({
      data: {
        callId: call.id,
        type: "availability_watch",
        isLead: false,
        data: {
          clientPhone,
          startDateTime,
          durationMinutes,
          serviceIds,
          professionalId: professionalId ?? null,
          ...(clientName ? { clientName } : {}),
        },
      },
    });
    return {
      success: true,
      result: {
        success: true,
        message: "Aviso guardado: te escribiremos por WhatsApp si se libera esa hora.",
      },
    };
  } catch (error) {
    console.error(
      `[VoiceTools] ${callLabel} no pudo guardar el aviso de disponibilidad: ${errorMessage(error)}`
    );
    return {
      success: true,
      result: {
        success: false,
        code: "SAVE_FAILED",
        message: "No he podido guardar el aviso ahora mismo.",
      },
    };
  }
}

/**
 * Cancela una cita identificada por find_my_appointment. Vuelve a comprobar
 * en servidor que el número de quien llama coincide y que dio consentimiento
 * — nunca se fía de que el LLM solo pase ids de citas propias.
 */
async function executeCancelAppointment(
  business: BusinessVoiceConfig,
  params: Record<string, unknown>,
  callLabel: string,
  callId?: string
): Promise<{ success: boolean; result?: any }> {
  const bookingId =
    typeof params.bookingId === "string" ? params.bookingId : undefined;

  const notFoundResult = {
    success: true,
    result: {
      success: false,
      code: "APPOINTMENT_NOT_FOUND",
      message:
        "No encuentro esa cita con este número. ¿Puedes darme el nombre con el que reservaste?",
    },
  };

  if (!bookingId) {
    return notFoundResult;
  }

  const call = await resolveCallForBusiness(callId, business.id, callLabel);
  const callerNumber = call?.fromNumber;

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, call: { businessId: business.id } },
    include: { call: { select: { fromNumber: true } } },
  });

  // Mismo criterio que find_my_appointment: la pertenencia se comprueba por
  // el número desde el que llama, no por el consentimiento de mensajería.
  const ownsBooking =
    booking &&
    callerNumber &&
    (booking.clientPhone
      ? booking.clientPhone === callerNumber
      : booking.call.fromNumber === callerNumber);

  if (!booking || !ownsBooking) {
    return notFoundResult;
  }

  if (booking.isCancelled) {
    return {
      success: true,
      result: { success: true, message: "Esa cita ya estaba cancelada." },
    };
  }

  // Cancelación en BD (fuente de verdad), borrado del evento externo con la
  // conexión con la que se creó, aviso #4 al dueño y lista de espera: todo
  // en `cancelarReserva` (compartido con el botón «Cancelar» del
  // recordatorio por WhatsApp). Idempotente: un segundo intento devuelve
  // `ya_cancelada` sin segundo aviso ni segunda oferta de hueco.
  const cancelacion = await cancelarReserva({
    bookingId: booking.id,
    businessId: business.id,
    cancelledBy: "client_voice",
    etiqueta: callLabel,
  });
  if (cancelacion.resultado === "ya_cancelada") {
    return {
      success: true,
      result: { success: true, message: "Esa cita ya estaba cancelada." },
    };
  }
  if (cancelacion.resultado === "no_encontrada") {
    return notFoundResult;
  }

  return {
    success: true,
    result: { success: true, message: "Cita cancelada correctamente." },
  };
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
    case "find_my_appointment":
      return executeFindMyAppointment(business, callLabel, callId);
    case "cancel_appointment":
      return executeCancelAppointment(business, params, callLabel, callId);
    case "notify_when_available":
      return executeNotifyWhenAvailable(business, params, callLabel, callId);
    case "informar_al_negocio": {
      // Post-conversación (PLAN-CANAL-DUENO.md § 10): siempre 200, para que
      // el assistant no reintente y duplique el recado.
      if (!callId) {
        console.error(`[VoiceTools] ${callLabel} informar_al_negocio sin callId`);
        return { success: true, result: { success: false } };
      }
      const informe = await procesarInformeFinal({
        business: {
          id: business.id,
          name: business.name,
          timezone: business.timezone || "Europe/Madrid",
        },
        callControlId: callId,
        params,
      });
      return { success: true, result: { success: true, outcome: informe.outcome } };
    }
    default:
      console.warn(`[VoiceTools] Tool desconocida: ${toolName}`);
      return { success: true };
  }
}
