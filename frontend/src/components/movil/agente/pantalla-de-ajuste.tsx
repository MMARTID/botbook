"use client";

import { CabeceraMovil } from "@/components/movil/cabecera-movil";

/**
 * Marco de una pantalla de ajuste del agente en el móvil: «‹ Agente», el
 * título grande con su frase y sitio abajo para la barra de guardar.
 */
export function PantallaDeAjuste({
  titulo,
  subtitulo,
  accion,
  children,
}: {
  titulo: string;
  subtitulo: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="entrada-detalle pb-24">
      <CabeceraMovil titulo={titulo} subtitulo={subtitulo} volver={{ href: "/agente", etiqueta: "Agente" }} accion={accion} />
      {children}
    </div>
  );
}
