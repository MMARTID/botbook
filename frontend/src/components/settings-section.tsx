"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";

/**
 * Sección plegable de la página de ajustes. Cerrada muestra el título y un
 * resumen de estado de una línea; abierta muestra el contenido completo.
 */
export function SettingsSection({
  id,
  icon: Icon,
  title,
  summary,
  pending = false,
  open,
  onToggle,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  summary: string;
  /** Marca la sección como pendiente de completar con un indicador ambiental,
   * en vez de un asistente de configuración aparte. */
  pending?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="panel scroll-mt-32 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${id}-content`}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition duration-200 hover:bg-relleno focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-morado sm:px-5"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lavado text-morado">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-tinta sm:text-lg">
            {title}
          </span>
          <span className={`mt-0.5 flex items-center gap-1.5 text-sm ${pending ? "font-medium text-aviso" : "text-muted"}`}>
            {pending ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-aviso-icono" aria-hidden="true" /> : null}
            <span className="truncate">{summary}</span>
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted transition duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div id={`${id}-content`} className="border-t border-linea">
          {children}
        </div>
      ) : null}
    </section>
  );
}
