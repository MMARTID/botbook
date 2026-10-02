/**
 * Las citas que el dueño apunta con el Gestor (`añadir_cita`) cuelgan de una
 * fila Call sintética, porque `Booking.callId` es obligatorio. Esa fila no es
 * una conversación con un cliente: no cuenta como llamada ni como chat, no
 * sale en el historial y su cita no es un logro de la recepcionista. Las
 * citas en sí sí son reales y siguen en la agenda.
 */
export const PREFIJO_DE_CALL_DEL_GESTOR = "whatsapp:gestor:";

/** Condición de Prisma sobre `Call`: deja fuera las filas sintéticas del
 * Gestor. Va dentro de un `AND` cuando la consulta ya tiene su propio `NOT`. */
export const SIN_CALLS_DEL_GESTOR = {
  NOT: { callId: { startsWith: PREFIJO_DE_CALL_DEL_GESTOR } },
};

export function esCallDelGestor(callId: string): boolean {
  return callId.startsWith(PREFIJO_DE_CALL_DEL_GESTOR);
}
