
import Link from "next/link";
import { ArrowRight, CalendarDays, Check, Clock3, MessageCircleMore, Scissors, Sparkles, Store } from "lucide-react";
import { LandingHero } from "@/components/landing-hero";
import { MobileNav } from "@/components/mobile-nav";
import { SectorDataSection } from "@/components/sector-data-section";
import { RevenueLossCalculator } from "@/components/revenue-loss-calculator";
import { Reveal } from "@/components/scroll-reveal";
import { BrandMark } from "@/components/brand-mark";
import { ParticleField } from "@/components/particle-field";
import { formatIncludedMinutes, formatPlanPrice, plans, TRIAL_REASSURANCE } from "@/lib/plans";
import { generalSectorData, type NicheLandingContent } from "@/lib/niche-landings";

function buildPlansHref(niche?: string) {
  return niche ? `/planes?niche=${encodeURIComponent(niche)}` : "/planes";
}

function BrandLogo() {
  return (
    <Link href="/landing" aria-label="Ir al inicio de Alhabla" className="flex min-w-0 items-center gap-2.5">
      <BrandMark className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
      <p className="text-base font-black leading-5 tracking-tight text-[#0a0a0a]">Alhabla</p>
    </Link>
  );
}

const businessBenefits = [
  {
    title: "Peluquerías",
    description: "Reserva cortes, color y tratamientos incluso mientras todo el equipo está atendiendo.",
    result: "Menos llamadas perdidas en horas punta",
  },
  {
    title: "Centros de estética",
    description: "Responde dudas sobre servicios, duración y disponibilidad antes de confirmar la cita.",
    result: "Atención cuidada desde el primer contacto",
  },
  {
    title: "Barberías, uñas y fisioterapia",
    description: "Cita con el profesional de siempre, duración real y huecos que cuadran con tu jornada.",
    result: "La agenda se llena sin soltar las manos",
  },
] as const;

const BENEFIT_ICONS = [Scissors, Sparkles, Store] as const;

const threeSteps = [
  {
    title: "Suena tu número de siempre",
    description: "Activas un desvío condicional en 15 segundos. Solo las llamadas que no contestas van al asistente.",
  },
  {
    title: "Responde como si fuera de la casa",
    description: "Conoce tus servicios, precios y huecos reales. Si no sabe algo, toma un recado en vez de inventarlo.",
  },
  {
    title: "La cita, en tu agenda al colgar",
    description: "Confirmación automática y ficha con quién llamó y qué reservó. Duración media: menos de 2 minutos.",
  },
] as const;

const frequentlyAskedQuestions = [
  {
    question: "¿Mantengo mi número de teléfono de siempre?",
    answer: "Sí, completamente. Tus clientes seguirán llamando a tu número habitual; Alhabla atiende las llamadas mediante un simple desvío desde tu móvil o fijo. No tienes que publicar un número nuevo ni avisar a nadie.",
  },
  {
    question: "¿Es difícil configurar el desvío de llamadas?",
    answer: "No. Activas un desvío desde tu teléfono habitual marcando un código rápido; tarda unos 15 segundos. Te damos las instrucciones paso a paso para tu operador, sin cambiar tu número ni tocar ajustes técnicos.",
  },
  {
    question: "¿Puede reservar, cambiar y cancelar citas?",
    answer: "Sí. Alhabla comprueba tu horario y tu disponibilidad real antes de ofrecer un hueco, y registra, modifica o cancela citas directamente en tu Google Calendar o tu Outlook, respetando los servicios y las reglas que marques.",
  },
  {
    question: "¿Responde dudas sobre precios y servicios?",
    answer: "Sí. Le das la información real de tu negocio: carta de precios en PDF, servicios, duración, horarios y datos de Google Maps. Así responde con seguridad sin que tengas que dejar a medias un tinte, unas uñas o una sesión.",
  },
  {
    question: "¿La voz suena natural?",
    answer: "Suena natural y cercana, en español de España. Puedes ajustar cómo habla —más cálida, más profesional o más directa— y si da respuestas breves o algo más explicadas, para que encaje con el trato que das en tu negocio.",
  },
  {
    question: "¿Qué pasa si la llamada necesita atención humana?",
    answer: "Alhabla recoge el motivo, los datos y el contexto de la llamada para que no se pierda nada importante. Cuando una consulta requiere a tu equipo, deja el aviso preparado para que podáis responder con toda la información.",
  },
  {
    question: "¿Atiende fuera de horario?",
    answer: "Sí, Alhabla sigue disponible 24/7. Puede resolver dudas y gestionar solicitudes incluso por la noche, en festivos o mientras tienes cerrado, para que no pierdas una posible cita por no contestar.",
  },
  {
    question: "¿Hay permanencia?",
    answer: "No. Empiezas con el plan que mejor encaje con tu volumen y puedes cambiarlo cuando lo necesites. Sin contratos largos ni compromisos que te aten.",
  },
  {
    question: "¿Qué pasa si supero los minutos incluidos en mi plan?",
    answer: "No hay sorpresas: cada plan muestra claramente el coste por minuto adicional antes de contratar. Así sabes en todo momento cuánto pagas y puedes elegir el plan que mejor se adapta a tus llamadas.",
  },
] as const;

