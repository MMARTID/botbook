
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Check, Clock3, MessageCircleMore, PhoneCall, Scissors, Sparkles, Store } from "lucide-react";
import { LandingHero } from "@/components/landing-hero";
import { MobileNav } from "@/components/mobile-nav";
import { SectorDataSection } from "@/components/sector-data-section";
import { RevenueLossCalculator } from "@/components/revenue-loss-calculator";
import { formatIncludedMinutes, formatPlanPrice, plans, TRIAL_REASSURANCE } from "@/lib/plans";
import { generalSectorData, nicheLinks, type NicheLandingContent } from "@/lib/niche-landings";

const ASSET_PATHS = {
  logo: "/brand/logo.svg",
} as const;

function buildPlansHref(niche?: string) {
  return niche ? `/planes?niche=${encodeURIComponent(niche)}` : "/planes";
}

function BrandLogo() {
  return (
    <Link href="/landing" aria-label="Ir al inicio de AsistAI" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/70 bg-white/90 shadow-[0_8px_24px_rgba(30,43,34,0.06)] backdrop-blur sm:h-11 sm:w-11 sm:rounded-2xl">
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
        <p className="hidden text-xs text-[#54634b] sm:block">Recepción inteligente para negocios</p>
      </div>
    </Link>
  );
}

const highlights = [
  {
    title: "Atención 24/7",
    description: "Responde llamadas fuera de horario y evita perder reservas o consultas importantes.",
  },
  {
    title: "Agenda conectada",
    description: "Sincroniza disponibilidad real y confirma citas sin fricción para el cliente.",
  },
  {
    title: "Conversaciones útiles",
    description: "Anota lo que pide cada cliente y te deja solo las llamadas que necesitan que hables tú.",
  },
] as const;

const businessBenefits = [
  {
    title: "Peluquerías",
    description: "Reserva cortes, color y tratamientos incluso mientras todo el equipo está atendiendo.",
    result: "Menos llamadas perdidas en horas punta",
  },
  {
    title: "Centros de estética",
    description: "Responde dudas sobre servicios, duración y disponibilidad antes de confirmar la cita.",
    result: "Una atención cuidada desde el primer contacto",
  },
  {
    title: "Barberías, uñas y fisioterapia",
    description: "Cita con el profesional de siempre, duración real de cada servicio y huecos que cuadran con tu jornada.",
    result: "La agenda se llena sin soltar las manos",
  },
] as const;

/**
 * Los iconos van por posición: las landings de nicho sustituyen los textos de
 * estos tres huecos, pero no traen icono propio. El orden es el contrato.
 */
const HIGHLIGHT_ICONS = [Clock3, CalendarDays, PhoneCall] as const;
const BENEFIT_ICONS = [Scissors, Sparkles, Store] as const;

