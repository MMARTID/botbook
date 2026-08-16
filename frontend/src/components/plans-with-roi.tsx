"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, CheckCircle2 } from "lucide-react";
import { PlanSelectionLink } from "@/components/plan-selection-link";
import { formatExtraMinute, formatIncludedMinutes, formatPlanPrice, plans, type Plan } from "@/lib/plans";
import { calculatePlanValueContrast, getActiveRoiContext, type RoiEstimate } from "@/lib/roi-context";


function GenericPlanCard({ plan }: { plan: Plan }) {
  return (
    <article
      className={`relative flex flex-col rounded-[2rem] border p-6 shadow-sm ${
        plan.featured
          ? "border-[#cfe6b0] bg-[linear-gradient(180deg,#f9fceb_0%,#ffffff_100%)] shadow-[0_22px_55px_rgba(115,146,33,0.16)]"
          : "border-white/70 bg-white/88 backdrop-blur-xl"
      }`}
    >
      {plan.featured ? (
        <div className="absolute right-5 top-5 inline-flex items-center gap-2 rounded-full bg-[#1e2b22] px-3 py-1 text-xs font-semibold text-white">
          <BadgeCheck className="h-3.5 w-3.5 text-[#b8d96e]" /> Recomendado
        </div>
      ) : null}
      <div className="pr-24">
        <h2 className="text-2xl font-semibold text-[#1e2b22]">{plan.name}</h2>
        <p className="mt-3 text-sm leading-6 text-[#54634b]">{plan.description}</p>
      </div>
      <PlanPrice plan={plan} />
      <PlanFeatures plan={plan} />
      <PlanSelectionLink planId={plan.id} planName={plan.name} featured={plan.featured} />
    </article>
  );
}

function PersonalizedPlanCard({ plan, estimate }: { plan: Plan; estimate: RoiEstimate }) {
  calculatePlanValueContrast(estimate, plan); // precompute if needed in future (kept for type-stability)

  return (
    <article
      className={`relative flex flex-col rounded-[2rem] border p-6 shadow-sm ${
        plan.featured
          ? "border-[#bcd98d] bg-[linear-gradient(180deg,#f7fbe7_0%,#ffffff_100%)] shadow-[0_22px_55px_rgba(115,146,33,0.18)]"
          : "border-white/70 bg-white/90 backdrop-blur-xl"
      }`}
    >
      {plan.featured ? (
        <div className="absolute right-5 top-5 inline-flex items-center gap-2 rounded-full bg-[#1e2b22] px-3 py-1 text-xs font-semibold text-white">
          <BadgeCheck className="h-3.5 w-3.5 text-[#b8d96e]" /> Recomendado
        </div>
      ) : null}
      <div className="pr-24">
        <h2 className="text-2xl font-semibold text-[#1e2b22]">{plan.name}</h2>
        <p className="mt-3 text-sm leading-6 text-[#54634b]">{plan.description}</p>
      </div>
      <PlanPrice plan={plan} />



      <PlanFeatures plan={plan} />
      <PlanSelectionLink planId={plan.id} planName={plan.name} featured={plan.featured} />
    </article>
  );
}

function PlanPrice({ plan }: { plan: Plan }) {
  return (
    <div className="mt-8">
      <p className="text-5xl font-semibold tracking-tight text-[#1e2b22]">
        {formatPlanPrice(plan.price)}<span className="text-base font-medium text-[#687267]">/mes</span>
      </p>
      <p className="mt-3 text-sm font-medium text-[#344038]">{formatIncludedMinutes(plan.minutes)} minutos incluidos</p>
      <p className="mt-1 text-sm text-[#687267]">{formatExtraMinute(plan.extraPerMinute)}</p>
    </div>
  );
}

function PlanFeatures({ plan }: { plan: Plan }) {
  return (
    <ul className="mt-8 flex-1 space-y-3">
      {plan.features.map((feature) => (
        <li key={feature} className="flex items-start gap-3 text-sm leading-6 text-[#344038]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2c7334]" /> {feature}
        </li>
      ))}
    </ul>
  );
}

export function PlansWithRoi() {
  const [estimate, setEstimate] = useState<RoiEstimate | null>(null);

  useEffect(() => {
    setEstimate(getActiveRoiContext());
  }, []);

  return (
    <>


      <div className={`grid gap-5 lg:grid-cols-3 ${estimate ? "mt-8" : ""}`}>
        {plans.map((plan) => estimate
          ? <PersonalizedPlanCard key={plan.id} plan={plan} estimate={estimate} />
          : <GenericPlanCard key={plan.id} plan={plan} />)}
      </div>
    </>
  );
}
