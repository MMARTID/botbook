import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { errorMessage } from "../../lib/logUtils.js";
import { isRecordNotFoundError } from "../../lib/prismaErrors.js";
import { calendarService } from "../calendar/service.js";
import {
  registrarBorradoDeEvento,
  ventanaDeLaCita,
} from "../calendar/borradoDeEvento.js";
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

/** Lo que necesitan los pasos posteriores a cancelar (evento externo, #4 y
 * lista de espera). */
const SELECT_CITA_CANCELADA = {
  id: true,
  programedAt: true,
  durationMinutes: true,
  clientName: true,
  serviceIds: true,
  externalEventId: true,
  externalCalendarProvider: true,
  externalCalendarId: true,
} as const satisfies Prisma.BookingSelect;

/**
 * Cancelación de una reserva por el cliente, por voz (`cancel_appointment`)
 * o por el botón «Cancelar» del recordatorio (PR 4). Idempotente por
 * `update` condicional (`isCancelled: false` en el where): la segunda llamada
 * devuelve `ya_cancelada` sin borrar el evento, sin avisar al dueño (#4) y
 * sin tocar la lista de espera.
 * Los pasos posteriores a la cancelación en BD (evento externo, #4, lista de
 * espera) son best-effort: cada uno con su catch y su log, ninguno lanza.
 * Nuestra BD es la fuente de verdad, como en la cancelación por voz.
 */
export async function cancelarReserva(input: {
  bookingId: string;
  businessId: string;
  /** `client_chat`: la recepcionista por chat de WhatsApp (fase 2);
   * `owner_chat`: el dueño desde el Gestor (fase 2 / PR 4); `owner_panel`:
   * el dueño desde la agenda del panel. El dueño no recibe el aviso #4 de
   * su propia cancelación. */
  cancelledBy:
    | "client_voice"
    | "client_button"
    | "client_chat"
    | "owner_chat"
    | "owner_panel";
  /** Para los logs («llamada …», «boton cliente <inboundId>»). */
  etiqueta: string;
  inboundMessageId?: string;
}): Promise<{ resultado: "cancelada" | "ya_cancelada" | "no_encontrada" }> {
  const existe = await prisma.booking.findFirst({
    where: { id: input.bookingId, call: { businessId: input.businessId } },
    select: { id: true },
  });
  if (!existe) {
    return { resultado: "no_encontrada" };
  }

  // Cancelar y leer en la MISMA sentencia (UPDATE … WHERE isCancelled = false
  // RETURNING): el evento que hay que borrar y la hora son los del momento
  // exacto de cancelar.
  // - Leídos antes, un moverReserva que entrara entre la lectura y la
  //   cancelación dejaría la cita cancelada apuntando al evento nuevo y aquí
  //   se borraría el viejo: el nuevo seguiría avisando al dueño de una cita
  //   cancelada. Quien mueve el puntero solo lo hace si la cita sigue viva
  //   (filtra por isCancelled: false), así que tras esta sentencia nadie
  //   puede moverlo.
  // - Leídos después, en otra consulta, una reactivación (book_appointment
  //   que cambia de hora en la misma conversación, el reintento de una
  //   reserva fallida…) que entrara entre medias dejaría leer el evento NUEVO
  //   de una cita que vuelve a estar activa: se borraría, y el #4 y la lista
  //   de espera saldrían con la hora nueva.
  let booking: Prisma.BookingGetPayload<{
    select: typeof SELECT_CITA_CANCELADA;
  }>;
  try {
    booking = await prisma.booking.update({
      where: { id: existe.id, isCancelled: false },
      data: {
        isCancelled: true,
        cancelledAt: new Date(),
        cancelledBy: input.cancelledBy,
      },
      select: SELECT_CITA_CANCELADA,
    });
  } catch (error) {
    // P2025: ya estaba cancelada (o se borró entre medias), así que esta
    // llamada no hace nada más: ni evento, ni #4, ni lista de espera.
    if (isRecordNotFoundError(error)) {
      return { resultado: "ya_cancelada" };
    }
    throw error;
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
      const borrado = await calendarService.cancelAppointment({
        conexion: resolverConexionDeCalendario(
          business as Parameters<typeof resolverConexionDeCalendario>[0],
          { provider: proveedor, calendarId: booking.externalCalendarId }
        ),
        eventId: booking.externalEventId,
        ventana: ventanaDeLaCita(booking.programedAt, booking.durationMinutes),
      });
      registrarBorradoDeEvento({
        prefijo: "[Booking]",
        etiqueta: input.etiqueta,
        businessId: input.businessId,
        bookingId: booking.id,
        proveedor,
        eventId: booking.externalEventId,
        resultado: borrado,
      });
    } catch (error) {
      console.error(
        `[Booking] ${input.etiqueta} canceló la cita ${booking.id} del negocio ${input.businessId} pero no pudo borrar el evento ${booking.externalEventId} de ${proveedor}: ${errorMessage(error)}`
      );
    }
  }

  // Aviso #4 al dueño (idempotente por aviso:cancelacion:<bookingId>). No
  // cuando cancela él mismo desde el chat o el panel: ya lo sabe.
  const cancelaElDueno =
    input.cancelledBy === "owner_chat" || input.cancelledBy === "owner_panel";
  if (business && !cancelaElDueno) {
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
          : cancelaElDueno
            ? "cancelacion_dueno"
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
