import { prisma } from "../lib/prisma.js";
import { getRedis } from "../lib/redis.js";
import { calendarService } from "../modules/calendar/service.js";
import {
  checkBusinessHours,
  checkBookingRestrictions,
} from "../lib/businessSchedule.js";
import {
  checkAvailability,
  computeAvailabilityLookaheadMs,
} from "../lib/availability.js";
import { acquireBookingLock, releaseBookingLock } from "../lib/bookingLock.js";
import { errorMessage } from "../lib/logUtils.js";
import { RetryFailedBookingJob } from "../lib/jobTypes.js";

interface PendingBookingData {
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  startDateTime: string;
  durationMinutes: number;
  serviceIds?: string[] | null;
  professionalId?: string | null;
}

async function abandonLead(leadId: string, reason: string): Promise<void> {
  console.error(`[Job] Lead ${leadId} ya no es válido: ${reason}`);
  await prisma.lead.update({
    where: { id: leadId },
    data: { resolvedAt: new Date() },
  });
}

/**
 * Reintenta en segundo plano una reserva que falló durante la llamada (ver
 * capturePendingBookingLead en voiceTools/service.ts) por un fallo probablemente
 * transitorio del calendario. El cliente ya colgó — si el negocio sigue sin
 * reconectar el calendario, lanzamos un error para que Cloud Tasks reintente
 * más tarde en vez de dar la reserva por perdida.
 */
