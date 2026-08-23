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
  open,
  onToggle,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  summary: string;
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
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition duration-200 hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6] sm:px-5"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-[#0a0a0a] sm:text-lg">
            {title}
          </span>
          <span className="mt-0.5 block truncate text-sm text-muted">
            {summary}
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted transition duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div id={`${id}-content`} className="border-t border-[#e5e5e5]">
          {children}
        </div>
      ) : null}
    </section>
  );
}
