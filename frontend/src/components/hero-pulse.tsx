"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Phone } from "lucide-react";

import type { NicheAccent } from "@/lib/niche-landings";

/**
 * Pulso del hero: una llamada que entra.
 *
 * Sustituye a HeroConversation, que simulaba un diálogo en tres escenas de
 * 6,6 s y no confirmaba la cita hasta el segundo 5 — unos 20 s para verlo
 * entero. Aquí no hay nada que leer ni que esperar: los anillos salen del
 * centro como un tono de llamada y las dos etiquetas cuentan el desenlace.
 *
 * El bucle es deliberado y lento (un tono cada 2,4 s). No es decoración
 * inquieta: representa lo único que hace este producto, que es coger el
 * teléfono. Con prefers-reduced-motion se queda quieto.
 */

/** Anillos fijos: dan la estructura del dibujo y evitan que el hueco se quede
 * vacío entre pulso y pulso. */
const STATIC_RINGS = [300, 228, 156];

/** Ondas que salen del centro. Van en el color de acento y a plena opacidad al
 * nacer: con el morado lavado del fondo no se veía ninguna. */
const RIPPLES = [0, 1, 2];
const RIPPLE_INTERVAL = 0.8;
const RIPPLE_CYCLE = RIPPLES.length * RIPPLE_INTERVAL;

export function HeroPulse({ accent }: { accent?: NicheAccent }) {
  const reducedMotion = useReducedMotion() === true;

  const strong = accent?.strong ?? "#8b5cf6";
  const wash = accent?.soft ?? "#f3eeff";

  return (
    <div className="flex flex-col gap-7">
      <div
        className="relative mx-auto flex h-[260px] w-full max-w-[320px] items-center justify-center sm:mx-0 sm:h-[300px] sm:max-w-[360px]"
        role="img"
        aria-label="Una llamada entrante que se atiende en dos tonos y acaba en una cita el jueves a las 17:30"
      >
        {STATIC_RINGS.map((size) => (
          <span
            key={size}
            aria-hidden="true"
            className="absolute rounded-full border border-[#ddd6fe]"
            style={{ width: size, height: size, maxWidth: "100%", maxHeight: "100%" }}
          />
        ))}

        {!reducedMotion &&
          RIPPLES.map((index) => (
            <motion.span
              key={index}
              aria-hidden="true"
              className="absolute rounded-full border-2"
              style={{
                width: STATIC_RINGS[0],
                height: STATIC_RINGS[0],
                maxWidth: "100%",
                maxHeight: "100%",
                borderColor: strong,
              }}
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{ opacity: [0, 0.55, 0], scale: [0.3, 0.75, 1] }}
              transition={{
                duration: RIPPLE_CYCLE,
                times: [0, 0.4, 1],
                delay: index * RIPPLE_INTERVAL,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />
          ))}

        <span
          aria-hidden="true"
          className="absolute h-[92px] w-[92px] rounded-full"
          style={{ backgroundColor: wash }}
        />
        <span
          aria-hidden="true"
          className="relative flex h-[62px] w-[62px] items-center justify-center rounded-full bg-[#0a0a0a] text-white"
        >
          <Phone className="h-6 w-6" />
        </span>

        <motion.span
          className="absolute right-0 top-8 inline-flex items-center gap-2 rounded-full border border-[#e5e5e5] bg-white px-3.5 py-2 text-[0.8125rem] font-semibold text-[#0a0a0a] sm:top-11"
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ delay: reducedMotion ? 0 : 0.3, duration: 0.4 }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#2c7334]" />
          Atendida en 2 tonos
        </motion.span>

        <motion.span
          className="absolute bottom-6 left-0 inline-flex items-center gap-2 rounded-full border border-[#e5e5e5] bg-white px-3.5 py-2 text-[0.8125rem] font-semibold text-[#0a0a0a] sm:bottom-10"
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ delay: reducedMotion ? 0 : 0.55, duration: 0.4 }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: strong }}
          />
          jueves · 17:30
        </motion.span>
      </div>

      <p className="mx-auto max-w-md text-center text-sm leading-7 text-[#52525b] lg:mx-0 lg:text-left">
        De la voz del cliente a un hueco reservado en tu agenda, sin que nadie
        del equipo suelte lo que está haciendo.
      </p>
    </div>
  );
}
