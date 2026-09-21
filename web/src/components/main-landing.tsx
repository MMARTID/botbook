"use client";

import Link from "next/link";
import { appUrl } from "@/lib/app-url";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Headphones } from "lucide-react";
import { motion, useReducedMotion, type PanInfo } from "framer-motion";

import { BrandMark } from "@/components/brand-mark";
import { DemoVoiceCall } from "@/components/demo-voice-call";
import { HeroHilos } from "@/components/hero-hilos";
import { HowItWorksScrollytelling } from "@/components/how-it-works-scrollytelling";
import { MobileNav } from "@/components/mobile-nav";
import { Reveal } from "@/components/scroll-reveal";
import { SectorDataSection } from "@/components/sector-data-section";
import { TeamRoutingSection } from "@/components/team-routing-section";
import { OwnerAssistantSection } from "@/components/owner-assistant-section";
import { WhatsAppBenefitsTable } from "@/components/whatsapp-benefits-table";
import { generalOwnerAssistant, generalSectorData, generalTeamRouting } from "@/lib/niche-landings";
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

// Tarjeta destacada del bento de escritorio: la única a tamaño ancho y con
// autoplay propio (el resto solo se reproduce en hover) — elegida a
// petición directa del usuario, no por ningún criterio de negocio.
const SECTOR_DESTACADO = SECTORES[1];

/** Media de la tarjeta de sector: vídeo mudo en bucle, o su fotograma si el
 * visitante prefiere menos movimiento. `preload="metadata"` mantiene ligera
 * la carga inicial (los 5 clips suman ~3MB pero solo se traen al reproducir).
 *
 * El vídeo va `absolute inset-0` dentro de `wrapperClassName` (que fija su
 * propio tamaño por aspect-ratio o por stretch de flex, nunca por el
 * contenido) — así el elemento de vídeo queda totalmente fuera del flujo y
 * no puede alterar el tamaño del contenedor bajo ningún caso (el bug real:
 * en la tarjeta ancha, el contenedor de vídeo dependía de una altura de
 * flex sin resolver, y el vídeo panorámico "tiraba" de ella al reproducir).
 *
 * `reproducir` controla el play/pause en marcha (no solo al montar) para
 * poder alternar entre autoplay fijo (la tarjeta grande) y solo-en-hover
 * (el resto) con el mismo componente. */
function SectorSceneMedia({
  video,
  poster,
  reducedMotion,
  reproducir = true,
  wrapperClassName = "relative block aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[#e5e5e5]",
}: {
  video: string;
  poster: string;
  reducedMotion: boolean;
  reproducir?: boolean;
  wrapperClassName?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || reducedMotion) return;
    if (reproducir) {
      el.play().catch(() => {});
    } else {
      el.pause();
      el.currentTime = 0;
    }
  }, [reproducir, reducedMotion]);

  return (
    <span className={wrapperClassName}>
      {reducedMotion ? (
        // eslint-disable-next-line @next/next/no-img-element -- fotograma local
        <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={video}
          poster={poster}
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload nofullscreen noremoteplayback"
          aria-hidden="true"
        />
      )}
    </span>
  );
}

const TARJETA_SECTOR_CLASE =
  "group flex h-full flex-col rounded-3xl border border-[#e5e5e5] bg-white p-3 transition duration-300 hover:-translate-y-1 hover:border-[#ddd6fe] hover:shadow-[0_18px_35px_-24px_rgba(109,40,217,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-4";

/** Contenido visual de la tarjeta de sector, compartido entre la carta real
 * (delante, enlaza) y la carta invisible que solo reserva altura. */
function SectorCardVisual({
  sector,
  reducedMotion,
  reproducir = true,
}: {
  sector: (typeof SECTORES)[number];
  reducedMotion: boolean;
  reproducir?: boolean;
}) {
  return (
    <>
      <SectorSceneMedia video={sector.video} poster={sector.poster} reducedMotion={reducedMotion} reproducir={reproducir} />
      <span className="flex min-h-0 flex-1 flex-col px-2 pb-2">
        <h3 className="mt-4 text-lg font-bold">{sector.title}</h3>
        <p className="mt-1.5 text-sm leading-6 text-[#52525b]">{sector.description}</p>
        <span className="mt-auto inline-flex items-center gap-2 pt-3 text-sm font-semibold text-[#0a0a0a]">
          Ver planes y precios <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
        </span>
      </span>
    </>
  );
}

