import { Check } from "lucide-react";
import { Reveal } from "@/components/scroll-reveal";

// Contenido fijo, igual en la landing principal y en las cinco de nicho: el
// canal de WhatsApp hace el mismo trabajo sea cual sea el negocio, así que
// no hace falta una variante por sector (a diferencia de `ownerAssistant`).
const PARA_NEGOCIO = [
  "Cambia turnos, bajas y cierres desde el móvil, sin abrir el panel",
  "Si un profesional falta, le propones a quién mover sus citas con un botón",
  "Te avisa al momento de cada reserva y cancelación nueva",
  "Da de alta servicios, equipo y horario por chat, no solo desde el panel",
] as const;

const PARA_CLIENTE = [
  "Recibe confirmación y recordatorio de su cita por WhatsApp",
  "Puede cambiar o cancelar su cita respondiendo al mensaje, sin llamar",
  "Si no hay hueco, entra en lista de espera y le avisan al liberarse uno",
  "Puede reservar o mover su cita hablando por WhatsApp con la recepcionista",
] as const;

function BenefitColumn({ heading, items }: { heading: string; items: readonly string[] }) {
  return (
    <div className="p-6 sm:p-8">
      <h3 className="text-sm font-bold uppercase tracking-[0.08em] text-[#6d28d9]">{heading}</h3>
      <ul className="mt-5 grid gap-4">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-[#27272a]">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Un mismo canal, dos trabajos: recapitula en una tabla lo que el WhatsApp
 * de Alhabla hace por el negocio (el Gestor, justo arriba) y lo que hace por
 * sus clientes (confirmaciones, cambios, lista de espera — no cubierto en
 * ningún otro bloque de la landing). Sin esto, alguien que solo ve el
 * Gestor puede pensar que el WhatsApp es solo para el dueño.
 */
export function WhatsAppBenefitsTable() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-2xl">
          <h2 className="text-3xl font-black leading-tight tracking-tight text-[#0a0a0a] sm:text-4xl">
            Un mismo WhatsApp, dos lados atendidos a la vez.
          </h2>
          <p className="mt-4 text-base leading-7 text-[#52525b]">
            A ti te deja llevar el negocio desde el móvil. A tus clientes les evita tener que llamar para lo de siempre.
          </p>
        </Reveal>

        <Reveal delay={0.1} y={16}>
          <div className="mt-10 overflow-hidden rounded-3xl border border-[#e5e5e5] bg-white sm:grid sm:grid-cols-2 sm:divide-x sm:divide-[#e5e5e5]">
            <BenefitColumn heading="Para tu negocio" items={PARA_NEGOCIO} />
            <div className="border-t border-[#e5e5e5] sm:border-t-0">
              <BenefitColumn heading="Para tus clientes" items={PARA_CLIENTE} />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
