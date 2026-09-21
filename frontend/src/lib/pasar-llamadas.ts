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

/**
 * ¿Hay a quién pasar la llamada? El móvil del dueño, que no puede ser el
 * propio número de Alhabla. El backend afina más (solo números de España);
 * aquí basta para decidir si se pide el móvil primero.
 */
export function hayMovilParaPasarLlamadas(
  business: Pick<Business, "ownerWhatsappNumber">,
  numeroDeAlhabla: string | null
): boolean {
  const movil = business.ownerWhatsappNumber ?? null;
  return movil !== null && movil !== numeroDeAlhabla;
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
