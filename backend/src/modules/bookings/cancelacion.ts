import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import { calendarService } from "../calendar/service.js";
import {
  resolverConexionDeCalendario,
  SELECT_CONEXION_DE_CALENDARIO,
} from "../calendar/conexion.js";
import { normalizarProveedorDeCalendario } from "../../adapters/calendar/CalendarProvider.js";
import {
  avisarCancelacion,
  nombreDeServicios,
} from "../whatsapp/avisosNegocio.js";
import { avisarAQuienEsperaba } from "../whatsapp/listaDeEspera.js";

/**
 * Cancelación de una reserva por el cliente, por voz (`cancel_appointment`)
 * o por el botón «Cancelar» del recordatorio (PR 4). Idempotente por
 * `updateMany` condicional: la segunda llamada devuelve `ya_cancelada` sin
 * borrar el evento, sin avisar al dueño (#4) y sin tocar la lista de espera.
 * Los pasos posteriores a la cancelación en BD (evento externo, #4, lista de
 * espera) son best-effort: cada uno con su catch y su log, ninguno lanza.
 * Nuestra BD es la fuente de verdad, como en la cancelación por voz.
 */
export async function cancelarReserva(input: {
  bookingId: string;
  businessId: string;
  cancelledBy: "client_voice" | "client_button";
  /** Para los logs («llamada …», «boton cliente <inboundId>»). */
  etiqueta: string;
  inboundMessageId?: string;
}): Promise<{ resultado: "cancelada" | "ya_cancelada" | "no_encontrada" }> {
  const booking = await prisma.booking.findFirst({
    where: { id: input.bookingId, call: { businessId: input.businessId } },
    select: {
      id: true,
      programedAt: true,
      durationMinutes: true,
      clientName: true,
      serviceIds: true,
      externalEventId: true,
      externalCalendarProvider: true,
      externalCalendarId: true,
    },
  });
  if (!booking) {
    return { resultado: "no_encontrada" };
  }

  const cancelada = await prisma.booking.updateMany({
    where: { id: booking.id, isCancelled: false },
    data: {
      isCancelled: true,
      cancelledAt: new Date(),
      cancelledBy: input.cancelledBy,
    },
  });
  if (cancelada.count === 0) {
    return { resultado: "ya_cancelada" };
  }
  console.log(
    `[Booking] ${input.etiqueta} canceló la cita ${booking.id} del negocio ${input.businessId} (${input.cancelledBy})`
  );

  let business: {
    name: string;
    timezone: string;
    calendarProvider: string | null;
    calendarConnections: unknown;
  } | null = null;
  try {
    business = await prisma.business.findUnique({
      where: { id: input.businessId },
      select: { name: true, timezone: true, ...SELECT_CONEXION_DE_CALENDARIO },
    });
  } catch (error) {
    console.error(
      `[Booking] ${input.etiqueta} canceló la cita ${booking.id} del negocio ${input.businessId} pero no pudo leer el negocio para los pasos posteriores: ${errorMessage(error)}`
    );
  }

  // Evento externo: contra el proveedor y el calendario con los que se creó.
  if (business && booking.externalEventId && booking.externalCalendarProvider) {
    const proveedor = normalizarProveedorDeCalendario(
      booking.externalCalendarProvider
    );
    try {
      await calendarService.cancelAppointment({
        conexion: resolverConexionDeCalendario(
          business as Parameters<typeof resolverConexionDeCalendario>[0],
          { provider: proveedor, calendarId: booking.externalCalendarId }
        ),
        eventId: booking.externalEventId,
      });
    } catch (error) {
      console.error(
        `[Booking] ${input.etiqueta} canceló la cita ${booking.id} del negocio ${input.businessId} pero no pudo borrar el evento ${booking.externalEventId} de ${proveedor}: ${errorMessage(error)}`
      );
    }
  }

  // Aviso #4 al dueño (idempotente por aviso:cancelacion:<bookingId>).
  if (business) {
    try {
      await avisarCancelacion({
        businessId: input.businessId,
        businessName: business.name,
        timezone: business.timezone || "Europe/Madrid",
        bookingId: booking.id,
        clientName: booking.clientName,
        startDateTime: booking.programedAt,
        serviceNames: await nombreDeServicios(booking.serviceIds),
      });
    } catch (error) {
      console.error(
        `[Booking] ${input.etiqueta}: no se pudo avisar al negocio ${input.businessId} de la cancelación de ${booking.id}: ${errorMessage(error)}`
      );
    }
  }

  // Lista de espera: el hueco que se acaba de liberar.
  try {
    await avisarAQuienEsperaba({
      businessId: input.businessId,
      hueco: {
        inicioMs: booking.programedAt.getTime(),
        finMs:
          booking.programedAt.getTime() +
          (booking.durationMinutes || 30) * 60_000,
      },
      origen:
        input.cancelledBy === "client_voice"
          ? "cancelacion_voz"
          : "cancelacion_cliente",
      etiqueta: input.etiqueta,
    });
  } catch (error) {
    console.error(
      `[Booking] ${input.etiqueta}: la lista de espera falló tras cancelar ${booking.id} (negocio ${input.businessId}): ${errorMessage(error)}`
    );
  }

  return { resultado: "cancelada" };
}
