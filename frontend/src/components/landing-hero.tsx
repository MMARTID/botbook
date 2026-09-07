
"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowRight, Check, Headphones } from "lucide-react";

import { HeroPulse } from "@/components/hero-pulse";
import { DemoVoiceCall } from "@/components/demo-voice-call";
import { Reveal } from "@/components/scroll-reveal";
import type { NicheLandingContent } from "@/lib/niche-landings";

function buildPlansHref(niche?: string) {
  return niche ? `/planes?niche=${encodeURIComponent(niche)}` : "/planes";
}

export function LandingHero({ content }: { content?: NicheLandingContent }) {
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const accent = content?.accent;
  const plansHref = buildPlansHref(content?.slug);

  return (
    <>
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:px-8 lg:py-20">
        <div className="space-y-7 text-center lg:space-y-8 lg:text-left">
          {/*
            El hero no tenía ninguna animación de entrada propia — aparecía de
            golpe mientras el pulso del fondo (ParticleField) y la conversación
            del móvil (con su propio ritmo de ~5s) sí se movían, dando una
            sensación de piezas sueltas. Mismo lenguaje que el resto de la
            página (Reveal, curva [0.22,1,.36,1]), con un stagger rápido para
            que todo el bloque de texto llegue en el mismo aliento que el
            pulso de partículas (~900ms) — la conversación del móvil sigue a
            su propio ritmo después, eso es contenido, no llegada.
          */}
          <Reveal y={14}>
            <span
              className="badge-soft gap-2"
              style={accent ? { backgroundColor: accent.soft, color: accent.strong } : undefined}
            >
              <ArrowDown className="h-3.5 w-3.5" />
              {content?.eyebrow ?? "60% de quienes no logran contactarte no vuelve a intentarlo"}
            </span>
          </Reveal>
          <Reveal delay={0.06} y={16}>
            <div className="space-y-5">
              <h1 className="mx-auto max-w-3xl text-[2.65rem] font-black leading-[1.05] tracking-[-0.03em] text-[#0a0a0a] sm:text-5xl lg:mx-0 lg:text-[4.25rem]">
                {content?.heroTitle ?? "Cada llamada sin contestar es un cliente que ya reservó en otro sitio."}
              </h1>
              <p className="mx-auto max-w-xl text-base leading-7 text-[#52525b] sm:text-lg sm:leading-8 lg:mx-0">
                {content?.heroDescription ?? "Alhabla responde, resuelve dudas y agenda citas 24/7 con tu número de siempre — sin cambiar cómo trabajas."}
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.12} y={16}>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start">
              <button
                type="button"
                onClick={() => setIsDemoOpen(true)}
                className="btn-secondary h-12 w-full px-6 sm:w-auto"
              >
                <Headphones className="h-4 w-4" aria-hidden="true" />
                Escuchar la demo
              </button>
              <Link href={plansHref} className="btn-primary h-12 w-full px-6 sm:w-auto">
                Empezar 7 días gratis
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
          <Reveal delay={0.18} y={12}>
            <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-medium text-[#3f3f46] lg:justify-start">
              {["Sin permanencia", "Mismo número de siempre", "7 días de prueba"].map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-[#8b5cf6]" style={accent ? { color: accent.strong } : undefined} />
                  {item}
                </span>
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.1} y={18} id="demo-llamada" className="scroll-m-24">
          <HeroPulse accent={accent} />
        </Reveal>
      </section>

      {/*
        Ya no se pasa onActiveChange: existía para pausar la conversación
        simulada del hero mientras sonaba la demo. La huella de voz que la
        sustituye se representa una sola vez al entrar en pantalla y no compite
        con el audio, así que no hay nada que pausar.
      */}
      <DemoVoiceCall
        open={isDemoOpen}
        onClose={() => setIsDemoOpen(false)}
        niche={content?.slug}
      />
    </>
  );
}
