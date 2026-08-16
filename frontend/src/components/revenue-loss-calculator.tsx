"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Check, TrendingDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { starterPlan } from "@/lib/plans";
import type { NicheLandingContent } from "@/lib/niche-landings";
import { activateRoiContext, getSavedRoiEstimate, saveRoiEstimate } from "@/lib/roi-context";

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

function sliderBackground(value: number, minimum: number, maximum: number) {
  const progress = ((value - minimum) / (maximum - minimum)) * 100;

  return {
    background: `linear-gradient(to right, #b8d96e 0%, #b8d96e ${progress}%, #dce4d7 ${progress}%, #dce4d7 100%)`,
  };
}

export function RevenueLossCalculator({ content }: { content?: NicheLandingContent["calculator"] }) {
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
    <section id="calculadora" aria-labelledby="revenue-loss-title" className="scroll-m-20 border-y border-white/70 bg-white/35 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="badge-soft gap-2">
            <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
            {content?.badge ?? "Calcula el coste de no responder"}
          </span>
          <h2 id="revenue-loss-title" className="mt-4 text-3xl font-semibold tracking-tight text-[#1e2b22] sm:text-4xl lg:text-5xl">
            {content?.title ?? "¿Cuánto dinero se queda en llamadas sin atender?"}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#54634b] sm:text-lg">
            {content?.description ?? "Ajusta dos cifras y descubre la oportunidad que puedes estar dejando pasar cada mes."}
          </p>
        </div>

        <div className="panel mx-auto mt-10 grid max-w-6xl overflow-hidden p-2 sm:p-3 lg:grid-cols-[0.94fr_1.06fr]">
          <div className="p-5 sm:p-7 lg:p-9">
            <h3 className="text-2xl font-semibold tracking-tight text-[#1e2b22]">Haz una estimación rápida</h3>
            <p className="mt-2 text-sm leading-6 text-[#54634b]">No necesitas datos exactos. Una aproximación basta para ver el impacto.</p>

            <div className="mt-8 space-y-7">
              <div className="rounded-xl border border-[#e2e9dc] bg-[#f8faf5] p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <label htmlFor="average-ticket" className="max-w-[15rem] text-sm font-semibold leading-5 text-[#344038]">
                    {content?.ticketLabel ?? "Ticket medio por servicio"}
                  </label>
                  <output htmlFor="average-ticket" className="shrink-0 text-2xl font-semibold tracking-tight text-[#1e2b22]">
                    {currencyFormatter.format(averageTicket)}
                  </output>
                </div>
                <input
                  id="average-ticket"
                  type="range"
                  min={TICKET_MIN}
                  max={TICKET_MAX}
                  step={TICKET_STEP}
                  value={averageTicket}
                  onChange={(event) => updateAverageTicket(Number(event.target.value))}
                  aria-valuetext={`${averageTicket} euros por servicio`}
                  className="mt-6 h-11 w-full cursor-pointer appearance-none rounded-full bg-transparent accent-[#1e2b22] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#b8d96e]/60 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[#1e2b22] [&::-moz-range-thumb]:shadow-md [&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#1e2b22] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full"
                  style={sliderBackground(averageTicket, TICKET_MIN, TICKET_MAX)}
                />
                <div className="mt-3 flex justify-between text-xs font-medium text-[#54634b]" aria-hidden="true">
                  <span>{currencyFormatter.format(TICKET_MIN)}</span>
                  <span>{currencyFormatter.format(TICKET_MAX)}</span>
                </div>
              </div>

              <div className="rounded-xl border border-[#e2e9dc] bg-[#f8faf5] p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <label htmlFor="missed-appointments" className="max-w-[15rem] text-sm font-semibold leading-5 text-[#344038]">
                    {content?.appointmentsLabel ?? "Citas que podrías perder cada semana"}
                  </label>
                  <output htmlFor="missed-appointments" className="shrink-0 text-2xl font-semibold tracking-tight text-[#1e2b22]">
                    {missedAppointmentsPerWeek}
                  </output>
                </div>
                <input
                  id="missed-appointments"
                  type="range"
                  min={APPOINTMENTS_MIN}
                  max={APPOINTMENTS_MAX}
                  step={1}
                  value={missedAppointmentsPerWeek}
                  onChange={(event) => updateMissedAppointments(Number(event.target.value))}
                  aria-valuetext={`${missedAppointmentsPerWeek} citas perdidas por semana`}
                  className="mt-6 h-11 w-full cursor-pointer appearance-none rounded-full bg-transparent accent-[#1e2b22] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#b8d96e]/60 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[#1e2b22] [&::-moz-range-thumb]:shadow-md [&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#1e2b22] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full"
                  style={sliderBackground(missedAppointmentsPerWeek, APPOINTMENTS_MIN, APPOINTMENTS_MAX)}
                />
                <div className="mt-3 flex justify-between text-xs font-medium text-[#54634b]" aria-hidden="true">
                  <span>{APPOINTMENTS_MIN} cita</span>
                  <span>{APPOINTMENTS_MAX} citas</span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex min-h-[28rem] flex-col overflow-hidden rounded-2xl bg-[#1e2b22] p-6 text-white sm:p-8 lg:p-10">
            <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#b8d96e]/20 blur-[70px]" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-[#5b7441]/25 blur-[80px]" />

            <div className="relative flex h-full flex-1 flex-col">
              <div className="flex items-center gap-3 text-sm font-semibold text-white/75">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-[#b8d96e] ring-1 ring-inset ring-white/10">
                  <TrendingDown className="h-5 w-5" aria-hidden="true" />
                </span>
                Ingresos que podrías estar perdiendo al mes
              </div>

              <div className="mt-8 border-b border-white/10 pb-8" aria-live="polite" aria-atomic="true">
                <p className="text-5xl font-semibold tracking-[-0.04em] text-[#b8d96e] sm:text-6xl lg:text-7xl">
                  {currencyFormatter.format(monthlyLoss)}
                </p>
                <p className="mt-3 text-base leading-7 text-white/65">
                  Eso podría convertirse en <strong className="font-semibold text-white">{currencyFormatter.format(annualLoss)} al año</strong>.
                </p>
              </div>

              <div className="mt-7 rounded-xl border border-[#b8d96e]/20 bg-[#b8d96e]/10 p-5">
                <p className="text-sm font-semibold leading-6 text-white">
                  Con recuperar solo {appointmentsToCoverPlan} {appointmentsToCoverPlan === 1 ? "cita" : "citas"} al mes, el plan {starterPlan.name} podría cubrirse.
                </p>
                <p className="mt-1 text-sm leading-6 text-white/65">
                  Tu estimación actual es de {monthlyMissedAppointments} citas al mes. El plan {starterPlan.name} cuesta {starterPlan.price} €/mes.
                </p>
              </div>

              <div className="mt-auto pt-8">
                <button type="button" onClick={openPersonalizedPlans} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#b8d96e] px-5 py-3 text-center text-sm font-semibold text-[#1e2b22] transition hover:-translate-y-0.5 hover:bg-[#e3ff9e] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#b8d96e]/40">
                  Recuperar mis {monthlyLoss.toLocaleString("es-ES")} € al mes
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </button>
                <p className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-white/55">
                  <Check className="h-3.5 w-3.5 text-[#b8d96e]" aria-hidden="true" />
                  Sin permanencia · Configuración guiada
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="mx-auto mt-5 max-w-2xl text-center text-sm leading-6 text-[#54634b]">
          Estimación orientativa basada en 4 semanas al mes. No incluye recurrencia de clientes ni ventas adicionales.
        </p>
      </div>
    </section>
  );
}
