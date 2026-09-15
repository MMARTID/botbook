"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, Headphones, Scissors, Sparkles, Store } from "lucide-react";
import { motion } from "framer-motion";

import { BrandMark } from "@/components/brand-mark";
import { DemoVoiceCall } from "@/components/demo-voice-call";
import { HeroPulse } from "@/components/hero-pulse";
import { HowItWorksScrollytelling } from "@/components/how-it-works-scrollytelling";
import { MobileNav } from "@/components/mobile-nav";
import { Reveal } from "@/components/scroll-reveal";
import { RevenueLossCalculator } from "@/components/revenue-loss-calculator";
import { SectorDataSection } from "@/components/sector-data-section";
import { generalSectorData } from "@/lib/niche-landings";

const SECTORES = [
  { href: "/peluqueria", title: "Peluquerías", description: "Cortes, color y tratamientos sin soltar el secador.", icon: Scissors },
  { href: "/centro-de-estetica", title: "Estética", description: "Reservas y dudas resueltas mientras estás en cabina.", icon: Sparkles },
  { href: "/barberia", title: "Barberías, uñas y fisioterapia", description: "Una recepción que encaja con tu agenda y tu equipo.", icon: Store },
] as const;

function LandingHeader({ hiddenOnMobile }: { hiddenOnMobile: boolean }) {
  return (
    <motion.header
      animate={{ y: hiddenOnMobile ? -72 : 0, opacity: hiddenOnMobile ? 0 : 1 }}
      transition={{ type: "spring", stiffness: 340, damping: 32, mass: 0.55 }}
      className={`sticky top-0 z-50 overflow-hidden bg-white/90 backdrop-blur-xl transition-[height,border-color] duration-300 ${hiddenOnMobile ? "h-0 border-b border-transparent pointer-events-none" : "h-16 border-b border-[#e5e5e5] lg:h-[4.5rem]"}`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-[4.5rem] lg:px-8">
        <Link href="/landing" aria-label="Ir al inicio de Alhabla" className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
          <span className="text-base font-black tracking-tight text-[#0a0a0a]">Alhabla</span>
        </Link>
        <nav className="hidden items-center gap-5 md:flex" aria-label="Navegación principal">
          <a href="#calculadora" className="text-sm font-medium text-[#3f3f46] transition hover:text-[#0a0a0a]">Calcula tu pérdida</a>
          <a href="#como-funciona" className="text-sm font-medium text-[#3f3f46] transition hover:text-[#0a0a0a]">Cómo funciona</a>
          <a href="#sectores" className="text-sm font-medium text-[#3f3f46] transition hover:text-[#0a0a0a]">Para tu negocio</a>
          <Link href="/login" className="btn-secondary h-10 px-4">Iniciar sesión</Link>
          <Link href="/planes" className="btn-primary h-10 px-4">Empezar ahora</Link>
        </nav>
        <MobileNav variant="main" />
      </div>
    </motion.header>
  );
}

export function MainLanding() {
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const [isNarrativeActive, setIsNarrativeActive] = useState(false);
  const [hideHeaderOnMobile, setHideHeaderOnMobile] = useState(false);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const updateHeader = () => setHideHeaderOnMobile(mobileQuery.matches && isNarrativeActive);

    updateHeader();
    mobileQuery.addEventListener("change", updateHeader);
    return () => {
      mobileQuery.removeEventListener("change", updateHeader);
    };
  }, [isNarrativeActive]);

  return (
    <main id="main-content" className="min-h-screen bg-white text-[#0a0a0a]" data-landing="alhabla" data-landing-variant="principal">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-[#0a0a0a] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white">Saltar al contenido</a>
      <LandingHeader hiddenOnMobile={hideHeaderOnMobile} />

      <section id="contenido" className="border-b border-[#e5e5e5]" tabIndex={-1}>
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:px-8 lg:py-16">
          <div className="max-w-3xl space-y-7">
            <Reveal y={14}>
              <span className="badge-soft">Recepción telefónica para negocios con cita previa</span>
            </Reveal>
            <Reveal delay={0.06} y={16}>
              <h1 className="text-[2.75rem] font-black leading-[1.02] tracking-[-0.045em] text-[#0a0a0a] sm:text-6xl lg:text-[4.6rem]">
                Tu negocio no tiene que parar para atender el teléfono.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[#52525b]">
                Alhabla responde con tu número, consulta tu agenda y confirma citas mientras tu equipo sigue atendiendo.
              </p>
            </Reveal>
            <Reveal delay={0.12} y={16}>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link href="/planes" className="btn-primary h-12 px-6">Probar Alhabla 7 días <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                <button type="button" onClick={() => setIsDemoOpen(true)} className="btn-secondary h-12 px-6"><Headphones className="h-4 w-4" aria-hidden="true" /> Escuchar cómo atiende</button>
              </div>
            </Reveal>
            <Reveal delay={0.18} y={12}>
              <p className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-[#3f3f46]">
                {["Sin cambiar de número", "Google Calendar y Outlook", "Sin permanencia"].map((item) => <span key={item} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-[#8b5cf6]" aria-hidden="true" />{item}</span>)}
              </p>
            </Reveal>
          </div>
          <Reveal delay={0.1} y={18} className="hidden rounded-3xl border border-[#e5e5e5] bg-[#fafafa] px-5 py-8 sm:px-8 lg:block lg:px-10">
            <HeroPulse />
          </Reveal>
        </div>
      </section>

      <RevenueLossCalculator />

      <SectorDataSection data={generalSectorData} />

      <HowItWorksScrollytelling onNarrativeActiveChange={setIsNarrativeActive} />

      <section id="sectores" className="scroll-m-20 border-t border-[#e5e5e5] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><Reveal className="flex max-w-3xl flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-sm font-bold uppercase tracking-[0.14em] text-[#6d28d9]">Hecho para tu ritmo</p><h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Cada negocio tiene su forma de llenar la agenda.</h2></div></Reveal><div className="mt-10 grid gap-4 lg:grid-cols-3">{SECTORES.map(({ href, title, description, icon: Icon }, index) => <Reveal key={href} delay={index * 0.08}><Link href={href} className="group block h-full rounded-3xl border border-[#e5e5e5] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#ddd6fe] hover:shadow-[0_18px_35px_-24px_rgba(109,40,217,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-4"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]"><Icon className="h-5 w-5" aria-hidden="true" /></span><h3 className="mt-7 text-xl font-bold">{title}</h3><p className="mt-3 text-sm leading-6 text-[#52525b]">{description}</p><span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#0a0a0a]">Ver cómo funciona <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" /></span></Link></Reveal>)}</div></div>
      </section>

      <section className="bg-[#0a0a0a] text-white"><Reveal className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 px-4 py-16 sm:px-6 sm:py-20 lg:flex-row lg:items-center lg:px-8"><div><p className="text-sm font-bold uppercase tracking-[0.14em] text-[#a78bfa]">Tu recepción, siempre disponible</p><h2 className="mt-3 max-w-xl text-3xl font-black tracking-tight sm:text-5xl">Prueba qué pasa cuando nadie deja una llamada sin atender.</h2></div><Link href="/planes" className="btn-purple shrink-0">Empezar ahora <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Reveal></section>
      <footer className="bg-[#0a0a0a] text-white/70"><div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"><p className="text-sm">© 2026 Alhabla</p><nav aria-label="Enlaces legales" className="flex flex-wrap items-center gap-x-4 text-sm font-medium"><Link href="/legal/privacidad" className="inline-flex h-11 items-center transition hover:text-white">Privacidad</Link><Link href="/legal/aviso-legal" className="inline-flex h-11 items-center transition hover:text-white">Aviso legal</Link><a href="mailto:hola@alhabla.ai" className="inline-flex h-11 items-center transition hover:text-white">Contacto</a></nav></div></footer>
      <DemoVoiceCall open={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </main>
  );
}
