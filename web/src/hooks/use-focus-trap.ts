"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Elementos que el usuario puede alcanzar de verdad: los ocultos (una sección
 * plegada, un paso todavía sin mostrar) no cuentan, o el tabulador saltaría a
 * sitios invisibles.
 */
function focusablesVisibles(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

type FocusTrapOptions = {
  /** El diálogo está en pantalla. Con false no se engancha nada. */
  active?: boolean;
  /** Qué hacer al pulsar Escape. Sin callback, la tecla no se intercepta. */
  onEscape?: () => void;
  /** Los diálogos que ya bloquean el scroll por su cuenta pasan false. */
  lockScroll?: boolean;
  /** Igual para los que ya devuelven el foco al cerrarse. */
  restoreFocus?: boolean;
  /** Quién recibe el foco al abrir; por defecto, el primer elemento enfocable. */
  initialFocusRef?: RefObject<HTMLElement | null>;
};

/**
 * Trampa de foco para diálogos modales: el tabulador da la vuelta dentro del
 * diálogo en vez de pasearse por la página de detrás, que sigue ahí pero no se
 * puede usar. Estaba escrita dos veces (la demo de voz y el menú móvil) y
 * faltaba en otras dos; vive aquí para que las cuatro se comporten igual.
 *
 * Devuelve la ref que hay que poner en el contenedor del diálogo.
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>({
  active = true,
  onEscape,
  lockScroll = true,
  restoreFocus = true,
  initialFocusRef,
}: FocusTrapOptions = {}) {
  const containerRef = useRef<T | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // En una ref para que cambiar el callback entre renders no vuelva a montar
  // la trampa: eso devolvería el foco al principio en mitad de la navegación.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (initialFocusRef?.current) initialFocusRef.current.focus();
    else focusablesVisibles(container)[0]?.focus();

    const previousOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onEscapeRef.current) {
        event.preventDefault();
        onEscapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusables = focusablesVisibles(container);
      if (focusables.length === 0) return;
      const primero = focusables[0];
      const ultimo = focusables[focusables.length - 1];
      const enfocado = document.activeElement;

      if (event.shiftKey && (enfocado === primero || !container.contains(enfocado))) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && enfocado === ultimo) {
        event.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (lockScroll) document.body.style.overflow = previousOverflow;
      if (restoreFocus) previousFocusRef.current?.focus();
    };
  }, [active, initialFocusRef, lockScroll, restoreFocus]);

  return containerRef;
}
