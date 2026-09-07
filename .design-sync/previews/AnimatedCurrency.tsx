import "./_sin-movimiento";
import * as React from "react";
import { AnimatedCurrency } from "alhabla-ui";

/** Cómo aparece en la calculadora: cifra grande sobre la tarjeta oscura. */
export function CifraDestacada() {
  return (
    <div className="panel w-full max-w-xs bg-[#0a0a0a] p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-white/60">
        Pierdes al mes, al menos
      </p>
      <p className="mt-2 text-4xl font-black text-[#a78bfa]">
        <AnimatedCurrency value={420} />
      </p>
      <p className="mt-1 text-xs text-white/50">4.680 € al año</p>
    </div>
  );
}

/** En línea dentro de un texto corrido, heredando el tamaño del párrafo. */
export function EnLinea() {
  return (
    <p className="max-w-sm text-sm leading-6 text-muted">
      Con el agente atendiendo las llamadas que hoy se pierden, la estimación
      sube a{" "}
      <strong className="font-semibold text-[#0a0a0a]">
        <AnimatedCurrency value={1260} />
      </strong>{" "}
      recuperados cada trimestre.
    </p>
  );
}
