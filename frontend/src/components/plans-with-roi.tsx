"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, CheckCircle2 } from "lucide-react";
import { PlanSelectionLink } from "@/components/plan-selection-link";
import { formatExtraMinute, formatIncludedMinutes, formatPlanPrice, plans, TRIAL_REASSURANCE, type Plan } from "@/lib/plans";
import { calculatePlanValueContrast, getActiveRoiContext, type RoiEstimate } from "@/lib/roi-context";

const currencyFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function cardClassName({ featured, preselected }: { featured: boolean; preselected: boolean }) {
  const base = "relative flex flex-col rounded-3xl p-6 transition duration-200";

  if (featured) {
    return `${base} bg-[#0a0a0a] ${preselected ? "ring-2 ring-[#a78bfa]" : ""}`;
  }

  if (preselected) {
    return `${base} border border-[#8b5cf6] bg-white ring-2 ring-[#8b5cf6]/25`;
  }

  return `${base} border border-[#e5e5e5] bg-white`;
}

function PlanCard({
  plan,
  estimate,
  preselected,
}: {
  plan: Plan;
  estimate: RoiEstimate | null;
  preselected: boolean;
}) {
  const contrast = estimate ? calculatePlanValueContrast(estimate, plan) : null;
  const isDark = plan.featured;

  return (
    <article className={cardClassName({ featured: plan.featured, preselected })}>
      <div className="flex flex-wrap items-center gap-2">
        {preselected ? (
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
              isDark ? "bg-white/10 text-white" : "bg-[#f3eeff] text-[#6d28d9] ring-1 ring-inset ring-[#ddd6fe]"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> El que has elegido
          </span>
        ) : null}
        {plan.featured ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-[#8b5cf6] px-3 py-1 text-xs font-semibold text-white">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Recomendado
          </span>
        ) : null}
      </div>

      <h2 className={`mt-4 text-2xl font-bold ${isDark ? "text-white" : "text-[#0a0a0a]"}`}>{plan.name}</h2>
      <p className={`mt-3 text-sm leading-6 ${isDark ? "text-white/65" : "text-[#52525b]"}`}>{plan.description}</p>

      <div className="mt-8">
        <p className={`text-5xl font-black tracking-tight ${isDark ? "text-white" : "text-[#0a0a0a]"}`}>
          {formatPlanPrice(plan.price)}
          <span className={`text-base font-medium ${isDark ? "text-white/60" : "text-[#71717a]"}`}>/mes</span>
        </p>
        <p className={`mt-3 text-sm font-semibold ${isDark ? "text-white/90" : "text-[#27272a]"}`}>
          {formatIncludedMinutes(plan.minutes)} minutos incluidos
        </p>
        <p className={`mt-1 text-sm ${isDark ? "text-white/60" : "text-[#52525b]"}`}>{formatExtraMinute(plan.extraPerMinute)}</p>
      </div>

      {/* Contraste de valor: solo aparece cuando la persona viene de la calculadora
          y solo si su propia estimación cubre el plan. Si no lo cubre, callar es
          más honesto que enseñar una resta en contra. */}
      {contrast?.opportunityCoversPlan ? (
        <div className={`mt-6 rounded-2xl p-4 ${isDark ? "border border-white/10 bg-white/5" : "border border-[#ddd6fe] bg-[#f3eeff]"}`}>
          <p className={`text-sm font-semibold leading-6 ${isDark ? "text-white" : "text-[#0a0a0a]"}`}>
            Según tu estimación, recuperarías {currencyFormatter.format(contrast.monthlyOpportunity)} al mes.
          </p>
          <p className={`mt-1 text-sm leading-6 ${isDark ? "text-white/65" : "text-[#52525b]"}`}>
            Este plan cuesta {currencyFormatter.format(contrast.monthlyPlanCost)}: te quedarían{" "}
            <strong className={`font-semibold ${isDark ? "text-[#a78bfa]" : "text-[#7c3aed]"}`}>
              {currencyFormatter.format(contrast.monthlyDifference)} de margen
            </strong>{" "}
            y se cubre con {contrast.appointmentsToCoverPlan}{" "}
            {contrast.appointmentsToCoverPlan === 1 ? "cita" : "citas"} al mes.
          </p>
        </div>
      ) : null}

      <ul className="mt-8 flex-1 space-y-3">
        {plan.features.map((feature) => (
          <li key={feature} className={`flex items-start gap-3 text-sm leading-6 ${isDark ? "text-white/80" : "text-[#27272a]"}`}>
            <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${isDark ? "text-[#a78bfa]" : "text-[#8b5cf6]"}`} aria-hidden="true" /> {feature}
          </li>
        ))}
      </ul>

      <PlanSelectionLink planId={plan.id} planName={plan.name} featured={plan.featured} preselected={preselected} />
    </article>
  );
}

export function PlansWithRoi() {
  const [estimate, setEstimate] = useState<RoiEstimate | null>(null);
  const [preselectedPlanId, setPreselectedPlanId] = useState<string | null>(null);

  useEffect(() => {
    setEstimate(getActiveRoiContext());

    // El plan llega en la URL cuando se ha elegido en la landing. Marcarlo evita
    // que un botón que decía «Elegir Pro» devuelva una pantalla de elección.
    const requested = new URLSearchParams(window.location.search).get("plan");
    if (requested && plans.some((plan) => plan.id === requested)) {
      setPreselectedPlanId(requested);
    }
  }, []);

  return (
    <div>
      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            estimate={estimate}
            preselected={plan.id === preselectedPlanId}
          />
        ))}
      </div>
      <p className="mt-6 text-center text-base font-semibold text-[#0a0a0a]">{TRIAL_REASSURANCE}</p>
    </div>
  );
}
