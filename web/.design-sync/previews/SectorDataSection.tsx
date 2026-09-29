import "./_sin-movimiento";
import * as React from "react";
import { SectorDataSection, nicheLandings } from "alhabla-web-ui";

const peluqueria = nicheLandings.peluqueria;

/** Datos sectoriales reales de peluquerías, con su acento como en la landing. */
export function Peluqueria() {
  return peluqueria.sectorData ? (
    <SectorDataSection
      data={peluqueria.sectorData}
      accent={peluqueria.accent}
    />
  ) : null;
}

const estetica = nicheLandings["centro-de-estetica"];

/**
 * Bloque mínimo: sólo cifras (cada una con su fuente), sin citas ni punto de
 * dolor, en el morado de marca. Datos reales de centros de estética: una cifra
 * sin fuente externa no se publica (PRODUCT.md § Evidence on Hand).
 */
export function SoloCifras() {
  if (!estetica.sectorData) return null;
  const { quotes: _citas, painPoint: _dolor, ...soloCifras } = estetica.sectorData;
  return <SectorDataSection data={soloCifras} />;
}