// Solo se ven 3 cartas a la vez (delante + 2 detrás); a partir de ahí quedan
// invisibles detrás del mazo. Cada posición se retira un poco más en
// diagonal y se atenúa — nunca se recorta contenido, solo el canto de la
// carta (borde/fondo) puede asomar.
const PILA_VISIBLES = 3;
const PILA_ESTILOS = [
  { x: 0, y: 0, scale: 1, opacity: 1 },
  { x: 20, y: 14, scale: 0.945, opacity: 0.62 },
  { x: 40, y: 28, scale: 0.89, opacity: 0.32 },
] as const;
const PILA_ESTILO_OCULTO = { x: 56, y: 40, scale: 0.85, opacity: 0 } as const;

function estiloDePila(slot: number) {
  return slot < PILA_VISIBLES ? PILA_ESTILOS[slot] : PILA_ESTILO_OCULTO;
}

/** Una carta de la pila de sectores. Solo la de delante (slot 0) enlaza y se
 * puede arrastrar; las de detrás son puro fondo, pero tocar su canto visible
 * las trae al frente — como hojear un mazo real. */
function SectorStackCard({
  sector,
  slot,
  total,
  reducedMotion,
  onAvanzar,
  onRetroceder,
  onTraerAlFrente,
}: {
  sector: (typeof SECTORES)[number];
  slot: number;
  total: number;
  reducedMotion: boolean;
  onAvanzar: () => void;
  onRetroceder: () => void;
  onTraerAlFrente: () => void;
}) {
  const esFrente = slot === 0;
  const estilo = estiloDePila(slot);

  const manejarSoltar = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -90 || info.velocity.x < -450) onAvanzar();
    else if (info.offset.x > 90 || info.velocity.x > 450) onRetroceder();
  };

  return (
    <motion.div
      className="absolute inset-0"
      style={{ zIndex: total - Math.min(slot, total) }}
      animate={{ x: estilo.x, y: estilo.y, scale: estilo.scale, opacity: estilo.opacity }}
      transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 34 }}
      drag={esFrente && !reducedMotion ? "x" : false}
      dragMomentum={false}
      whileDrag={{ scale: 1.02, cursor: "grabbing" }}
      onDragEnd={manejarSoltar}
      aria-hidden={!esFrente}
    >
      {esFrente ? (
        <Link href={sector.href} className={`${TARJETA_SECTOR_CLASE} cursor-grab active:cursor-grabbing`}>
          <SectorCardVisual sector={sector} reducedMotion={reducedMotion} reproducir={esFrente} />
        </Link>
      ) : (
        <div onClick={onTraerAlFrente} className={`${TARJETA_SECTOR_CLASE} cursor-pointer`}>
          <SectorCardVisual sector={sector} reducedMotion={reducedMotion} reproducir={false} />
        </div>
      )}
    </motion.div>
  );
}

/** Asomo lateral de la tarjeta anterior/siguiente en el formato tablet: solo
 * la foto (sin texto — a este ancho no cabría legible), atenuada en reposo,
 * con una flechita que aparece en hover para dejar claro que es
 * navegación, no una tarjeta rota. Ancho fijo + `self-stretch`: la imagen va
 * `absolute inset-0`, así que nunca puede alterar el alto de la fila (misma
 * garantía que en el resto de tarjetas). */
