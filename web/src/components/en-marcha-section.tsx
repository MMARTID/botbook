import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Reveal } from "@/components/scroll-reveal";
import { TRIAL_REASSURANCE } from "@/lib/plans";

/**
 * Puesta en marcha (2026-09-26): responde a «¿es difícil?» justo antes del
 * precio, con los tres pasos reales del alta (negocio → calendario →
 * desvío). Sin tiempos totales inventados: el único dato medido es el del
 * desvío, que ya cita la FAQ.
 */
const PASOS = [
  {
    titulo: "Das de alta tu negocio",
    texto:
      "Lo buscas en Google y rellenamos los datos básicos. Eliges tu sector y partes de sus servicios habituales; solo ajustas precios, duraciones y quién hace cada cosa.",
  },
  {
    titulo: "Conectas tu calendario",
    texto:
      "Google Calendar, Outlook o iCloud. Alhabla lee tus huecos y apunta las citas donde ya las miras tú, sin cambiar de agenda.",
  },
  {
    titulo: "Activas el desvío",
    texto:
      "Marcas un código en tu teléfono: unos 15 segundos, y te guiamos según tu operador. Tu número no cambia y no tienes que avisar a nadie.",
  },
] as const;

export function EnMarchaSection() {
  return (
    <section className="border-b border-[#e5e5e5] bg-[#fafafa] py-16 sm:py-24" aria-labelledby="en-marcha-titulo">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-2xl">
          <h2 id="en-marcha-titulo" className="text-3xl font-black tracking-tight text-[#0a0a0a] sm:text-4xl">
            Lo pones en marcha tú, sin técnicos.
          </h2>
          <p className="mt-4 text-base leading-7 text-[#52525b] sm:text-lg sm:leading-8">
            Se configura desde el móvil, entre cliente y cliente. Y si lo dejas a medias, sigues luego donde lo dejaste.
          </p>
        </Reveal>

        <ol className="mt-10 grid gap-5 sm:mt-12 lg:grid-cols-3">
          {PASOS.map((paso, i) => (
            <li key={paso.titulo}>
              <Reveal delay={i * 0.08} className="h-full rounded-3xl border border-[#e5e5e5] bg-white p-7">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[#8b5cf6] text-sm font-bold tabular-nums text-white">{i + 1}</span>
                <h3 className="mt-5 text-xl font-bold tracking-tight text-[#0a0a0a]">{paso.titulo}</h3>
                <p className="mt-2 text-base leading-7 text-[#52525b]">{paso.texto}</p>
              </Reveal>
            </li>
          ))}
        </ol>

        <Reveal className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between" y={10}>
          <p className="text-base font-semibold text-[#27272a]">{TRIAL_REASSURANCE}</p>
          <Link href="/planes" className="btn-primary h-12 px-6">
            Empezar la prueba <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
