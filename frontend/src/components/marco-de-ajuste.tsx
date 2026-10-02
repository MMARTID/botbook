"use client";

import { createContext, useContext } from "react";

/**
 * Dónde se pinta una pantalla de ajuste del agente. Las mismas pantallas
 * (horario, capacidad, calendario…) sirven a la app móvil, a pantalla
 * completa, y al Agente de escritorio, en la columna central: el marco decide
 * la cabecera y dónde va la barra de guardar.
 */
export type MarcoDeAjuste =
  | { tipo: "movil" }
  | {
      tipo: "escritorio";
      /** Pie de la columna central, donde se monta la barra de guardar. */
      destinoDeLaBarra: HTMLElement | null;
      /** La pantalla avisa de si tiene cambios sin guardar. */
      alCambiarPendientes: (pendientes: boolean) => void;
    };

const Contexto = createContext<MarcoDeAjuste>({ tipo: "movil" });

export const ProveedorDeMarco = Contexto.Provider;

export function useMarcoDeAjuste() {
  return useContext(Contexto);
}
