"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarCheck,
  CalendarClock,
  MessageSquareText,
  Phone,
  PhoneIncoming,
} from "lucide-react";

import type { NicheAccent } from "@/lib/niche-landings";

/**
 * Pulso del hero: una llamada que entra.
 *
 * Sustituye a HeroConversation, que simulaba un diálogo en tres escenas de
 * 6,6 s y no confirmaba la cita hasta el segundo 5 — unos 20 s para verlo
 * entero. Aquí no hay nada que leer ni que esperar: los anillos salen del
 * centro como un tono de llamada y las pastillas van contando desenlaces —
 * confirmar, mover, tomar recado— cada una entendible por sí sola.
 *
 * El bucle es deliberado y lento (un tono cada 3,6 s). No es decoración
 * inquieta: representa lo único que hace este producto, que es coger el
 * teléfono. Con prefers-reduced-motion se queda quieto.
 */

/** Ondas que salen del centro. Van en el color de acento y a plena opacidad al
 * nacer: con el morado lavado del fondo no se veía ninguna. */
const RIPPLES = [0, 1, 2];
const RIPPLE_INTERVAL = 1.2;
const RIPPLE_CYCLE = RIPPLES.length * RIPPLE_INTERVAL;
const RIPPLE_SIZE = 300;

/**
 * Lo que resuelve una llamada, no solo reservarla: confirmar, mover, resolver
 * una duda o tomar un recado cuando hace falta una persona. Cada pastilla se
 * entiende sola, así que no hay que esperar a la siguiente para captar la idea
 * —el problema que hundía a la conversación simulada del hero anterior.
 *
 * Las posiciones se reparten alrededor de los anillos. En móvil se apilan
 * arriba y abajo, no a los lados: a los lados no caben y desbordaban la página.
 *
 * El centrado en móvil va con inset-x-0 + mx-auto y NO con -translate-x-1/2:
 * framer-motion escribe el transform del elemento al animar y/scale, y se
 * llevaba por delante la traslación de Tailwind, dejando la pastilla 22 px
 * fuera de la pantalla.
 */
const RESULTADOS = [
  {
    texto: "Atendida en 2 tonos",
    icono: PhoneIncoming,
    tono: "exito" as const,
    posicion: "inset-x-0 top-0 mx-auto w-fit sm:inset-x-auto sm:right-0 sm:top-8 sm:mx-0",
  },
  {
    texto: "Cita confirmada · jue 17:30",
    icono: CalendarCheck,
    tono: "acento" as const,
    posicion: "inset-x-0 bottom-8 mx-auto w-fit sm:inset-x-auto sm:bottom-6 sm:left-0 sm:mx-0",
  },
  {
    texto: "Movida al viernes 11:00",
    icono: CalendarClock,
    tono: "acento" as const,
    posicion: "inset-x-0 top-0 mx-auto w-fit sm:inset-x-auto sm:right-2 sm:top-8 sm:mx-0",
  },
  {
    texto: "Recado tomado · Marta",
    icono: MessageSquareText,
    tono: "acento" as const,
    posicion: "inset-x-0 bottom-8 mx-auto w-fit sm:inset-x-auto sm:bottom-6 sm:left-2 sm:mx-0",
  },
];

/** Cada pastilla vive un ciclo completo y entran escalonadas, de modo que
 * siempre hay una o dos en pantalla y ninguna se solapa con su vecina. */
const CICLO_RESULTADOS = 10.8;

export function HeroPulse({ accent }: { accent?: NicheAccent }) {
  const reducedMotion = useReducedMotion() === true;

  const strong = accent?.strong ?? "#8b5cf6";
  const wash = accent?.soft ?? "#f3eeff";

  return (
    <div className="flex flex-col gap-7">
      <div
        className="relative mx-auto flex h-[260px] w-full max-w-[320px] items-center justify-center sm:mx-auto sm:h-[300px] sm:max-w-[360px]"
        role="img"
        aria-label="Llamadas entrantes que se resuelven solas: atendidas en dos tonos, citas confirmadas, citas movidas de día y recados tomados"
      >
        {!reducedMotion &&
          RIPPLES.map((index) => (
            <motion.span
              key={index}
              aria-hidden="true"
              className="absolute inset-0 m-auto aspect-square rounded-full border-2"
              style={{
                width: `min(${RIPPLE_SIZE}px, 100%)`,
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

        {RESULTADOS.map((resultado, index) => {
          const Icono = resultado.icono;
          return (
            <motion.span
              key={resultado.texto}
              className={`absolute inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[#e5e5e5] bg-white px-3.5 py-2 text-[0.8125rem] font-semibold text-[#0a0a0a] ${resultado.posicion}`}
              initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.96 }}
              animate={
                reducedMotion
                  ? { opacity: 1, y: 0, scale: 1 }
                  : { opacity: [0, 1, 1, 0], y: [8, 0, 0, -6], scale: [0.96, 1, 1, 0.98] }
              }
              transition={
                reducedMotion
                  ? undefined
                  : {
                      duration: CICLO_RESULTADOS,
                      times: [0, 0.08, 0.72, 0.85],
                      delay: index * (CICLO_RESULTADOS / RESULTADOS.length),
                      repeat: Infinity,
                      ease: "easeOut",
                    }
              }
            >
              <Icono
                className="h-3.5 w-3.5"
                style={{ color: resultado.tono === "exito" ? "#2c7334" : strong }}
                aria-hidden="true"
              />
              {resultado.texto}
            </motion.span>
          );
        })}
      </div>

      <p className="mx-auto max-w-md text-center text-sm leading-7 text-[#52525b] lg:mx-0 lg:text-left">
        De la voz del cliente a un hueco reservado en tu agenda, sin que nadie
        del equipo suelte lo que está haciendo.
      </p>
    </div>
  );
}
