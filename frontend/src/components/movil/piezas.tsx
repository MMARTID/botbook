"use client";

import Link from "next/link";
import { Children, Fragment } from "react";
import { ArrowRight, ChevronRight, type LucideIcon } from "lucide-react";

/**
 * Piezas pequeñas que comparten las pantallas de la app móvil. Siguen
 * DESIGN.md: objetivos de al menos 44 px, iconos en azulejo morado
 * (`rounded-xl`, #f3eeff / #8b5cf6) y paneles `rounded-3xl`.
 */

export const TONOS = {
  exito: { fondo: "bg-[#ecf7ec]", texto: "text-[#2c7334]", anillo: "ring-[#d8efd7]", borde: "border-[#d8efd7]", punto: "bg-[#2c7334]" },
  aviso: { fondo: "bg-[#fef8e7]", texto: "text-[#806012]", anillo: "ring-[#f0dfa8]", borde: "border-[#f0dfa8]", punto: "bg-[#9f7a15]" },
  error: { fondo: "bg-[#fff1f1]", texto: "text-[#c53030]", anillo: "ring-[#f5d3d3]", borde: "border-[#f5d3d3]", punto: "bg-[#c53030]" },
  neutro: { fondo: "bg-[#f4f4f5]", texto: "text-[#52525b]", anillo: "ring-[#e5e5e5]", borde: "border-[#e5e5e5]", punto: "bg-[#a1a1aa]" },
  morado: { fondo: "bg-[#f3eeff]", texto: "text-[#6d28d9]", anillo: "ring-[#ddd6fe]", borde: "border-[#ddd6fe]", punto: "bg-[#8b5cf6]" },
} as const;

export type Tono = keyof typeof TONOS;

export function Insignia({
  tono,
  icono: Icono,
  children,
  className = "",
}: {
  tono: Tono;
  icono?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  const t = TONOS[tono];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-semibold ring-1 ring-inset ${t.fondo} ${t.texto} ${t.anillo} ${className}`}
    >
      {Icono ? <Icono className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function AzulejoIcono({
  icono: Icono,
  tamaño = "md",
  className = "",
}: {
  icono: LucideIcon;
  tamaño?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6] ${tamaño === "sm" ? "h-9 w-9" : "h-10 w-10"} ${className}`}
      aria-hidden="true"
    >
      <Icono className={tamaño === "sm" ? "h-[18px] w-[18px]" : "h-5 w-5"} />
    </span>
  );
}

/** Rótulo de grupo en versalitas: «DISPONIBILIDAD», «AJUSTES». */
export function RotuloDeGrupo({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`mb-2 mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-muted ${className}`}>
      {children}
    </h2>
  );
}

