"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Headphones } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { BrandMark } from "@/components/brand-mark";
import { DemoVoiceCall } from "@/components/demo-voice-call";
import { HeroPulse } from "@/components/hero-pulse";
import { HowItWorksScrollytelling } from "@/components/how-it-works-scrollytelling";
import { MobileNav } from "@/components/mobile-nav";
import { Reveal } from "@/components/scroll-reveal";
import { SectorDataSection } from "@/components/sector-data-section";
import { generalSectorData } from "@/lib/niche-landings";
import { formatIncludedMinutes, formatPlanPrice, plans, TRIAL_REASSURANCE } from "@/lib/plans";

/**
 * Un sector por tarjeta, cada uno con su escena en vídeo (los clips de
 * `public/heroes/`, generados con Seedance bajo la dirección de arte del
 * sistema): la escena real del oficio con las manos ocupadas mientras el
 * teléfono espera. Antes barbería/uñas/fisio compartían tarjeta y solo se
 * enlazaba /barberia — ahora cada landing de nicho tiene su entrada.
 */
const SECTORES = [
  { href: "/peluqueria", title: "Peluquerías", description: "Cortes, color y tratamientos sin soltar el secador.", video: "/heroes/peluqueria.mp4", poster: "/heroes/peluqueria.jpg" },
  { href: "/barberia", title: "Barberías", description: "Degradados y arreglos sin dejar la máquina a medias.", video: "/heroes/barberia.mp4", poster: "/heroes/barberia.jpg" },
  { href: "/salon-de-unas", title: "Salones de uñas", description: "Manicuras sin interrupciones; la agenda se llena sola.", video: "/heroes/salon-de-unas.mp4", poster: "/heroes/salon-de-unas.jpg" },
  { href: "/centro-de-estetica", title: "Centros de estética", description: "Reservas y dudas resueltas mientras estás en cabina.", video: "/heroes/centro-de-estetica.mp4", poster: "/heroes/centro-de-estetica.jpg" },
  { href: "/fisioterapia", title: "Fisioterapia", description: "Las citas entran solas mientras tratas en camilla.", video: "/heroes/fisioterapia.mp4", poster: "/heroes/fisioterapia.jpg" },
] as const;

/** Media de la tarjeta de sector: vídeo mudo en bucle, o su fotograma si el
 * visitante prefiere menos movimiento. `preload="metadata"` mantiene ligera
 * la carga inicial (los 5 clips suman ~3MB pero solo se traen al reproducir). */
