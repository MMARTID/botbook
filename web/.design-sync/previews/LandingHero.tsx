import "./_sin-movimiento";
import * as React from "react";
import { LandingHero, nicheLandings } from "alhabla-web-ui";

/** El uso real: el hero de una landing por sector, con su copy y su acento. */
export function Peluqueria() {
  return <LandingHero content={nicheLandings.peluqueria} />;
}

/**
 * Sin `content`: el hero genérico en morado de marca. Hoy no lo monta ninguna
 * página (la portada tiene su propio hero), pero es el estado por defecto.
 */
export function Generico() {
  return <LandingHero />;
}
