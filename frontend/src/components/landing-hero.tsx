"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, PhoneCall, Sparkles } from "lucide-react";
import { HeroConversation } from "@/components/hero-conversation";
import { DemoVoiceCall } from "@/components/demo-voice-call";
import type { NicheLandingContent } from "@/lib/niche-landings";

function buildPlansHref(niche?: string) {
  return niche ? `/planes?niche=${encodeURIComponent(niche)}` : "/planes";
}

export function LandingHero({ content }: { content?: NicheLandingContent }) {
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const [isDemoActive, setIsDemoActive] = useState(false);
  const hideDemoHeader = content?.slug === "peluqueria";
  const accent = content?.accent;
  const plansHref = buildPlansHref(content?.slug);

  return (
    <>
      <section className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl items-stretch gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:px-8 lg:py-20">
        <div className="space-y-7 lg:space-y-8">
          <span
            className="badge-soft gap-2"
            style={accent ? { backgroundColor: accent.soft, color: accent.strong } : undefined}
          >
            <Sparkles className="h-3.5 w-3.5" /> {content?.eyebrow ?? "Tu recepción, siempre disponible"}
          </span>
          <div className="space-y-5">
            <h1 className="max-w-3xl text-[2.65rem] font-semibold leading-[1.04] tracking-[-0.045em] text-[#1e2b22] sm:text-5xl lg:text-[4.25rem]">
              {content?.heroTitle ?? "No pierdas otra reserva por no contestar el teléfono"}
            </h1>
            <p className="max-w-xl text-base leading-7 text-[#54634b] sm:text-lg sm:leading-8">
              {content?.heroDescription ?? "AsistAI atiende llamadas, resuelve dudas y agenda citas 24/7 — incluso mientras atiendes a otro cliente."}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => setIsDemoOpen(true)}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#1e2b22] px-6 text-sm font-semibold text-white shadow-[0_16px_38px_rgba(16,24,20,0.22)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#243026] active:translate-y-0 sm:w-auto"
            >
              <PhoneCall className="h-4 w-4 text-[#b8d96e]" />
              Escuchar demo gratuita
              <ArrowRight className="h-4 w-4" />
            </button>
            <Link href={plansHref} className="btn-secondary h-12 w-full px-6 sm:w-auto">
              Ver planes desde 69 €/mes
            </Link>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-[#52604f]">
            {["Sin permanencia", "Empieza hoy mismo", "Sincronizado con tu agenda"].map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4" style={accent ? { color: accent.strong } : undefined} />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div id="demo-llamada" className="panel relative flex h-full flex-col scroll-m-24 overflow-hidden p-4 sm:p-6">
          <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(214,255,114,0.22),transparent_72%)]" />
          <div className="relative flex h-full flex-col space-y-5">
            {hideDemoHeader ? null : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[#687267]"> Casos de prueba</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[#405115] ring-1 ring-inset ring-[#d7e9c5]">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
              </div>
            )}

            <div className="rounded-[1.75rem] border border-white/70 bg-[linear-gradient(160deg,rgba(255,255,255,0.95),rgba(246,248,242,0.92))] p-2 shadow-[0_20px_45px_rgba(16,24,20,0.08)] sm:p-3 flex-1">
              <HeroConversation paused={isDemoActive} conversationsOverride={content?.conversations} />
            </div>
          </div>
        </div>
      </section>

      <DemoVoiceCall
        open={isDemoOpen}
        onClose={() => setIsDemoOpen(false)}
        onActiveChange={setIsDemoActive}
      />
    </>
  );
}