const frequentlyAskedQuestions = [
  {
    question: "¿Mantengo mi número de teléfono de siempre?",
    answer: "Sí, completamente. Tus clientes seguirán llamando a tu número habitual; AsistAI atiende las llamadas mediante un simple desvío desde tu móvil o fijo. No tienes que publicar un número nuevo ni avisar a nadie.",
  },
  {
    question: "¿Cómo funciona el desvío de llamadas? ¿Es difícil de configurar?",
    answer: "Es muy sencillo. Activas un desvío desde tu teléfono habitual marcando un código rápido; tarda unos 15 segundos. Te damos las instrucciones paso a paso para tu operador, sin cambiar tu número ni tocar ajustes técnicos.",
  },
  {
    question: "¿Puede reservar, cambiar y cancelar citas en mi agenda?",
    answer: "Sí. AsistAI comprueba tu horario y tu disponibilidad real antes de ofrecer un hueco, y registra, modifica o cancela citas directamente en tu Google Calendar o tu Outlook, respetando los servicios y las reglas que marques.",
  },
  {
    question: "¿Puede responder dudas sobre mis servicios y precios?",
    answer: "Sí. Le das la información real de tu negocio: carta de precios en PDF, servicios, duración, horarios y datos de Google Maps. Así responde con seguridad sin que tengas que dejar a medias un tinte, unas uñas o una sesión.",
  },
  {
    question: "¿La voz suena natural o como un robot antiguo?",
    answer: "Suena natural y cercana, en español de España. Puedes ajustar cómo habla —más cálida, más profesional o más directa— y si da respuestas breves o algo más explicadas, para que encaje con el trato que das en tu negocio.",
  },
  {
    question: "¿Qué ocurre si una llamada necesita atención humana o es urgente?",
    answer: "AsistAI recoge el motivo, los datos y el contexto de la llamada para que no se pierda nada importante. Cuando una consulta requiere a tu equipo, deja el aviso preparado para que podáis responder con toda la información.",
  },
  {
    question: "¿Qué pasa si un cliente llama fuera de mi horario?",
    answer: "AsistAI sigue disponible 24/7. Puede resolver dudas y gestionar solicitudes incluso por la noche, en festivos o mientras tienes cerrado, para que no pierdas una posible cita por no contestar.",
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
        href="#contenido"
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
            <a href="#preguntas" className="text-sm font-medium text-[#344038] transition hover:text-[#1e2b22]">
              Preguntas
            </a>
            <Link href="/login" className="btn-secondary px-4">
              Iniciar sesión
            </Link>
            <Link href={plansHref} className="btn-primary px-4">
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

      <section id="como-funciona" className="border-y border-white/70 bg-white/35 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-9 max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{content?.sectionTitle ?? "Atiende cada llamada. Sin dejar lo que estás haciendo."}</h2>
            {content?.sectionDescription ? <p className="mt-4 text-base leading-7 text-[#54634b]">{content.sectionDescription}</p> : null}
          </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {visibleHighlights.map(({ title, description }, index) => {
            const Icon = HIGHLIGHT_ICONS[index] ?? PhoneCall;
            return (
            <article key={`${title}-detail`} className="panel p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef6dc] text-[#2c7334]">
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
          <div className="grid gap-7 rounded-2xl border border-[#d4e4bd] bg-white/75 p-6 shadow-[0_8px_24px_rgba(30,43,34,0.06)] sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-12 lg:p-10">
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
              <h2 className="text-3xl font-semibold leading-tight tracking-tight text-[#1e2b22] sm:text-4xl lg:text-5xl">
                {content?.benefitsTitle ?? "El teléfono deja de interrumpir. Empieza a trabajar para ti."}
              </h2>
              <p className="mt-5 text-base leading-8 text-[#54634b]">
                {content?.benefitsDescription ?? "Cada llamada es una oportunidad de reservar, resolver una duda o captar un nuevo cliente. AsistAI mantiene esa puerta abierta aunque estés ocupado, fuera de horario o atendiendo a otra persona."}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {visibleBenefits.map(({ title, description, result }, index) => {
                const Icon = BENEFIT_ICONS[index] ?? Store;
                return (
                <article key={title} className="group rounded-2xl border border-white/80 bg-white/85 p-5 shadow-[0_4px_16px_rgba(30,43,34,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(30,43,34,0.08)] sm:p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef6dc] text-[#2c7334] transition group-hover:bg-[#dff3ad]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-[#1e2b22]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#54634b]">{description}</p>
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

        </div>
      </section>

      <RevenueLossCalculator content={content?.calculator} />

      <section id="soluciones" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-[#dce6d4] bg-white/75 p-6 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-tight text-[#1e2b22]">Descubre AsistAI para tu sector</h2>
          <div className="mt-5 flex flex-wrap gap-3">
            {nicheLinks.map((link) => (
              <Link key={link.href} href={link.href} className={`inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold transition duration-200 ${content && link.href === `/${content.slug}` ? "border-[#1e2b22] bg-[#1e2b22] text-white" : "border-[#d7e3ce] bg-white text-[#344038] hover:bg-[#eef6dc]"}`}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="precios" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="panel p-6 sm:p-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-[#1e2b22] sm:text-4xl">Planes claros para crecer sin fricción</h2>
            <p className="mt-4 text-base leading-7 text-[#54634b]">
              Empieza con el volumen que necesitas y cambia de plan cuando crezca tu negocio.
            </p>
            <p className="mt-4 flex flex-wrap items-center gap-2 text-base font-semibold leading-7 text-[#2c7334]">
              <Check className="h-5 w-5 shrink-0" aria-hidden="true" />
              {TRIAL_REASSURANCE}
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.id}
                className={`rounded-xl border p-6 ${plan.featured ? "border-[#cfe6b0] bg-[linear-gradient(180deg,#f9fceb_0%,#ffffff_100%)] shadow-[0_8px_24px_rgba(30,43,34,0.06)]" : "border-[#e5ebdd] bg-white/85 shadow-[0_4px_16px_rgba(30,43,34,0.04)]"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-[#1e2b22]">{plan.name}</h3>
                  {plan.featured ? <span className="badge-soft">Recomendado</span> : null}
                </div>
                <p className="mt-6 text-4xl font-semibold tracking-tight text-[#1e2b22]">{formatPlanPrice(plan.price)}<span className="text-base font-medium text-[#54634b]">/mes</span></p>
                <p className="mt-3 text-sm font-semibold text-[#344038]">{formatIncludedMinutes(plan.minutes)} minutos incluidos</p>
                <p className="mt-2 text-sm leading-7 text-[#54634b]">{plan.summary}</p>
                <Link
                  href={`${plansHref}${plansHref.includes("?") ? "&" : "?"}plan=${plan.id}`}
                  className={`mt-6 inline-flex h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold transition duration-200 hover:-translate-y-0.5 active:translate-y-0 ${plan.featured ? "bg-[#1e2b22] text-white hover:bg-[#243026]" : "border border-[#d6dfcf] bg-white text-[#344038] hover:bg-[#f4f6f1]"}`}
                >
                  Elegir {plan.name}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="preguntas" className="scroll-m-20 border-y border-white/70 bg-white/35 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-14">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-[#1e2b22] sm:text-4xl">Resuelve tus dudas antes de empezar.</h2>
              <p className="mt-4 text-base leading-7 text-[#54634b]">
                Tú defines el tono, la información y las reglas con las que responde. Se configura desde tu panel y puedes cambiarlo cuando quieras.
              </p>

              <div className="mt-7 rounded-xl border border-[#d7e9c5] bg-[#f7fbee] p-6">
                <p className="text-base font-semibold leading-6 text-[#1e2b22]">Preparado para negocios con cita previa</p>
                <p className="mt-2 text-sm leading-6 text-[#54634b]">Servicios, horarios, precios, preguntas frecuentes y calendario trabajan juntos desde una única configuración.</p>
              </div>
            </div>

            <div className="grid items-start gap-3 sm:grid-cols-2">
              {visibleFaqs.map(({ question, answer }) => (
                <details key={question} className="group rounded-xl border border-[#e2e9dc] bg-white/90 p-5 shadow-sm open:shadow-[0_8px_24px_rgba(30,43,34,0.06)]">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-sm font-semibold leading-6 text-[#1e2b22] marker:content-none">
                    {question}
                    <span className="mt-1 text-lg leading-none text-[#54634b] transition group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="mt-3 border-t border-[#e8ece3] pt-3 text-sm leading-6 text-[#54634b]">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/70 bg-[#1e2b22] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{content?.closingTitle ?? "Empieza a no perder llamadas esta semana."}</h2>
          </div>
          <div className="shrink-0">
            <Link
              href={plansHref}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#b8d96e] px-6 text-sm font-semibold text-[#1e2b22] transition duration-200 hover:-translate-y-0.5 hover:bg-[#e3ff9e] active:translate-y-0"
            >
              Empezar ahora <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <p className="mt-3 text-sm text-white/75">{TRIAL_REASSURANCE}</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#1e2b22] text-white/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <p className="font-semibold text-white">AsistAI</p>
            <p className="mt-1 text-sm">Recepción telefónica para negocios con cita previa.</p>
          </div>
          <nav aria-label="Enlaces legales" className="flex flex-wrap items-center gap-x-4 text-sm font-medium">
            <Link href="/legal/privacidad" className="inline-flex h-11 items-center transition hover:text-white">Privacidad</Link>
            <Link href="/legal/aviso-legal" className="inline-flex h-11 items-center transition hover:text-white">Aviso legal</Link>
            <a href="#preguntas" className="inline-flex h-11 items-center transition hover:text-white">Preguntas frecuentes</a>
            <a href="mailto:hola@asistai.es" className="inline-flex h-11 items-center transition hover:text-white">Contacto</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
