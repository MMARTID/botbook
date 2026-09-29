"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * `prefers-reduced-motion` sin romper la hidratación.
 *
 * `useReducedMotion()` de framer-motion vale null en el servidor y true/false
 * desde el primer render del cliente. Un componente que pinte otro marcado
 * según ese valor antes de montar no casa con el HTML del servidor, y React
 * descarta ese HTML y vuelve a pintar toda la raíz en el cliente (medido en la
 * portada el 2026-09-29: siete errores «Hydration failed» con movimiento
 * reducido).
 *
 * Este hook devuelve false en el servidor y en el primer render del cliente,
 * igual que el HTML que llega, y la preferencia real solo tras montar.
 */
export function useMovimientoReducido() {
  const reducir = useReducedMotion() === true;
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  return montado && reducir;
}
