import { CalendarOff, Check, MessageCircleMore, UserX } from "lucide-react";
import type { NicheAccent, OwnerAssistant } from "@/lib/niche-landings";
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
 * derecha en escritorio), aquí el texto va a la izquierda y las tarjetas a
 * la derecha — como el bloque de calendario de `site-landing.tsx` — para que
 * las dos secciones alternen en vez de repetir el mismo layout dos veces
 * seguidas.
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
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-12">
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
          </Reveal>

          <div>
            <div className="grid gap-3">
              {data.examples.map((example, index) => {
                const Icon = EXAMPLE_ICONS[index] ?? MessageCircleMore;
                return (
                  <Reveal key={example.title} delay={index * 0.1} y={14}>
                    <div className="flex items-start gap-4 rounded-2xl border border-[#e5e5e5] bg-white p-4">
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: a.soft, color: a.strong }}
                      >
                        <Icon className="h-6 w-6" strokeWidth={2.25} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold leading-5 text-[#0a0a0a]">{example.title}</h3>
                        <p className="mt-1.5 text-sm leading-6 text-[#52525b]">{example.description}</p>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
            {/* Cierra los tres ejemplos, igual que `tieBreak` en
                TeamRoutingSection: pegado a ellos, no al titular, para que en
                móvil se lea justo después del último. */}
            <Reveal delay={0.3} y={14}>
              <p className="mt-4 px-1 text-sm leading-6 text-[#52525b]">{data.closing}</p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
