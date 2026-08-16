
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CalendarDays, Check, Clock3, MessageCircleMore, PhoneCall, Scissors, Sparkles, Store, TrendingUp, UserRoundCheck } from "lucide-react";
import { LandingHero } from "@/components/landing-hero";
import { MobileNav } from "@/components/mobile-nav";
import { SectorDataSection } from "@/components/sector-data-section";
import { RevenueLossCalculator } from "@/components/revenue-loss-calculator";
import { formatIncludedMinutes, formatPlanPrice, plans } from "@/lib/plans";
import { nicheLinks, type NicheLandingContent } from "@/lib/niche-landings";

const ASSET_PATHS = {
  logo: "/brand/logo.svg",
} as const;

function buildPlansHref(niche?: string) {
  return niche ? `/planes?niche=${encodeURIComponent(niche)}` : "/planes";
}

function BrandLogo() {
  return (
    <Link href="/landing" aria-label="Ir al inicio de AsistAI" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/70 bg-white/90 shadow-[0_12px_30px_rgba(16,24,20,0.08)] backdrop-blur sm:h-11 sm:w-11 sm:rounded-2xl">
        <Image
          src={ASSET_PATHS.logo}
          alt="AsistAI"
          width={34}
          height={34}
          className="h-auto w-7 object-contain sm:w-[30px]"
          priority
        />
      </div>
      <div>
        <p className="text-base font-semibold leading-5 text-[#1e2b22]">AsistAI</p>
        <p className="hidden text-xs text-[#5f6d63] sm:block">Recepción inteligente para negocios</p>
      </div>
    </Link>
  );
}

const highlights = [
  {
    title: "Atención 24/7",
    description: "Responde llamadas fuera de horario y evita perder reservas o consultas importantes.",
    icon: Clock3,
  },
  {
    title: "Agenda conectada",
    description: "Sincroniza disponibilidad real y confirma citas sin fricción para el cliente.",
    icon: CalendarDays,
  },
  {
    title: "Conversaciones útiles",
    description: "Recoge contexto, detecta leads y deja a tu equipo solo lo que requiere atención humana.",
    icon: PhoneCall,
  },
] as const;

const businessBenefits = [
  {
    title: "Peluquerías",
    description: "Reserva cortes, color y tratamientos incluso mientras todo el equipo está atendiendo.",
    result: "Menos llamadas perdidas en horas punta",
    icon: Scissors,
  },
  {
    title: "Centros de estética",
    description: "Responde dudas sobre servicios, duración y disponibilidad antes de confirmar la cita.",
    result: "Una atención cuidada desde el primer contacto",
    icon: Sparkles,
  },
  {
    title: "Pymes y profesionales",
    description: "Filtra consultas, recoge datos y deriva al equipo solo las conversaciones importantes.",
    result: "Más tiempo para trabajar y hacer crecer el negocio",
    icon: BriefcaseBusiness,
  },
] as const;

const frequentlyAskedQuestions = [
  {
    question: "¿Mantengo mi número de teléfono de siempre?",
    answer: "Sí, completamente. Tus clientes seguirán llamando a tu número habitual; AsistAI atiende las llamadas mediante un simple desvío desde tu móvil o fijo. No tienes que publicar un número nuevo ni avisar a nadie.",
  },
  {
    question: "¿Cómo funciona el desvío de llamadas? ¿Es difícil de configurar?",
    answer: "Es muy sencillo. Activamos contigo un desvío desde tu teléfono habitual marcando un código rápido; tarda unos 15 segundos. Te guiamos paso a paso para que empieces sin tocar tu número ni complicarte con ajustes técnicos.",
  },
  {
    question: "¿Puede reservar, cambiar y cancelar citas en mi agenda?",
    answer: "Sí. AsistAI consulta tu disponibilidad en tiempo real y registra, modifica o cancela citas directamente en Google Calendar, respetando los horarios, servicios y reglas que marques para tu salón.",
  },
  {
    question: "¿Puede responder dudas sobre mis servicios y precios?",
    answer: "Sí. Le damos la información real de tu negocio: carta de precios en PDF, tratamientos, duración, horarios y datos de Google Maps. Así responde con seguridad sin que tengas que dejar un tinte, unas uñas o un masaje a medias.",
  },
  {
    question: "¿La voz suena natural o como un robot antiguo?",
    answer: "Suena natural y cercana. Puedes elegir entre voces ultra-naturales e hiperrealistas para que la experiencia encaje con el tono cálido y profesional de tu negocio.",
  },
  {
    question: "¿Qué ocurre si una llamada necesita atención humana o es urgente?",
    answer: "AsistAI recoge el motivo, los datos y el contexto de la llamada para que no se pierda nada importante. Cuando una consulta requiere a tu equipo, deja el aviso preparado para que podáis responder con toda la información.",
  },
  {
    question: "¿Qué pasa si un cliente llama fuera de mi horario?",
    answer: "AsistAI sigue disponible 24/7. Puede resolver dudas y gestionar solicitudes incluso por la noche, en festivos o mientras el salón está cerrado, para que no pierdas una posible cita por no contestar.",
  },
  {
    question: "¿Hay permanencia o compromiso de permanencia?",
    answer: "No. Empiezas con el plan que mejor encaje con tu volumen y puedes cambiarlo cuando lo necesites. Sin contratos largos ni compromisos que te aten.",
  },
  {
    question: "¿Qué pasa si supero los minutos incluidos en mi plan?",
    answer: "No hay sorpresas: cada plan muestra claramente el coste por minuto adicional antes de contratar. Así sabes en todo momento cuánto pagas y puedes elegir el plan que mejor se adapta a tus llamadas.",
  },
] as const;

