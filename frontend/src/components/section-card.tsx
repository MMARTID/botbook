import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type SectionCardAction =
  | { kind: "link"; href: string; label: string }
  | { kind: "button"; label: string; onClick: () => void; disabled?: boolean };

type SectionCardProps = {
  id: string;
  title: string;
  description?: string;
  action?: SectionCardAction;
  className?: string;
  children: React.ReactNode;
};

/**
 * Cabecera de tarjeta (título + descripción + acción opcional) dentro de un
 * `.panel`. Mismo patrón en Próximas citas, Llamadas recientes y el resumen
 * semanal — un solo sitio para que evolucione igual en el resto del panel.
 */
export function SectionCard({ id, title, description, action, className, children }: SectionCardProps) {
  return (
    <section className={`panel min-w-0 p-4 sm:p-5 lg:p-6 ${className ?? ""}`} aria-labelledby={`${id}-title`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-lg font-semibold text-[#0a0a0a] sm:text-xl">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {action ? (
          action.kind === "link" ? (
            <Link
              href={action.href}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#e5e5e5] bg-white px-3 text-sm font-semibold text-[#27272a] transition duration-200 hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
            >
              {action.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#e5e5e5] bg-white px-3 text-sm font-semibold text-[#27272a] transition duration-200 hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
            >
              {action.label}
            </button>
          )
        ) : null}
      </div>
      {children}
    </section>
  );
}

type SectionEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
};

/** Bloque de estado vacío: azulejo morado + mensaje, borde discontinuo. */
export function SectionEmptyState({ icon: Icon, title, description, className }: SectionEmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-start gap-3 rounded-2xl border border-dashed border-[#e5e5e5] bg-[#fafafa] px-4 py-6 sm:flex-row sm:items-center ${className ?? ""}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#27272a]">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
      </div>
    </div>
  );
}

type SectionErrorStateProps = {
  message: string;
  onRetry: () => void;
  className?: string;
};

/** Bloque de error con reintento: mismo tono rojo en toda la app. */
export function SectionErrorState({ message, onRetry, className }: SectionErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl border border-[#f5d3d3] bg-[#fff1f1] px-4 py-6 text-center ${className ?? ""}`}
    >
      <p className="text-sm font-medium text-[#c53030]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-[#f5d3d3] bg-white px-4 text-sm font-semibold text-[#c53030] transition duration-200 hover:bg-[#fff1f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Reintentar
      </button>
    </div>
  );
}
