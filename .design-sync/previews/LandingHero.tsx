import "./_sin-movimiento";
import * as React from "react";
import { LandingHero, nicheLandings } from "alhabla-ui";

/** Sin `content`: el hero genérico de la portada. */
export function Generico() {
  return <LandingHero />;
}

/** Con el contenido real del nicho de peluquerías. */
export function Peluqueria() {
  return <LandingHero content={nicheLandings.peluqueria} />;
}
