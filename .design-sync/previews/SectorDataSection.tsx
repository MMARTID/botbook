import "./_sin-movimiento";
import * as React from "react";
import { SectorDataSection, nicheLandings } from "alhabla-ui";

const datosPeluqueria = nicheLandings.peluqueria.sectorData;

/** Datos sectoriales reales del nicho de peluquerías. */
export function Peluqueria() {
  return datosPeluqueria ? <SectorDataSection data={datosPeluqueria} /> : null;
}

/** Bloque mínimo: sólo cifras, sin citas ni punto de dolor. */
export function SoloCifras() {
  return (
    <SectorDataSection
      data={{
        eyebrow: "El sector en cifras",
        title: "La recepción se ha convertido en el cuello de botella",
        description:
          "Los datos del sector coinciden en lo mismo: la mayoría de las llamadas que se pierden llegan cuando no hay nadie libre para cogerlas.",
        stats: [
          { value: "62%", label: "de las llamadas entran fuera de horario" },
          { value: "1 de cada 3", label: "clientes no vuelve a llamar" },
          { value: "45-65€", label: "ticket medio de una cita perdida" },
        ],
      }}
    />
  );
}
