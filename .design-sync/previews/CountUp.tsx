import "./_sin-movimiento";
import * as React from "react";
import { CountUp } from "alhabla-ui";

/**
 * Fila de métricas como la de la landing. La tarjeta es estática, así que
 * muestra el valor ya asentado: la animación de conteo sólo se ve en vivo.
 */
export function FilaDeMetricas() {
  return (
    <div className="flex flex-wrap gap-8">
      {[
        { cifra: "78%", pie: "de llamadas fuera de horario" },
        { cifra: "26.000", pie: "citas reservadas por agentes" },
        { cifra: "45-65€", pie: "ticket medio recuperado" },
      ].map((metrica) => (
        <div key={metrica.cifra}>
          <p className="text-3xl font-black tracking-tight text-[#0a0a0a]">
            <CountUp value={metrica.cifra} />
          </p>
          <p className="mt-1 max-w-[10rem] text-xs leading-5 text-muted">
            {metrica.pie}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Cifra suelta con acento morado: el tratamiento de las cifras clave. */
export function CifraDestacada() {
  return (
    <p className="text-5xl font-black tracking-tight text-[#8b5cf6]">
      <CountUp value="600M€" />
    </p>
  );
}
