const TOTAL_PASOS = 5;

/**
 * Dónde está el negocio dentro del alta (negocio → tipo → servicios → equipo →
 * calendario). Sin esto cada paso parecía el último y nadie sabía cuánto
 * quedaba antes del pago. Barra en negro: el morado de la pantalla ya lo lleva
 * el azulejo del icono (La Regla del Acento Único).
 */
export function PasoDelAlta({ paso }: { paso: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <div
        role="progressbar"
        aria-label="Progreso del alta"
        aria-valuemin={1}
        aria-valuemax={TOTAL_PASOS}
        aria-valuenow={paso}
        aria-valuetext={`Paso ${paso} de ${TOTAL_PASOS}`}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e5e5e5]"
      >
        <div
          className="h-full rounded-full bg-[#0a0a0a]"
          style={{ width: `${(paso / TOTAL_PASOS) * 100}%` }}
        />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted" aria-hidden="true">
        Paso {paso} de {TOTAL_PASOS}
      </span>
    </div>
  );
}
