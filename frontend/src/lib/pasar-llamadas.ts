import { esLineaDeClientesEspanola } from "@/lib/phone";
import type { Business, ModoDePasarLlamadas } from "@/lib/types";

/**
 * «Cuándo pasarme llamadas» (PLAN-TELEFONIA-UX.md § 5, fase 4): con Alhabla
 * como número principal la recepcionista puede pasar la llamada al móvil
 * del dueño. Espejo del backend (lib/transferenciaAlDueno.ts): el modo
 * guardado en `agentSettings.pasarLlamadas` o, si no hay, «si el cliente lo
 * pide» cuando el número de Alhabla es el principal y hay móvil del dueño,
 * «nunca» en el resto.
 */

export const MODOS_DE_PASAR_LLAMADAS: ReadonlyArray<{
  modo: ModoDePasarLlamadas;
  titulo: string;
  descripcion: string;
}> = [
  {
    modo: "nunca",
    titulo: "Nunca",
    descripcion:
      "Tu recepcionista lo atiende todo: toma recado y te avisa por WhatsApp.",
  },
  {
    modo: "si_lo_pide",
    titulo: "Si el cliente lo pide",
    descripcion:
      "Solo cuando alguien pide hablar contigo. Para quejas o pagos ofrece antes tomar recado.",
  },
  {
    modo: "siempre",
    titulo: "Siempre que sea posible en mi horario",
    descripcion:
      "También si hay una queja, una urgencia o algo de pagos. Fuera de tu horario, recado.",
  },
];

/** Por qué la recepcionista no puede pasar llamadas al móvil guardado. */
export type MotivoSinMovilParaPasarLlamadas = "sin_movil" | "fuera_de_espana";

/**
 * Las mismas condiciones que el backend (`destinoDeTransferencia`): tiene
 * que haber móvil del dueño, no puede ser el propio número de Alhabla y
 * tiene que ser un fijo o móvil de España (la pata la paga Alhabla). Con
 * un móvil extranjero el backend nunca registra la tool, así que la
 * pantalla no puede prometer que pasará llamadas.
 */
export function motivoSinMovilParaPasarLlamadas(
  business: Pick<Business, "ownerWhatsappNumber">,
  numeroDeAlhabla: string | null
): MotivoSinMovilParaPasarLlamadas | null {
  const movil = business.ownerWhatsappNumber ?? null;
  if (movil === null || movil === numeroDeAlhabla) return "sin_movil";
  if (!esLineaDeClientesEspanola(movil)) return "fuera_de_espana";
  return null;
}

/** ¿Hay a quién pasar la llamada? */
export function hayMovilParaPasarLlamadas(
  business: Pick<Business, "ownerWhatsappNumber">,
  numeroDeAlhabla: string | null
): boolean {
  return motivoSinMovilParaPasarLlamadas(business, numeroDeAlhabla) === null;
}

export function modoDePasarLlamadasPorDefecto(
  business: Pick<Business, "customerLineType" | "ownerWhatsappNumber">,
  numeroDeAlhabla: string | null
): ModoDePasarLlamadas {
  return business.customerLineType === "alhabla" &&
    hayMovilParaPasarLlamadas(business, numeroDeAlhabla)
    ? "si_lo_pide"
    : "nunca";
}

/** El modo que está aplicando de verdad la recepcionista. */
export function modoDePasarLlamadas(
  business: Pick<
    Business,
    "customerLineType" | "ownerWhatsappNumber" | "agentSettings"
  >,
  numeroDeAlhabla: string | null
): ModoDePasarLlamadas {
  return (
    business.agentSettings?.pasarLlamadas ??
    modoDePasarLlamadasPorDefecto(business, numeroDeAlhabla)
  );
}

/**
 * ¿La línea de siempre es el propio móvil del dueño (caso C, o B con los
 * avisos al mismo móvil)? Entonces es también el destino de la
 * transferencia y NO puede quedarse desviada al número de Alhabla: la
 * llamada que le pasara la recepcionista volvería a entrar por Alhabla,
 * se tomaría por una comprobación de desvío y el móvil no sonaría nunca.
 */
export function lineaAntiguaEsElMovilDelDueno(
  business: Pick<Business, "ownerWhatsappNumber" | "ownerPhoneIsCustomerLine">,
  lineaAntigua: string | null
): boolean {
  if (lineaAntigua === null) return false;
  return (
    business.ownerPhoneIsCustomerLine === true ||
    lineaAntigua === business.ownerWhatsappNumber
  );
}
