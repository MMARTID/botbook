import { prisma } from "../../lib/prisma.js";

/**
 * Cambiar una cita por teléfono o por WhatsApp es, para la recepcionista,
 * `cancel_appointment` + `book_appointment`. La cita nueva cuelga de la
 * conversación que la cambió y la vieja queda cancelada en la conversación
 * original, que en el panel se quedaba sin etiqueta como si no hubiera
 * conseguido nada. Tras crear la reserva nueva se busca la que ese mismo
 * cliente acaba de cancelar en esta conversación y se enlaza
 * (`rescheduledToId`): el panel la muestra como «Reserva modificada».
 *
 * Solo enlaza cancelaciones hechas por el cliente en esta misma conversación
 * (desde que empezó la llamada/chat) y del mismo cliente: por teléfono de
 * la reserva o por número desde el que llama. Mejor no enlazar que enlazar
 * la cita de otra persona.
 */
export async function enlazarReservaModificada(params: {
  businessId: string;
  nuevaReservaId: string;
  conversacion: { id: string; startedAt: Date; fromNumber: string | null };
  clientPhone?: string | null;
}): Promise<string | null> {
  const telefonos = [params.clientPhone, params.conversacion.fromNumber].filter(
    (t): t is string => Boolean(t)
  );
  if (telefonos.length === 0) return null;

  const cancelada = await prisma.booking.findFirst({
    where: {
      id: { not: params.nuevaReservaId },
      call: { businessId: params.businessId },
      isCancelled: true,
      cancelledBy: { in: ["client_voice", "client_chat"] },
      cancelledAt: { gte: params.conversacion.startedAt },
      rescheduledToId: null,
      OR: [
        { clientPhone: { in: telefonos } },
        { clientPhone: null, call: { fromNumber: { in: telefonos } } },
      ],
    },
    orderBy: { cancelledAt: "desc" },
    select: { id: true },
  });
  if (!cancelada) return null;

  await prisma.booking.update({
    where: { id: cancelada.id },
    data: { rescheduledToId: params.nuevaReservaId },
  });
  console.log(
    `[Booking] reserva ${cancelada.id} marcada como modificada → ${params.nuevaReservaId} (conversación ${params.conversacion.id})`
  );
  return cancelada.id;
}
