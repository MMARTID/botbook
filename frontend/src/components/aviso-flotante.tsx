"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

export type Aviso = { type: "success" | "error"; message: string };

const DURACION_EXITO_MS = 5000;

/**
 * Resultado de una acción de guardado en una página larga. Flota abajo (encima
 * de la barra inferior en móvil, en la esquina en escritorio) porque la acción
 * puede estar a varias pantallas del principio: un aviso pintado arriba del
 * todo no lo ve nadie que acabe de pulsar «Guardar» al final de la página.
 *
 * El éxito se va solo a los 5 s; el error se queda hasta que se cierra, porque
 * dice algo que hay que leer y resolver.
 */
export function AvisoFlotante({ aviso, onClose }: { aviso: Aviso; onClose: () => void }) {
  // Por ref para que un re-render del padre (escribir en un campo) no reinicie
  // la cuenta atrás del aviso.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (aviso.type !== "success") return;
    const temporizador = window.setTimeout(() => onCloseRef.current(), DURACION_EXITO_MS);
    return () => window.clearTimeout(temporizador);
  }, [aviso]);

  const exito = aviso.type === "success";
  const Icono = exito ? CheckCircle2 : AlertTriangle;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 lg:bottom-6 lg:justify-end lg:px-10">
      <div
        role={exito ? "status" : "alert"}
        className={`aviso-entrada pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border py-1.5 pl-4 pr-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.12)] ${
          exito
            ? "border-[#d8efd7] bg-[#ecf7ec] text-[#2c7334]"
            : "border-[#f5d3d3] bg-[#fff1f1] text-[#c53030]"
        }`}
      >
        <Icono className="h-5 w-5 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 py-2 text-sm font-medium leading-5">{aviso.message}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar aviso"
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${
            exito ? "hover:bg-[#d8efd7]" : "hover:bg-[#f5d3d3]"
          }`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