/** Título de sección con enlace a la derecha: «Llamadas recientes · Ver todas». */
export function TituloDeSeccion({
  children,
  enlace,
  className = "",
}: {
  children: React.ReactNode;
  enlace?: { href: string; etiqueta: string };
  className?: string;
}) {
  return (
    <div className={`flex min-h-7 items-center justify-between ${className}`}>
      <h2 className="text-lg font-bold tracking-[-0.01em] text-[#0a0a0a]">{children}</h2>
      {enlace ? (
        <Link
          href={enlace.href}
          className="-my-2 -mr-2 flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-semibold text-[#6d28d9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
        >
          {enlace.etiqueta}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

/** Panel con filas separadas por una línea que empieza tras el icono. */
export function GrupoDeFilas({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const filas = Children.toArray(children).filter(Boolean);
  return (
    <div className={`panel overflow-hidden ${className}`}>
      {filas.map((fila, indice) => (
        <Fragment key={indice}>
          {indice > 0 ? <div className="ml-[66px] h-px bg-[#e5e5e5]" aria-hidden="true" /> : null}
          {fila}
        </Fragment>
      ))}
    </div>
  );
}

type DestinoDeFila =
  | { href: string; externo?: boolean; onClick?: never }
  | { onClick: () => void; href?: never; externo?: never };

/**
 * Fila de un índice de ajustes: azulejo, título, una línea de estado y
 * chevron. `pendiente` pinta la línea en ámbar con un punto, como lo que
 * falta por configurar.
 */
export function FilaDeAjuste({
  icono,
  titulo,
  resumen,
  pendiente = false,
  insignia,
  ...destino
}: {
  icono: LucideIcon;
  titulo: string;
  resumen?: string;
  pendiente?: boolean;
  insignia?: React.ReactNode;
} & DestinoDeFila) {
  const contenido = (
    <>
      <AzulejoIcono icono={icono} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-base font-semibold leading-tight text-[#0a0a0a]">
          {titulo}
          {insignia}
        </span>
        {resumen ? (
          <span
            className={`mt-0.5 flex min-w-0 items-center gap-1.5 text-sm ${pendiente ? "font-semibold text-[#806012]" : "text-muted"}`}
          >
            {pendiente ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#9f7a15]" aria-hidden="true" /> : null}
            <span className="truncate">{resumen}</span>
          </span>
        ) : null}
      </span>
      <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[#a1a1aa]" aria-hidden="true" />
    </>
  );
  const clases =
    "flex min-h-[68px] w-full items-center gap-3 px-3.5 py-3 text-left transition duration-200 hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]";

  if (destino.onClick) {
    return (
      <button type="button" onClick={destino.onClick} className={clases}>
        {contenido}
      </button>
    );
  }
  if (destino.externo) {
    return (
      <a href={destino.href} className={clases}>
        {contenido}
      </a>
    );
  }
  return (
    <Link href={destino.href!} className={clases}>
      {contenido}
    </Link>
  );
}

/** Estado vacío de la app móvil: caja punteada con azulejo y texto. */
export function VacioMovil({
  icono,
  titulo,
  children,
  className = "",
}: {
  icono: LucideIcon;
  titulo?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-[20px] border border-dashed border-[#e5e5e5] bg-[#fafafa] px-4 py-[18px] ${className}`}
    >
      <AzulejoIcono icono={icono} />
      <div className="min-w-0">
        {titulo ? <p className="text-[15px] font-bold text-[#27272a]">{titulo}</p> : null}
        <p className={`text-sm leading-6 text-muted ${titulo ? "mt-0.5" : ""}`}>{children}</p>
      </div>
    </div>
  );
}

/** Interruptor de 52×32 dentro de un objetivo de 44 px. */
export function Interruptor({
  activo,
  onCambiar,
  etiqueta,
  disabled = false,
}: {
  activo: boolean;
  onCambiar: (activo: boolean) => void;
  etiqueta: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={() => onCambiar(!activo)}
      className="group flex h-11 w-[52px] shrink-0 items-center justify-end focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        className={`relative h-8 w-[52px] rounded-full transition-colors duration-200 group-focus-visible:ring-2 group-focus-visible:ring-[#8b5cf6] group-focus-visible:ring-offset-2 ${activo ? "bg-[#0a0a0a]" : "bg-[#d4d4d8]"}`}
      >
        <span
          className={`absolute top-[3px] h-[26px] w-[26px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-[left] duration-200 ${activo ? "left-[23px]" : "left-[3px]"}`}
        />
      </span>
    </button>
  );
}

/**
 * Barra «Descartar / Guardar» fija abajo que solo aparece cuando hay
 * cambios sin guardar. Sustituye al botón Guardar del final de cada bloque:
 * en móvil quedaba a varias pantallas del cambio.
 */
export function BarraGuardar({
  visible,
  etiqueta,
  guardando = false,
  deshabilitado = false,
  onGuardar,
  onDescartar,
}: {
  visible: boolean;
  etiqueta: string;
  guardando?: boolean;
  deshabilitado?: boolean;
  onGuardar: () => void;
  onDescartar: () => void;
}) {
  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-50 flex gap-2.5 border-t border-[#e5e5e5] bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_28px_rgba(0,0,0,0.08)] backdrop-blur transition-transform duration-[260ms] ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none lg:hidden ${
        visible ? "translate-y-0" : "pointer-events-none translate-y-[105%]"
      }`}
    >
      {/* Escondida sigue en el DOM: sin tabIndex -1 el tabulador entraría en
          una barra que no se ve. */}
      <button type="button" onClick={onDescartar} disabled={guardando} tabIndex={visible ? undefined : -1} className="btn-secondary flex-none px-5">
        Descartar
      </button>
      <button type="button" onClick={onGuardar} disabled={guardando || deshabilitado} tabIndex={visible ? undefined : -1} className="btn-primary flex-1 px-4">
        {guardando ? "Guardando…" : etiqueta}
      </button>
    </div>
  );
}
