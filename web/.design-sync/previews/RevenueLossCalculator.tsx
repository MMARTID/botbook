import "./_sin-movimiento";
import * as React from "react";
import { RevenueLossCalculator, nicheLandings } from "alhabla-web-ui";

/** La calculadora de la portada, con su copy genérico. */
export function Generica() {
  return <RevenueLossCalculator />;
}

/** Como en la landing de peluquerías: su copy, su ticket inicial y su acento. */
export function Peluqueria() {
  return (
    <RevenueLossCalculator
      content={nicheLandings.peluqueria.calculator}
      activeNiche="peluqueria"
      accent={nicheLandings.peluqueria.accent}
    />
  );
}
