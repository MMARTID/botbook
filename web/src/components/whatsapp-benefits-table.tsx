import { Check } from "lucide-react";
import type { NicheAccent } from "@/lib/niche-landings";
import { Reveal } from "@/components/scroll-reveal";

const FALLBACK_ACCENT: NicheAccent = { strong: "#8b5cf6", soft: "#f3eeff", deep: "#6d28d9" };

// Contenido fijo: el canal de WhatsApp hace el mismo trabajo sea cual sea el
// negocio, así que no hace falta una variante por sector.
const PARA_CLIENTE = [
  "Recibe confirmación y recordatorio de su cita por WhatsApp",
  "Puede cambiar o cancelar su cita respondiendo al mensaje, sin llamar",
  "Si no hay hueco, entra en lista de espera y le avisan al liberarse uno",
  "Puede reservar o mover su cita hablando por WhatsApp con la recepcionista",
] as const;

/**
 * Continuación de El Gestor (owner-assistant-section.tsx), montada justo
 * después — no una sección nueva (2026-09-24). El Gestor ya cuenta el lado
 * del dueño con prosa, ejemplos y un mockup de chat; repetirlo aquí en una
 * columna "Para tu negocio" era la misma historia dos veces. Esta pieza
 * cierra el otro lado del mismo canal: qué recibe el cliente que llama,
 * información que ningún otro bloque de la landing cubre.
 *
 * Solo se usa en las landings de nicho (site-landing.tsx) — la principal ya
 * no monta esta sección (recorte 2026-09-24, ver main-landing.tsx).
 */
export function WhatsAppBenefitsTable({ accent }: { accent?: NicheAccent }) {
  const a = accent ?? FALLBACK_ACCENT;
  return (
    <section className="pb-16 sm:pb-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="panel overflow-hidden">
          <div className="p-6 sm:p-8">
            <h3 className="text-sm font-bold uppercase tracking-[0.08em]" style={{ color: a.deep }}>
              Y tus clientes, sin tener que llamar
            </h3>
            <Reveal delay={0.05} y={12}>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                {PARA_CLIENTE.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-[#27272a]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: a.strong }} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
