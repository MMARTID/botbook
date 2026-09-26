"use client";

import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { useRef, useState } from "react";
import { ArrowRight, Check, Headphones } from "lucide-react";

import { DemoVoiceCall } from "@/components/demo-voice-call";
import { HeroHilos } from "@/components/hero-hilos";
import { SiteHeader } from "@/components/site-header";
import { Reveal } from "@/components/scroll-reveal";
import { RelatoSection } from "@/components/relato-section";
import { HOME_QUICK_FAQS } from "@/lib/home-faqs";
import { formatExtraMinute, formatIncludedMinutes, formatPlanPrice, plans, TRIAL_REASSURANCE } from "@/lib/plans";

/**
 * Un sector por tarjeta, cada uno con su foto de `public/heroes/`: la escena
 * real del oficio con las manos ocupadas mientras el teléfono espera. Antes
 * barbería/uñas/fisio compartían tarjeta y solo se enlazaba /barberia —
 * ahora cada landing de nicho tiene su entrada.
 *
 * Eran clips de vídeo hasta el 2026-09-24: se retiraron por calidad (los
 * generó Seedance) y se sustituyeron por fotos del banco de imágenes.
 */
const SECTORES = [
  { href: "/peluqueria", title: "Peluquerías", description: "Cortes, color y tratamientos sin soltar el secador.", imagen: "/heroes/peluqueria.jpg" },
  { href: "/barberia", title: "Barberías", description: "Degradados y arreglos sin dejar la máquina a medias.", imagen: "/heroes/barberia.jpg" },
  { href: "/salon-de-unas", title: "Salones de uñas", description: "Manicuras sin interrupciones; la agenda se llena sola.", imagen: "/heroes/salon-de-unas.jpg" },
  { href: "/centro-de-estetica", title: "Centros de estética", description: "Reservas y dudas resueltas mientras estás en cabina.", imagen: "/heroes/centro-de-estetica.jpg" },
  { href: "/fisioterapia", title: "Fisioterapia", description: "Las citas entran solas mientras tratas en camilla.", imagen: "/heroes/fisioterapia.jpg" },
] as const;

/**
 * Escritorio: acordeón horizontal. Los cinco sectores comparten una sola
 * fila de rejilla, y al pasar el ratón (o al enfocar con el teclado) el
 * activo se lleva la mayor parte del ancho mientras el resto se estrecha.
 *
 * La animación va sobre `grid-template-columns`, no sobre el ancho de cada
 * panel: la fila reparte SIEMPRE el 100% del espacio, así que al crecer uno
 * los demás ceden en el mismo fotograma y no puede abrirse ningún hueco —
 * que es justo lo que pasaba con la tarjeta destacada anterior, que crecía
 * por su cuenta empujando al resto.
 *
 * Las proporciones están calculadas para que el panel abierto enseñe la foto
 * ENTERA: a la altura de la fila, un 3:2 necesita ~1,5 veces esa altura de
 * ancho, y con 4,4fr contra 1fr el activo se lleva ese ancho en una fila de
 * escritorio. Los cerrados quedan en una franja estrecha con el nombre en
 * vertical, legible sin abrirlos.
 */
const ACORDEON_ABIERTO = 4.4;
const ACORDEON_CERRADO = 1;

