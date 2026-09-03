import { prisma } from "../lib/prisma.js";
import { calendarService } from "../modules/calendar/service.js";
import { RetryFailedBookingJob } from "../lib/jobTypes.js";

interface PendingBookingData {
  clientName: string;
  clientEmail?: string | null;
  startDateTime: string;
  durationMinutes: number;
  serviceId?: string | null;
  professionalId?: string | null;
}

/**
 * Reintenta en segundo plano una reserva que falló durante la llamada (ver
 * capturePendingBookingLead en voiceTools/service.ts) por un fallo probablemente
 * transitorio del calendario. El cliente ya colgó — si el negocio sigue sin
 * reconectar el calendario, lanzamos un error para que Cloud Tasks reintente
 * más tarde en vez de dar la reserva por perdida.
 */
export async function processRetryFailedBookingJob(data: RetryFailedBookingJob): Promise<void> {
  const { leadId } = data;
  console.log(`[Job] Reintentando reserva pendiente del lead ${leadId}`);

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.resolvedAt) {
    console.log(`[Job] Lead ${leadId} ya no existe o ya está resuelto; se descarta el reintento`);
    return;
  }

  const data_ = lead.data as unknown as PendingBookingData;

  const call = await prisma.call.findUnique({
    where: { id: lead.callId },
    select: { businessId: true },
  });
  if (!call) {
    throw new Error(`Call ${lead.callId} no existe; no se puede reintentar la reserva del lead ${leadId}`);
  }

  const business = await prisma.business.findUnique({
    where: { id: call.businessId },
    select: {
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
    throw new Error(`Business ${call.businessId} no existe; no se puede reintentar la reserva del lead ${leadId}`);
  }

  const provider = business.calendarProvider === "outlook" ? "outlook" : "google";
  const hasCalendarConnection =
    provider === "outlook"
      ? !!business.outlookRefreshToken && business.outlookCalendarConnected !== false
      : !!business.googleRefreshToken && business.googleCalendarConnected !== false;

  if (!hasCalendarConnection) {
    // El negocio sigue sin reconectar el calendario: no tiene sentido
    // reintentar de verdad todavía, pero tampoco damos el lead por perdido.
    throw new Error("Calendario todavía desconectado; se reintentará más tarde");
  }

  const result = await calendarService.bookAppointment({
    clientName: data_.clientName,
    startDateTime: data_.startDateTime,
    durationMinutes: data_.durationMinutes,
    clientEmail: data_.clientEmail ?? undefined,
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
        programedAt: new Date(data_.startDateTime),
        durationMinutes: data_.durationMinutes,
        numberPeople: 1,
        professionalId: data_.professionalId ?? undefined,
        serviceId: data_.serviceId ?? undefined,
      },
      update: {
        programedAt: new Date(data_.startDateTime),
        durationMinutes: data_.durationMinutes,
        professionalId: data_.professionalId ?? undefined,
        serviceId: data_.serviceId ?? undefined,
      },
    });
    await tx.lead.update({ where: { id: lead.id }, data: { resolvedAt: new Date() } });
  });

  console.log(
    `[Job] Reserva pendiente confirmada en segundo plano para el lead ${leadId} · evento=${
      (result as { htmlLink?: string })?.htmlLink ?? "n/d"
    }`
  );
}
