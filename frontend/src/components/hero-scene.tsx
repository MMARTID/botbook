"use client";

import { useReducedMotion, motion } from "framer-motion";
import { CalendarCheck, PhoneIncoming } from "lucide-react";

import type { NicheAccent, NicheHeroVideo } from "@/lib/niche-landings";

/**
 * Escena del hero con vídeo: el momento real del negocio (manos ocupadas,
 * el teléfono suena) generado por nicho, con los desenlaces de Alhabla
 * superpuestos — la misma pareja problema/solución que cuenta HeroPulse,
 * pero con la escena de verdad delante.
 *
 * El vídeo va mudo, en bucle y con poster; con prefers-reduced-motion se
 * muestra solo el fotograma. Si el nicho no tiene clip todavía, LandingHero
 * ni siquiera monta este componente (cae a HeroPulse), así que aquí el vídeo
 * se asume presente.
 */

const CHIP_CYCLE = 7.2;

const CHIPS = [
  { texto: "Atendida en 2 tonos", icono: PhoneIncoming, tono: "exito" as const },
  { texto: "Cita confirmada · jue 17:30", icono: CalendarCheck, tono: "acento" as const },
];

export function HeroScene({
  video,
  accent,
}: {
  video: NicheHeroVideo;
  accent?: NicheAccent;
}) {
  const reducedMotion = useReducedMotion() === true;
  const strong = accent?.strong ?? "#8b5cf6";

  return (
    <figure className="relative mx-auto w-full max-w-[520px]">
      <div className="relative overflow-hidden rounded-3xl border border-[#e5e5e5] bg-[#fafafa]">
        {reducedMotion ? (
          // eslint-disable-next-line @next/next/no-img-element -- fotograma local, sin optimización remota
          <img
            src={video.poster}
            alt=""
            className="aspect-[4/3] w-full object-cover"
          />
        ) : (
          <video
            className="aspect-[4/3] w-full object-cover"
            src={video.src}
            poster={video.poster}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
          />
        )}

        {/* Velo inferior sutil para que las pastillas lean sobre cualquier
            fotograma sin ensuciar la escena. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/25 to-transparent"
        />

        <div className="absolute inset-x-4 bottom-4 flex justify-start">
          {CHIPS.map((chip, index) => {
            const Icono = chip.icono;
            return (
              <motion.span
                key={chip.texto}
                className="absolute bottom-0 left-0 inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[#e5e5e5] bg-white px-3.5 py-2 text-[0.8125rem] font-semibold text-[#0a0a0a] shadow-[0_6px_20px_rgba(0,0,0,0.18)]"
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={
                  reducedMotion
                    ? { opacity: index === 1 ? 1 : 0, y: 0 }
                    : { opacity: [0, 1, 1, 0], y: [8, 0, 0, -6] }
                }
                transition={
                  reducedMotion
                    ? undefined
                    : {
                        duration: CHIP_CYCLE,
                        times: [0, 0.06, 0.5, 0.56],
                        delay: index * (CHIP_CYCLE / CHIPS.length),
                        repeat: Infinity,
                        ease: "easeOut",
                      }
                }
              >
                <Icono
                  className="h-3.5 w-3.5"
                  style={{ color: chip.tono === "exito" ? "#2c7334" : strong }}
                  aria-hidden="true"
                />
                {chip.texto}
              </motion.span>
            );
          })}
        </div>
      </div>

      <figcaption className="mx-auto mt-5 max-w-md text-center text-sm leading-7 text-[#52525b] lg:mx-0 lg:text-left">
        De la voz del cliente a un hueco reservado en tu agenda, sin que nadie
        del equipo suelte lo que está haciendo.
      </figcaption>
    </figure>
  );
}
