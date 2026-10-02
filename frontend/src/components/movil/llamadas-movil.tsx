"use client";

import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { BarChart3, PhoneCall } from "lucide-react";
import { getCalls } from "@/lib/api";
import { formatCanalYDuracion } from "@/lib/format";
import { claveDeDia, etiquetaDeDia, horaDelNegocio } from "@/lib/fechas-negocio";
import type { FiltroDeLlamadas } from "@/lib/types";
import { useBusiness } from "@/components/providers";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import { SectionErrorState } from "@/components/section-card";
import { CabeceraMovil, CLASES_BOTON_REDONDO } from "@/components/movil/cabecera-movil";
import { FilaLlamada } from "@/components/movil/fila-llamada";
import { HojaLlamada } from "@/components/movil/hoja-llamada";
import { VacioMovil } from "@/components/movil/piezas";

const POR_PAGINA = 20;

const FILTROS: Array<{ clave: FiltroDeLlamadas; etiqueta: string; conteo: "todas" | "conCita" | "porDevolver" }> = [
  { clave: "todas", etiqueta: "Todas", conteo: "todas" },
  { clave: "con_cita", etiqueta: "Con cita", conteo: "conCita" },
  { clave: "por_devolver", etiqueta: "Por devolver", conteo: "porDevolver" },
];

/**
 * Historial de llamadas en el móvil: filtros de un toque, agrupado por día,
 * deslizar para llamar y «Cargar más» en vez de la paginación de
 * escritorio. El detalle sube en una hoja.
 */
export function LlamadasMovil() {
  const { business } = useBusiness();
  const timeZone = business?.timezone || "Europe/Madrid";
  const hoy = claveDeDia(new Date(), timeZone);
  const [filtro, setFiltro] = useState<FiltroDeLlamadas>("todas");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [conAccion, setConAccion] = useState<string | null>(null);
  const { aviso, avisar, cerrar } = useAviso();

  const consulta = useInfiniteQuery({
    queryKey: ["llamadas", filtro],
    queryFn: ({ pageParam }) => getCalls(POR_PAGINA, pageParam, filtro),
    initialPageParam: 0,
    getNextPageParam: (ultima, paginas) => {
      const cargadas = paginas.reduce((suma, pagina) => suma + pagina.data.length, 0);
      return cargadas < ultima.total ? cargadas : undefined;
    },
    refetchOnWindowFocus: true,
  });

  const paginas = consulta.data?.pages ?? [];
  const llamadas = paginas.flatMap((pagina) => pagina.data);
  const total = paginas[0]?.total ?? 0;
  const conteos = paginas[0]?.conteos;
  // Un backend anterior a los recados ignora el filtro y no manda conteos:
  // sin ellos no se enseñan filtros que no filtrarían nada.
  const hayFiltros = Boolean(conteos) || filtro !== "todas";
  const restantes = Math.max(0, total - llamadas.length);

  return (
    <div>
      <CabeceraMovil
        titulo="Llamadas"
        subtitulo="Conversaciones atendidas por tu recepcionista."
        accion={
          <Link href="/llamadas/analitica" aria-label="Analítica avanzada" className={CLASES_BOTON_REDONDO}>
            <BarChart3 className="h-[18px] w-[18px]" aria-hidden="true" />
          </Link>
        }
      />

      {hayFiltros ? (
        <div role="group" aria-label="Filtrar llamadas" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2.5 pt-0.5 [scrollbar-width:none]">
          {FILTROS.map((opcion) => {
            const activo = filtro === opcion.clave;
            const numero = conteos?.[opcion.conteo];
            return (
              <button
                key={opcion.clave}
                type="button"
                aria-pressed={activo}
                onClick={() => {
                  setFiltro(opcion.clave);
                  setConAccion(null);
                }}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${
                  activo ? "border-lavado-borde bg-lavado text-morado-tinta" : "border-linea bg-superficie text-tinta-2"
                }`}
              >
                {opcion.etiqueta}
                {numero !== undefined ? (
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                      activo ? "bg-superficie text-morado-tinta" : "bg-relleno-fuerte text-apagado"
                    }`}
                  >
                    {numero}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {consulta.isLoading ? (
        <div className="space-y-2 pt-2" aria-label="Cargando llamadas">
          {[0, 1, 2, 3, 4].map((indice) => (
            <div key={indice} className="h-[72px] rounded-2xl bg-relleno-fuerte motion-safe:animate-pulse" aria-hidden="true" />
          ))}
        </div>
      ) : consulta.isError ? (
        <SectionErrorState message="No se pudieron cargar las llamadas." onRetry={() => void consulta.refetch()} />
      ) : llamadas.length === 0 ? (
        <VacioMovil icono={PhoneCall} className="mt-1.5">
          {filtro === "por_devolver"
            ? "No tienes llamadas por devolver."
            : filtro === "con_cita"
              ? "Ninguna llamada ha terminado en cita todavía."
              : "La actividad aparecerá aquí cuando la recepcionista atienda a un cliente."}
        </VacioMovil>
      ) : (
        <>
          <ul className="-mx-4">
            {llamadas.map((call, indice) => {
              const dia = claveDeDia(call.startedAt, timeZone);
              const nuevoDia = indice === 0 || claveDeDia(llamadas[indice - 1].startedAt, timeZone) !== dia;
              return (
                <li key={call.id}>
                  {nuevoDia ? (
                    <h2 className="px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      {etiquetaDeDia(dia, hoy)}
                    </h2>
                  ) : null}
                  <div className="border-t border-linea">
                    <FilaLlamada
                      call={call}
                      momento={`${horaDelNegocio(call.startedAt, timeZone)} · ${formatCanalYDuracion(call)}`}
                      onAbrir={() => setAbierta(call.id)}
                      deslizable
                      accionVisible={conAccion === call.id}
                      onAccionVisible={(visible) => setConAccion(visible ? call.id : null)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="-mx-4 flex flex-col gap-3 border-t border-linea px-4 pt-4">
            <p className="text-center text-[13px] text-muted">
              Mostrando {llamadas.length} de {total} {total === 1 ? "llamada" : "llamadas"}
            </p>
            {consulta.hasNextPage ? (
              <button
                type="button"
                onClick={() => void consulta.fetchNextPage()}
                disabled={consulta.isFetchingNextPage}
                className="btn-secondary w-full"
              >
                {consulta.isFetchingNextPage ? "Cargando…" : `Cargar ${Math.min(POR_PAGINA, restantes)} más`}
              </button>
            ) : null}
          </div>
        </>
      )}

      <HojaLlamada callId={abierta} timeZone={timeZone} onCerrar={() => setAbierta(null)} avisar={avisar} />
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </div>
  );
}