function SectorPeekButton({ sector, direccion, onClick }: { sector: (typeof SECTORES)[number]; direccion: "anterior" | "siguiente"; onClick: () => void }) {
  const Icono = direccion === "anterior" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Ver ${sector.title}`}
      className="group relative block w-20 shrink-0 self-stretch overflow-hidden rounded-2xl border border-[#e5e5e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura estática, sin vídeo */}
      <img src={sector.poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55 transition duration-300 group-hover:opacity-85" />
      <span className="absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100" aria-hidden="true">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#0a0a0a] shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
          <Icono className="h-4 w-4" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}

/** Tarjeta estándar del bento de escritorio/tablet ancho: foto arriba, texto
 * abajo — mismo contenido visual que la carta de la pila móvil. Solo la
 * tarjeta grande (destacada) se reproduce sola; estas solo al pasar el
 * ratón por encima, y se paran al salir (nunca queda ninguna a medias con
 * el botón nativo del navegador porque, si no está en hover, ni se intenta
 * reproducir). */
function SectorGridCard({ sector, reducedMotion }: { sector: (typeof SECTORES)[number]; reducedMotion: boolean }) {
  const [enHover, setEnHover] = useState(false);
  return (
    <Link
      href={sector.href}
      className={TARJETA_SECTOR_CLASE}
      onMouseEnter={() => setEnHover(true)}
      onMouseLeave={() => setEnHover(false)}
      onFocus={() => setEnHover(true)}
      onBlur={() => setEnHover(false)}
    >
      <SectorCardVisual sector={sector} reducedMotion={reducedMotion} reproducir={enHover} />
    </Link>
  );
}

// Ancho del vídeo en la tarjeta destacada: arranca al 46% y, al entrar en
// vista, crece hasta el 65% en 3s (marcado a mano por el usuario sobre una
// captura) — el vídeo panorámico "abre" el encuadre en vez de quedar
// estático. El texto (flex-1) cede sitio solo porque el vídeo crece; nunca
// al revés.
const DESTACADO_ANCHO_INICIAL = "46%";
const DESTACADO_ANCHO_EXPANDIDO = "65%";

/** Tarjeta de cierre del bento: ocupa dos columnas y pone la foto y el texto
 * en horizontal — rompe la monotonía de la rejilla sin insinuar que un
 * sector "importa más" que otro (los cinco reciben la misma atención, esta
 * solo cierra la fila impar con un tratamiento distinto). Es la única
 * tarjeta del bento que se reproduce sin necesitar hover, y la única cuyo
 * encuadre de vídeo se expande al entrar en vista. */
function SectorFeatureCard({ sector, reducedMotion }: { sector: (typeof SECTORES)[number]; reducedMotion: boolean }) {
  return (
    <Link
      href={sector.href}
      className="group col-span-2 flex overflow-hidden rounded-3xl border border-[#e5e5e5] bg-white transition duration-300 hover:-translate-y-1 hover:border-[#ddd6fe] hover:shadow-[0_18px_35px_-24px_rgba(109,40,217,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-4"
    >
      <motion.span
        className="relative block shrink-0 overflow-hidden"
        initial={{ width: reducedMotion ? DESTACADO_ANCHO_EXPANDIDO : DESTACADO_ANCHO_INICIAL }}
        whileInView={reducedMotion ? undefined : { width: DESTACADO_ANCHO_EXPANDIDO }}
        viewport={{ once: true, amount: "some" }}
        transition={{ duration: 7, ease: "easeInOut" }}
      >
        {/* wrapperClassName="absolute inset-0": este span solo rellena el
            ancho animado de arriba — el tamaño real nunca lo decide el
            vídeo, lo decide el motion.span, así el vídeo se ve siempre bien
            recortado durante el propio crecimiento, sin deformarse. */}
        <SectorSceneMedia video={sector.video} poster={sector.poster} reducedMotion={reducedMotion} reproducir wrapperClassName="absolute inset-0" />
      </motion.span>
      <span className="flex flex-1 flex-col justify-center gap-3 px-8 py-6">
        <h3 className="text-2xl font-bold">{sector.title}</h3>
        <p className="text-base leading-7 text-[#52525b]">{sector.description}</p>
        <span className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-[#0a0a0a]">
          Ver planes y precios <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
        </span>
      </span>
    </Link>
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
        <Link href="/" aria-label="Ir al inicio de Alhabla" className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
          <span className="text-base font-black tracking-tight text-[#0a0a0a]">Alhabla</span>
        </Link>
        <nav className="hidden items-center gap-5 md:flex" aria-label="Navegación principal">
          <a href="#sectores" className="enlace-nav">Tu negocio</a>
          <a href="#como-funciona" className="enlace-nav">Cómo funciona</a>
          <a href="#precios" className="enlace-nav">Precios</a>
          <a href="#preguntas" className="enlace-nav">Preguntas</a>
          <a href={appUrl("/login")} className="btn-secondary h-10 px-4">Iniciar sesión</a>
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
  // Orden actual del mazo: ordenSectores[0] es la carta de delante. "Siguiente"
  // manda la de delante al final (como hojear un mazo real); "anterior" trae
  // la última al frente.
  const [ordenSectores, setOrdenSectores] = useState<number[]>(() => SECTORES.map((_, i) => i));
  const avanzarSector = () => setOrdenSectores((orden) => [...orden.slice(1), orden[0]]);
  const retrocederSector = () => setOrdenSectores((orden) => [orden[orden.length - 1], ...orden.slice(0, -1)]);
  const irASector = (indice: number) =>
    setOrdenSectores((orden) => {
      const posicion = orden.indexOf(indice);
      if (posicion <= 0) return orden;
      return [...orden.slice(posicion), ...orden.slice(0, posicion)];
    });
  const sectorActivo = ordenSectores[0];

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
              {["Sin cambiar de número", "Google Calendar y Outlook", "Sin permanencia"].map((item) => <span key={item} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-[#8b5cf6]" aria-hidden="true" />{item}</span>)}
            </p>
          </Reveal>
        </div>
      </section>

      <HowItWorksScrollytelling onNarrativeActiveChange={setIsNarrativeActive} />

      <TeamRoutingSection data={generalTeamRouting} />

      <OwnerAssistantSection data={generalOwnerAssistant} />

      <WhatsAppBenefitsTable />

      <SectorDataSection data={generalSectorData} />

      {/*
        Las tarjetas de sector bajan aquí a propósito (2026-09-21): antes
        subían justo después del hero para enrutar a quien ya sabía su
        sector, pero eso sacaba a la mitad de las visitantes de la página
        antes de leer el relato genérico completo (cómo funciona, reparto
        por especialidad, el Gestor, el coste de no contestar). Ahora ese
        relato va primero y esto queda como el puente hacia "quiero verlo
        ya adaptado a mi negocio", justo antes de precios.
      */}
      <section id="sectores" className="scroll-m-20 border-t border-[#e5e5e5] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#6d28d9]">Hecho para tu ritmo</p>
              <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Cada negocio tiene su forma de llenar la agenda.</h2>
            </div>
            {/* Las flechas solo tienen sentido donde hay una carta "de
                delante" que cambiar (la pila de tablet/móvil); el bento de
                escritorio muestra los cinco sectores a la vez, sin estado
                que avanzar. */}
            <div className="hidden shrink-0 items-center gap-2 sm:flex lg:hidden">
              <button type="button" onClick={retrocederSector} className="calendar-arrow h-11 w-11 rounded-full hover:border-[#ddd6fe] hover:bg-[#f3eeff] hover:text-[#6d28d9]" aria-label="Sector anterior"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
              <button type="button" onClick={avanzarSector} className="calendar-arrow h-11 w-11 rounded-full hover:border-[#ddd6fe] hover:bg-[#f3eeff] hover:text-[#6d28d9]" aria-label="Siguiente sector"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
            </div>
          </Reveal>
          <div className="mt-14 sm:mt-16">
            {/* Escritorio/tablet ancho: bento grid — los cinco sectores
                visibles a la vez, ninguno recortado ni oculto. Nada de
                carrusel: no hace falta desplazar, apilar ni arrastrar nada
                para verlos todos (feedback directo del usuario: tanto el
                corte en seco como la pila apilada resultaban horribles aquí,
                aunque la pila sí funciona bien en el hueco más ajustado del
                móvil — se mantiene solo ahí, ver abajo). Barberías es la
                tarjeta destacada (dos columnas, foto y texto en horizontal,
                única con autoplay); el resto solo se reproduce al pasar el
                ratón por encima. */}
            <div className="hidden grid-cols-3 gap-5 lg:grid">
              {SECTORES.filter((sector) => sector.href !== SECTOR_DESTACADO.href).map((sector) => (
                <SectorGridCard key={sector.href} sector={sector} reducedMotion={sectorReducedMotion} />
              ))}
              <SectorFeatureCard sector={SECTOR_DESTACADO} reducedMotion={sectorReducedMotion} />
            </div>

            {/* Móvil estrecho (<640px): pila de cartas real. La fila con
                scroll cortaba en seco la tarjeta que asomaba (feedback
                directo del usuario, con capturas, en dos rondas — ni el
                corte a plena nitidez ni la versión atenuada convencían).
                Aquí solo la carta de delante enlaza/se arrastra; las de
                detrás asoman su propio canto (jamás contenido recortado) y
                tocarlas las trae al frente. Por debajo de este ancho no hay
                sitio para un asomo a cada lado sin dejarlos ilegibles. */}
            <div className="relative mx-auto w-full max-w-md sm:hidden">
              {/* Carta invisible en flujo normal: solo reserva la altura real
                  del contenido (varía poco de un sector a otro) para que la
                  pila absoluta de abajo tenga un contenedor con tamaño. */}
              <div aria-hidden="true" className="invisible">
                <div className={TARJETA_SECTOR_CLASE}>
                  <SectorCardVisual sector={SECTORES[sectorActivo]} reducedMotion={sectorReducedMotion} reproducir={false} />
                </div>
              </div>
              <div className="absolute inset-0">
                {SECTORES.map((sector, index) => (
                  <SectorStackCard
                    key={sector.href}
                    sector={sector}
                    slot={ordenSectores.indexOf(index)}
                    total={SECTORES.length}
                    reducedMotion={sectorReducedMotion}
                    onAvanzar={avanzarSector}
                    onRetroceder={retrocederSector}
                    onTraerAlFrente={() => irASector(index)}
                  />
                ))}
              </div>
            </div>

            {/* Tablet (640–1023px): la pila dejaba casi todo el ancho vacío
                a los lados de la carta central (feedback directo del
                usuario, con captura marcando ese hueco) — aquí se aprovecha
                con un asomo real de la anterior y la siguiente, uno a cada
                lado, en vez de esconderlas casi del todo detrás. */}
            <div className="mx-auto hidden w-full max-w-2xl items-stretch justify-center gap-4 sm:flex lg:hidden">
              <SectorPeekButton
                sector={SECTORES[ordenSectores[ordenSectores.length - 1]]}
                direccion="anterior"
                onClick={retrocederSector}
              />
              <div className="min-w-0 flex-1">
                <Link href={SECTORES[sectorActivo].href} className={TARJETA_SECTOR_CLASE}>
                  <SectorCardVisual sector={SECTORES[sectorActivo]} reducedMotion={sectorReducedMotion} reproducir />
                </Link>
              </div>
              <SectorPeekButton sector={SECTORES[ordenSectores[1]]} direccion="siguiente" onClick={avanzarSector} />
            </div>

            <div className="mt-6 flex items-center justify-center gap-2 lg:hidden" role="tablist" aria-label="Sector visible">
              {SECTORES.map(({ href, title }, index) => (
                <button
                  key={href}
                  type="button"
                  role="tab"
                  aria-selected={index === sectorActivo}
                  aria-label={`Ver ${title}`}
                  onClick={() => irASector(index)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${index === sectorActivo ? "w-5 bg-[#8b5cf6]" : "w-1.5 bg-[#d4d4d8]"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

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
      <footer className="bg-[#0a0a0a] text-white/70"><div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"><div className="flex flex-col gap-1"><p className="text-sm">© 2026 Alhabla</p><p className="text-sm">Titular: Miguel Martín Delgado</p></div><nav aria-label="Enlaces legales" className="flex flex-wrap items-center gap-x-4 text-sm font-medium"><Link href="/legal/privacidad" className="inline-flex h-11 items-center transition hover:text-white">Privacidad</Link><Link href="/legal/aviso-legal" className="inline-flex h-11 items-center transition hover:text-white">Aviso legal</Link><a href="mailto:hola@alhabla.ai" className="inline-flex h-11 items-center transition hover:text-white">Contacto</a></nav></div></footer>
      <DemoVoiceCall open={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </main>
  );
}
