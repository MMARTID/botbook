"use client";

import { PhoneForwarded } from "lucide-react";
import type { OnboardingForwarding } from "@/lib/types";

/**
 * «Falta desviar tu teléfono»: el aviso compacto del Panel y de Inicio. Los
 * pasos (códigos, comprobar el desvío) se abren en un diálogo en escritorio
 * y en una hoja en el móvil, en vez de ocupar media pantalla. El `id` es el
 * destino del paso «Desvía tu teléfono» de la guía de configuración.
 */
export function TarjetaDeDesvio({ forwarding, onAbrir }: { forwarding: OnboardingForwarding; onAbrir: () => void }) {
  const esperando = forwarding.status === "waiting_number";
  return (
    <button
      id="desvio"
      type="button"
      onClick={onAbrir}
      className="flex min-h-16 w-full items-center gap-3 rounded-[20px] border border-aviso-borde bg-aviso-fondo py-3.5 pl-4 pr-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-superficie text-aviso-icono" aria-hidden="true">
        <PhoneForwarded className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-aviso">
          {esperando ? "Estamos activando tu número" : "Falta desviar tu teléfono"}
        </span>
        <span className="mt-0.5 block text-[13px] leading-[1.45] text-apagado">
          {esperando ? "En unos minutos podrás desviar tus llamadas." : "Sin desvío no entra ninguna llamada a tu recepcionista."}
        </span>
      </span>
      <span className="shrink-0 text-sm font-bold text-aviso">{esperando ? "Ver" : "Activarlo"}</span>
    </button>
  );
}