export function SiteLanding({ content }: { content?: NicheLandingContent }) {
  const visibleBenefits = content?.benefits ?? businessBenefits;
  const visibleFaqs = content?.faqs ?? frequentlyAskedQuestions;
  const plansHref = buildPlansHref(content?.slug);

  return (
    <main
      id="main-content"
      // Sin fondo propio y con `isolate`: el blanco lo pone el `body` y el
      // campo de partículas queda por detrás del contenido (ver ParticleField).
      className="relative isolate min-h-screen w-full text-[#0a0a0a]"
      data-landing="alhabla"
    >
      <ParticleField />
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-[#0a0a0a] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Saltar al contenido
      </a>

      <header className="sticky top-0 z-50 border-b border-[#e5e5e5] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-[4.5rem] lg:px-8">
          <BrandLogo />
          <nav className="hidden items-center gap-3 md:flex" aria-label="Navegación principal">
            <a href="#por-que" className="text-sm font-medium text-[#3f3f46] transition hover:text-[#0a0a0a]">
              Por qué
            </a>
            <a href="#como-funciona" className="text-sm font-medium text-[#3f3f46] transition hover:text-[#0a0a0a]">
              Cómo funciona
            </a>
            <a href="#precios" className="text-sm font-medium text-[#3f3f46] transition hover:text-[#0a0a0a]">
              Precios
            </a>
            <a href="#preguntas" className="text-sm font-medium text-[#3f3f46] transition hover:text-[#0a0a0a]">
              Preguntas
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

      <div id="contenido" tabIndex={-1} className="outline-none">
        <LandingHero content={content} />
      </div>

      {/* La landing genérica también necesita prueba: si no hay datos de nicho,
          se muestran los transversales, todos con fuente externa citada. */}
      <SectorDataSection data={content?.sectorData ?? generalSectorData} accent={content?.accent} />

      <section id="como-funciona" className="scroll-m-20 bg-[#fafafa] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mb-10 max-w-2xl">
            <h2 className="text-3xl font-black tracking-tight text-[#0a0a0a] sm:text-4xl">
              De llamada perdida a cita confirmada, en tres pasos.
            </h2>
          </Reveal>

          <div className="grid gap-5 lg:grid-cols-3">
            {threeSteps.map((step, index) => (
              <Reveal key={step.title} delay={index * 0.1}>
                <article className="panel h-full p-7 sm:p-8">
                  <span className="text-4xl font-black tracking-tight text-[#8b5cf6]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-5 text-xl font-bold text-[#0a0a0a]">{step.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#52525b]">{step.description}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <span className="badge-soft gap-2">
              <CalendarDays className="h-3.5 w-3.5" />
              Google Calendar & Outlook
            </span>
          </Reveal>
          <div className="mt-5 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-12">
            <Reveal delay={0.05}>
              <h2 className="text-3xl font-black leading-tight tracking-tight text-[#0a0a0a] sm:text-4xl">
                {content?.calendarIntegration.title ?? "No cambias cómo recibes tus reservas."}
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-[#52525b]">
                {content?.calendarIntegration.description ?? "Alhabla consulta tu calendario antes de confirmar una cita. Si las reservas de tu web o WhatsApp ya llegan ahí, el agente las respeta antes de ofrecer un horario por teléfono."}
              </p>
            </Reveal>
            <div className="grid gap-3">
              {(content?.calendarIntegration.examples ?? [
                "Las citas de otros canales bloquean ese hueco",
                "Sólo ofrece horarios realmente disponibles",
                "Las llamadas nuevas llegan a la misma agenda",
              ]).map((example, index) => {
                const Icon = index === 0 ? MessageCircleMore : index === 1 ? Clock3 : CalendarDays;
                return (
                  <Reveal key={example} delay={index * 0.1} y={14}>
                    <div className="flex items-center gap-4 rounded-2xl border border-[#e5e5e5] bg-white p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
                        <Icon className="h-5 w-5" />
                      </span>
                      <p className="text-sm font-semibold leading-5 text-[#27272a]">{example}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#fafafa] py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="max-w-2xl text-3xl font-black leading-tight tracking-tight text-[#0a0a0a] sm:text-4xl">
              {content?.benefitsTitle ?? "Una recepción que entiende tu negocio, sea cual sea."}
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {visibleBenefits.map(({ title, description, result }, index) => {
              const Icon = BENEFIT_ICONS[index] ?? Store;
              return (
                <Reveal key={title} delay={index * 0.1}>
                  <article className="panel h-full p-6 sm:p-7">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 text-lg font-bold text-[#0a0a0a]">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-[#52525b]">{description}</p>
                    <div className="mt-5 border-t border-[#e5e5e5] pt-4">
                      <p className="flex items-start gap-2 text-sm font-semibold leading-5 text-[#27272a]">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" />
                        {result}
                      </p>
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <RevenueLossCalculator content={content?.calculator} activeNiche={content?.slug} />

      <section id="precios" className="scroll-m-20 mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
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
                    ? "relative flex h-full flex-col rounded-3xl bg-[#0a0a0a] p-7 text-white"
                    : "flex h-full flex-col rounded-3xl border border-[#e5e5e5] bg-white p-7"
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className={`text-lg font-bold ${plan.featured ? "text-white" : "text-[#0a0a0a]"}`}>{plan.name}</h3>
                  {plan.featured ? (
                    <span className="inline-flex items-center rounded-full bg-[#8b5cf6] px-3 py-1 text-xs font-semibold text-white">
                      Recomendado
                    </span>
                  ) : null}
                </div>
                <p className={`mt-6 text-4xl font-black tracking-tight ${plan.featured ? "text-white" : "text-[#0a0a0a]"}`}>
                  {formatPlanPrice(plan.price)}
                  <span className={`text-base font-medium ${plan.featured ? "text-white/60" : "text-[#71717a]"}`}>/mes</span>
                </p>
                <p className={`mt-3 text-sm font-semibold ${plan.featured ? "text-white/90" : "text-[#27272a]"}`}>
                  {formatIncludedMinutes(plan.minutes)} minutos incluidos
                </p>
                <p className={`mt-2 text-sm leading-7 ${plan.featured ? "text-white/65" : "text-[#52525b]"}`}>{plan.summary}</p>
                <Link
                  href={`${plansHref}${plansHref.includes("?") ? "&" : "?"}plan=${plan.id}`}
                  className={plan.featured ? "btn-purple mt-6" : "btn-secondary mt-6"}
                >
                  Elegir {plan.name}
                </Link>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="preguntas" className="scroll-m-20 border-y border-[#e5e5e5] bg-[#fafafa] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="text-3xl font-black tracking-tight text-[#0a0a0a] sm:text-4xl">Resuelve tus dudas antes de empezar.</h2>
          </Reveal>

          <div className="mt-8 grid items-start gap-3 sm:grid-cols-2">
            {visibleFaqs.map(({ question, answer }, index) => (
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

      <section className="bg-[#0a0a0a] text-white">
        <Reveal className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 py-16 sm:px-6 sm:py-20 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <h2 className="max-w-xl text-3xl font-black tracking-tight sm:text-4xl">
            {content?.closingTitle ?? "Empieza a no perder llamadas esta semana."}
          </h2>
          <div className="shrink-0">
            <Link href={plansHref} className="btn-purple">
              Empezar ahora
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="bg-[#0a0a0a] text-white/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p className="text-sm">© 2026 Alhabla</p>
          <nav aria-label="Enlaces legales" className="flex flex-wrap items-center gap-x-4 text-sm font-medium">
            <Link href="/legal/privacidad" className="inline-flex h-11 items-center transition hover:text-white">Privacidad</Link>
            <Link href="/legal/aviso-legal" className="inline-flex h-11 items-center transition hover:text-white">Aviso legal</Link>
            <a href="mailto:hola@alhabla.ai" className="inline-flex h-11 items-center transition hover:text-white">Contacto</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