export function SiteLanding({ content }: { content?: NicheLandingContent }) {
  const visibleHighlights = content?.highlights ?? highlights;
  const visibleBenefits = content?.benefits ?? businessBenefits;
  const visibleFaqs = content?.faqs ?? frequentlyAskedQuestions;
  const plansHref = buildPlansHref(content?.slug);

  return (
    <main
      id="main-content"
      className="relative isolate min-h-screen w-full overflow-hidden bg-[#f3f6ef] text-[#1e2b22]"
      data-landing="asistai"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-[#1e2b22] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Saltar al contenido
      </a>
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[linear-gradient(180deg,#fbfcf8_0%,#f1f5ec_44%,#e9efe5_100%)]" />
      <div className="pointer-events-none absolute -left-40 top-12 -z-10 h-[34rem] w-[34rem] rounded-full bg-[#b8d96e]/25 blur-[110px]" />
      <div
        className="pointer-events-none absolute -right-40 top-72 -z-10 h-[32rem] w-[32rem] rounded-full blur-[120px]"
        style={
          content?.accent
            ? { backgroundColor: content.accent.soft, opacity: 0.6 }
            : { backgroundColor: "#c6d7c1", opacity: 0.35 }
        }
      />

      <header className="relative sticky top-0 z-50 border-b border-white/60 bg-[#f8faf5]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-[4.5rem] lg:px-8">
          <BrandLogo />
          <nav className="hidden items-center gap-3 md:flex" aria-label="Navegación principal">
            <a href="#como-funciona" className="text-sm font-medium text-[#344038] transition hover:text-[#1e2b22]">
              Cómo funciona
            </a>
            <a href="#calculadora" className="text-sm font-medium text-[#344038] transition hover:text-[#1e2b22]">
              Calculadora
            </a>
            <a href="#precios" className="text-sm font-medium text-[#344038] transition hover:text-[#1e2b22]">
              Precios
            </a>
            <Link href="/login" className="btn-secondary h-10 px-4">
              Iniciar sesión
            </Link>
            <Link href={plansHref} className="btn-primary h-10 px-4">
              Empezar ahora
            </Link>
          </nav>

          <MobileNav niche={content?.slug} />
        </div>
      </header>

      <LandingHero content={content} />

      {content?.sectorData ? <SectorDataSection data={content.sectorData} accent={content.accent} /> : null}

      <section id="como-funciona" className="border-y border-white/70 bg-white/35 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-9 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#718064]">Cómo te ayuda</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{content?.sectionTitle ?? "Atiende cada llamada. Sin dejar lo que estás haciendo."}</h2>
            {content?.sectionDescription ? <p className="mt-4 text-base leading-7 text-[#54634b]">{content.sectionDescription}</p> : null}
          </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {visibleHighlights.map(({ title, description }, index) => {
            const Icon = highlights[index]?.icon ?? PhoneCall;
            return (
            <article key={`${title}-detail`} className="panel p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f4f8eb] text-[#2c7334]">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-xl font-semibold text-[#1e2b22]">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-[#54634b]">{description}</p>
            </article>
            );
          })}
        </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(135deg,rgba(238,246,220,0.82),rgba(255,255,255,0.96))] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-7 rounded-[2rem] border border-[#d4e4bd] bg-white/75 p-6 shadow-[0_18px_50px_rgba(16,24,20,0.07)] sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-12 lg:p-10">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-[#1e2b22] px-3 py-1.5 text-xs font-semibold text-white">
                <CalendarDays className="h-3.5 w-3.5 text-[#b8d96e]" />
                Google Calendar
              </span>
              <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-[#1e2b22] sm:text-4xl">
                {content?.calendarIntegration.title ?? "No tienes que cambiar cómo recibes tus reservas."}
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-[#54634b]">
                {content?.calendarIntegration.description ?? "AsistAI consulta Google Calendar antes de confirmar una cita. Si las reservas de tu web, WhatsApp o software ya llegan ahí, el agente las respeta antes de ofrecer un horario por teléfono."}
              </p>
            </div>
            <div className="grid gap-3">
              {(content?.calendarIntegration.examples ?? [
                "Las citas de otros canales bloquean ese hueco",
                "Sólo ofrece horarios realmente disponibles",
                "Las llamadas nuevas llegan a la misma agenda",
              ]).map((example, index) => {
                const Icon = index === 0 ? MessageCircleMore : index === 1 ? Clock3 : CalendarDays;
                return (
                  <div key={example} className="flex items-start gap-4 rounded-2xl border border-[#dce7d2] bg-white p-4 shadow-sm">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef6dc] text-[#2c7334]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <p className="pt-2 text-sm font-semibold leading-5 text-[#344038]">{example}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[linear-gradient(135deg,rgba(255,255,255,0.58),rgba(238,246,224,0.72))] py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-end lg:gap-14">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#1e2b22] px-3 py-1.5 text-xs font-semibold text-white">
                <TrendingUp className="h-3.5 w-3.5 text-[#b8d96e]" />
                Automatizar para crecer
              </span>
              <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-[#1e2b22] sm:text-4xl lg:text-5xl">
                {content?.benefitsTitle ?? "El teléfono deja de interrumpir. Empieza a trabajar para ti."}
              </h2>
              <p className="mt-5 text-base leading-8 text-[#54634b]">
                {content?.benefitsDescription ?? "Cada llamada es una oportunidad de reservar, resolver una duda o captar un nuevo cliente. AsistAI mantiene esa puerta abierta aunque estés ocupado, fuera de horario o atendiendo a otra persona."}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {visibleBenefits.map(({ title, description, result }, index) => {
                const Icon = businessBenefits[index]?.icon ?? Store;
                return (
                <article key={title} className="group rounded-[1.75rem] border border-white/80 bg-white/85 p-5 shadow-[0_16px_45px_rgba(16,24,20,0.07)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(16,24,20,0.11)] sm:p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef6dc] text-[#2c7334] transition group-hover:bg-[#dff3ad]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-[#1e2b22]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#5f6d63]">{description}</p>
                  <div className="mt-5 border-t border-[#e8ece3] pt-4">
                    <p className="flex items-start gap-2 text-sm font-semibold leading-5 text-[#344038]">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#2c7334]" />
                      {result}
                    </p>
                  </div>
                </article>
                );
              })}
            </div>
          </div>

          <div className="mt-10 grid gap-3 rounded-[1.75rem] border border-[#dce6d4] bg-[#1e2b22] p-5 text-white sm:grid-cols-3 sm:p-6">
            <div className="flex items-center gap-3 border-white/10 sm:border-r">
              <Clock3 className="h-5 w-5 shrink-0 text-[#b8d96e]" />
              <p className="text-sm"><strong className="block font-semibold">Disponible 24/7</strong><span className="text-white/65">También fuera de horario</span></p>
            </div>
            <div className="flex items-center gap-3 border-white/10 sm:border-r sm:px-5">
              <UserRoundCheck className="h-5 w-5 shrink-0 text-[#b8d96e]" />
              <p className="text-sm"><strong className="block font-semibold">Atención consistente</strong><span className="text-white/65">Siempre con el tono de tu marca</span></p>
            </div>
            <div className="flex items-center gap-3 sm:pl-5">
              <Store className="h-5 w-5 shrink-0 text-[#b8d96e]" />
              <p className="text-sm"><strong className="block font-semibold">Preparado para tu negocio</strong><span className="text-white/65">Servicios, horarios y respuestas reales</span></p>
            </div>
          </div>
        </div>
      </section>

      <RevenueLossCalculator content={content?.calculator} />

      <section id="soluciones" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-[1.75rem] border border-[#dce6d4] bg-white/75 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#718064]">Soluciones por negocio</p>
          <h2 className="mt-3 text-2xl font-semibold text-[#1e2b22]">Descubre AsistAI para tu sector</h2>
          <div className="mt-5 flex flex-wrap gap-3">
            {nicheLinks.map((link) => (
              <Link key={link.href} href={link.href} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${content && link.href === `/${content.slug}` ? "border-[#1e2b22] bg-[#1e2b22] text-white" : "border-[#d7e3ce] bg-white text-[#344038] hover:bg-[#eef6dc]"}`}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="precios" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="panel p-6 sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#8b9a7f]">Precios</p>
              <h2 className="mt-2 text-3xl font-semibold text-[#1e2b22]">Planes claros para crecer sin fricción</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[#54634b]">
                Empieza con el volumen que necesitas y cambia de plan cuando crezca tu negocio. Sin permanencia.
              </p>
            </div>
            <Link href={plansHref} className="btn-secondary px-5">
              Ver todos los planes
            </Link>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.id}
                className={`rounded-[1.8rem] border p-6 shadow-sm ${plan.featured ? "border-[#cfe6b0] bg-[linear-gradient(180deg,#f9fceb_0%,#ffffff_100%)] shadow-[0_18px_45px_rgba(115,146,33,0.14)]" : "border-[#e5ebdd] bg-white/85"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-[#1e2b22]">{plan.name}</h3>
                  {plan.featured ? <span className="badge-soft">Recomendado</span> : null}
                </div>
                <p className="mt-6 text-4xl font-semibold tracking-tight text-[#1e2b22]">{formatPlanPrice(plan.price)}<span className="text-base font-medium text-[#687267]">/mes</span></p>
                <p className="mt-3 text-sm font-semibold text-[#344038]">{formatIncludedMinutes(plan.minutes)} minutos incluidos</p>
                <p className="mt-2 text-sm leading-7 text-[#54634b]">{plan.summary}</p>
                <Link href={plansHref} className={`mt-6 inline-flex h-11 items-center justify-center rounded-2xl px-5 text-sm font-semibold ${plan.featured ? "bg-[#1e2b22] text-white" : "border border-[#d6dfcf] bg-white text-[#344038]"}`}>
                  Empezar con {plan.name}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/70 bg-white/35 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-14">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#718064]">Sin letra pequeña</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#1e2b22] sm:text-4xl">Resuelve tus dudas antes de empezar.</h2>
              <p className="mt-4 text-base leading-7 text-[#54634b]">
                Configuramos contigo el comportamiento del asistente para que responda con el tono, la información y las reglas de tu negocio.
              </p>

              <div className="mt-7 rounded-[1.75rem] border border-[#dce6d4] bg-[#1e2b22] p-6 text-white">
                <p className="text-sm font-semibold text-[#b8d96e]">Preparado para negocios con cita previa</p>
                <p className="mt-2 text-sm leading-6 text-white/70">Servicios, horarios, precios, preguntas frecuentes y calendario trabajan juntos desde una única configuración.</p>
              </div>
            </div>

            <div className="grid items-start gap-3 sm:grid-cols-2">
              {visibleFaqs.map(({ question, answer }) => (
                <details key={question} className="group rounded-[1.5rem] border border-[#e2e9dc] bg-white/90 p-5 shadow-sm open:shadow-[0_14px_35px_rgba(16,24,20,0.08)]">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-sm font-semibold leading-6 text-[#1e2b22] marker:content-none">
                    {question}
                    <span className="mt-1 text-lg leading-none text-[#718064] transition group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="mt-3 border-t border-[#e8ece3] pt-3 text-sm leading-6 text-[#5f6d63]">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/70 bg-[#1e2b22] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-sm font-semibold text-[#b8d96e]">Da el siguiente paso</p>
            <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{content?.closingTitle ?? "Empieza a no perder llamadas esta semana."}</h2>
          </div>
          <Link href={plansHref} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#b8d96e] px-6 text-sm font-semibold text-[#1e2b22] transition hover:bg-[#e3ff9e]">
            Empezar con AsistAI <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="bg-[#0b110e] text-white/65">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <p className="font-semibold text-white">AsistAI</p>
            <p className="mt-1 text-xs">Recepción telefónica inteligente para negocios con cita previa.</p>
          </div>
          <nav aria-label="Enlaces legales" className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium">
            <a href="mailto:hola@asistai.es" className="transition hover:text-white">Contacto</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
