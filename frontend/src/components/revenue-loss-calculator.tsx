"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, CalendarX, Check, Tag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { starterPlan } from "@/lib/plans";
import type { NicheLandingContent } from "@/lib/niche-landings";
import { nicheLinks } from "@/lib/niche-landings";
import { activateRoiContext, getSavedRoiEstimate, saveRoiEstimate } from "@/lib/roi-context";
import { Reveal } from "@/components/scroll-reveal";
import { RangeSlider } from "@/components/range-slider";

const TICKET_MIN = 10;
const TICKET_MAX = 200;
const TICKET_STEP = 5;
const APPOINTMENTS_MIN = 1;
const APPOINTMENTS_MAX = 20;
const WEEKS_PER_MONTH = 4;
const MONTHS_PER_YEAR = 12;

const currencyFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function RevenueLossCalculator({ content, activeNiche }: { content?: NicheLandingContent["calculator"]; activeNiche?: string }) {
  const router = useRouter();
  const [averageTicket, setAverageTicket] = useState(content?.initialTicket ?? 35);
  const [missedAppointmentsPerWeek, setMissedAppointmentsPerWeek] = useState(3);
  const hasHydrated = useRef(false);

  useEffect(() => {
    const saved = getSavedRoiEstimate();
    if (saved) {
      setAverageTicket(saved.averageTicket);
      setMissedAppointmentsPerWeek(saved.missedAppointmentsPerWeek);
    }
    hasHydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hasHydrated.current) return;
    saveRoiEstimate({ averageTicket, missedAppointmentsPerWeek });
  }, [averageTicket, missedAppointmentsPerWeek]);

  const updateAverageTicket = (value: number) => {
    setAverageTicket(clamp(value, TICKET_MIN, TICKET_MAX));
  };

  const updateMissedAppointments = (value: number) => {
    setMissedAppointmentsPerWeek(clamp(value, APPOINTMENTS_MIN, APPOINTMENTS_MAX));
  };

  const openPersonalizedPlans = () => {
    // La cifra que el botón nombra es la que se ve en pantalla, tocada o no.
    // Propagarla siempre evita que /planes reciba un titular genérico después
    // de haber prometido un importe concreto.
    activateRoiContext({ averageTicket, missedAppointmentsPerWeek });
    router.push("/planes");
  };

  const monthlyLoss = missedAppointmentsPerWeek * averageTicket * WEEKS_PER_MONTH;
  const annualLoss = monthlyLoss * MONTHS_PER_YEAR;
  const monthlyMissedAppointments = missedAppointmentsPerWeek * WEEKS_PER_MONTH;
  const appointmentsToCoverPlan = Math.ceil(starterPlan.price / averageTicket);

  return (
    <section id="calculadora" aria-labelledby="revenue-loss-title" className="scroll-m-20 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <span className="badge-soft gap-2">
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            {content?.badge ?? "Calcula tu pérdida real"}
          </span>
          <h2 id="revenue-loss-title" className="mt-4 text-3xl font-black tracking-tight text-[#0a0a0a] sm:text-4xl lg:text-5xl">
            {content?.title ?? "¿Cuánto dinero se queda en llamadas sin atender?"}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#52525b] sm:text-lg">
            {content?.description ?? "Ajusta dos cifras y descubre la oportunidad que puedes estar dejando pasar cada mes."}
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mx-auto mt-10 max-w-6xl">
        <div className="panel grid overflow-hidden p-2 sm:p-3 lg:grid-cols-[0.94fr_1.06fr]">
          <div className="p-5 sm:p-7 lg:p-9">
            <h3 className="text-2xl font-bold tracking-tight text-[#0a0a0a]">Haz una estimación rápida</h3>
            <p className="mt-2 text-sm leading-6 text-[#52525b]">No necesitas datos exactos. Una aproximación basta para ver el impacto.</p>

            <div className="mt-8 space-y-7">
              <RangeSlider
                id="average-ticket"
                icon={Tag}
                label={content?.ticketLabel ?? "Ticket medio por servicio"}
                value={averageTicket}
                min={TICKET_MIN}
                max={TICKET_MAX}
                step={TICKET_STEP}
                onChange={updateAverageTicket}
                ariaValueText={`${averageTicket} euros por servicio`}
                displayValue={currencyFormatter.format(averageTicket)}
                minLabel={currencyFormatter.format(TICKET_MIN)}
                maxLabel={currencyFormatter.format(TICKET_MAX)}
              />

              <RangeSlider
                id="missed-appointments"
                icon={CalendarX}
                label={content?.appointmentsLabel ?? "Citas perdidas por semana"}
                value={missedAppointmentsPerWeek}
                min={APPOINTMENTS_MIN}
                max={APPOINTMENTS_MAX}
                step={1}
                onChange={updateMissedAppointments}
                ariaValueText={`${missedAppointmentsPerWeek} citas perdidas por semana`}
                displayValue={String(missedAppointmentsPerWeek)}
                minLabel={`${APPOINTMENTS_MIN} cita`}
                maxLabel={`${APPOINTMENTS_MAX} citas`}
              />
            </div>
          </div>

          <div className="relative flex min-h-[28rem] flex-col overflow-hidden rounded-[26px] bg-[#0a0a0a] p-6 text-white sm:p-8 lg:p-10">
            <div className="relative flex h-full flex-1 flex-col">
              <p className="text-sm font-semibold text-white/60">Pérdida estimada al mes</p>

              <div className="mt-4 border-b border-white/10 pb-8" aria-live="polite" aria-atomic="true">
                <p className="text-5xl font-black tracking-[-0.03em] text-[#a78bfa] sm:text-6xl lg:text-7xl">
                  {currencyFormatter.format(monthlyLoss)}
                </p>
                <p className="mt-3 text-base leading-7 text-white/65">
                  {currencyFormatter.format(annualLoss)} al año
                </p>
              </div>

              <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm font-semibold leading-6 text-white">
                  Con recuperar solo {appointmentsToCoverPlan} {appointmentsToCoverPlan === 1 ? "cita" : "citas"} al mes, el plan {starterPlan.name} podría cubrirse.
                </p>
                <p className="mt-1 text-sm leading-6 text-white/60">
                  Tu estimación actual es de {monthlyMissedAppointments} citas al mes. El plan {starterPlan.name} cuesta {starterPlan.price} €/mes.
                </p>
              </div>

              <div className="mt-auto pt-8">
                <button type="button" onClick={openPersonalizedPlans} className="btn-purple min-h-12 w-full">
                  Recuperar mis {monthlyLoss.toLocaleString("es-ES")} €
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </button>
                <p className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-white/55">
                  <Check className="h-3.5 w-3.5 text-[#a78bfa]" aria-hidden="true" />
                  Sin permanencia · Configuración guiada
                </p>
              </div>
            </div>
          </div>
        </div>
        </Reveal>

        <p className="mx-auto mt-5 max-w-2xl text-center text-sm leading-6 text-[#71717a]">
          Estimación orientativa basada en 4 semanas al mes. No incluye recurrencia de clientes ni ventas adicionales.
        </p>

        <Reveal delay={0.15} id="soluciones" className="mx-auto mt-8 flex max-w-4xl flex-wrap items-center justify-center gap-2.5">
          {nicheLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition duration-200 ${
                activeNiche && link.href === `/${activeNiche}`
                  ? "border-[#0a0a0a] bg-[#0a0a0a] text-white"
                  : "border-[#e5e5e5] bg-white text-[#3f3f46] hover:border-[#0a0a0a]"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
