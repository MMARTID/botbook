import { CalendarOff, Check, MessageCircleMore, UserX } from "lucide-react";
import type { NicheAccent, OwnerAssistant } from "@/lib/niche-landings";
import { OwnerAssistantChatMockup } from "@/components/owner-assistant-chat";
import { Reveal } from "@/components/scroll-reveal";

const FALLBACK_ACCENT: NicheAccent = {
  strong: "#8b5cf6",
  soft: "#f3eeff",
  deep: "#0a0a0a",
};

const FALLBACK_INK = "#6d28d9";

// Un icono por ejemplo: ausencia de un profesional (UserX), cierre de la
// agenda (CalendarOff) y consulta o cambio rápido (MessageCircleMore). El
// orden es el de `data.examples`.
const EXAMPLE_ICONS = [UserX, CalendarOff, MessageCircleMore] as const;

/**
 * El Gestor: el negocio le habla a Alhabla por WhatsApp para cambiar su
 * propia agenda, no solo para que sus clientes reserven por teléfono. Mismo
 * bloque en la landing principal (copy genérico, `generalOwnerAssistant`) y
 * en las cinco de nicho (`content.ownerAssistant`), como `TeamRoutingSection`.
 *
 * A diferencia de `TeamRoutingSection` (cartas a la izquierda, texto a la
 * derecha en escritorio), aquí el texto va a la izquierda y el mockup a la
 * derecha — como el bloque de calendario de `site-landing.tsx` — para que
 * las dos secciones alternen en vez de repetir el mismo layout dos veces
 * seguidas.
 *
 * El mockup de conversación (`OwnerAssistantChatMockup`) es el elemento
 * gráfico principal: dramatiza el primer caso de `data.examples` turno a
 * turno. Los otros dos casos se quedan en texto, más compactos que antes
 * (una fila con icono en vez de una tarjeta con borde), porque ya no son lo
 * primero que ve el visitante — el mockup se lleva esa función.
 */
export function OwnerAssistantSection({
  data,
  accent,
}: {
  data: OwnerAssistant;
  accent?: NicheAccent;
}) {
  const a = accent ?? FALLBACK_ACCENT;
  const badgeInk = accent ? accent.deep : FALLBACK_INK;

  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-12">
          <Reveal>
            <span
              className={
                accent
                  ? "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset"
                  : "badge-soft gap-2"
              }
              style={
                accent
                  ? ({
                      backgroundColor: accent.soft,
                      color: badgeInk,
                      "--tw-ring-color": `${accent.strong}33`,
                    } as React.CSSProperties)
                  : undefined
              }
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {data.badge}
            </span>
            <h2 className="mt-5 text-3xl font-black leading-tight tracking-tight text-[#0a0a0a] sm:text-4xl">
              {data.title}
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-[#52525b]">{data.description}</p>

            {/* Los otros dos casos de uso, en texto compacto bajo el titular
                en escritorio (donde el mockup ya ocupa la columna ancha) —
                en móvil quedan igualmente antes del mockup, en el orden
                natural del DOM. */}
            <div className="mt-6 grid gap-3">
              {data.examples.slice(1).map((example, index) => {
                const Icon = EXAMPLE_ICONS[index + 1] ?? MessageCircleMore;
                return (
                  <Reveal key={example.title} delay={index * 0.1} y={10}>
                    <div className="flex items-start gap-3">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: a.soft, color: a.strong }}
                      >
                        <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold leading-5 text-[#0a0a0a]">{example.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-[#52525b]">{example.description}</p>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>

            <Reveal delay={0.2} y={10}>
              <p className="mt-5 text-sm leading-6 text-[#52525b]">{data.closing}</p>
            </Reveal>
          </Reveal>

          <Reveal delay={0.1} y={16}>
            <OwnerAssistantChatMockup data={data.chat} />
            <p className="mt-3 px-1 text-xs leading-5 text-[#a1a1aa]">
              {data.examples[0].title}: ejemplo de una conversación real por WhatsApp.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
