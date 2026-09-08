import { prisma } from "../lib/prisma.js";
import { calendarService } from "../modules/calendar/service.js";
import {
  checkBusinessHours,
  checkBookingRestrictions,
} from "../lib/businessSchedule.js";
import { checkAvailability } from "../lib/availability.js";
import { acquireBookingLock, releaseBookingLock } from "../lib/bookingLock.js";
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

  const call = await prisma.call.findUnique({
    where: { id: lead.callId },
    select: { businessId: true, fromNumber: true },
  });
  if (!call) {
    throw new Error(
      `Call ${lead.callId} no existe; no se puede reintentar la reserva del lead ${leadId}`
    );
  }

  // Un booking ya puede existir para esta llamada — por un reintento anterior
  // de este mismo job que ya tuvo éxito, o porque el cliente siguió al
  // teléfono y logró confirmar (otra hora, quizás) antes de colgar. En
  // cualquiera de los dos casos, sobrescribirlo con los datos DEL LEAD
  // (que reflejan el momento del fallo, no el estado actual) sería el propio
  // bug que este fix corrige: nunca crear un segundo evento para la misma
  // reserva, y nunca pisar una reserva más reciente con una más vieja.
  const startDate = new Date(data_.startDateTime);
  const existingBooking = await prisma.booking.findUnique({
    where: { callId: lead.callId },
    select: { externalEventId: true, programedAt: true, durationMinutes: true },
  });
  if (existingBooking) {
    const sameRequest =
      existingBooking.programedAt.getTime() === startDate.getTime() &&
      existingBooking.durationMinutes === data_.durationMinutes;
    if (sameRequest && existingBooking.externalEventId) {
      console.log(
        `[Job] Lead ${leadId} ya tenía un evento creado para esta reserva exacta; se marca resuelto sin duplicar`
      );
    } else {
      console.log(
        `[Job] Lead ${leadId} descartado: ya existe una reserva distinta (más reciente) para esta llamada`
      );
    }
    await prisma.lead.update({
      where: { id: lead.id },
      data: { resolvedAt: new Date() },
    });
    return;
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
      console.error(
        `[Job] Lead ${leadId} ya no es válido: fuera del horario actual del negocio (${businessHours.code ?? "sin código"})`
      );
      await prisma.lead.update({
        where: { id: lead.id },
        data: { resolvedAt: new Date() },
      });
      return;
    }

    const restrictions = checkBookingRestrictions(
      business,
      data_.startDateTime,
      data_.durationMinutes
    );
    if (!restrictions.success) {
      console.error(
        `[Job] Lead ${leadId} ya no es válido: ${restrictions.code}`
      );
      await prisma.lead.update({
        where: { id: lead.id },
        data: { resolvedAt: new Date() },
      });
      return;
    }

    const availability = await checkAvailability({
      businessId: call.businessId,
      schedule: business.schedule,
      timezone: business.timezone || "Europe/Madrid",
      bookingCapacity: business.bookingCapacity,
      startDateTime: data_.startDateTime,
      durationMinutes: data_.durationMinutes,
      serviceIds: requestedServiceIds,
      professionalId: verifiedProfessionalId,
    });
    if (!availability.available) {
      console.error(
        `[Job] Lead ${leadId} ya no es válido: ${availability.code} (el hueco se ocupó mientras esperaba el reintento)`
      );
      await prisma.lead.update({
        where: { id: lead.id },
        data: { resolvedAt: new Date() },
      });
      return;
    }
    const resolvedProfessionalId =
      verifiedProfessionalId ?? availability.availableProfessionals[0]?.id;

    // Igual que en la reserva en vivo: si el cliente no dio un teléfono
    // distinto, se usa el de la llamada — antes este job lo perdía siempre
    // (solo miraba data_.clientPhone), así que el caso más común (cliente
    // reserva con el mismo número desde el que llama) se quedaba sin
    // teléfono en el evento creado por un reintento.
    const effectiveClientPhone =
      data_.clientPhone ?? call.fromNumber ?? undefined;

    const result = await calendarService.bookAppointment({
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
          clientPhone: data_.clientPhone ?? undefined,
          externalEventId: (result as { id?: string })?.id ?? undefined,
        },
        update: {
          programedAt: startDate,
          durationMinutes: data_.durationMinutes,
          professionalId: resolvedProfessionalId ?? undefined,
          serviceIds: data_.serviceIds ?? [],
          clientPhone: data_.clientPhone ?? undefined,
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
