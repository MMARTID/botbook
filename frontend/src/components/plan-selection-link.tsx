"use client";

import { useState } from "react";
import { hasAuthToken, savePendingPlan } from "@/lib/billing-navigation";
import { normalizeBusinessType } from "@/lib/business-type";
import type { PlanId } from "@/lib/types";

type PlanSelectionLinkProps = {
  planId: PlanId;
  planName: string;
  featured: boolean;
};

export function PlanSelectionLink({ planId, planName, featured }: PlanSelectionLinkProps) {
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
      className={`mt-8 inline-flex h-12 items-center justify-center rounded-2xl px-5 text-sm font-semibold transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70 ${
        featured
          ? "bg-[#1e2b22] text-white shadow-[0_14px_38px_rgba(16,24,20,0.18)]"
          : "border border-[#d6dfcf] bg-white text-[#344038] hover:bg-[#f4f6f1]"
      }`}
    >
      {navigating ? "Continuando…" : `Elegir ${planName}`}
    </button>
  );
}