function SectorSceneMedia({ video, poster, reducedMotion }: { video: string; poster: string; reducedMotion: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // El atributo autoPlay solo actúa al insertarse el elemento: tras un
  // remontaje (HMR, navegación de vuelta) o un bloqueo puntual del navegador
  // los vídeos quedaban en pausa. Un play() explícito al montar lo cubre;
  // si el navegador lo rechaza, se queda el poster y no pasa nada.
  useEffect(() => {
    if (!reducedMotion) videoRef.current?.play().catch(() => {});
  }, [reducedMotion]);

  return (
    <span className="block overflow-hidden rounded-2xl border border-[#e5e5e5]">
      {reducedMotion ? (
        // eslint-disable-next-line @next/next/no-img-element -- fotograma local
        <img src={poster} alt="" className="aspect-[4/3] w-full object-cover" />
      ) : (
        <video
          ref={videoRef}
          className="aspect-[4/3] w-full object-cover"
          src={video}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
      )}
    </span>
  );
}

// FAQ recortada a las 4 dudas que más frenan una decisión justo antes del
// CTA de cierre — la lista completa (9 preguntas) vive en las landings de
// nicho, donde sí hay intención de búsqueda concreta para justificarla.
const QUICK_FAQS = [
  {
    question: "¿Mantengo mi número de teléfono de siempre?",
    answer: "Sí, completamente. Alhabla atiende mediante un desvío desde tu móvil o fijo habitual; no publicas un número nuevo ni avisas a nadie.",
  },
  {
    question: "¿Es difícil de configurar?",
    answer: "No. Activas el desvío marcando un código rápido en tu teléfono; tarda unos 15 segundos y te guiamos paso a paso para tu operador.",
  },
  {
    question: "¿Hay permanencia?",
    answer: "No. Empiezas con el plan que mejor encaje y lo cambias cuando lo necesites, sin contratos largos.",
  },
  {
    question: "¿Qué pasa si supero los minutos incluidos?",
    answer: "Sin sorpresas: cada plan muestra el coste por minuto adicional antes de contratar.",
  },
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
          <a href="#sectores" className="enlace-nav">Tu negocio</a>
          <a href="#como-funciona" className="enlace-nav">Cómo funciona</a>
          <a href="#precios" className="enlace-nav">Precios</a>
          <a href="#preguntas" className="enlace-nav">Preguntas</a>
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
  const sectorReducedMotion = useReducedMotion() === true;
  const sectorTrackRef = useRef<HTMLDivElement>(null);
  const [sectorFades, setSectorFades] = useState({ izquierda: false, derecha: true });

  // El fundido de cada borde solo aparece cuando hay tarjetas cortadas por
  // ese lado (a scroll cero no hay nada oculto a la izquierda, y al final
  // nada a la derecha).
  const actualizarFundidos = () => {
    const track = sectorTrackRef.current;
    if (!track) return;
    const maximo = track.scrollWidth - track.clientWidth;
    setSectorFades({
      izquierda: track.scrollLeft > 8,
      derecha: track.scrollLeft < maximo - 8,
    });
  };

  useEffect(() => {
    actualizarFundidos();
    window.addEventListener("resize", actualizarFundidos);
    return () => window.removeEventListener("resize", actualizarFundidos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Avanza/retrocede una tarjeta exacta del carrusel de sectores.
  const desplazarSectores = (direccion: 1 | -1) => {
    const track = sectorTrackRef.current;
    if (!track) return;
    const tarjeta = track.querySelector<HTMLElement>("[data-sector-card]");
    const paso = (tarjeta?.offsetWidth ?? 320) + 16;
    track.scrollBy({ left: direccion * paso, behavior: sectorReducedMotion ? "auto" : "smooth" });
  };
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
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-[10px] focus:bg-[#0a0a0a] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white">Saltar al contenido</a>
      <LandingHeader hiddenOnMobile={hideHeaderOnMobile} />

      <section id="contenido" className="border-b border-[#e5e5e5]" tabIndex={-1}>
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:px-8 lg:py-24">
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

      {/*
        Las tarjetas de sector suben justo después del hero: una visitante
        con intención clara (busca "peluquería" o "fisioterapia") se enruta
        a su landing de nicho — con precio y FAQ propios — antes de invertir
        tiempo en el relato genérico. Quien no tiene un sector claro en
        mente simplemente sigue bajando por la página como antes.
      */}
      <section id="sectores" className="scroll-m-20 border-t border-[#e5e5e5] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#6d28d9]">Hecho para tu ritmo</p>
              <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Cada negocio tiene su forma de llenar la agenda.</h2>
            </div>
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              <button type="button" onClick={() => desplazarSectores(-1)} className="calendar-arrow h-11 w-11 rounded-full" aria-label="Sectores anteriores"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
              <button type="button" onClick={() => desplazarSectores(1)} className="calendar-arrow h-11 w-11 rounded-full" aria-label="Sectores siguientes"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
            </div>
          </Reveal>
          {/* Una sola línea: carril con scroll-snap (rueda/arrastre en móvil,
              flechas en escritorio). El grid anterior de 3+2 ocupaba media
              página — feedback directo del usuario. */}
          <div className="relative mt-14 sm:mt-16">
          <div ref={sectorTrackRef} onScroll={actualizarFundidos} className="sector-track" aria-label="Sectores">
            {SECTORES.map(({ href, title, description, video, poster }, index) => (
              <Reveal key={href} delay={index * 0.06} className="h-full snap-start">
                <Link data-sector-card href={href} className="group flex h-full flex-col rounded-3xl border border-[#e5e5e5] p-3 transition duration-300 hover:-translate-y-1 hover:border-[#ddd6fe] hover:shadow-[0_18px_35px_-24px_rgba(109,40,217,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-4">
                  <SectorSceneMedia video={video} poster={poster} reducedMotion={sectorReducedMotion} />
                  <span className="flex min-h-0 flex-1 flex-col px-2 pb-2">
                    <h3 className="mt-4 text-lg font-bold">{title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-[#52525b]">{description}</p>
                    <span className="mt-auto inline-flex items-center gap-2 pt-3 text-sm font-semibold text-[#0a0a0a]">Ver planes y precios <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" /></span>
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
          <span aria-hidden="true" className="sector-fade sector-fade-izquierda" style={{ opacity: sectorFades.izquierda ? 1 : 0 }} />
          <span aria-hidden="true" className="sector-fade sector-fade-derecha" style={{ opacity: sectorFades.derecha ? 1 : 0 }} />
          </div>
        </div>
      </section>

      <HowItWorksScrollytelling onNarrativeActiveChange={setIsNarrativeActive} />

      <SectorDataSection data={generalSectorData} />

      {/* Precio y FAQ compactos aquí mismo: la visitante que llega convencida
          por el relato anterior no tiene que salir de la página para ver un
          número o resolver la duda que la frena justo antes del CTA final. */}
      <section id="precios" className="scroll-m-20 border-t border-[#e5e5e5] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="max-w-2xl">
            <h2 className="text-3xl font-black tracking-tight text-[#0a0a0a] sm:text-4xl">Planes claros, sin permanencia.</h2>
            <p className="mt-4 flex flex-wrap items-center gap-2 text-base font-semibold leading-7 text-[#27272a]">
              <Check className="h-5 w-5 shrink-0 text-[#8b5cf6]" aria-hidden="true" />
              {TRIAL_REASSURANCE}
            </p>
          </Reveal>

          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {plans.map((plan, index) => (
              <Reveal key={plan.id} delay={index * 0.1}>
                <article
                  className={
                    plan.featured
                      ? "relative flex h-full flex-col rounded-3xl bg-white p-7 ring-2 ring-[#8b5cf6]"
                      : "flex h-full flex-col rounded-3xl border border-[#e5e5e5] bg-white p-7"
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-bold text-[#0a0a0a]">{plan.name}</h3>
                    {plan.featured ? <span className="badge-soft">Recomendado</span> : null}
                  </div>
                  <p className="mt-6 text-4xl font-black tracking-tight text-[#0a0a0a]">
                    {formatPlanPrice(plan.price)}
                    <span className="text-base font-medium text-[#71717a]">/mes</span>
                  </p>
                  <p className="mt-3 text-sm font-semibold text-[#27272a]">{formatIncludedMinutes(plan.minutes)} minutos incluidos</p>
                  <p className="mt-2 text-sm leading-7 text-[#52525b]">{plan.summary}</p>
                  <Link href={`/planes?plan=${plan.id}`} className={plan.featured ? "btn-primary mt-6" : "btn-secondary mt-6"}>
                    Elegir {plan.name}
                  </Link>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="preguntas" className="scroll-m-20 border-y border-[#e5e5e5] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="text-3xl font-black tracking-tight text-[#0a0a0a] sm:text-4xl">Resuelve tus dudas antes de empezar.</h2>
          </Reveal>
          <div className="mt-8 grid items-start gap-3 sm:grid-cols-2">
            {QUICK_FAQS.map(({ question, answer }, index) => (
              <Reveal key={question} delay={Math.min(index, 5) * 0.05} y={12}>
                <details className="group rounded-2xl border border-[#e5e5e5] bg-white p-5">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-sm font-semibold leading-6 text-[#0a0a0a] marker:content-none">
                    {question}
                    <span className="mt-1 text-lg leading-none text-[#8b5cf6] transition group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="mt-3 border-t border-[#e5e5e5] pt-3 text-sm leading-6 text-[#52525b]">{answer}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#0a0a0a] text-white"><Reveal className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 px-4 py-16 sm:px-6 sm:py-20 lg:flex-row lg:items-center lg:px-8"><div><p className="text-sm font-bold uppercase tracking-[0.14em] text-[#a78bfa]">Tu recepción, siempre disponible</p><h2 className="mt-3 max-w-xl text-3xl font-black tracking-tight sm:text-5xl">Prueba qué pasa cuando nadie deja una llamada sin atender.</h2></div><Link href="/planes" className="btn-purple shrink-0">Empezar ahora <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Reveal></section>
      <footer className="bg-[#0a0a0a] text-white/70"><div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"><p className="text-sm">© 2026 Alhabla</p><nav aria-label="Enlaces legales" className="flex flex-wrap items-center gap-x-4 text-sm font-medium"><Link href="/legal/privacidad" className="inline-flex h-11 items-center transition hover:text-white">Privacidad</Link><Link href="/legal/aviso-legal" className="inline-flex h-11 items-center transition hover:text-white">Aviso legal</Link><a href="mailto:hola@alhabla.ai" className="inline-flex h-11 items-center transition hover:text-white">Contacto</a></nav></div></footer>
      <DemoVoiceCall open={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </main>
  );
}
