
import Link from "next/link";
import { ArrowRight, Check, Scissors, Sparkles, Store } from "lucide-react";
import { LandingHero } from "@/components/landing-hero";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SectorDataSection } from "@/components/sector-data-section";
import { HowItWorksScrollytelling } from "@/components/how-it-works-scrollytelling";
import { TeamRoutingSection } from "@/components/team-routing-section";
import { OwnerAssistantSection } from "@/components/owner-assistant-section";
import { WhatsAppBenefitsTable } from "@/components/whatsapp-benefits-table";
import { RevenueLossCalculator } from "@/components/revenue-loss-calculator";
import { Reveal } from "@/components/scroll-reveal";
import { formatIncludedMinutes, formatPlanPrice, plans, TRIAL_REASSURANCE } from "@/lib/plans";
import { type NicheLandingContent, type NicheSlug } from "@/lib/niche-landings";
import { MainLanding } from "@/components/main-landing";

// Ejemplos de servicio/reserva que muestra el relato de "Cómo funciona" en
// cada landing de nicho (2026-09-24): antes de esto, las 5 landings
// mostraban siempre "Corte, color y tratamientos" / "Corte y peinado" —
// vocabulario de peluquería — sea cual fuera el nicho real de la página.
const COMO_FUNCIONA_EJEMPLOS: Record<NicheSlug, { servicio: string; reserva: string }> = {
  peluqueria: { servicio: "Corte, color y tratamientos", reserva: "Corte y peinado" },
  barberia: { servicio: "Corte, barba y afeitado", reserva: "Corte y barba" },
  "salon-de-unas": { servicio: "Manicura, gel y nail art", reserva: "Manicura semipermanente" },
  "centro-de-estetica": { servicio: "Faciales, corporales y bonos", reserva: "Facial con peeling" },
  fisioterapia: { servicio: "Primera consulta y seguimientos", reserva: "Primera consulta" },
};

