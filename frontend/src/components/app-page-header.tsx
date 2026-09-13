import type { LucideIcon } from "lucide-react";

type AppPageHeaderProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
};

/**
 * Cabecera común de las vistas de trabajo. Da la misma orientación visual a
 * Panel, Agenda, Llamadas y Agente sin convertirlas en tarjetas genéricas.
 */
export function AppPageHeader({
  icon: Icon,
  title,
  description,
  children,
}: AppPageHeaderProps) {
  return (
    <header className="grid gap-5 border-b border-[#e5e5e5] pb-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-8 sm:pb-7">
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6] sm:h-12 sm:w-12" aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-balance text-3xl font-extrabold tracking-[-0.025em] text-[#0a0a0a] sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-[15px]">
            {description}
          </p>
        </div>
      </div>
      {children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}
