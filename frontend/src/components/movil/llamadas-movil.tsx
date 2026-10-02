"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { BarChart3, Download, LoaderCircle, PhoneCall, Search, SlidersHorizontal, X } from "lucide-react";
import { getLlamadas } from "@/lib/api";
import { formatCanalYDuracion } from "@/lib/format";
import { claveDeDia, etiquetaDeDia, horaDelNegocio } from "@/lib/fechas-negocio";
import {
  CANALES,
  PERIODOS,
  RESULTADOS,
  SENTIMIENTOS,
  consultaDeFiltros,
  descargarCsv,
  leerFiltros,
  type FiltrosDeLlamadas,
} from "@/lib/filtros-de-llamadas";
import { useBusquedaConRetraso } from "@/hooks/use-busqueda-con-retraso";
import { useBusiness } from "@/components/providers";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import { SectionErrorState } from "@/components/section-card";
import { CabeceraMovil, CLASES_BOTON_REDONDO } from "@/components/movil/cabecera-movil";
import { FilaLlamada } from "@/components/movil/fila-llamada";
import { HojaLlamada } from "@/components/movil/hoja-llamada";
import { CuerpoDeHoja, HojaInferior } from "@/components/movil/hoja-inferior";
import { BotonDeBuscar } from "@/components/movil/buscador-movil";
import { VacioMovil } from "@/components/movil/piezas";

const POR_PAGINA = 20;
const CONTEO_DE: Partial<Record<FiltrosDeLlamadas["filtro"], "todas" | "conCita" | "porDevolver">> = {
  todas: "todas",
  con_cita: "conCita",
  por_devolver: "porDevolver",
};

function mmss(segundos: number) {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}

/** Cuántos filtros de la hoja «Filtros» están puestos (no cuenta el resultado). */
function filtrosDeLaHoja(filtros: FiltrosDeLlamadas) {
  return [filtros.canal !== "", filtros.sentimiento !== "", filtros.periodo !== "todo"].filter(Boolean).length;
}

/**
 * Historial de llamadas en el móvil, con los mismos filtros que el
 * escritorio (en la URL): buscar por texto, el resultado en pastillas y
 * canal, ánimo y fechas en una hoja, desde donde también se exporta a CSV.
 * Agrupado por día, deslizar para llamar y «Cargar más». La llamada se abre
 * en una hoja, también desde el buscador (`?llamada=`).
 */