function buildPlansHref(niche?: string) {
  return niche ? `/planes?niche=${encodeURIComponent(niche)}` : "/planes";
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
  // La portada general tiene que resolver una sola pregunta —qué hace Alhabla
  // y por qué probarlo—. El material largo vive en las páginas de cada sector,
  // donde esa profundidad sí responde a una intención de búsqueda concreta.
  if (!content) return <MainLanding />;

  const visibleBenefits = content?.benefits ?? businessBenefits;
  const visibleFaqs = content?.faqs ?? frequentlyAskedQuestions;
  const plansHref = buildPlansHref(content?.slug);

  return (
    <main
      id="main-content"
      // Sin campo de partículas (decisión 2026-09-16): en la landing ensuciaba
      // el contenido y competiría con las animaciones del hero; queda
      // reservado a login/registro/onboarding.
      className="relative isolate min-h-screen w-full bg-white text-[#0a0a0a]"
      data-landing="alhabla"
    >
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-[10px] focus:bg-[#0a0a0a] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Saltar al contenido
      </a>

      <SiteHeader niche={content?.slug} />

      <div id="contenido" tabIndex={-1} className="outline-none">
        <LandingHero content={content} />
      </div>

      {content.sectorData ? <SectorDataSection data={content.sectorData} accent={content.accent} /> : null}

      {/*
        Sin fondo propio a partir de aquí (salvo los bloques negros reales,
        como el CTA final): las secciones dejaban de tener fondo transparente
        y tapaban el campo de partículas, que solo se veía en el hero y en
        "precios" — la queja real de "solo hay efecto en dos zonas". El ritmo
        visual entre secciones lo dan el espaciado y, donde ya existía, el
        borde — no un tinte de fondo.
      */}
      {/*
        Cómo funciona (2026-09-24, propuesta de conversión): antes había un
        bloque estático propio aquí (CallForwardingFlow + tres tarjetas fijas,
        siempre en morado de marca) distinto del relato con scroll que ya
        tenía la landing principal — dos explicaciones para lo mismo, una de
        ellas sin animación propia. Ahora las 5 landings de nicho montan el
        mismo componente que la principal, con el acento y los ejemplos de
        servicio de su propio nicho — un solo relato, coherente en las 6
        páginas y ya sin el bug de scroll en móvil (ver el propio componente).

        La sección de integración de calendario que vivía justo debajo se
        quita como bloque propio: "Google Calendar y Outlook" ya es un
        checkmark del hero (landing-hero.tsx) — la señal de confianza se
        mantiene sin alargar la página con una sección entera para ella.
      */}
      <HowItWorksScrollytelling
        accent={content.accent}
        serviceExample={COMO_FUNCIONA_EJEMPLOS[content.slug].servicio}
        bookingExample={COMO_FUNCIONA_EJEMPLOS[content.slug].reserva}
      />

      {/*
        Reparto por especialidad justo después de cómo funciona: el visitante
        acaba de ver la agenda real en marcha y ahora ve que la cita cae en la
        persona que él elegiría. Es el diferenciador del producto y va en
        todos los planes — por eso no vive dentro de precios.
      */}
      <TeamRoutingSection data={content.teamRouting} accent={content.accent} />

      {/*
        El Gestor justo después del reparto por especialidad: el visitante
        acaba de ver que la agenda ya reparte solo por profesional, y ahora
        ve que además puede hablarle por WhatsApp cuando algo cambia (una
        baja, un cierre) — la continuación natural de "la agenda es lista",
        no un bloque suelto.
      */}
      <OwnerAssistantSection data={content.ownerAssistant} accent={content.accent} />

      <WhatsAppBenefitsTable accent={content.accent} />

      <section className="py-16 sm:py-20 lg:py-24">
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
                  <article className="panel landing-card-hover h-full p-6 sm:p-7">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-xl"
                      style={content?.accent ? { backgroundColor: content.accent.soft, color: content.accent.strong } : { backgroundColor: "#f3eeff", color: "#8b5cf6" }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 text-lg font-bold text-[#0a0a0a]">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-[#52525b]">{description}</p>
                    <div className="mt-5 border-t border-[#e5e5e5] pt-4">
                      <p className="flex items-start gap-2 text-sm font-semibold leading-5 text-[#27272a]">
                        <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: content?.accent?.strong ?? "#8b5cf6" }} />
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

      {/*
        Orden decidido (2026-09-16): la calculadora vive justo antes de
        Precios, no tras los datos del sector. El arco es problema (datos) →
        solución (cómo funciona) → prueba (calendario) → encaje (beneficios) →
        cuantificación (calculadora) → precio: la cifra de pérdida queda
        fresca al ver los 69€, y /planes reutiliza esa estimación
        (plans-with-roi) — su CTA ya no pide comprar antes de haber visto
        cómo funciona el producto.
      */}
      <RevenueLossCalculator content={content?.calculator} activeNiche={content?.slug} accent={content?.accent} />

      <section id="precios" className="scroll-m-20 mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <Reveal className="max-w-2xl">
          <h2 className="text-3xl font-black tracking-tight text-[#0a0a0a] sm:text-4xl">Planes claros, sin permanencia.</h2>
          <p className="mt-4 flex flex-wrap items-center gap-2 text-base font-semibold leading-7 text-[#27272a]">
            <Check className="h-5 w-5 shrink-0" style={{ color: content?.accent?.strong ?? "#8b5cf6" }} aria-hidden="true" />
            {TRIAL_REASSURANCE}
          </p>
        </Reveal>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {plans.map((plan, index) => (
            <Reveal key={plan.id} delay={index * 0.1}>
              {/*
                El plan recomendado se marcaba con una tarjeta negra maciza,
                que a media página competía con el bloque negro del CTA final y
                dejaba dos anclas oscuras compitiendo por la misma mirada. Pasa
                a fondo blanco con un aro morado: La Regla del Acento Único
                admite el "borde seleccionado" como el elemento morado que
                reclama la atención, y así el negro se reserva para el cierre.
              */}
              <article
                className={
                  plan.featured
                    ? "landing-card-hover relative flex h-full flex-col rounded-3xl bg-white p-7 ring-2 ring-[#8b5cf6]"
                    : "landing-card-hover flex h-full flex-col rounded-3xl border border-[#e5e5e5] bg-white p-7"
                }
                style={
                  plan.featured && content?.accent
                    ? { boxShadow: `0 0 0 2px ${content.accent.strong}` }
                    : undefined
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
                <p className="mt-3 text-sm font-semibold text-[#27272a]">
                  {formatIncludedMinutes(plan.minutes)} minutos incluidos
                </p>
                <p className="mt-2 text-sm leading-7 text-[#52525b]">{plan.summary}</p>
                <Link
                  href={`${plansHref}${plansHref.includes("?") ? "&" : "?"}plan=${plan.id}`}
                  className={plan.featured ? "btn-primary mt-6" : "btn-secondary mt-6"}
                >
                  Elegir {plan.name}
                </Link>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="preguntas" className="scroll-m-20 border-y border-[#e5e5e5] py-16 sm:py-20">
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
                    <span className="mt-1 text-lg leading-none transition group-open:rotate-45" style={{ color: content?.accent?.strong ?? "#8b5cf6" }} aria-hidden="true">+</span>
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

      <SiteFooter />
    </main>
  );
}
