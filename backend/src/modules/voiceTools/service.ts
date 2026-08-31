import { prisma } from "../../lib/prisma.js";
import { getRedis } from "../../lib/redis.js";
import { checkBusinessHours } from "../../lib/businessSchedule.js";
import { checkAvailability } from "../../lib/availability.js";
import { calendarService } from "../calendar/service.js";
import { errorMessage } from "../../lib/logUtils.js";

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
    const result = checkBusinessHours(
      business.schedule,
      business.timezone,
      startDateTime,
      durationMinutes
    );

    return { success: true, result };
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
    const serviceId =
      typeof params?.serviceId === "string" ? params.serviceId : undefined;

    const availability = await checkAvailability({
      businessId: business.id,
      schedule: business.schedule,
      timezone: business.timezone,
      bookingCapacity: business.bookingCapacity,
      startDateTime,
      durationMinutes,
      serviceId,
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
    serviceId?: string;
    professionalId?: string;
  };
  const { clientName, startDateTime, durationMinutes, clientEmail, serviceId, professionalId } = rawParams;

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
      return {
        success: true,
        result: {
          success: false,
          code: reconnectCode,
          message: `El negocio debe reconectar ${providerLabel} antes de agendar citas.`,
        },
      };
    }

    const businessHours = checkBusinessHours(
      business.schedule,
      business.timezone || "Europe/Madrid",
      startDateTime,
      durationMinutes || 30
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

    // Resolve professional: use provided one, otherwise pick the first available
    let resolvedProfessionalId = professionalId;
    if (!resolvedProfessionalId) {
      const availability = await checkAvailability({
        businessId: business.id,
        schedule: business.schedule,
        timezone: business.timezone || "Europe/Madrid",
        bookingCapacity: business.bookingCapacity,
        startDateTime,
        durationMinutes: durationMinutes || 30,
        serviceId: serviceId ?? null,
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
        durationMinutes: durationMinutes || 30,
        clientEmail,
        provider,
        googleRefreshToken: business.googleRefreshToken,
        googleCalendarId: business.googleCalendarId,
        outlookRefreshToken: business.outlookRefreshToken,
        outlookCalendarId: business.outlookCalendarId,
      });

      // Persist booking in database, vinculada a la llamada exacta cuando se
      // conoce su callId. Si no se conoce (o su fila Call aún no existe por
      // una carrera con el webhook call_started) se cae al heurístico de
      // "llamada más reciente del negocio" como red de seguridad.
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
          where: { businessId: business.id },
          orderBy: { startedAt: "desc" },
          select: { id: true },
        });
      }

      if (call) {
        await prisma.booking.upsert({
          where: { callId: call.id },
          create: {
            callId: call.id,
            programedAt: new Date(startDateTime),
            durationMinutes: durationMinutes || 30,
            numberPeople: 1,
            professionalId: resolvedProfessionalId ?? undefined,
            serviceId: serviceId ?? undefined,
          },
          update: {
            programedAt: new Date(startDateTime),
            durationMinutes: durationMinutes || 30,
            professionalId: resolvedProfessionalId ?? undefined,
            serviceId: serviceId ?? undefined,
          },
        });
      }

      console.log(`[VoiceTools] ${callLabel} agendó la cita correctamente`);

      return {
        success: true,
        result: {
          success: true,
          message: "Cita agendada correctamente.",
          eventLink: result.htmlLink,
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

        return {
          success: true,
          result: {
            success: false,
            code: e.code,
            message:
              errorProvider === "outlook"
                ? "No pude acceder al calendario del negocio porque la conexión con Outlook expiró o fue revocada. El negocio debe reconectarlo."
                : "No pude acceder al calendario del negocio porque la conexión con Google expiró o fue revocada. El negocio debe reconectarlo.",
          },
        };
      }

      if (
        e?.name === "CalendarBusinessError" &&
        e?.code === "BOOK_APPOINTMENT_FAILED"
      ) {
        return {
          success: true,
          result: {
            success: false,
            code: "BOOK_APPOINTMENT_FAILED",
            message: "No pude agendar la cita en este momento.",
          },
        };
      }

      console.error(
        `[VoiceTools] ${callLabel} no pudo agendar la cita: ${errorMessage(
          error
        )}`
      );
      return {
        success: false,
        result: {
          success: false,
          error: (error as Error).message,
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
      success: false,
      result: {
        success: false,
        error: (error as Error).message,
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
