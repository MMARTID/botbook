/**
 * Pastilla «Beta» sobre un botón o tarjeta: el botón sigue funcionando, la
 * pastilla solo avisa. El contenedor tiene que ser `relative`.
 */
export function BetaPill({ className = "" }: { className?: string }) {
  return (
    <span
      className={`badge-soft pointer-events-none absolute -top-2.5 right-3 z-10 px-2.5 py-0.5 text-[11px] shadow-sm ${className}`}
    >
      Beta
    </span>
  );
}
