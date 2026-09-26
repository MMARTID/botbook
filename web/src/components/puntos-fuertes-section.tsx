import { Clock3, Headphones, MessageSquareText, Store } from "lucide-react";

import { Reveal } from "@/components/scroll-reveal";

/**
 * Lo que diferencia a Alhabla de un contestador o de un bot genérico
 * (2026-09-26), sacado del «Positioning» de PRODUCT.md: tres ventajas con
 * dibujo (reserva verificada, voz natural, reparto por especialidad) y tres
 * más en una fila compacta. El Gestor tiene sección propia más abajo.
 */

const OTRAS = [
  {
    Icono: Store,
    titulo: "Hecha para tu sector",
    texto:
      "Peluquerías, barberías, uñas, estética y fisioterapia: arranca con los servicios, las duraciones y las preguntas típicas de tu oficio, no con una plantilla genérica.",
  },
  {
    Icono: MessageSquareText,
    titulo: "Si no lo sabe, no se lo inventa",
    texto:
      "Cuando le preguntan algo que no está en tus datos, toma un recado con el nombre y el teléfono del cliente y te lo pasa. Nada de respuestas improvisadas.",
  },
  {
    Icono: Clock3,
    titulo: "Siempre disponible",
    texto:
      "Atiende las 24 horas, también fines de semana y festivos. Y si tu calendario se desconecta, te avisa para que ninguna reserva se quede en el aire.",
  },
] as const;

export function PuntosFuertesSection({ onEscuchar }: { onEscuchar: () => void }) {
  return (
    <section className="border-b border-[#e5e5e5] py-16 sm:py-24" aria-labelledby="puntos-fuertes-titulo">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-2xl">
          <h2 id="puntos-fuertes-titulo" className="text-3xl font-black tracking-tight text-[#0a0a0a] sm:text-4xl">
            No es un contestador. Es tu recepción.
          </h2>
          <p className="mt-4 text-base leading-7 text-[#52525b] sm:text-lg sm:leading-8">
            Un contestador toma nota y te deja el trabajo a ti. Alhabla resuelve la llamada: informa, reserva y confirma, con las mismas reglas que pondrías tú.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-5 sm:mt-12 lg:grid-cols-3">
          <Reveal delay={0} className="h-full">
            <article className="flex h-full flex-col rounded-3xl border border-[#e5e5e5] bg-white p-7">
              <div className="flex h-36 flex-col justify-center gap-2 rounded-2xl bg-[#fafafa] px-5 text-sm" aria-hidden="true">
                <div className="flex items-center gap-3">
                  <span className="w-11 shrink-0 tabular-nums text-xs text-[#a1a1aa]">17:00</span>
                  <span className="flex-1 rounded-xl bg-[#ececef] px-3 py-1.5 text-[#71717a] line-through decoration-[#a1a1aa]">Ocupado</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-11 shrink-0 tabular-nums text-xs text-[#a1a1aa]">17:30</span>
                  <span className="flex flex-1 items-center justify-between rounded-xl bg-[#f3eeff] px-3 py-1.5 font-semibold text-[#6d28d9] ring-1 ring-inset ring-[#8b5cf6]/30">
                    Libre · 90 min <span className="text-xs font-medium">con Marta</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-11 shrink-0 tabular-nums text-xs text-[#a1a1aa]">19:00</span>
                  <span className="flex-1 rounded-xl bg-[#ececef] px-3 py-1.5 text-[#71717a] line-through decoration-[#a1a1aa]">Ocupado</span>
                </div>
              </div>
              <h3 className="mt-7 text-xl font-bold tracking-tight text-[#0a0a0a]">Nunca reserva a ciegas</h3>
              <p className="mt-2 text-base leading-7 text-[#52525b]">
                Comprueba tu horario y tu calendario antes de ofrecer una hora, y cuenta lo que dura cada servicio. Tu agenda manda: no promete huecos que no existen ni te monta dos citas a la vez.
              </p>
            </article>
          </Reveal>

          <Reveal delay={0.08} className="h-full">
            <article className="flex h-full flex-col rounded-3xl border border-[#e5e5e5] bg-white p-7">
              <div className="flex h-36 items-center justify-center gap-[5px] rounded-2xl bg-[#f3eeff]" aria-hidden="true">
                {[22, 38, 58, 34, 70, 48, 28, 62, 44, 30, 52, 26, 40].map((alto, i) => (
                  <span key={i} className="w-[5px] rounded-full bg-[#8b5cf6]" style={{ height: alto, opacity: 0.45 + (alto / 70) * 0.55 }} />
                ))}
              </div>
              <h3 className="mt-7 text-xl font-bold tracking-tight text-[#0a0a0a]">Suena a persona, no a robot</h3>
              <p className="mt-2 text-base leading-7 text-[#52525b]">
                Voz natural en español de España que se deja interrumpir y no espera silencios largos para contestar, como quien atiende en tu mostrador.
              </p>
              <div className="mt-auto pt-6">
                <button type="button" onClick={onEscuchar} className="btn-secondary">
                  <Headphones className="h-4 w-4" aria-hidden="true" /> Escuchar una llamada
                </button>
              </div>
            </article>
          </Reveal>

          <Reveal delay={0.16} className="h-full">
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
                Marcas quién es especialista en cada servicio y Alhabla reparte las citas como lo harías tú. Si el cliente pide a alguien por su nombre, con esa persona; entre dos igual de buenos, al que tenga el día más despejado.
              </p>
            </article>
          </Reveal>
        </div>

        <div className="mt-5 grid gap-5 rounded-3xl border border-[#e5e5e5] bg-[#fafafa] p-7 sm:gap-8 lg:grid-cols-3">
          {OTRAS.map(({ Icono, titulo, texto }, i) => (
            <Reveal key={titulo} delay={i * 0.06} y={10}>
              <div className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
                  <Icono className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-[#0a0a0a]">{titulo}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#52525b]">{texto}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
