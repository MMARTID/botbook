"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * "Volver" real: usa el historial del navegador en vez de un destino fijo.
 * Quien llega a /planes desde una landing de nicho o desde /register vuelve
 * ahí, no a /landing — antes se perdía el contexto de nicho/ROI de la
 * calculadora al aterrizar siempre en la genérica. Sin historial (p. ej.
 * entrada directa por URL), cae a `fallbackHref`.
 */
export function BackLink({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
      className="btn-secondary px-4"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Volver
    </button>
  );
}
