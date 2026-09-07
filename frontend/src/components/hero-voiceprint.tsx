"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CalendarCheck } from "lucide-react";

import type { NicheAccent } from "@/lib/niche-landings";

/**
 * Huella de voz del hero: la voz del cliente entra por la izquierda y se
 * resuelve en una cita confirmada.
 *
 * Sustituye a HeroConversation, que simulaba un diálogo real en tres escenas
 * de 6,6 s cada una y no llegaba a la confirmación hasta el segundo 5 — unos
 * 20 s para verlo entero, cuando un visitante decide en mucho menos. Aquí la
 * idea es una sola, se lee sin leer nada, y la animación entera dura ~1,2 s:
 * las barras suben de izquierda a derecha y la tarjeta entra al final.
 *
 * Se representa una vez al entrar en pantalla y se queda quieta. Nada de
 * bucle: el movimiento cuenta algo y termina, no decora.
 */

/** Alturas en px de la onda. Perfil deliberado: entra baja, crece hacia el
 * centro (donde el cliente habla) y decae al final, que es cuando el agente
 * ya está resolviendo. */
const BAR_HEIGHTS = [
  18, 34, 26, 52, 78, 44, 96, 62, 118, 84, 138, 102, 126, 70, 110, 48, 88, 36,
  58, 24, 40, 16, 28,
];

/** Tramo de la onda al que corresponde cada barra, de más apagado a más
 * saturado. Se resuelve contra el acento del nicho cuando lo hay. */
const BAR_TONE: ("faint" | "mid" | "strong")[] = [
  "faint", "faint", "faint", "mid", "mid", "mid", "mid", "mid", "strong",
  "strong", "strong", "strong", "strong", "strong", "strong", "mid", "mid",
  "mid", "mid", "mid", "faint", "faint", "faint",
];

const DEFAULT_TONES = { faint: "#e5e5e5", mid: "#ddd6fe", strong: "#8b5cf6" };

const BAR_STAGGER = 0.022;
const CARD_DELAY = BAR_HEIGHTS.length * BAR_STAGGER + 0.18;

export function HeroVoiceprint({ accent }: { accent?: NicheAccent }) {
  const reducedMotion = useReducedMotion() === true;

  const tones = accent
    ? { faint: "#e5e5e5", mid: accent.soft, strong: accent.strong }
    : DEFAULT_TONES;

  return (
    <div className="flex flex-col gap-7">
      {/*
        En móvil la tarjeta baja debajo de la onda: en una sola fila, los 23
        trazos más la tarjeta (que no parte su hora) no caben en 390 px y
        desbordaban la página entera en horizontal.
      */}
      <div
        className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-4"
        role="img"
        aria-label="Una llamada entrante se convierte en una cita confirmada para el jueves a las 17:30"
      >
        {/* justify-between reparte el ancho sobrante entre los trazos en vez
            de dejar un hueco muerto entre la onda y la tarjeta. */}
        <div className="flex h-[110px] w-full min-w-0 items-center justify-between gap-[3px] sm:h-[150px] sm:flex-1">
          {BAR_HEIGHTS.map((height, index) => (
            <motion.span
              key={index}
              aria-hidden="true"
              className="w-[5px] shrink-0 rounded-full"
              style={{ backgroundColor: tones[BAR_TONE[index]] }}
              initial={reducedMotion ? false : { height: 4, opacity: 0 }}
              whileInView={{ height, opacity: 1 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{
                delay: reducedMotion ? 0 : index * BAR_STAGGER,
                duration: 0.32,
                ease: [0.22, 1, 0.36, 1],
              }}
            />
          ))}
        </div>

        <span aria-hidden="true" className="hidden h-px w-11 shrink-0 bg-[#e5e5e5] sm:block" />

        <motion.div
          className="shrink-0 rounded-[20px] bg-[#0a0a0a] px-5 py-4 text-white sm:px-6 sm:py-5"
          initial={reducedMotion ? false : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{
            delay: reducedMotion ? 0 : CARD_DELAY,
            duration: 0.4,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <span
            className="flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-[#a78bfa]"
            style={accent ? { color: accent.soft } : undefined}
          >
            <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Cita confirmada
          </span>
          <span className="mt-1.5 block whitespace-nowrap text-xl font-extrabold tracking-[-0.02em] sm:text-[1.375rem]">
            jueves · 17:30
          </span>
        </motion.div>
      </div>

      <p className="max-w-md text-sm leading-7 text-[#52525b]">
        De la voz del cliente a un hueco reservado en tu agenda, sin que nadie
        del equipo suelte lo que está haciendo.
      </p>
    </div>
  );
}
