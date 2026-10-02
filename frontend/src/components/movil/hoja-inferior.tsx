"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "@/hooks/use-focus-trap";

const DURACION_MS = 320;

/**
 * Hoja que sube desde abajo: el detalle de una llamada o de una cita, el
 * estado del servicio o el editor de un servicio. Se cierra con la X, con
 * Escape o tocando el velo; mientras está abierta, el tabulador no se sale
 * de ella y la página de detrás no se desplaza.
 *
 * Va por portal a `<body>`: dentro de una pantalla de detalle que entra con
 * una transformación, `position: fixed` se anclaría a esa pantalla y no a la
 * ventana.
 *
 * `alta` la lleva casi hasta arriba (llamada, con su reproductor fijo abajo);
 * sin ella, mide lo que su contenido.
 */
export function HojaInferior({
  abierta,
  onCerrar,
  titulo,
  antetitulo,
  subtitulo,
  alta = false,
  etiquetaCerrar = "Cerrar",
  pie,
  children,
}: {
  abierta: boolean;
  onCerrar: () => void;
  titulo: React.ReactNode;
  antetitulo?: React.ReactNode;
  subtitulo?: React.ReactNode;
  alta?: boolean;
  etiquetaCerrar?: string;
  /** Franja fija al pie (el reproductor de la llamada). */
  pie?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [montada, setMontada] = useState(abierta);
  const [dentro, setDentro] = useState(false);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const tituloId = useId();

  useEffect(() => {
    if (abierta) {
      setMontada(true);
      // Dos fotogramas: el primero pinta la hoja abajo, el segundo la sube.
      let segundo = 0;
      const primero = window.requestAnimationFrame(() => {
        segundo = window.requestAnimationFrame(() => setDentro(true));
      });
      return () => {
        window.cancelAnimationFrame(primero);
        window.cancelAnimationFrame(segundo);
      };
    }
    setDentro(false);
    const temporizador = window.setTimeout(() => setMontada(false), DURACION_MS);
    return () => window.clearTimeout(temporizador);
  }, [abierta]);

  const hojaRef = useFocusTrap<HTMLDivElement>({
    active: montada && abierta,
    onEscape: onCerrar,
    initialFocusRef: cerrarRef,
  });

  if (!montada || typeof document === "undefined") return null;

  return createPortal(
    <div className="lg:hidden">
      <div
        aria-hidden="true"
        onClick={onCerrar}
        className={`fixed inset-0 z-[70] bg-[#0a0a0a]/45 transition-opacity duration-300 motion-reduce:transition-none ${dentro ? "opacity-100" : "opacity-0"}`}
      />
      <div
        ref={hojaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className={`fixed inset-x-0 bottom-0 z-[71] flex flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_-18px_48px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none ${
          alta ? "top-[max(3.5rem,calc(env(safe-area-inset-top)+2.5rem))]" : "max-h-[calc(100dvh-4rem)]"
        } ${dentro ? "translate-y-0" : "translate-y-[105%]"}`}
      >
        <div className="flex shrink-0 justify-center pt-2" aria-hidden="true">
          <span className="h-[5px] w-10 rounded-full bg-[#d4d4d8]" />
        </div>
        <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-2 pt-2">
          <div className="min-w-0">
            {antetitulo ? <p className="text-[13px] font-semibold text-muted">{antetitulo}</p> : null}
            <h2
              id={tituloId}
              className="mt-0.5 text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-[#0a0a0a] [overflow-wrap:anywhere]"
            >
              {titulo}
            </h2>
            {subtitulo ? <p className="mt-1 text-sm leading-6 text-muted">{subtitulo}</p> : null}
          </div>
          <button
            ref={cerrarRef}
            type="button"
            onClick={onCerrar}
            aria-label={etiquetaCerrar}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#0a0a0a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
          >
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>
        <div className={`flex min-h-0 flex-1 flex-col ${pie ? "" : "pb-[max(1.25rem,env(safe-area-inset-bottom))]"}`}>
          {children}
        </div>
        {pie ? (
          <div className="shrink-0 border-t border-[#e5e5e5] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2.5">
            {pie}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

/** Cuerpo con scroll propio de una hoja. */
export function CuerpoDeHoja({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1 ${className}`}>{children}</div>
  );
}