function SectorAccordion({ sectores }: { sectores: typeof SECTORES }) {
  const [activo, setActivo] = useState(0);

  return (
    <div
      className="hidden gap-3 lg:grid lg:h-[27rem]"
      style={{
        gridTemplateColumns: sectores
          .map((_, i) => `${i === activo ? ACORDEON_ABIERTO : ACORDEON_CERRADO}fr`)
          .join(" "),
        transition: "grid-template-columns 620ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {sectores.map((sector, i) => {
        const abierto = i === activo;
        return (
          <Link
            key={sector.href}
            href={sector.href}
            onMouseEnter={() => setActivo(i)}
            onFocus={() => setActivo(i)}
            aria-label={`${sector.title}: ${sector.description}`}
            className="group relative block min-w-0 overflow-hidden rounded-3xl border border-[#e5e5e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- foto local */}
            <img
              src={sector.imagen}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-[620ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ transform: abierto ? "scale(1)" : "scale(1.18)" }}
            />
            {/* Velo: el cerrado se oscurece para que el nombre en vertical se
                lea sobre cualquier foto; el abierto solo lleva el degradado
                de abajo, donde va el texto. */}
            <span
              aria-hidden="true"
              className="absolute inset-0 transition-opacity duration-500"
              style={{
                background: abierto
                  ? "linear-gradient(to top, rgba(10,10,10,0.82) 0%, rgba(10,10,10,0.35) 38%, rgba(10,10,10,0) 68%)"
                  : "linear-gradient(to top, rgba(10,10,10,0.78) 0%, rgba(10,10,10,0.5) 100%)",
              }}
            />

            {/* Cerrado: nombre en vertical, de abajo arriba. */}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 flex justify-center pb-6 transition-opacity duration-300"
              style={{ opacity: abierto ? 0 : 1 }}
            >
              <span className="whitespace-nowrap text-base font-bold tracking-tight text-white [writing-mode:vertical-rl] [transform:rotate(180deg)]">
                {sector.title}
              </span>
            </span>

            {/* Abierto: el contenido completo. */}
            <span
              aria-hidden={!abierto}
              className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-7 transition-all duration-500"
              style={{
                opacity: abierto ? 1 : 0,
                transform: abierto ? "translateY(0)" : "translateY(12px)",
              }}
            >
              <span className="text-2xl font-bold tracking-tight text-white">{sector.title}</span>
              <span className="max-w-md text-base leading-7 text-white/85">{sector.description}</span>
              <span className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-white">
                Ver planes y precios
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Tablet: el mismo acordeón, girado.
 *
 * En horizontal no cabe: cinco paneles en ~700 px dejan el abierto tan
 * estrecho que la foto no se ve, que es justo lo que el acordeón viene a
 * resolver. Girado, el que está abierto se lleva la altura y los demás
 * quedan en una banda con su nombre en horizontal, que a este ancho se lee
 * mucho mejor que en vertical.
 *
 * Se abre al TOCAR, no al pasar por encima: en una tableta no hay ratón, y
 * un panel que fuera un enlace entero se navegaría con el primer toque sin
 * llegar a enseñar nunca la foto. Por eso la fila es un botón que abre y el
 * enlace de verdad es el «Ver planes y precios» de dentro.
 */
const ACORDEON_VERTICAL_ABIERTO = 4.6;

function SectorAccordionVertical({ sectores }: { sectores: typeof SECTORES }) {
  const [abierto, setAbierto] = useState(0);

  return (
    <div
      className="hidden gap-3 sm:grid lg:hidden sm:h-[34rem]"
      style={{
        gridTemplateRows: sectores
          .map((_, i) => `${i === abierto ? ACORDEON_VERTICAL_ABIERTO : 1}fr`)
          .join(" "),
        transition: "grid-template-rows 560ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {sectores.map((sector, i) => {
        const esteAbierto = i === abierto;
        return (
          <div
            key={sector.href}
            className="relative min-h-0 overflow-hidden rounded-3xl border border-[#e5e5e5]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- foto local */}
            <img
              src={sector.imagen}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span
              aria-hidden="true"
              className="absolute inset-0 transition-opacity duration-500"
              style={{
                background: esteAbierto
                  ? "linear-gradient(to top, rgba(10,10,10,0.85) 0%, rgba(10,10,10,0.3) 45%, rgba(10,10,10,0) 75%)"
                  : "linear-gradient(to right, rgba(10,10,10,0.8) 0%, rgba(10,10,10,0.55) 100%)",
              }}
            />

            {/* Toda la fila abre; cuando ya está abierta deja de ser botón
                para que el único destino táctil sea el enlace de abajo. */}
            <button
              type="button"
              onClick={() => setAbierto(i)}
              aria-expanded={esteAbierto}
              aria-label={`Ver ${sector.title}`}
              tabIndex={esteAbierto ? -1 : 0}
              className="absolute inset-0 flex items-center px-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]"
              style={{ pointerEvents: esteAbierto ? "none" : "auto" }}
            >
              <span
                className="text-lg font-bold tracking-tight text-white transition-opacity duration-300"
                style={{ opacity: esteAbierto ? 0 : 1 }}
              >
                {sector.title}
              </span>
            </button>

            <span
              className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 p-6 transition-all duration-500"
              style={{
                opacity: esteAbierto ? 1 : 0,
                transform: esteAbierto ? "translateY(0)" : "translateY(10px)",
              }}
            >
              <span className="text-2xl font-bold tracking-tight text-white">{sector.title}</span>
              <span className="max-w-lg text-base leading-7 text-white/85">{sector.description}</span>
              <Link
                href={sector.href}
                tabIndex={esteAbierto ? 0 : -1}
                className="pointer-events-auto mt-1 inline-flex w-fit items-center gap-2 rounded-full text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
              >
                Ver planes y precios <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Móvil: carrusel de scroll nativo con anclaje.
 *
 * Sustituye a la pila de cartas arrastrable (retirada el 2026-09-24 por
 * petición del usuario: "funciona mal y se ve mal"). Aquellos reimplementaban a mano el gesto de desplazar —con drag de
 * framer-motion, inercia propia y un contenedor de altura fantasma— y
 * peleaban contra el scroll del navegador. Esto es el gesto nativo: se mueve
 * con el dedo como espera cualquiera, cada tarjeta se ancla en su sitio, y
 * los puntos de abajo siguen la posición real leída del scroll.
 */
function SectorCarousel({ sectores }: { sectores: typeof SECTORES }) {
  const pista = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(0);

  // La tarjeta visible se deduce del scroll, no al revés: así los puntos
  // siguen al dedo aunque nadie los toque, y no hay dos fuentes de verdad.
  //
  // Se mide la posición REAL de cada tarjeta (`offsetLeft`) en vez de
  // multiplicar por el ancho del carril: entre tarjeta y tarjeta hay un
  // hueco, así que «índice × ancho» se va desviando y, con suficientes
  // tarjetas, acabaría señalando el punto equivocado.
  const alDesplazar = () => {
    const el = pista.current;
    if (!el) return;
    const tarjetas = Array.from(el.children) as HTMLElement[];
    if (tarjetas.length === 0) return;
    let masCerca = 0;
    let menorDistancia = Infinity;
    tarjetas.forEach((tarjeta, i) => {
      const distancia = Math.abs(tarjeta.offsetLeft - el.offsetLeft - el.scrollLeft);
      if (distancia < menorDistancia) {
        menorDistancia = distancia;
        masCerca = i;
      }
    });
    setVisible(masCerca);
  };

  const irA = (indice: number) => {
    const el = pista.current;
    const tarjeta = el?.children[indice] as HTMLElement | undefined;
    if (!el || !tarjeta) return;
    el.scrollTo({ left: tarjeta.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };

  return (
    <div className="sm:hidden">
      <div
        ref={pista}
        onScroll={alDesplazar}
        className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 sm:-mx-6 sm:px-6"
      >
        {sectores.map((sector) => (
          <Link
            key={sector.href}
            href={sector.href}
            className="group relative block w-full shrink-0 snap-center overflow-hidden rounded-3xl border border-[#e5e5e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-4"
          >
            <span className="block aspect-[4/5] w-full">
              {/* eslint-disable-next-line @next/next/no-img-element -- foto local */}
              <img src={sector.imagen} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            </span>
            <span
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(10,10,10,0.85) 0%, rgba(10,10,10,0.35) 42%, rgba(10,10,10,0) 70%)",
              }}
            />
            <span className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-6">
              <span className="text-2xl font-bold tracking-tight text-white">{sector.title}</span>
              <span className="text-sm leading-6 text-white/85">{sector.description}</span>
              <span className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-white">
                Ver planes y precios <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-center gap-2" role="tablist" aria-label="Sector visible">
        {sectores.map(({ href, title }, indice) => (
          <button
            key={href}
            type="button"
            role="tab"
            aria-selected={indice === visible}
            aria-label={`Ver ${title}`}
            onClick={() => irA(indice)}
            className={`h-1.5 rounded-full transition-all duration-300 ${indice === visible ? "w-5 bg-[#8b5cf6]" : "w-1.5 bg-[#d4d4d8]"}`}
          />
        ))}
      </div>
    </div>
  );
}

export function MainLanding() {
  const [isDemoOpen, setIsDemoOpen] = useState(false);

  return (
    <main id="main-content" className="min-h-screen bg-white text-[#0a0a0a]" data-landing="alhabla" data-landing-variant="principal">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-[10px] focus:bg-[#0a0a0a] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white">Saltar al contenido</a>
      <SiteHeader />

      {/*
        Hero a una columna con el titular centrado y los hilos de voz detrás
        (2026-09-17): el pulso de llamada que ocupaba la columna derecha se
        retiró. `relative isolate` es obligatorio para que el canvas en
        `-z-10` quede por encima del fondo del <main> y no desaparezca; la
        sección no puede pintar fondo propio por lo mismo (ver DESIGN.md).
      */}
      <section id="contenido" className="relative isolate overflow-hidden border-b border-[#e5e5e5]" tabIndex={-1}>
        <HeroHilos />
        <div className="mx-auto flex max-w-4xl flex-col items-center space-y-7 px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8 lg:py-28">
          <Reveal y={14}>
            <span className="badge-soft">Recepción telefónica para negocios con cita previa</span>
          </Reveal>
          <Reveal delay={0.06} y={16}>
            <h1 className="text-balance text-[2.75rem] font-black leading-[1.02] tracking-[-0.045em] text-[#0a0a0a] sm:text-6xl lg:text-[4.6rem]">
              Tu negocio no tiene que parar para atender el teléfono.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-[#52525b]">
              Alhabla responde con tu número, consulta tu agenda y confirma citas mientras tu equipo sigue atendiendo.
            </p>
          </Reveal>
          <Reveal delay={0.12} y={16}>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
              <Link href="/planes" className="btn-primary h-12 px-6">Probar Alhabla 7 días <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              <button type="button" onClick={() => setIsDemoOpen(true)} className="btn-secondary h-12 px-6"><Headphones className="h-4 w-4" aria-hidden="true" /> Escuchar cómo atiende</button>
            </div>
          </Reveal>
          <Reveal delay={0.18} y={12}>
            <p className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-medium text-[#3f3f46]">
              {["Sin cambiar de número", "Google, Outlook o iCloud", "Sin permanencia"].map((item) => <span key={item} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-[#8b5cf6]" aria-hidden="true" />{item}</span>)}
            </p>
          </Reveal>
        </div>
      </section>

      {/*
        Las tarjetas de sector suben aquí, justo después del hero
        (2026-09-24, propuesta de conversión — revierte el orden de
        2026-09-21, ver historial de este comentario): el trabajo real de la
        landing principal es enrutar rápido a quien ya sabe su sector — cada
        landing de nicho lleva ahora su propia profundidad completa (cómo
        funciona, reparto, El Gestor, datos del sector), así que no hace
        falta repetirla en genérico antes de ofrecer la salida. Quien no
        pica aquí sigue leyendo el relato genérico de abajo.
      */}
      <section id="sectores" className="scroll-m-20 border-b border-[#e5e5e5] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">Cada negocio tiene su forma de llenar la agenda.</h2>
          </Reveal>
          <div className="mt-14 sm:mt-16">
            {/* Una pieza por forma de mirar, que no es la misma en cada
                sitio: en escritorio el acordeón horizontal (los cinco a la
                vez, se abre al pasar el ratón), en tableta el mismo
                acordeón girado y abierto al toque, y en móvil un carrusel
                de scroll nativo. */}
            <SectorAccordion sectores={SECTORES} />
            <SectorAccordionVertical sectores={SECTORES} />
            <SectorCarousel sectores={SECTORES} />
          </div>
        </div>
      </section>

      {/*
        El relato (2026-09-26, «quiero que toda la secuencia sea
        storyscroll»): un único teléfono fijo acompaña cinco capítulos —
        cómo se atiende una llamada, qué la hace distinta de un contestador,
        qué recibe el cliente por WhatsApp, qué hace el dueño por WhatsApp
        (El Gestor) y cómo se pone en marcha. Luego, precio y dudas.
      */}
      <RelatoSection onEscuchar={() => setIsDemoOpen(true)} />

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
                      ? "landing-card-hover relative flex h-full flex-col rounded-3xl bg-white p-7 ring-2 ring-[#8b5cf6]"
                      : "landing-card-hover flex h-full flex-col rounded-3xl border border-[#e5e5e5] bg-white p-7"
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
                  <p className="mt-3 text-sm font-semibold text-[#27272a]">{formatIncludedMinutes(plan.minutes)} minutos incluidos · {formatExtraMinute(plan.extraPerMinute)}</p>
                  <p className="mt-2 text-sm leading-6 text-[#52525b]">{plan.description}</p>
                  <ul className="mb-7 mt-5 space-y-2.5 border-t border-[#e5e5e5] pt-5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm leading-6 text-[#27272a]">
                        <Check className="mt-1 h-4 w-4 shrink-0 text-[#8b5cf6]" aria-hidden="true" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link href={`/planes?plan=${plan.id}`} className={plan.featured ? "btn-primary mt-auto" : "btn-secondary mt-auto"}>
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
            {HOME_QUICK_FAQS.map(({ question, answer }, index) => (
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

      <section className="bg-[#0a0a0a] text-white"><Reveal className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 px-4 py-16 sm:px-6 sm:py-20 lg:flex-row lg:items-center lg:px-8"><div><h2 className="max-w-xl text-3xl font-black tracking-tight sm:text-5xl">Prueba qué pasa cuando nadie deja una llamada sin atender.</h2></div><Link href="/planes" className="btn-purple shrink-0">Empezar ahora <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Reveal></section>
      <SiteFooter />
      <DemoVoiceCall open={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </main>
  );
}
