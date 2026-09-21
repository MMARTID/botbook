import { esLineaDeClientesEspanola } from "./phone.js";

/**
 * Transferencia de la llamada al dueño (PLAN-TELEFONIA-UX.md § 5, fase 4):
 * la pieza que hace real «Alhabla como número principal» (caso E). La
 * recepcionista de Telnyx lleva una tool nativa `transfer` hacia el móvil
 * del dueño y el prompt le dice cuándo usarla según el ajuste «Cuándo
 * pasarme llamadas» (`AgentSettings.pasarLlamadas`).
 *
 * Este módulo decide, a partir de las columnas del negocio, si la tool se
 * registra y hacia qué número. La misma resolución la usan el sync del
 * assistant (lib/telnyxAgentSync.ts), el prompt (lib/managedAgentPrompt.ts)
 * y el PATCH de ajustes, para que nunca se registre la tool sin su regla
 * en el prompt ni al revés.
 */

export const MODOS_DE_TRANSFERENCIA = [
  "nunca",
  "si_lo_pide",
  "siempre",
] as const;

export type ModoDeTransferencia = (typeof MODOS_DE_TRANSFERENCIA)[number];

/** Campos de `Business` que deciden la transferencia. Todos opcionales:
 * los selects parciales de Prisma y los mocks de los tests no siempre los
 * traen, y faltar equivale a «sin transferencia». */
export interface NegocioParaTransferencia {
  customerLineType?: string | null;
  phone?: string | null;
  telnyxPhoneNumber?: string | null;
  ownerWhatsappNumber?: string | null;
  ownerPhoneIsCustomerLine?: boolean | null;
}

export interface TransferenciaAlDueno {
  /** Modo efectivo: el guardado en agentSettings o el de por defecto. */
  modo: ModoDeTransferencia;
  /** Número E.164 al que se pasa la llamada; null si no hay uno válido. */
  destino: string | null;
  /** Número de Alhabla desde el que sale la pata de la transferencia. */
  origen: string | null;
  /** true solo si modo ≠ nunca y hay origen y destino: entonces se registra
   * la tool y el prompt lleva el bloque «## Pasar la llamada». */
  activa: boolean;
}

export function esModoDeTransferencia(
  value: unknown
): value is ModoDeTransferencia {
  return (
    typeof value === "string" &&
    (MODOS_DE_TRANSFERENCIA as readonly string[]).includes(value)
  );
}

/**
 * A qué número se pasa la llamada: el móvil del dueño (`ownerWhatsappNumber`)
 * o, si los avisos van a la propia línea de clientes (caso C), esa línea.
 *
 * Nunca es válido un destino que sea la línea de clientes desviada a
 * Alhabla: con un desvío «si no contesta» la pata saliente volvería a
 * entrar por el número de Alhabla como una segunda llamada (y, como llega
 * desde el propio número de Alhabla, «Comprobar desvío» la tomaría por una
 * comprobación y la colgaría). Con Alhabla como principal `phone` ES el
 * número de Alhabla, así que la regla no estorba en el caso E. Tampoco es
 * válido un destino fuera de España: la pata la paga Alhabla, igual que la
 * llamada de «Comprobar desvío» (esLineaDeClientesEspanola).
 */
export function destinoDeTransferencia(
  negocio: NegocioParaTransferencia
): string | null {
  const candidato =
    negocio.ownerWhatsappNumber ??
    (negocio.ownerPhoneIsCustomerLine ? negocio.phone : null) ??
    null;
  if (!candidato || !esLineaDeClientesEspanola(candidato)) return null;
  if (negocio.telnyxPhoneNumber && candidato === negocio.telnyxPhoneNumber) {
    return null;
  }
  const lineaDesviada =
    negocio.customerLineType !== "alhabla" && negocio.phone
      ? negocio.phone
      : null;
  if (lineaDesviada && candidato === lineaDesviada) return null;
  return candidato;
}

/**
 * Modo si el dueño no ha elegido ninguno: «si el cliente lo pide» cuando el
 * número de Alhabla es el principal y hay a quién pasar la llamada; «nunca»
 * en el resto (con desvío, la recepcionista sigue tomando recado).
 */
export function modoDeTransferenciaPorDefecto(
  negocio: NegocioParaTransferencia
): ModoDeTransferencia {
  return negocio.customerLineType === "alhabla" &&
    destinoDeTransferencia(negocio) !== null
    ? "si_lo_pide"
    : "nunca";
}

export function resolverTransferenciaAlDueno(
  negocio: NegocioParaTransferencia,
  modoGuardado: ModoDeTransferencia | null | undefined
): TransferenciaAlDueno {
  const modo = modoGuardado ?? modoDeTransferenciaPorDefecto(negocio);
  const destino = destinoDeTransferencia(negocio);
  const origen = negocio.telnyxPhoneNumber ?? null;
  return {
    modo,
    destino,
    origen,
    activa: modo !== "nunca" && destino !== null && origen !== null,
  };
}
