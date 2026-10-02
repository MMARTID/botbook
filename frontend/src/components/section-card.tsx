import Link from "next/link";
import { ArrowRight, RefreshCw, TriangleAlert } from "lucide-react";
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
          <h2 id={`${id}-title`} className="text-lg font-semibold text-tinta sm:text-xl">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {action ? (
          action.kind === "link" ? (
            <Link
              href={action.href}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-linea bg-superficie px-3 text-sm font-semibold text-tinta-2 transition duration-200 hover:bg-relleno focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
            >
              {action.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-linea bg-superficie px-3 text-sm font-semibold text-tinta-2 transition duration-200 hover:bg-relleno disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
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
      className={`flex flex-col items-start gap-3 rounded-2xl border border-dashed border-linea bg-relleno px-4 py-6 sm:flex-row sm:items-center ${className ?? ""}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lavado text-morado">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-tinta-2">{title}</p>
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

/** Bloque de error con reintento, igual en toda la app: tarjeta blanca con
 * el rojo solo en el icono. */
export function SectionErrorState({ message, onRetry, className }: SectionErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl border border-linea bg-superficie px-4 py-6 text-center ${className ?? ""}`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-urgente-fondo text-urgente" aria-hidden="true">
        <TriangleAlert className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-tinta-2">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-linea bg-superficie px-4 text-sm font-semibold text-tinta transition duration-200 hover:bg-relleno focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Reintentar
      </button>
    </div>
  );
}
