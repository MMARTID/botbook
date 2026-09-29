import "./_sin-movimiento";
import * as React from "react";
import { CountUp } from "alhabla-web-ui";

/**
 * Fila de métricas con las cifras reales de salones de uñas de
 * `niche-landings.ts` (STANPA / El Periódico y safina.ai): toda cifra
 * publicada lleva fuente externa y Alhabla no tiene métricas propias
 * (PRODUCT.md § Evidence on Hand). La tarjeta es estática, así que muestra el
 * valor ya asentado: la animación de conteo sólo se ve en vivo.
 */
export function FilaDeMetricas() {
  return (
    <div className="flex flex-wrap gap-8">
      {[
        { cifra: "26.000", pie: "centros en España ofrecen servicios de uñas" },
        { cifra: "600M€", pie: "de facturación anual del sector" },
        { cifra: "85%", pie: "de quienes no hablan con una persona no vuelve a llamar" },
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
