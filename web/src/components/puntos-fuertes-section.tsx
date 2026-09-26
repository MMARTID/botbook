import { Check, Headphones } from "lucide-react";

import { Reveal } from "@/components/scroll-reveal";

/**
 * Los tres puntos fuertes, en tres tarjetas cortas (2026-09-26). Sustituye
 * en la portada a los bloques largos de reparto por especialidad y de El
 * Gestor: la misma idea, en una frase y un ejemplo cada uno. El detalle
 * completo sigue en las landings de nicho.
 */
export function PuntosFuertesSection({ onEscuchar }: { onEscuchar: () => void }) {
  return (
    <section className="border-b border-[#e5e5e5] py-16 sm:py-24" aria-labelledby="puntos-fuertes-titulo">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-2xl">
          <h2 id="puntos-fuertes-titulo" className="text-3xl font-black tracking-tight text-[#0a0a0a] sm:text-4xl">
            No es un contestador. Es tu recepción.
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-5 sm:mt-12 lg:grid-cols-3">
          <Reveal delay={0} className="h-full">
            <article className="flex h-full flex-col rounded-3xl border border-[#e5e5e5] bg-white p-7">
              <div className="flex h-36 items-center justify-center gap-[5px] rounded-2xl bg-[#f3eeff]" aria-hidden="true">
                {[22, 38, 58, 34, 70, 48, 28, 62, 44, 30, 52, 26, 40].map((alto, i) => (
                  <span key={i} className="w-[5px] rounded-full bg-[#8b5cf6]" style={{ height: alto, opacity: 0.45 + (alto / 70) * 0.55 }} />
                ))}
              </div>
              <h3 className="mt-7 text-xl font-bold tracking-tight text-[#0a0a0a]">Suena a persona, no a robot</h3>
              <p className="mt-2 text-base leading-7 text-[#52525b]">
                Habla con naturalidad y se deja interrumpir, como quien atiende en tu mostrador. Si algo no lo sabe, toma un recado en vez de inventárselo.
              </p>
              <div className="mt-auto pt-6">
                <button type="button" onClick={onEscuchar} className="btn-secondary">
                  <Headphones className="h-4 w-4" aria-hidden="true" /> Escuchar una llamada
                </button>
              </div>
            </article>
          </Reveal>

          <Reveal delay={0.08} className="h-full">
            <article className="flex h-full flex-col rounded-3xl border border-[#e5e5e5] bg-white p-7">
              <div className="flex h-36 flex-col justify-center gap-2 rounded-2xl bg-[#fafafa] px-5" aria-hidden="true">
                {[
                  { nombre: "Marta", nivel: "Especialista en color", fuerte: true },
                  { nombre: "Javier", nivel: "Lo hace", fuerte: false },
                  { nombre: "Elena", nivel: "Solo si lo piden", fuerte: false },
                ].map((p) => (
                  <div key={p.nombre} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-1.5 text-sm ring-1 ring-[#ececef]">
                    <span className="font-semibold text-[#27272a]">{p.nombre}</span>
                    <span className={p.fuerte ? "rounded-full bg-[#f3eeff] px-2 py-0.5 text-xs font-semibold text-[#6d28d9]" : "text-xs text-[#71717a]"}>{p.nivel}</span>
                  </div>
                ))}
              </div>
              <h3 className="mt-7 text-xl font-bold tracking-tight text-[#0a0a0a]">Cada cita, con quien tú elegirías</h3>
              <p className="mt-2 text-base leading-7 text-[#52525b]">
                Marcas quién es especialista en cada servicio y Alhabla reparte las citas como lo harías tú. Si el cliente pide a alguien por su nombre, con esa persona.
              </p>
            </article>
          </Reveal>

          <Reveal delay={0.16} className="h-full">
            <article className="flex h-full flex-col rounded-3xl border border-[#e5e5e5] bg-white p-7">
              <div className="flex h-36 flex-col justify-center gap-2 rounded-2xl bg-[#efeae2] px-5 text-sm" aria-hidden="true">
                <p className="max-w-[80%] self-end rounded-xl rounded-br-sm bg-[#d9fdd3] px-3 py-1.5 text-[#111b21]">Ana está de baja hoy</p>
                <p className="max-w-[88%] rounded-xl rounded-tl-sm bg-white px-3 py-1.5 text-[#111b21]">Tenía una cita a las 11:00. ¿Se la paso a Marcos?</p>
                <p className="inline-flex w-fit items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 font-semibold text-[#027eb5]">
                  <Check className="h-3.5 w-3.5" /> Confirmar
                </p>
              </div>
              <h3 className="mt-7 text-xl font-bold tracking-tight text-[#0a0a0a]">Y tú lo gestionas por WhatsApp</h3>
              <p className="mt-2 text-base leading-7 text-[#52525b]">
                Un profesional que falta, un día que cierras o un precio que cambia: se lo dices por WhatsApp y te propone el cambio. Solo lo aplica cuando tú confirmas.
              </p>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
