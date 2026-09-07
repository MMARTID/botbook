import "./_sin-movimiento";
import * as React from "react";
import { RevenueLossCalculator, nicheLandings } from "alhabla-ui";

/** La calculadora de la portada, con su copy genérico. */
export function Generica() {
  return <RevenueLossCalculator />;
}

/** Con el copy y el ticket inicial del nicho de peluquerías. */
export function Peluqueria() {
  return (
    <RevenueLossCalculator
      content={nicheLandings.peluqueria.calculator}
      activeNiche="peluqueria"
    />
  );
}
