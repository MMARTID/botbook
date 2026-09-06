"use client";

import { ArrowRight, CalendarCheck2, Check, PhoneCall, PhoneForwarded, Volume2 } from "lucide-react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { NicheAccent } from "@/lib/niche-landings";

type FlowStage = "complete" | "dialing" | "forwarded" | "answering" | "booked";

const DIAL_CODE = ["*", "*", "6", "1", "*", "·", "·", "#"];

/**
 * Una demostración de producto, no un adorno: explica el único cambio que
 * pide Alhabla al negocio (el desvío) y lo enlaza con el resultado que compra
 * (la cita en agenda). El código es deliberadamente ilustrativo: depende de
 * cada operadora y no debe confundirse con una instrucción de activación.
 */
export function CallForwardingFlow({ accent }: { accent?: NicheAccent }) {
  const ref = useRef<HTMLElement | null>(null);
  const isInView = useInView(ref, { once: true, amount: 0.35 });
  const reducedMotion = useReducedMotion() === true;
  const [stage, setStage] = useState<FlowStage>("complete");
  const [run, setRun] = useState(0);

  const accentStrong = accent?.strong ?? "#8b5cf6";
  const accentSoft = accent?.soft ?? "#f3eeff";
  const accentDeep = accent?.deep ?? "#6d28d9";
  // El fotograma final es también el fallback sin JavaScript y la alternativa
  // de movimiento reducido: el recorrido nunca depende de una animación para
  // entenderse.
  const isStaticComplete = reducedMotion || stage === "complete";
  const hasForwarded = isStaticComplete || stage === "forwarded" || stage === "answering" || stage === "booked";
  const hasAnswered = isStaticComplete || stage === "answering" || stage === "booked";
  const hasBooked = isStaticComplete || stage === "booked";

  useEffect(() => {
    if (reducedMotion) {
      setStage("complete");
      return;
    }

    // Algunos WebViews de prueba no exponen IntersectionObserver. En ese caso
    // se reproduce una vez al montar; en navegadores reales espera a entrar en
    // pantalla. Así la escena sigue siendo progresiva y verificable.
    const canObserveViewport = typeof window !== "undefined" && typeof window.IntersectionObserver !== "undefined";
    if (!isInView && canObserveViewport) {
      return;
    }

    setStage("dialing");
    const forwardTimer = window.setTimeout(() => setStage("forwarded"), 1500);
    const answerTimer = window.setTimeout(() => setStage("answering"), 2750);
    const bookingTimer = window.setTimeout(() => setStage("booked"), 4350);

    return () => {
      window.clearTimeout(forwardTimer);
      window.clearTimeout(answerTimer);
      window.clearTimeout(bookingTimer);
    };
  }, [isInView, reducedMotion, run]);

  const replay = () => {
    if (reducedMotion) return;
    setRun((current) => current + 1);
  };

  return (
    <section
      ref={ref}
      aria-label="Demostración visual del desvío de llamadas hasta la cita confirmada"
      className="overflow-hidden rounded-3xl border border-[#e5e5e5] bg-[#fafafa]"
    >
      <div className="flex items-start justify-between gap-4 border-b border-[#e5e5e5] bg-white px-5 py-4 sm:px-6">
        <div>
          <p className="text-sm font-bold text-[#0a0a0a]">Un recorrido, sin cambiar tu número</p>
          <p className="mt-1 text-xs leading-5 text-[#52525b]">El desvío solo entra cuando no puedes responder.</p>
        </div>
        {!reducedMotion ? (
          <button
            type="button"
            onClick={replay}
            className="shrink-0 rounded-full border border-[#e5e5e5] bg-white px-3 py-2 text-xs font-semibold text-[#3f3f46] transition hover:border-[#0a0a0a] hover:text-[#0a0a0a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
          >
            Reproducir
          </button>
        ) : null}
      </div>

      <div className="grid items-center gap-3 p-4 sm:gap-4 sm:p-6 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: accentSoft, color: accentStrong }}>
              <PhoneCall className="h-4 w-4" aria-hidden="true" />
            </span>
            <motion.span
              className="rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{ backgroundColor: accentSoft, color: accentDeep }}
              animate={stage === "dialing" ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={{ duration: 0.45 }}
            >
              Tu número
            </motion.span>
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#71717a]">Desvío condicional</p>
          <div className="mt-2 flex min-h-11 items-center rounded-xl bg-[#0a0a0a] px-3 font-mono text-lg font-bold tracking-[0.16em] text-white">
            {DIAL_CODE.map((digit, index) => (
              <motion.span
                key={`${digit}-${index}-${run}`}
                className="inline-block"
                animate={stage === "dialing" ? { color: ["#a1a1aa", accentStrong, "#ffffff"], y: [0, -3, 0] } : { color: "#ffffff", y: 0 }}
                transition={{ duration: 0.38, delay: stage === "dialing" ? index * 0.11 : 0 }}
              >
                {digit}
              </motion.span>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[#52525b]">
            <PhoneForwarded className="h-3.5 w-3.5" style={{ color: accentStrong }} aria-hidden="true" />
            {hasForwarded ? "Desvío activado" : "Marcado en segundos"}
          </p>
        </div>

        <div className="flex justify-center lg:block" aria-hidden="true">
          <motion.div
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#52525b] lg:h-9 lg:w-9"
            animate={hasForwarded ? { x: [0, 3, 0], color: accentStrong, borderColor: accentStrong } : { x: 0 }}
            transition={{ duration: 0.45 }}
          >
            <ArrowRight className="h-4 w-4 rotate-90 lg:rotate-0" />
          </motion.div>
        </div>

        <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: accentSoft, color: accentStrong }}>
              <Volume2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-xs font-bold" style={{ color: accentDeep }}>Alhabla</span>
          </div>
          <p className="mt-4 text-sm font-bold text-[#0a0a0a]">Atiende como en casa</p>
          <div className="mt-3 flex h-11 items-center gap-1.5 rounded-xl px-3" style={{ backgroundColor: accentSoft }} aria-hidden="true">
            {[0.55, 0.9, 0.72, 1, 0.62].map((height, index) => (
              <motion.span
                key={index}
                className="w-1.5 rounded-full"
                style={{ backgroundColor: accentStrong }}
                animate={hasAnswered ? { height: [`${height * 14}px`, `${height * 28}px`, `${height * 14}px`] } : { height: `${height * 14}px` }}
                transition={{ duration: 0.5, delay: hasAnswered ? index * 0.05 : 0 }}
              />
            ))}
            <span className="ml-2 text-xs font-semibold" style={{ color: accentDeep }}>
              {hasAnswered ? "Comprueba disponibilidad" : "Lista para atender"}
            </span>
          </div>
          <p className="mt-3 text-xs font-medium text-[#52525b]">Servicios, horarios y huecos reales.</p>
        </div>

        <div className="flex justify-center lg:block" aria-hidden="true">
          <motion.div
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#52525b] lg:h-9 lg:w-9"
            animate={hasBooked ? { x: [0, 3, 0], color: accentStrong, borderColor: accentStrong } : { x: 0 }}
            transition={{ duration: 0.45 }}
          >
            <ArrowRight className="h-4 w-4 rotate-90 lg:rotate-0" />
          </motion.div>
        </div>

        <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: accentSoft, color: accentStrong }}>
              <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-xs font-bold text-[#3f3f46]">Tu agenda</span>
          </div>
          <div className="mt-4 space-y-2 text-xs font-semibold">
            <div className="flex items-center justify-between rounded-lg bg-[#fafafa] px-2.5 py-2 text-[#71717a]">
              <span>16:30</span><span>Ocupado</span>
            </div>
            <motion.div
              className="flex items-center justify-between rounded-lg px-2.5 py-2"
              animate={hasBooked ? { backgroundColor: accentSoft, color: accentDeep } : { backgroundColor: "#fafafa", color: "#71717a" }}
              transition={{ duration: 0.35 }}
            >
              <span>17:00</span>
              <span className="flex items-center gap-1">
                {hasBooked ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                {hasBooked ? "Cita confirmada" : "Disponible"}
              </span>
            </motion.div>
          </div>
          <p className="mt-3 text-xs font-medium text-[#52525b]">La cita queda guardada al colgar.</p>
        </div>
      </div>

      <p className="border-t border-[#e5e5e5] bg-white px-5 py-3 text-xs leading-5 text-[#71717a] sm:px-6">
        Demostración visual: el código exacto de desvío depende de tu operadora; Alhabla te guía al configurarlo.
      </p>
      <p className="sr-only">
        El recorrido ilustra un código de desvío condicional, una llamada atendida por Alhabla y una cita confirmada a las 17:00 en la agenda.
      </p>
    </section>
  );
}
