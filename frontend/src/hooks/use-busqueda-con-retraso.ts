"use client";

import { useEffect, useRef, useState } from "react";

/**
 * El texto de un buscador con un respiro (300 ms) antes de mandarlo a la URL
 * y al servidor: no se busca letra a letra.
 */
export function useBusquedaConRetraso(inicial: string, alCambiar: (valor: string) => void) {
  const [texto, setTexto] = useState(inicial);
  const ultimo = useRef(inicial);
  useEffect(() => {
    if (texto.trim() === ultimo.current) return;
    const temporizador = window.setTimeout(() => {
      ultimo.current = texto.trim();
      alCambiar(texto.trim());
    }, 300);
    return () => window.clearTimeout(temporizador);
  }, [texto, alCambiar]);
  return [texto, setTexto] as const;
}
