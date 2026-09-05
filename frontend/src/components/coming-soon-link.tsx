"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentProps } from "react";

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
      role="status"
      className="fixed z-[9999] max-w-[260px] rounded-2xl border border-[#e5e5e5] bg-white px-4 py-3 text-sm leading-5 text-[#27272a] shadow-xl"
      style={{ left: Math.min(position.x + 12, window.innerWidth - 280), top: position.y + 12 }}
    >
      {COMING_SOON_MESSAGE}
    </div>
  );
}

/**
 * Para botones que no son <Link> (ej. un onClick con lógica propia antes de
 * navegar) — devuelve el elemento del globo a renderizar y una función para
 * abrirlo en la posición del click, en vez de dejar que el botón navegue.
 */
export function useComingSoonBubble() {
  const [position, setPosition] = useState<Position | null>(null);

  const openAt = (event: { clientX: number; clientY: number }) => {
    setPosition({ x: event.clientX, y: event.clientY });
  };

  const bubble = position ? (
    <ComingSoonBubble position={position} onClose={() => setPosition(null)} />
  ) : null;

  return { openAt, bubble };
}

/**
 * Botón/enlace de la landing que, mientras el registro público está
 * desactivado, nunca navega — muestra un aviso junto al cursor en vez de
 * llevar a login/registro/planes. Conserva el href real (SEO, accesibilidad
 * sin JS) y solo intercepta el click.
 */
export function ComingSoonLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  const { openAt, bubble } = useComingSoonBubble();

  return (
    <>
      <Link
        {...props}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick?.(event);
          openAt(event);
        }}
      />
      {bubble}
    </>
  );
}
