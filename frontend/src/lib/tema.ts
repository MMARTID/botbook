"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CLAVE_DE_TEMA, CONSULTA_OSCURO } from "./tema-inicial";

/**
 * Claro, oscuro o el del sistema (por defecto). Se elige en Cuenta y se
 * recuerda en este dispositivo; el script de app/layout.tsx lo aplica antes
 * del primer pintado para que no haya un destello blanco en oscuro.
 */
export type PreferenciaDeTema = "sistema" | "claro" | "oscuro";
export type Tema = "claro" | "oscuro";

const EVENTO_DE_TEMA = "alhabla:tema";

export function leerPreferencia(): PreferenciaDeTema {
  try {
    const guardada = window.localStorage.getItem(CLAVE_DE_TEMA);
    return guardada === "claro" || guardada === "oscuro" ? guardada : "sistema";
  } catch {
    return "sistema";
  }
}

export function resolverTema(preferencia: PreferenciaDeTema): Tema {
  if (preferencia !== "sistema") return preferencia;
  return window.matchMedia?.(CONSULTA_OSCURO).matches ? "oscuro" : "claro";
}

export function aplicarTema(tema: Tema) {
  const raiz = document.documentElement;
  raiz.dataset.tema = tema;
  raiz.style.colorScheme = tema === "oscuro" ? "dark" : "light";
}

/** Guarda la elección y avisa a quien la esté pintando (el selector, el
 * seguidor del tema); «sistema» borra la elección guardada. */
export function elegirTema(preferencia: PreferenciaDeTema) {
  try {
    if (preferencia === "sistema") window.localStorage.removeItem(CLAVE_DE_TEMA);
    else window.localStorage.setItem(CLAVE_DE_TEMA, preferencia);
  } catch {
    // Sin almacenamiento (navegación privada): vale hasta recargar.
  }
  aplicarTema(resolverTema(preferencia));
  window.dispatchEvent(new Event(EVENTO_DE_TEMA));
}

function suscribir(avisar: () => void) {
  window.addEventListener(EVENTO_DE_TEMA, avisar);
  // Otra pestaña cambió el tema.
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO_DE_TEMA, avisar);
    window.removeEventListener("storage", avisar);
  };
}

export function usePreferenciaDeTema(): PreferenciaDeTema {
  return useSyncExternalStore(suscribir, leerPreferencia, () => "sistema");
}

/**
 * Mantiene el tema aplicado: con «sistema» sigue en vivo al sistema (si el
 * móvil pasa a oscuro al anochecer, la app también) y recoge los cambios
 * hechos en otra pestaña. Va una sola vez, en el layout.
 */
export function useSeguirTema() {
  const preferencia = usePreferenciaDeTema();
  useEffect(() => {
    aplicarTema(resolverTema(preferencia));
    if (preferencia !== "sistema" || !window.matchMedia) return;
    const consulta = window.matchMedia(CONSULTA_OSCURO);
    const alCambiar = () => aplicarTema(resolverTema("sistema"));
    consulta.addEventListener("change", alCambiar);
    return () => consulta.removeEventListener("change", alCambiar);
  }, [preferencia]);
}

/** Monta `useSeguirTema` una vez en el layout (que es de servidor). */
export function SeguidorDelTema() {
  useSeguirTema();
  return null;
}
