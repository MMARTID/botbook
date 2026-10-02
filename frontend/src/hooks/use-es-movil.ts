"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Por debajo de `lg` (1024 px) la app es la app móvil: barra de pestañas,
 * cabeceras con título grande y ajustes en pantallas propias. Por encima, el
 * panel de escritorio con barra lateral, que no cambia.
 */
const CONSULTA_MOVIL = "(max-width: 1023.98px)";

function suscribir(avisar: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const consulta = window.matchMedia(CONSULTA_MOVIL);
  consulta.addEventListener?.("change", avisar);
  return () => consulta.removeEventListener?.("change", avisar);
}

function leer() {
  // Sin matchMedia (jsdom en los tests) se queda en escritorio.
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(CONSULTA_MOVIL).matches;
}

/**
 * `null` mientras no se sabe (render del servidor e hidratación): quien lo
 * usa pinta su esqueleto en vez de adivinar y saltar de una vista a otra.
 */
export function useEsMovil(): boolean | null {
  return useSyncExternalStore<boolean | null>(suscribir, leer, () => null);
}

/**
 * Si la página se ha desplazado más de `umbral` px. La cabecera móvil lo usa
 * para enseñar el título pequeño cuando el grande ya se ha ido por arriba.
 */
export function useDesplazado(umbral = 36) {
  const [desplazado, setDesplazado] = useState(false);

  useEffect(() => {
    let fotograma = 0;
    const comprobar = () => {
      fotograma = 0;
      setDesplazado(window.scrollY > umbral);
    };
    const alDesplazar = () => {
      if (!fotograma) fotograma = window.requestAnimationFrame(comprobar);
    };
    comprobar();
    window.addEventListener("scroll", alDesplazar, { passive: true });
    return () => {
      window.removeEventListener("scroll", alDesplazar);
      if (fotograma) window.cancelAnimationFrame(fotograma);
    };
  }, [umbral]);

  return desplazado;
}

/**
 * La hora de ahora, refrescada cada minuto: la cuenta atrás de la próxima
 * cita y la marca «Ahora» de la agenda no pueden quedarse congeladas en la
 * hora a la que se abrió la app.
 */
export function useAhora(intervaloMs = 60_000) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const temporizador = window.setInterval(() => setAhora(new Date()), intervaloMs);
    return () => window.clearInterval(temporizador);
  }, [intervaloMs]);
  return ahora;
}
