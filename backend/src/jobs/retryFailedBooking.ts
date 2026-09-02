import { Worker, Job } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { getRedis } from "../lib/redis.js";
import { calendarService } from "../modules/calendar/service.js";
import { RetryFailedBookingJob } from "../lib/queue.js";
import { errorMessage } from "../lib/logUtils.js";

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
 * reconectar el calendario, lanzamos un error para que BullMQ reintente más
 * tarde en vez de dar la reserva por perdida.
 */
export async function processRetryFailedBookingWorker() {
  const redisConnection = getRedis();

  const worker = new Worker<RetryFailedBookingJob, unknown, string>(
    "retry-failed-booking",
    async (job: Job<RetryFailedBookingJob>) => {
      const { leadId } = job.data;
      console.log(`[Job] Reintentando reserva pendiente del lead ${leadId}`);

      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead || lead.resolvedAt) {
        console.log(`[Job] Lead ${leadId} ya no existe o ya está resuelto; se descarta el reintento`);
        return;
      }

      const data = lead.data as unknown as PendingBookingData;

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
        clientName: data.clientName,
        startDateTime: data.startDateTime,
        durationMinutes: data.durationMinutes,
        clientEmail: data.clientEmail ?? undefined,
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
            programedAt: new Date(data.startDateTime),
            durationMinutes: data.durationMinutes,
            numberPeople: 1,
            professionalId: data.professionalId ?? undefined,
            serviceId: data.serviceId ?? undefined,
          },
          update: {
            programedAt: new Date(data.startDateTime),
            durationMinutes: data.durationMinutes,
            professionalId: data.professionalId ?? undefined,
            serviceId: data.serviceId ?? undefined,
          },
        });
        await tx.lead.update({ where: { id: lead.id }, data: { resolvedAt: new Date() } });
      });

      console.log(
        `[Job] Reserva pendiente confirmada en segundo plano para el lead ${leadId} · evento=${
          (result as { htmlLink?: string })?.htmlLink ?? "n/d"
        }`
      );
    },
    {
      connection: redisConnection as any,
      concurrency: 3,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[Job] Reintento de reserva completado: ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`[Job] Reintento de reserva falló: ${job?.id} · ${errorMessage(error)}`);
  });

  return worker;
}
