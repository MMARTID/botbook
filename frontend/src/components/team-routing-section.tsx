import { Award, Check, UserCheck, Users } from "lucide-react";
import type { NicheAccent, TeamRouting } from "@/lib/niche-landings";
import { Reveal } from "@/components/scroll-reveal";

const FALLBACK_ACCENT: NicheAccent = {
  strong: "#8b5cf6",
  soft: "#f3eeff",
  deep: "#0a0a0a",
};

// Texto del badge sobre el lavado: siempre la tinta oscura de la familia
// (Tinta Morada en la principal, `deep` en cada nicho). Nunca `strong` como
// texto — falla AA en tres de los cinco acentos de nicho.
const FALLBACK_INK = "#6d28d9";

// Un icono por nivel: especialista (Award), pedido por su nombre (UserCheck)
// y el resto del equipo (Users). El orden es el de `data.rules`.
const RULE_ICONS = [Award, UserCheck, Users] as const;

/**
 * Reparto de citas por especialidad. Es el mismo bloque en la landing
 * principal (copy genérico, `generalTeamRouting`) y en las cinco de nicho
 * (`content.teamRouting`), como ya hace `SectorDataSection`.
 *
 * Espejo del bloque de calendario de `site-landing.tsx`: allí el texto va a
 * la izquierda y las filas a la derecha; aquí las filas ocupan la columna
 * ancha de la izquierda en escritorio y el texto la derecha. El DOM mantiene
 * texto → filas para que en móvil y para lectores de pantalla el titular
 * siga yendo antes que las reglas.
 */
export function TeamRoutingSection({
  data,
  accent,
}: {
  data: TeamRouting;
  accent?: NicheAccent;
}) {
  const a = accent ?? FALLBACK_ACCENT;
  const badgeInk = accent ? accent.deep : FALLBACK_INK;

  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-12">
          <Reveal className="lg:order-2">
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

          <div className="lg:order-1">
            <div className="grid gap-3">
              {data.rules.map((rule, index) => {
                const Icon = RULE_ICONS[index] ?? Users;
                return (
                  <Reveal key={rule.title} delay={index * 0.1} y={14}>
                    <div className="flex items-start gap-4 rounded-2xl border border-[#e5e5e5] bg-white p-4">
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: a.soft, color: a.strong }}
                      >
                        <Icon className="h-6 w-6" strokeWidth={2.25} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold leading-5 text-[#0a0a0a]">{rule.title}</h3>
                        <p className="mt-1.5 text-sm leading-6 text-[#52525b]">{rule.description}</p>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
            {/* El desempate cierra las tres reglas: va pegado a ellas, no al
                titular, para que en móvil se lea justo después de la última. */}
            <Reveal delay={0.3} y={14}>
              <p className="mt-4 px-1 text-sm leading-6 text-[#52525b]">{data.tieBreak}</p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
