"use client";

import { useRef, useState } from "react";
import { MessageCircle, Phone, PhoneCall } from "lucide-react";
import { esChatDeWhatsapp, formatPhoneLocal } from "@/lib/format";
import { enlaceTel, etiquetaDeLlamada, telefonoParaDevolver } from "@/lib/llamadas";
import type { Call } from "@/lib/types";
import { Insignia } from "@/components/movil/piezas";

const ANCHO_ACCION = 92;

/**
 * Una llamada en las listas del móvil: quién llamó, cuándo, el resumen en
 * dos líneas y su etiqueta. En el historial (`deslizable`) se desliza a la
 * izquierda para dejar a la vista «Llamar»; tocarla abre el detalle.
 */
export function FilaLlamada({
  call,
  momento,
  onAbrir,
  deslizable = false,
  accionVisible = false,
  onAccionVisible,
}: {
  call: Call;
  /** «09:03 · 1m 36s» en el historial, «Ayer 20:12» en Inicio. */
  momento: string;
  onAbrir: () => void;
  deslizable?: boolean;
  accionVisible?: boolean;
  onAccionVisible?: (visible: boolean) => void;
}) {
  const etiqueta = etiquetaDeLlamada(call);
  const telefono = telefonoParaDevolver(call);
  const puedeDeslizar = deslizable && Boolean(telefono);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const arrastrado = useRef(false);
  const [arrastre, setArrastre] = useState<number | null>(null);

  const base = accionVisible ? -ANCHO_ACCION : 0;
  const desplazamiento = arrastre ?? base;

  const contenido = (
    <span className="flex min-h-[72px] items-start gap-3 py-3">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]"
        aria-hidden="true"
      >
        {esChatDeWhatsapp(call) ? <MessageCircle className="h-[18px] w-[18px]" /> : <PhoneCall className="h-[18px] w-[18px]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-bold tabular-nums text-[#0a0a0a]">
            {formatPhoneLocal(call.fromNumber) ?? "Número oculto"}
          </span>
          <span className="shrink-0 text-xs text-muted">{momento}</span>
        </span>
        {esChatDeWhatsapp(call) ? <span className="sr-only">Chat de WhatsApp. </span> : null}
        {call.summary ? (
          <span className="mt-0.5 line-clamp-2 text-[13px] leading-[1.5] text-muted">{call.summary}</span>
        ) : (
          <span className="mt-0.5 block text-[13px] leading-[1.5] text-muted">Sin resumen de la conversación.</span>
        )}
        {etiqueta ? (
          <Insignia tono={etiqueta.tono} icono={etiqueta.icono} className="mt-1.5">
            {etiqueta.texto}
          </Insignia>
        ) : null}
      </span>
    </span>
  );

  if (!puedeDeslizar) {
    return (
      <button
        type="button"
        onClick={onAbrir}
        className={`w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6] ${deslizable ? "px-4" : ""}`}
      >
        {contenido}
      </button>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <a
        href={enlaceTel(telefono!)}
        aria-hidden={!accionVisible}
        tabIndex={accionVisible ? undefined : -1}
        onClick={() => onAccionVisible?.(false)}
        className="absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-1 bg-[#0a0a0a] text-sm font-bold text-white"
        style={{ width: ANCHO_ACCION }}
      >
        <Phone className="h-5 w-5" aria-hidden="true" />
        Llamar
      </a>
      <button
        type="button"
        onPointerDown={(event) => {
          inicio.current = { x: event.clientX, y: event.clientY };
          arrastrado.current = false;
        }}
        onPointerMove={(event) => {
          if (!inicio.current) return;
          const dx = event.clientX - inicio.current.x;
          const dy = event.clientY - inicio.current.y;
          if (!arrastrado.current && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
            arrastrado.current = true;
          }
          if (arrastrado.current) {
            setArrastre(Math.max(-ANCHO_ACCION, Math.min(0, base + dx)));
          }
        }}
        onPointerUp={() => {
          if (arrastrado.current && arrastre !== null) {
            onAccionVisible?.(arrastre < -ANCHO_ACCION / 2);
          }
          inicio.current = null;
          setArrastre(null);
        }}
        onPointerCancel={() => {
          inicio.current = null;
          setArrastre(null);
        }}
        onClick={() => {
          if (arrastrado.current) {
            arrastrado.current = false;
            return;
          }
          if (accionVisible) {
            onAccionVisible?.(false);
            return;
          }
          onAbrir();
        }}
        className="relative block w-full touch-pan-y bg-white px-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]"
        style={{
          transform: `translateX(${desplazamiento}px)`,
          transition: arrastre === null ? "transform 220ms cubic-bezier(.32,.72,0,1)" : "none",
        }}
      >
        {contenido}
      </button>
    </div>
  );
}
