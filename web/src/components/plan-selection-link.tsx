"use client";

import { useState } from "react";
import { useComingSoonBubble } from "@/components/coming-soon-bubble";
import { normalizeBusinessType } from "@/lib/business-type";
import { isProductionBuild } from "@/lib/env";
import type { PlanId } from "@/lib/types";

type PlanSelectionLinkProps = {
  planId: PlanId;
  planName: string;
  featured: boolean;
  preselected?: boolean;
};

/**
 * Lo que pasa al pulsar, dicho antes de pulsar. Stripe pide tarjeta en el
 * checkout (`payment_method_collection: "always"`) aunque no cobre hasta que
 * acaba la prueba — mejor saberlo aquí que descubrirlo con la tarjeta en la
 * mano. La duración de la prueba ya la dice la línea bajo las tarjetas
 * (TRIAL_REASSURANCE); no se repite tres veces.
 */
function describeSelection({ production }: { production: boolean }) {
  if (production) return "Registro por invitación mientras terminamos el desarrollo.";
  return "Crea tu cuenta y añade una tarjeta: no se cobra nada hasta que termina la prueba.";
}

// Registro público desactivado en producción mientras se siguen haciendo
// cambios — pero en desarrollo (npm run dev, puerto 3001) navega de verdad,
// para poder probar de punta a punta el flujo de registro/onboarding sin
// tocar este bloqueo cada vez (decisión explícita 2026-09-14).
export function PlanSelectionLink({ planId, planName, featured, preselected = false }: PlanSelectionLinkProps) {
  const [navigating, setNavigating] = useState(false);
  const { openAt, bubble } = useComingSoonBubble();
  const production = isProductionBuild();
  const noteId = `plan-${planId}-nota`;

  const selectPlan = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (production) {
      openAt(event);
      return;
    }

    setNavigating(true);

    // En la web nunca hay sesión (vive en app.alhabla.ai): el plan y el
    // sector viajan en la query hasta el registro y de ahí a la app.
    const params = new URLSearchParams();
    params.set("plan", planId);
    const niche = new URLSearchParams(window.location.search).get("niche");
    if (niche) {
      params.set("niche", normalizeBusinessType(niche));
    }
    window.location.assign(`/register?${params.toString()}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={selectPlan}
        disabled={navigating}
        aria-describedby={noteId}
        className={`mt-8 inline-flex h-12 items-center justify-center rounded-[10px] px-5 text-sm font-semibold transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${
          featured
            ? "bg-[#8b5cf6] text-white hover:bg-[#7c3aed]"
            : preselected
              ? "bg-[#0a0a0a] text-white hover:bg-[#262626]"
              : "border border-[#0a0a0a] bg-white text-[#0a0a0a] hover:bg-[#fafafa]"
        }`}
      >
        {navigating ? "Continuando…" : `Elegir ${planName}`}
      </button>
      <p id={noteId} className={`mt-3 text-xs leading-5 ${featured ? "text-white/65" : "text-[#52525b]"}`}>
        {describeSelection({ production })}
      </p>
      {bubble}
    </>
  );
}
