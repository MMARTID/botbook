"use client";

import { useMarcoDeAjuste } from "@/components/marco-de-ajuste";
import { CabeceraMovil } from "@/components/movil/cabecera-movil";

/**
 * Marco de una pantalla de ajuste del agente. En el móvil: «‹ Agente», el
 * título grande con su frase y sitio abajo para la barra de guardar. En el
 * Agente de escritorio: la sección abierta de la columna central, con su
 * título; la barra de guardar va al pie de la columna.
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
  const marco = useMarcoDeAjuste();
  if (marco.tipo === "escritorio") {
    return (
      <section aria-labelledby="titulo-del-ajuste">
        <header className="mb-5 flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2 id="titulo-del-ajuste" className="text-xl font-bold tracking-[-0.02em] text-tinta">
              {titulo}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{subtitulo}</p>
          </div>
          {accion ? <div className="shrink-0">{accion}</div> : null}
        </header>
        {children}
      </section>
    );
  }
  return (
    <div className="entrada-detalle pb-24">
      <CabeceraMovil titulo={titulo} subtitulo={subtitulo} volver={{ href: "/agente", etiqueta: "Agente" }} accion={accion} />
      {children}
    </div>
  );
}
