"use client";

import { useEffect, useState } from "react";

export const COMING_SOON_MESSAGE =
  "Estamos en desarrollo. Muestra tu interés con un correo a social@alhabla.ai para recibir un descuento del 15% durante el primer año.";

type Position = { x: number; y: number };

function ComingSoonBubble({ position, onClose }: { position: Position; onClose: () => void }) {
  useEffect(() => {
    const timeout = setTimeout(onClose, 6000);
    const dismiss = () => onClose();
    document.addEventListener("click", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("click", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [onClose]);

  return (
    <div
      className="fixed z-[9999] max-w-[260px] rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3 text-sm leading-5 text-[#27272a] shadow-xl"
      style={{ left: Math.max(8, Math.min(position.x, window.innerWidth - 280)), top: position.y }}
    >
      {COMING_SOON_MESSAGE}
    </div>
  );
}

/** Alto aproximado del globo, para decidir si cabe debajo del botón. */
const BUBBLE_HEIGHT = 140;

/**
 * Para un botón que, mientras el registro público está desactivado, no debe
 * navegar — devuelve el elemento del globo a renderizar y una función para
 * abrirlo junto al botón, en vez de dejar que el botón navegue.
 */
export function useComingSoonBubble() {
  const [position, setPosition] = useState<Position | null>(null);

  // Anclado al botón, no al puntero: con teclado (Enter o Espacio) clientX y
  // clientY valen 0, así que el globo aparecía en la esquina superior
  // izquierda de la pantalla, lejos del botón que lo había abierto.
  const openAt = (event: { currentTarget: HTMLElement }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const cabeDebajo = window.innerHeight - rect.bottom > BUBBLE_HEIGHT;
    setPosition({
      x: rect.left,
      y: cabeDebajo ? rect.bottom + 8 : Math.max(8, rect.top - BUBBLE_HEIGHT - 8),
    });
  };

  // El contenedor aria-live se monta siempre, vacío, y el globo aparece dentro:
  // si la región naciera a la vez que su texto, los lectores de pantalla no
  // anunciarían nada, y este aviso es la única respuesta que dan los CTA
  // bloqueados. Va fijo para no ocupar sitio en el flujo de la tarjeta.
  const bubble = (
    <div aria-live="polite" role="status" className="fixed">
      {position ? <ComingSoonBubble position={position} onClose={() => setPosition(null)} /> : null}
    </div>
  );

  return { openAt, bubble };
}
