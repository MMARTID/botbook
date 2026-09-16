"use client";

import { useState } from "react";
import { useComingSoonBubble } from "@/components/coming-soon-bubble";
import { hasAuthToken, savePendingPlan } from "@/lib/billing-navigation";
import { normalizeBusinessType } from "@/lib/business-type";
import { isProductionBuild } from "@/lib/env";
import type { PlanId } from "@/lib/types";

type PlanSelectionLinkProps = {
  planId: PlanId;
  planName: string;
  featured: boolean;
  preselected?: boolean;
};

// Registro público desactivado en producción mientras se siguen haciendo
// cambios — pero en desarrollo (npm run dev, puerto 3001) navega de verdad,
// para poder probar de punta a punta el flujo de registro/onboarding sin
// tocar este bloqueo cada vez (decisión explícita 2026-09-14).
export function PlanSelectionLink({ planId, planName, featured, preselected = false }: PlanSelectionLinkProps) {
  const [navigating, setNavigating] = useState(false);
  const { openAt, bubble } = useComingSoonBubble();

  const selectPlan = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isProductionBuild()) {
      openAt(event);
      return;
    }

    setNavigating(true);
    savePendingPlan(planId);

    const params = new URLSearchParams();
    params.set("plan", planId);
    const niche = new URLSearchParams(window.location.search).get("niche");
    if (niche) {
      params.set("niche", normalizeBusinessType(niche));
    }

    const target = hasAuthToken() ? `/checkout?${params.toString()}` : `/register?${params.toString()}`;
    window.location.assign(target);
  };

  return (
    <>
      <button
        type="button"
        onClick={selectPlan}
        disabled={navigating}
        className={`mt-8 inline-flex h-12 items-center justify-center rounded-full px-5 text-sm font-semibold transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${
          featured
            ? "bg-[#8b5cf6] text-white hover:bg-[#7c3aed]"
            : preselected
              ? "bg-[#0a0a0a] text-white hover:bg-[#262626]"
              : "border border-[#0a0a0a] bg-white text-[#0a0a0a] hover:bg-[#fafafa]"
        }`}
      >
        {navigating ? "Continuando…" : `Elegir ${planName}`}
      </button>
      {bubble}
    </>
  );
}
