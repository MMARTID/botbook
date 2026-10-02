"use client";

import { X, type LucideIcon } from "lucide-react";

/**
 * Piezas de las pantallas de trabajo del escritorio (Panel, Agenda,
 * Llamadas): la franja de título de borde a borde, el selector en pastilla
 * y el panel de detalle que se abre a la derecha sin tapar la lista.
 */

/** Franja de título a lo ancho de la pantalla, con sus controles a la derecha. */
export function TiraDePagina({
  icono: Icono,
  titulo,
  subtitulo,
  children,
}: {
  icono?: LucideIcon;
  titulo: string;
  subtitulo?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex min-h-[72px] shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#e5e5e5] bg-white px-8 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {Icono ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]" aria-hidden="true">
            <Icono className="h-5 w-5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-tight tracking-[-0.02em] text-[#0a0a0a]">{titulo}</h1>
          {subtitulo ? <p className="truncate text-sm text-muted">{subtitulo}</p> : null}
        </div>
      </div>
      {children}
    </header>
  );
}

/** Selector en pastilla («Día · Semana · Lista»): un grupo de radios. */
export function SelectorSegmentado<T extends string>({
  opciones,
  valor,
  onCambiar,
  etiqueta,
}: {
  opciones: ReadonlyArray<{ valor: T; texto: string }>;
  valor: T;
  onCambiar: (valor: T) => void;
  etiqueta: string;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="inline-flex shrink-0 gap-0.5 rounded-full border border-[#e5e5e5] bg-[#fafafa] p-[3px]">
      {opciones.map((opcion) => {
        const elegida = opcion.valor === valor;
        return (
          <button
            key={opcion.valor}
            type="button"
            role="radio"
            aria-checked={elegida}
            onClick={() => onCambiar(opcion.valor)}
            className={`min-h-9 rounded-full px-3.5 text-sm font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${
              elegida ? "bg-[#f3eeff] text-[#6d28d9] ring-1 ring-inset ring-[#ddd6fe]" : "text-[#52525b] hover:text-[#0a0a0a]"
            }`}
          >
            {opcion.texto}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Panel de detalle a la derecha de una lista o de la semana: no es modal,
 * la lista sigue a la vista y se puede seguir eligiendo. Ocupa el alto que
 * le deja la pantalla (que no hace scroll) y tiene su propio scroll.
 */
export function PanelDeDetalle({
  titulo,
  antetitulo,
  insignia,
  onCerrar,
  ancho = 360,
  pie,
  children,
}: {
  titulo: React.ReactNode;
  antetitulo?: React.ReactNode;
  insignia?: React.ReactNode;
  onCerrar: () => void;
  ancho?: number;
  pie?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <aside
      aria-label="Detalle"
      style={{ width: ancho }}
      className="flex min-h-0 shrink-0 flex-col self-stretch border-l border-[#e5e5e5] bg-white"
    >
      <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0 flex-1">
          {antetitulo ? <p className="text-[13px] font-semibold text-muted">{antetitulo}</p> : null}
          <h2 className="text-lg font-bold leading-snug tracking-[-0.01em] text-[#0a0a0a] [overflow-wrap:anywhere]">{titulo}</h2>
          {insignia ? <div className="mt-1.5 flex flex-wrap gap-1.5">{insignia}</div> : null}
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar detalle"
          className="-mr-1.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#52525b] transition hover:bg-[#f4f4f5] hover:text-[#0a0a0a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
        >
          <X className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
      {pie ? <div className="shrink-0 border-t border-[#e5e5e5] bg-white px-5 py-3.5">{pie}</div> : null}
    </aside>
  );
}

/** Fila «etiqueta — valor» de un detalle. */
export function DatoDeDetalle({ termino, children, numerico = false }: { termino: string; children: React.ReactNode; numerico?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-2">
      <dt className="shrink-0 text-sm text-muted">{termino}</dt>
      <dd className={`min-w-0 text-right text-sm font-semibold text-[#0a0a0a] [overflow-wrap:anywhere] ${numerico ? "tabular-nums" : ""}`}>{children}</dd>
    </div>
  );
}

/** Tecla de un atajo: «⌘K», «G A». */
export function Tecla({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={`inline-flex min-w-5 items-center justify-center rounded-[5px] border border-[#d4d4d8] bg-white px-1 font-sans text-[11px] font-semibold leading-[18px] text-[#52525b] ${className}`}>
      {children}
    </kbd>
  );
}