export function LlamadasMovil() {
  const router = useRouter();
  const pathname = usePathname();
  const parametros = useSearchParams();
  const { business } = useBusiness();
  const timeZone = business?.timezone || "Europe/Madrid";
  const hoy = claveDeDia(new Date(), timeZone);
  const [conAccion, setConAccion] = useState<string | null>(null);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [exportando, setExportando] = useState(false);
  const { aviso, avisar, cerrar } = useAviso();

  const filtros = leerFiltros(parametros, "todo");
  const consulta = consultaDeFiltros(filtros, hoy, timeZone);
  const abierta = parametros.get("llamada");

  const actualizar = useCallback(
    (cambios: Record<string, string | null>) => {
      const siguiente = new URLSearchParams(parametros.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === "") siguiente.delete(clave);
        else siguiente.set(clave, valor);
      }
      const texto = siguiente.toString();
      router.replace(texto ? `${pathname}?${texto}` : pathname, { scroll: false });
    },
    [parametros, pathname, router]
  );
  const [busqueda, setBusqueda] = useBusquedaConRetraso(
    filtros.q,
    useCallback((valor: string) => actualizar({ q: valor || null }), [actualizar])
  );

  const pedido = useInfiniteQuery({
    queryKey: ["llamadas", consulta],
    queryFn: ({ pageParam }) =>
      getLlamadas({ ...consulta, limit: POR_PAGINA, offset: pageParam, ...(pageParam === 0 ? { resumen: "hoy" as const } : {}) }),
    initialPageParam: 0,
    getNextPageParam: (ultima, paginas) => {
      const cargadas = paginas.reduce((suma, pagina) => suma + pagina.data.length, 0);
      return cargadas < ultima.total ? cargadas : undefined;
    },
    refetchOnWindowFocus: true,
  });

  const paginas = pedido.data?.pages ?? [];
  const llamadas = paginas.flatMap((pagina) => pagina.data);
  const total = paginas[0]?.total ?? 0;
  const conteos = paginas[0]?.conteos;
  const resumen = paginas[0]?.hoy;
  const restantes = Math.max(0, total - llamadas.length);
  const enLaHoja = filtrosDeLaHoja(filtros);
  const filtrando = filtros.filtro !== "todas" || enLaHoja > 0 || filtros.q !== "";

  const subtitulo = resumen
    ? [
        `Hoy: ${resumen.llamadas === 1 ? "1 conversación" : `${resumen.llamadas} conversaciones`}`,
        `${resumen.conCita} con cita`,
        resumen.duracionMediaSecs != null ? `${mmss(resumen.duracionMediaSecs)} de media` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Conversaciones atendidas por tu recepcionista.";

  const exportar = async () => {
    setExportando(true);
    try {
      avisar(await descargarCsv(consulta));
      setFiltrosAbiertos(false);
    } catch {
      avisar("No se pudo exportar el historial. Inténtalo de nuevo.", "error");
    } finally {
      setExportando(false);
    }
  };

  return (
    <div>
      <CabeceraMovil
        titulo="Llamadas"
        subtitulo={subtitulo}
        accion={
          <>
            <BotonDeBuscar />
            <Link href="/llamadas/analitica" aria-label="Analítica avanzada" className={CLASES_BOTON_REDONDO}>
              <BarChart3 className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
          </>
        }
      />

      <label className="relative mb-2.5 flex items-center">
        <Search className="pointer-events-none absolute left-3.5 h-[18px] w-[18px] text-apagado" aria-hidden="true" />
        <span className="sr-only">Buscar en el historial</span>
        <input
          type="search"
          enterKeyHint="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Número, nombre o servicio"
          className="field h-11 w-full pl-11 text-base"
        />
      </label>

      <div role="group" aria-label="Filtrar llamadas" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2.5 pt-0.5 [scrollbar-width:none]">
        <button
          type="button"
          onClick={() => setFiltrosAbiertos(true)}
          aria-label={enLaHoja > 0 ? `Filtros, ${enLaHoja} puestos` : "Filtros"}
          className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${
            enLaHoja > 0 ? "border-lavado-borde bg-lavado text-morado-tinta" : "border-linea bg-superficie text-tinta-2"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {enLaHoja > 0 ? <span className="tabular-nums">{enLaHoja}</span> : null}
        </button>
        {RESULTADOS.map((opcion) => {
          const activo = filtros.filtro === opcion.valor;
          const clave = CONTEO_DE[opcion.valor];
          const numero = clave ? conteos?.[clave] : undefined;
          return (
            <button
              key={opcion.valor}
              type="button"
              aria-pressed={activo}
              onClick={() => {
                actualizar({ filtro: opcion.valor === "todas" ? null : opcion.valor });
                setConAccion(null);
              }}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${
                activo ? "border-lavado-borde bg-lavado text-morado-tinta" : "border-linea bg-superficie text-tinta-2"
              }`}
            >
              {opcion.corto}
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

      {pedido.isLoading ? (
        <div className="space-y-2 pt-2" aria-label="Cargando llamadas">
          {[0, 1, 2, 3, 4].map((indice) => (
            <div key={indice} className="h-[72px] rounded-2xl bg-relleno-fuerte motion-safe:animate-pulse" aria-hidden="true" />
          ))}
        </div>
      ) : pedido.isError ? (
        <SectionErrorState message="No se pudieron cargar las llamadas." onRetry={() => void pedido.refetch()} />
      ) : llamadas.length === 0 ? (
        <VacioMovil icono={PhoneCall} className="mt-1.5">
          {filtrando
            ? "Ninguna conversación cumple estos filtros."
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
                      onAbrir={() => actualizar({ llamada: call.id })}
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
            {pedido.hasNextPage ? (
              <button
                type="button"
                onClick={() => void pedido.fetchNextPage()}
                disabled={pedido.isFetchingNextPage}
                className="btn-secondary w-full"
              >
                {pedido.isFetchingNextPage ? "Cargando…" : `Cargar ${Math.min(POR_PAGINA, restantes)} más`}
              </button>
            ) : null}
          </div>
        </>
      )}

      <HojaDeFiltros
        abierta={filtrosAbiertos}
        onCerrar={() => setFiltrosAbiertos(false)}
        filtros={filtros}
        total={total}
        onCambiar={actualizar}
        onExportar={() => void exportar()}
        exportando={exportando}
      />
      <HojaLlamada callId={abierta} timeZone={timeZone} onCerrar={() => actualizar({ llamada: null })} avisar={avisar} />
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </div>
  );
}

function Pastillas<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambiar,
}: {
  etiqueta: string;
  opciones: ReadonlyArray<{ valor: T; texto: string }>;
  valor: T;
  onCambiar: (valor: T) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">{etiqueta}</legend>
      <div role="radiogroup" aria-label={etiqueta} className="flex flex-wrap gap-2">
        {opciones.map((opcion) => {
          const elegida = opcion.valor === valor;
          return (
            <button
              key={opcion.valor}
              type="button"
              role="radio"
              aria-checked={elegida}
              onClick={() => onCambiar(opcion.valor)}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${
                elegida ? "border-lavado-borde bg-lavado text-morado-tinta" : "border-linea bg-superficie text-tinta-2"
              }`}
            >
              {opcion.texto}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Canal, ánimo y fechas, y la exportación a CSV de lo filtrado. */
function HojaDeFiltros({
  abierta,
  onCerrar,
  filtros,
  total,
  onCambiar,
  onExportar,
  exportando,
}: {
  abierta: boolean;
  onCerrar: () => void;
  filtros: FiltrosDeLlamadas;
  total: number;
  onCambiar: (cambios: Record<string, string | null>) => void;
  onExportar: () => void;
  exportando: boolean;
}) {
  const puestos = filtrosDeLaHoja(filtros);
  return (
    <HojaInferior
      abierta={abierta}
      onCerrar={onCerrar}
      titulo="Filtrar llamadas"
      pie={
        <div className="flex gap-2">
          {puestos > 0 ? (
            <button
              type="button"
              onClick={() => onCambiar({ canal: null, animo: null, periodo: null })}
              className="btn-secondary flex-none px-4"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Quitar
            </button>
          ) : null}
          <button type="button" onClick={onCerrar} className="btn-primary flex-1 px-4">
            Ver {total === 1 ? "1 conversación" : `${total} conversaciones`}
          </button>
        </div>
      }
    >
      <CuerpoDeHoja className="space-y-5 pb-4">
        <Pastillas
          etiqueta="Canal"
          opciones={CANALES.map((opcion) => ({ valor: opcion.valor, texto: opcion.corto }))}
          valor={filtros.canal}
          onCambiar={(valor) => onCambiar({ canal: valor || null })}
        />
        <Pastillas
          etiqueta="Ánimo del cliente"
          opciones={SENTIMIENTOS.map((opcion) => ({ valor: opcion.valor, texto: opcion.corto }))}
          valor={filtros.sentimiento}
          onCambiar={(valor) => onCambiar({ animo: valor || null })}
        />
        <Pastillas
          etiqueta="Fecha"
          opciones={PERIODOS}
          valor={filtros.periodo}
          onCambiar={(valor) => onCambiar({ periodo: valor === "todo" ? null : valor })}
        />
        <button
          type="button"
          onClick={onExportar}
          disabled={exportando || total === 0}
          className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-linea bg-superficie px-4 text-left text-[15px] font-semibold text-tinta disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
        >
          {exportando ? (
            <LoaderCircle className="h-[18px] w-[18px] animate-spin text-morado" aria-hidden="true" />
          ) : (
            <Download className="h-[18px] w-[18px] text-morado" aria-hidden="true" />
          )}
          <span className="flex-1">Exportar a CSV</span>
          <span className="text-[13px] font-normal text-muted">lo filtrado</span>
        </button>
      </CuerpoDeHoja>
    </HojaInferior>
  );
}
