import { getRedis } from "../../lib/redis.js";
import { callLabel, errorMessage } from "../../lib/logUtils.js";

/**
 * Patas de llamada que pasan por el webhook de Telnyx sin tener fila `Call`:
 *
 * - La saliente que abre la tool nativa `transfer` hacia el móvil del dueño
 *   (fase 4 del plan de telefonía). Telnyx la crea en el mismo Call Control
 *   App, con `direction: outgoing` y sin `client_state` propio, así que sus
 *   `call.hangup` y `call.cost` llegan como los de cualquier llamada.
 * - La entrante de «Comprobar desvío», que se cuelga antes de arrancar la
 *   recepcionista (modules/onboarding/comprobacionDesvio.ts) y tampoco
 *   crea `Call`.
 *
 * Sin esta marca, cada transferencia correcta acababa en «no existía en la
 * base de datos», respuesta 404 y un evento en estado `error` que tapaba
 * los fallos de verdad. `call.cost` no trae `from`/`to`, así que no hay
 * forma sin estado de reconocerlo: se apunta el `call_control_id` en Redis
 * al verlo nacer y se consulta al colgar y al recibir el coste.
 */

export type MotivoDePataSinCall = "transferencia" | "comprobacion";

/** El coste puede llegar bastante después del colgado; sobra margen. */
const TTL_SEGUNDOS = 24 * 3600;

function clave(callControlId: string): string {
  return `telnyx:pata_sin_call:${callControlId}`;
}

/** Best-effort: si Redis falla, el colgado de esa pata volverá a dar 404
 * como antes, y se dice en el log con todo el contexto. */
export async function marcarPataSinCall(
  callControlId: string,
  motivo: MotivoDePataSinCall
): Promise<void> {
  try {
    await getRedis().set(clave(callControlId), motivo, "EX", TTL_SEGUNDOS);
  } catch (error) {
    console.error(
      `[Telnyx] No se pudo marcar ${callLabel(callControlId)} como pata propia sin Call (motivo=${motivo}); su colgado y su coste se procesarán como llamada desconocida: ${errorMessage(error)}`
    );
  }
}

/** null si la pata no está marcada (o Redis no responde: se dice en el log). */
export async function motivoDePataSinCall(
  callControlId: string
): Promise<MotivoDePataSinCall | null> {
  try {
    const motivo = await getRedis().get(clave(callControlId));
    return motivo === "transferencia" || motivo === "comprobacion"
      ? motivo
      : null;
  } catch (error) {
    console.error(
      `[Telnyx] No se pudo consultar si ${callLabel(callControlId)} es una pata propia sin Call: ${errorMessage(error)}`
    );
    return null;
  }
}
