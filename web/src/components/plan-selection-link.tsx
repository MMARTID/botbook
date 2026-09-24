"use client";

import { useState } from "react";
import { appUrl } from "@/lib/app-url";
import { normalizeBusinessType } from "@/lib/business-type";
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
function describeSelection() {
  return "Si ya tienes cuenta vas directo al pago; si no, la creas. Se pide tarjeta, pero no se cobra nada hasta que termina la prueba.";
}

// Registro abierto (el bloqueo «por invitación» de producción se retiró el
// 2026-09-21).
export function PlanSelectionLink({ planId, planName, featured, preselected = false }: PlanSelectionLinkProps) {
  const [navigating, setNavigating] = useState(false);
  const noteId = `plan-${planId}-nota`;

  const selectPlan = () => {
    setNavigating(true);

    // La web no sabe si hay sesión (vive en app.alhabla.ai): el plan y el
    // sector viajan en la query a /elegir-plan de la app, que decide entre
    // checkout (con sesión) y registro (sin ella).
    const params = new URLSearchParams();
    params.set("plan", planId);
    const niche = new URLSearchParams(window.location.search).get("niche");
    if (niche) {
      params.set("niche", normalizeBusinessType(niche));
    }
    window.location.assign(appUrl(`/elegir-plan?${params.toString()}`));
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
            ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
            : preselected
              ? "bg-[#0a0a0a] text-white hover:bg-[#262626]"
              : "border border-[#0a0a0a] bg-white text-[#0a0a0a] hover:bg-[#fafafa]"
        }`}
      >
        {navigating ? "Continuando…" : `Elegir ${planName}`}
      </button>
      <p id={noteId} className={`mt-3 text-xs leading-5 ${featured ? "text-white/65" : "text-[#52525b]"}`}>
        {describeSelection()}
      </p>
    </>
  );
}
