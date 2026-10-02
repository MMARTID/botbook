"use client";

import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "@/hooks/use-focus-trap";

/**
 * Diálogo centrado del escritorio: confirmar un cambio de cita, el estado
 * del servicio o los pasos del desvío. Se cierra con la X, con Escape o
 * pulsando el velo, y el tabulador no se sale de él mientras está abierto.
 * Va por portal a `<body>` para que ninguna pantalla lo recorte.
 */
export function Dialogo({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  ancho = "md",
  pie,
  children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  /** `md` para confirmar (28 rem); `lg` para contenido (40 rem). */
  ancho?: "md" | "lg";
  /** Botones al pie, alineados a la derecha. */
  pie?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const tituloId = useId();
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const ref = useFocusTrap<HTMLDivElement>({
    active: abierto,
    onEscape: onCerrar,
    initialFocusRef: pie ? undefined : cerrarRef,
  });

  if (!abierto || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
      <div aria-hidden="true" onClick={onCerrar} className="absolute inset-0 bg-black/40" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className={`relative flex max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden rounded-3xl border border-linea bg-superficie shadow-[0_24px_64px_rgba(0,0,0,0.22)] ${
          ancho === "lg" ? "max-w-[40rem]" : "max-w-[28rem]"
        }`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pb-2 pt-5">
          <div className="min-w-0">
            <h2 id={tituloId} className="text-lg font-bold tracking-[-0.01em] text-tinta">
              {titulo}
            </h2>
            {descripcion ? <p className="mt-1 text-sm leading-6 text-muted">{descripcion}</p> : null}
          </div>
          <button
            ref={cerrarRef}
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="-mr-2 -mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-apagado transition hover:bg-relleno-fuerte hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
          >
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>
        {children ? <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-2">{children}</div> : null}
        {pie ? (
          <div className="flex shrink-0 justify-end gap-2 border-t border-linea bg-relleno px-6 py-3.5">{pie}</div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
