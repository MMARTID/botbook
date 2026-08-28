"use client";

import { useState } from "react";
import { hasAuthToken, savePendingPlan } from "@/lib/billing-navigation";
import { normalizeBusinessType } from "@/lib/business-type";
import type { PlanId } from "@/lib/types";

type PlanSelectionLinkProps = {
  planId: PlanId;
  planName: string;
  featured: boolean;
  preselected?: boolean;
};

export function PlanSelectionLink({ planId, planName, featured, preselected = false }: PlanSelectionLinkProps) {
  const [navigating, setNavigating] = useState(false);

  const selectPlan = () => {
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
    <button
      type="button"
      onClick={selectPlan}
      disabled={navigating}
      className={`mt-8 inline-flex h-12 items-center justify-center rounded-full px-5 text-sm font-semibold transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70 ${
        featured
          ? "bg-[#8b5cf6] text-white hover:bg-[#7c3aed]"
          : preselected
            ? "bg-[#0a0a0a] text-white hover:bg-[#262626]"
            : "border border-[#0a0a0a] bg-white text-[#0a0a0a] hover:bg-[#fafafa]"
      }`}
    >
      {navigating ? "Continuando…" : `Elegir ${planName}`}
    </button>
  );
}
