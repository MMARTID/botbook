import { prisma } from "../../lib/prisma.js";
import { getRedis } from "../../lib/redis.js";
import { checkBusinessHours, checkBookingRestrictions } from "../../lib/businessSchedule.js";
import { checkAvailability } from "../../lib/availability.js";
import { calendarService } from "../calendar/service.js";
import { errorMessage } from "../../lib/logUtils.js";
import { enqueueRetryBookingJob } from "../../lib/cloudTasks.js";

export type VoiceToolName =
  | "check_business_hours"
  | "check_availability"
  | "book_appointment";

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
      const provider = parsed.calendarProvider === "outlook" ? "outlook" : "google";
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
      const restrictions = checkBookingRestrictions(business, startDateTime, durationMinutes);
      if (!restrictions.success) {
        return {
          success: true,
          result: { ...hoursResult, isOpen: false, code: restrictions.code, message: restrictions.message },
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

async function executeCheckAvailability(
  business: BusinessVoiceConfig,
  params: Record<string, unknown>,
  callLabel: string
): Promise<{ success: boolean; result?: any }> {
  try {
    const startDateTime =
      typeof params?.startDateTime === "string" ? params.startDateTime : "";
    const durationMinutes =
      typeof params?.durationMinutes === "number" ? params.durationMinutes : 0;
    const serviceIds = Array.isArray(params?.serviceIds)
      ? params.serviceIds.filter((id): id is string => typeof id === "string")
      : undefined;
    const professionalId =
      typeof params?.professionalId === "string" ? params.professionalId : undefined;

    const availability = await checkAvailability({
      businessId: business.id,
      schedule: business.schedule,
      timezone: business.timezone,
      bookingCapacity: business.bookingCapacity,
      startDateTime,
      durationMinutes,
      serviceIds,
      professionalId,
    });

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
): Promise<{ id: string } | null> {
  let call = callId
    ? await prisma.call.findUnique({
        where: { vapiCallId: callId },
        select: { id: true },
      })
    : null;

  if (!call) {
    if (callId) {
      console.warn(
        `[VoiceTools] ${callLabel} no encontró la fila Call para callId=${callId}; usando heurístico de llamada más reciente`
      );
    }
    call = await prisma.call.findFirst({
      where: { businessId },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
  }

  return call;
}

/**
 * Guarda la intención de reserva como un Lead cuando book_appointment falla,
 * para que el negocio nunca pierda los datos del cliente aunque el calendario
 * haya fallado. Devuelve el id del lead o null si no se pudo guardar (p. ej.
 * si no hay ninguna llamada a la que vincularlo).
 */
async function capturePendingBookingLead(args: {
  callId?: string;
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
    const call = await resolveCallForBusiness(args.callId, args.businessId, args.callLabel);
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
  };
  const { clientName, startDateTime, durationMinutes, clientEmail, clientPhone, professionalId } = rawParams;
  const requestedServiceIds = Array.isArray(rawParams.serviceIds)
    ? rawParams.serviceIds.filter((id): id is string => typeof id === "string")
    : [];

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

  try {
    // Nunca confiar en un serviceId/professionalId que venga del LLM sin
    // comprobar que pertenece a este negocio — si no coincide (o no existe),
    // se trata como si no se hubiera indicado en vez de fallar la reserva
    // entera o dejar que se cuele el de otro negocio. Puede haber varios
    // (ej. "corte y mechas" en la misma cita) — se descarta cada id inválido
    // por separado, no toda la lista.
    let verifiedServiceIds: string[] = [];
    let verifiedServicesDurationMinutes = 0;
    if (requestedServiceIds.length > 0) {
      const services = await prisma.service.findMany({
        where: { id: { in: requestedServiceIds }, businessId: business.id, active: true },
        select: { id: true, durationMinutes: true },
      });
      const foundIds = new Set(services.map((s) => s.id));
      for (const id of requestedServiceIds) {
        if (!foundIds.has(id)) {
          console.warn(
            `[VoiceTools] ${callLabel} recibió un serviceId no válido para este negocio (${id}); se ignora`
          );
        }
      }
      verifiedServiceIds = services.map((s) => s.id);
      verifiedServicesDurationMinutes = services.reduce((sum, s) => sum + s.durationMinutes, 0);
    }
    // La suma de duraciones de los servicios verificados manda sobre lo que
    // diga el LLM — evita que una suma mental mal hecha en la conversación
    // desemboque en una cita más corta o más larga de lo real.
    const effectiveDuration = verifiedServiceIds.length > 0 ? verifiedServicesDurationMinutes : durationMinutes || 30;

    const provider =
      business.calendarProvider === "outlook" ? "outlook" : "google";
    const hasCalendarConnection =
      provider === "outlook"
        ? !!business.outlookRefreshToken &&
          business.outlookCalendarConnected !== false
        : !!business.googleRefreshToken &&
          business.googleCalendarConnected !== false;

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
        callId,
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

    const restrictions = checkBookingRestrictions(business, startDateTime, effectiveDuration);
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
    if (professionalId) {
      const professional = await prisma.professional.findFirst({
        where: { id: professionalId, businessId: business.id, active: true },
        select: { id: true },
      });
      if (professional) {
        verifiedProfessionalId = professional.id;
      } else {
        console.warn(
          `[VoiceTools] ${callLabel} recibió un professionalId no válido para este negocio (${professionalId}); se ignora`
        );
      }
    }

    // Resolve professional: use provided one, otherwise pick the first available
    let resolvedProfessionalId = verifiedProfessionalId;
    if (!resolvedProfessionalId) {
      const availability = await checkAvailability({
        businessId: business.id,
        schedule: business.schedule,
        timezone: business.timezone || "Europe/Madrid",
        bookingCapacity: business.bookingCapacity,
        startDateTime,
        durationMinutes: effectiveDuration,
        serviceIds: verifiedServiceIds,
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

      resolvedProfessionalId = availability.availableProfessionals[0]?.id;
    }

    try {
      const result = await calendarService.bookAppointment({
        clientName,
        startDateTime,
        durationMinutes: effectiveDuration,
        clientEmail,
        provider,
        googleRefreshToken: business.googleRefreshToken,
        googleCalendarId: business.googleCalendarId,
        outlookRefreshToken: business.outlookRefreshToken,
        outlookCalendarId: business.outlookCalendarId,
      });

      // Persist booking in database, vinculada a la llamada exacta cuando se
      // conoce su callId (ver resolveCallForBusiness).
      const call = await resolveCallForBusiness(callId, business.id, callLabel);

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
          },
          update: {
            programedAt: new Date(startDateTime),
            durationMinutes: effectiveDuration,
            professionalId: resolvedProfessionalId ?? undefined,
            serviceIds: verifiedServiceIds,
            clientPhone: clientPhone || undefined,
          },
        });
      }

      console.log(`[VoiceTools] ${callLabel} agendó la cita correctamente`);

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
          callId,
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
      const code = e?.name === "CalendarBusinessError" ? e.code : "BOOK_APPOINTMENT_UNEXPECTED_ERROR";
      const baseMessage =
        e?.name === "CalendarBusinessError" && typeof e.message === "string"
          ? e.message
          : "No pude agendar la cita en este momento.";
      console.error(
        `[VoiceTools] ${callLabel} no pudo agendar la cita (${code}): ${errorMessage(error)}`
      );

      const leadId = await capturePendingBookingLead({
        callId,
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
        message: "No pude completar la reserva en este momento. Por favor, indícame tus datos y te confirmaremos en breve.",
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
    case "check_business_hours":
      return executeCheckBusinessHours(business, params, callLabel);
    case "check_availability":
      return executeCheckAvailability(business, params, callLabel);
    case "book_appointment":
      return executeBookAppointment(business, params, callLabel, callId);
    default:
      console.warn(`[VoiceTools] Tool desconocida: ${toolName}`);
      return { success: true };
  }
}