export async function processRetryFailedBookingJob(
  data: RetryFailedBookingJob
): Promise<void> {
  const { leadId } = data;
  console.log(`[Job] Reintentando reserva pendiente del lead ${leadId}`);

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.resolvedAt) {
    console.log(
      `[Job] Lead ${leadId} ya no existe o ya está resuelto; se descarta el reintento`
    );
    return;
  }

  const data_ = lead.data as unknown as PendingBookingData;
  const startDate = new Date(data_.startDateTime);

  const call = await prisma.call.findUnique({
    where: { id: lead.callId },
    select: { businessId: true, fromNumber: true },
  });
  if (!call) {
    throw new Error(
      `Call ${lead.callId} no existe; no se puede reintentar la reserva del lead ${leadId}`
    );
  }

  const business = await prisma.business.findUnique({
    where: { id: call.businessId },
    select: {
      schedule: true,
      timezone: true,
      bookingCapacity: true,
      minAdvanceBookingMinutes: true,
      maxAppointmentDurationMinutes: true,
      calendarProvider: true,
      googleRefreshToken: true,
      googleCalendarId: true,
      googleCalendarConnected: true,
      outlookRefreshToken: true,
      outlookCalendarId: true,
      outlookCalendarConnected: true,
    },
  });
  if (!business) {
    throw new Error(
      `Business ${call.businessId} no existe; no se puede reintentar la reserva del lead ${leadId}`
    );
  }

  const provider =
    business.calendarProvider === "outlook" ? "outlook" : "google";
  const hasCalendarConnection =
    provider === "outlook"
      ? !!business.outlookRefreshToken &&
        business.outlookCalendarConnected !== false
      : !!business.googleRefreshToken &&
        business.googleCalendarConnected !== false;

  if (!hasCalendarConnection) {
    // El negocio sigue sin reconectar el calendario: no tiene sentido
    // reintentar de verdad todavía, pero tampoco damos el lead por perdido.
    throw new Error(
      "Calendario todavía desconectado; se reintentará más tarde"
    );
  }

  // Resueltos aparte (no vienen guardados en el Lead) para que el evento de
  // calendario de un reintento en segundo plano quede tan completo como el
  // de una reserva que sale bien a la primera — ver buildEventContent en
  // calendar/service.ts. Filtrados por businessId igual que en
  // voiceTools/service.ts: serviceIds/professionalId en el Lead pueden venir
  // sin verificar (capturePendingBookingLead los guarda tal cual cuando el
  // fallo es por calendario desconectado, antes de que existan las versiones
  // verificadas) — sin este filtro, un id que por lo que sea coincidiera con
  // el de otro negocio filtraría el nombre de SU servicio/profesional al
  // evento de este negocio.
  const requestedServiceIds = data_.serviceIds ?? [];
  let serviceNames: string[] = [];
  if (requestedServiceIds.length > 0) {
    const services = await prisma.service.findMany({
      where: { id: { in: requestedServiceIds }, businessId: call.businessId },
      select: { id: true, name: true },
    });
    const serviceById = new Map(services.map((s) => [s.id, s.name]));
    serviceNames = requestedServiceIds
      .map((id) => serviceById.get(id))
      .filter((n): n is string => Boolean(n));
  }

  let professionalName: string | undefined;
  let verifiedProfessionalId: string | undefined;
  if (data_.professionalId) {
    const professional = await prisma.professional.findFirst({
      where: {
        id: data_.professionalId,
        businessId: call.businessId,
        active: true,
      },
      select: { id: true, name: true },
    });
    professionalName = professional?.name;
    verifiedProfessionalId = professional?.id;
  }

  // Mismo lock por negocio que usa la reserva en vivo (voiceTools/service.ts)
  // — este job puede correr a la vez que una llamada real está reservando
  // para el mismo negocio, y las dos comparten el mismo hueco/capacidad.
  const lockToken = await acquireBookingLock(call.businessId);
  if (!lockToken) {
    throw new Error(
      `No se pudo adquirir el lock de reserva de ${call.businessId}; se reintentará más tarde`
    );
  }

  try {
    // La comprobación de idempotencia tiene que vivir DENTRO de la sección
    // protegida por el lock, no antes de adquirirlo: si se hiciera antes,
    // dos entregas concurrentes de Cloud Tasks para el mismo leadId podrían
    // ambas leer "no existe reserva todavía", serializarse en el lock, y la
    // segunda —que ya no vuelve a comprobar tras conseguirlo— duplicaría el
    // evento de calendario y la notificación al negocio. Un booking ya
    // puede existir para esta llamada por un reintento anterior que tuvo
    // éxito, o porque el cliente siguió al teléfono y logró confirmar (otra
    // hora, quizás) antes de colgar — en ambos casos, sobrescribirlo con los
    // datos DEL LEAD (que reflejan el momento del fallo, no el estado
    // actual) sería el propio bug que este fix corrige.
    const existingBooking = await prisma.booking.findUnique({
      where: { callId: lead.callId },
      select: { externalEventId: true, programedAt: true, durationMinutes: true },
    });
    if (existingBooking) {
      const sameRequest =
        existingBooking.programedAt.getTime() === startDate.getTime() &&
        existingBooking.durationMinutes === data_.durationMinutes;
      if (sameRequest && existingBooking.externalEventId) {
        await abandonLead(
          leadId,
          "ya tenía un evento creado para esta reserva exacta; se marca resuelto sin duplicar"
        );
      } else {
        await abandonLead(
          leadId,
          "descartado: ya existe una reserva distinta (más reciente) para esta llamada"
        );
      }
      return;
    }

    // El fallo original pudo haber sido de calendario, pero entre ese
    // momento y este reintento (a veces minutos u horas más tarde) el
    // horario pudo cambiar, el hueco pudo ocuparse, o la antelación mínima
    // pudo dejar de cumplirse — revalidar aquí es lo que evita confirmar a
    // ciegas una reserva que ya no es válida.
    const businessHours = checkBusinessHours(
      business.schedule,
      business.timezone || "Europe/Madrid",
      data_.startDateTime,
      data_.durationMinutes
    );
    if (!businessHours.success || !businessHours.isOpen) {
      await abandonLead(
        leadId,
        `fuera del horario actual del negocio (${businessHours.code ?? "sin código"})`
      );
      return;
    }

    const restrictions = checkBookingRestrictions(
      business,
      data_.startDateTime,
      data_.durationMinutes
    );
    if (!restrictions.success) {
      await abandonLead(leadId, restrictions.code);
      return;
    }

    // Misma comprobación de ocupación real del calendario que la reserva en
    // vivo (voiceTools/service.ts) — ver hallazgo #5 de la auditoría. Misma
    // ventana exacta que usa checkAvailability internamente
    // (computeAvailabilityLookaheadMs) — un margen fijo anterior (5h) se
    // quedaba corto para cualquier servicio de más de 60 min.
    const externalBusyIntervals = Number.isNaN(startDate.getTime())
      ? []
      : await calendarService.getBusyIntervals({
          provider,
          googleRefreshToken: business.googleRefreshToken,
          googleCalendarId: business.googleCalendarId,
          outlookRefreshToken: business.outlookRefreshToken,
          outlookCalendarId: business.outlookCalendarId,
          timeMin: startDate,
          timeMax: new Date(
            startDate.getTime() + computeAvailabilityLookaheadMs(data_.durationMinutes)
          ),
        });

    const availability = await checkAvailability({
      businessId: call.businessId,
      schedule: business.schedule,
      timezone: business.timezone || "Europe/Madrid",
      bookingCapacity: business.bookingCapacity,
      startDateTime: data_.startDateTime,
      durationMinutes: data_.durationMinutes,
      serviceIds: requestedServiceIds,
      professionalId: verifiedProfessionalId,
      externalBusyIntervals,
    });
    if (!availability.available) {
      await abandonLead(
        leadId,
        `${availability.code} (el hueco se ocupó mientras esperaba el reintento)`
      );
      return;
    }
    const resolvedProfessionalId =
      verifiedProfessionalId ?? availability.availableProfessionals[0]?.id;

    // Igual que en la reserva en vivo: si el cliente no dio un teléfono
    // distinto, se usa el de la llamada.
    const effectiveClientPhone =
      data_.clientPhone ?? call.fromNumber ?? undefined;

    let result: unknown;
    try {
      result = await calendarService.bookAppointment({
        clientName: data_.clientName,
        startDateTime: data_.startDateTime,
        durationMinutes: data_.durationMinutes,
        clientEmail: data_.clientEmail ?? undefined,
        clientPhone: effectiveClientPhone,
        serviceNames,
        professionalName,
        provider,
        googleRefreshToken: business.googleRefreshToken,
        googleCalendarId: business.googleCalendarId,
        outlookRefreshToken: business.outlookRefreshToken,
        outlookCalendarId: business.outlookCalendarId,
      });
    } catch (error) {
      const e = error as { name?: string; code?: string };
      if (
        e?.name === "CalendarBusinessError" &&
        (e?.code === "GOOGLE_CALENDAR_RECONNECT_REQUIRED" ||
          e?.code === "OUTLOOK_CALENDAR_RECONNECT_REQUIRED")
      ) {
        // A diferencia de otros fallos (transitorios, reintentables), este
        // requiere una acción manual del negocio — igual que en la reserva
        // en vivo (voiceTools/service.ts), se marca el calendario como
        // desconectado y se invalida la caché de voz, en vez de dejar que
        // Cloud Tasks siga reintentando contra una conexión que no va a
        // arreglarse sola. Sin este catch, el job simplemente fallaba una y
        // otra vez hasta agotar los reintentos de Cloud Tasks, dejando
        // Business.googleCalendarConnected/outlookCalendarConnected en true
        // (el panel seguía mostrando "conectado") aunque en realidad la
        // conexión llevara horas rota.
        const errorProvider =
          e.code === "OUTLOOK_CALENDAR_RECONNECT_REQUIRED" ? "outlook" : "google";
        try {
          await prisma.business.update({
            where: { id: call.businessId },
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
            `[Job] No se pudo actualizar el estado del calendario de ${call.businessId}: ${errorMessage(dbErr)}`
          );
        }
        try {
          await getRedis().del(`voice_config:${call.businessId}`);
        } catch (redisErr) {
          console.error(
            `[Job] No se pudo invalidar la caché de calendario de ${call.businessId}: ${errorMessage(redisErr)}`
          );
        }
        await abandonLead(
          leadId,
          `conexión de ${errorProvider === "outlook" ? "Outlook" : "Google"} revocada o expirada; requiere reconexión manual`
        );
        return;
      }
      throw error;
    }

    await prisma.$transaction(async (tx) => {
      await tx.booking.upsert({
        where: { callId: lead.callId },
        create: {
          callId: lead.callId,
          programedAt: startDate,
          durationMinutes: data_.durationMinutes,
          numberPeople: 1,
          professionalId: resolvedProfessionalId ?? undefined,
          serviceIds: data_.serviceIds ?? [],
          clientPhone: effectiveClientPhone,
          externalEventId: (result as { id?: string })?.id ?? undefined,
        },
        update: {
          programedAt: startDate,
          durationMinutes: data_.durationMinutes,
          professionalId: resolvedProfessionalId ?? undefined,
          serviceIds: data_.serviceIds ?? [],
          clientPhone: effectiveClientPhone,
          externalEventId: (result as { id?: string })?.id ?? undefined,
        },
      });
      await tx.lead.update({
        where: { id: lead.id },
        data: { resolvedAt: new Date() },
      });
    });

    console.log(
      `[Job] Reserva pendiente confirmada en segundo plano para el lead ${leadId} · evento=${
        (result as { htmlLink?: string })?.htmlLink ?? "n/d"
      }`
    );
  } finally {
    await releaseBookingLock(call.businessId, lockToken);
  }
}
