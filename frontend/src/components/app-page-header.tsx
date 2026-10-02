"use client";

import type { LucideIcon } from "lucide-react";
import { CabeceraMovil, type DestinoDeVuelta } from "@/components/movil/cabecera-movil";

type AppPageHeaderProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
  /** En la app móvil, a qué pantalla vuelve «‹ …» (sin él, es una pestaña). */
  volver?: DestinoDeVuelta;
  /** Título y frase propios de la app móvil, si no son los de escritorio. */
  tituloMovil?: string;
  descripcionMovil?: string;
  /** false cuando las acciones ya sobran en el móvil (un «Volver» que la
   * barra de arriba ya ofrece). */
  accionesEnMovil?: boolean;
};

/**
 * Cabecera común de las vistas de trabajo. Da la misma orientación visual a
 * Panel, Agenda, Llamadas y Agente sin convertirlas en tarjetas genéricas.
 * Por debajo de `lg` es la cabecera de la app móvil (título grande y barra
 * con «‹ Volver»); las dos se pintan y el CSS decide cuál se ve.
 */
export function AppPageHeader({
  icon: Icon,
  title,
  description,
  children,
  volver,
  tituloMovil,
  descripcionMovil,
  accionesEnMovil = true,
}: AppPageHeaderProps) {
  return (
    <>
    <header className="hidden gap-5 border-b border-linea pb-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-8 sm:pb-7 lg:grid">
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lavado text-morado sm:h-12 sm:w-12" aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-balance text-3xl font-extrabold tracking-[-0.025em] text-tinta sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-[15px]">
            {description}
          </p>
        </div>
      </div>
      {children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
    </header>
    <CabeceraMovil titulo={tituloMovil ?? title} subtitulo={descripcionMovil ?? description} volver={volver} soloMovil>
      {accionesEnMovil ? children : null}
    </CabeceraMovil>
    </>
  );
}

/**
 * Esqueleto de una vista de trabajo mientras llega el negocio: reserva el sitio
 * de la cabecera y de los primeros paneles para que la pantalla no salte de un
 * «Cargando…» centrado al contenido real. El texto queda para el lector de
 * pantalla.
 */
export function AppPageSkeleton({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`space-y-5 sm:space-y-8 ${className}`} role="status">
      <span className="sr-only">{label}</span>
      <div
        className="flex items-start gap-3 border-b border-linea pb-6 sm:gap-4 sm:pb-7"
        aria-hidden="true"
      >
        <div className="h-11 w-11 shrink-0 rounded-xl bg-relleno-fuerte motion-safe:animate-pulse sm:h-12 sm:w-12" />
        <div className="min-w-0 flex-1 space-y-3 pt-1">
          <div className="h-8 w-56 max-w-full rounded-[10px] bg-relleno-fuerte motion-safe:animate-pulse sm:h-9 sm:w-72" />
          <div className="h-4 w-full max-w-lg rounded bg-relleno-fuerte motion-safe:animate-pulse" />
        </div>
      </div>
      <div className="h-36 rounded-3xl border border-linea bg-relleno motion-safe:animate-pulse" aria-hidden="true" />
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2" aria-hidden="true">
        <div className="h-72 rounded-3xl border border-linea bg-relleno motion-safe:animate-pulse" />
        <div className="h-72 rounded-3xl border border-linea bg-relleno motion-safe:animate-pulse" />
      </div>
    </div>
  );
}
