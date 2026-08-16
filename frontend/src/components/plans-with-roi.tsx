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
  const base = "relative flex flex-col rounded-xl border p-6 transition duration-200";

  if (preselected) {
    return `${base} border-[#9dbb55] bg-white ring-2 ring-[#b8d96e]/45 shadow-[0_8px_24px_rgba(30,43,34,0.06)]`;
  }

  if (featured) {
    return `${base} border-[#cfe6b0] bg-[linear-gradient(180deg,#f9fceb_0%,#ffffff_100%)] shadow-[0_8px_24px_rgba(30,43,34,0.06)]`;
  }

  return `${base} border-white/70 bg-white/88 shadow-[0_4px_16px_rgba(30,43,34,0.04)] backdrop-blur-xl`;
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

  return (
    <article className={cardClassName({ featured: plan.featured, preselected })}>
      <div className="flex flex-wrap items-center gap-2">
        {preselected ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-[#eef6dc] px-3 py-1 text-xs font-semibold text-[#405115] ring-1 ring-inset ring-[#d7e9c5]">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> El que has elegido
          </span>
        ) : null}
        {plan.featured ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-[#1e2b22] px-3 py-1 text-xs font-semibold text-white">
            <BadgeCheck className="h-3.5 w-3.5 text-[#b8d96e]" aria-hidden="true" /> Recomendado
          </span>
        ) : null}
      </div>

      <h2 className="mt-4 text-2xl font-semibold text-[#1e2b22]">{plan.name}</h2>
      <p className="mt-3 text-sm leading-6 text-[#54634b]">{plan.description}</p>

      <div className="mt-8">
        <p className="text-5xl font-semibold tracking-tight text-[#1e2b22]">
          {formatPlanPrice(plan.price)}
          <span className="text-base font-medium text-[#54634b]">/mes</span>
        </p>
        <p className="mt-3 text-sm font-medium text-[#344038]">{formatIncludedMinutes(plan.minutes)} minutos incluidos</p>
        <p className="mt-1 text-sm text-[#54634b]">{formatExtraMinute(plan.extraPerMinute)}</p>
      </div>

      {/* Contraste de valor: solo aparece cuando la persona viene de la calculadora
          y solo si su propia estimación cubre el plan. Si no lo cubre, callar es
          más honesto que enseñar una resta en contra. */}
      {contrast?.opportunityCoversPlan ? (
        <div className="mt-6 rounded-lg border border-[#d7e9c5] bg-[#f7fbee] p-4">
          <p className="text-sm font-semibold leading-6 text-[#1e2b22]">
            Según tu estimación, recuperarías {currencyFormatter.format(contrast.monthlyOpportunity)} al mes.
          </p>
          <p className="mt-1 text-sm leading-6 text-[#54634b]">
            Este plan cuesta {currencyFormatter.format(contrast.monthlyPlanCost)}: te quedarían{" "}
            <strong className="font-semibold text-[#2c7334]">
              {currencyFormatter.format(contrast.monthlyDifference)} de margen
            </strong>{" "}
            y se cubre con {contrast.appointmentsToCoverPlan}{" "}
            {contrast.appointmentsToCoverPlan === 1 ? "cita" : "citas"} al mes.
          </p>
        </div>
      ) : null}

      <ul className="mt-8 flex-1 space-y-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3 text-sm leading-6 text-[#344038]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2c7334]" aria-hidden="true" /> {feature}
          </li>
        ))}
      </ul>

      <PlanSelectionLink planId={plan.id} planName={plan.name} featured={plan.featured || preselected} />
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
      <p className="mt-6 text-center text-base font-semibold text-[#2c7334]">{TRIAL_REASSURANCE}</p>
    </div>
  );
}
