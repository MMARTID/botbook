"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  Frown,
  LoaderCircle,
  Meh,
  MessageCircle,
  PhoneCall,
  Search,
  Smile,
  X,
} from "lucide-react";
import { getLlamadas } from "@/lib/api";
import { CANALES, PERIODOS, RESULTADOS, SENTIMIENTOS, consultaDeFiltros, descargarCsv, leerFiltros } from "@/lib/filtros-de-llamadas";
import { useBusquedaConRetraso } from "@/hooks/use-busqueda-con-retraso";
import { esChatDeWhatsapp, formatPhoneLocal, formatPrice, sentimentLabel } from "@/lib/format";
import { claveDeDia } from "@/lib/fechas-negocio";
import { momentoCorto, resultadoDeLlamada } from "@/lib/llamadas";
import type { Business, Call, OrdenDeLlamadas } from "@/lib/types";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import { SectionErrorState } from "@/components/section-card";
import { Insignia } from "@/components/movil/piezas";
import { TiraDePagina } from "@/components/escritorio/piezas";
import { DetalleDeLlamada } from "@/components/escritorio/llamadas/detalle-de-llamada";
import { SeccionesDeLlamadas } from "@/components/escritorio/llamadas/secciones-de-llamadas";

const TAMAÑOS = [25, 50, 100];
const ICONO_DE_ANIMO = { POSITIVE: Smile, NEUTRAL: Meh, NEGATIVE: Frown } as const;
const TONO_DE_RESULTADO = { morado: "morado", aviso: "aviso", exito: "exito", neutro: "neutro" } as const;

function mmss(segundos: number | null) {
  if (segundos == null) return "—";
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}

/**
 * Historial de llamadas de escritorio (wireframe 1h): las cifras de hoy
 * arriba, filtros combinables (resultado, canal, ánimo, fecha y búsqueda)
 * que viven en la URL, una tabla ancha ordenable por fecha o duración y la
 * conversación en un panel a la derecha. La exportación a CSV baja
 * exactamente lo filtrado.
 */
export function LlamadasEscritorio({ business }: { business: Business }) {
  const router = useRouter();
  const pathname = usePathname();
  const parametros = useSearchParams();
  const timeZone = business.timezone || "Europe/Madrid";
  const hoy = claveDeDia(new Date(), timeZone);
  const { aviso, avisar, cerrar } = useAviso();

  const filtros = leerFiltros(parametros, "30");
  const { filtro, canal, sentimiento, periodo, orden, q } = filtros;
  const porPagina = TAMAÑOS.includes(Number(parametros.get("por"))) ? Number(parametros.get("por")) : 50;
  const pagina = Math.max(0, Number.parseInt(parametros.get("pagina") ?? "0", 10) || 0);
  const seleccionada = parametros.get("llamada");

  const actualizar = useCallback(
    (cambios: Record<string, string | null>, conservarPagina = false) => {
      const siguiente = new URLSearchParams(parametros.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === "") siguiente.delete(clave);
        else siguiente.set(clave, valor);
      }
      if (!conservarPagina && !("pagina" in cambios)) siguiente.delete("pagina");
      const texto = siguiente.toString();
      router.replace(texto ? `${pathname}?${texto}` : pathname, { scroll: false });
    },
    [parametros, pathname, router]
  );

  const [busqueda, setBusqueda] = useBusquedaConRetraso(
    q,
    useCallback((valor: string) => actualizar({ q: valor || null }), [actualizar])
  );

  // React Query compara la clave por contenido: no hace falta memorizarla.
  const consulta = consultaDeFiltros(filtros, hoy, timeZone);

  const pedido = useQuery({
    queryKey: ["llamadas-escritorio", consulta, pagina, porPagina],
    queryFn: () => getLlamadas({ ...consulta, limit: porPagina, offset: pagina * porPagina, resumen: "hoy" }),
    placeholderData: keepPreviousData,
    refetchInterval: 2 * 60_000,
    refetchOnWindowFocus: true,
  });
  const llamadas = useMemo(() => pedido.data?.data ?? [], [pedido.data]);
  const total = pedido.data?.total ?? 0;
  const hayFiltros = filtro !== "todas" || canal || sentimiento || periodo !== "30" || q;

  // ↑ ↓ recorren la tabla con el detalle abierto, sin abrir nada.
  useEffect(() => {
    if (!seleccionada || llamadas.length === 0) return;
    const alPulsar = (evento: KeyboardEvent) => {
      const objetivo = evento.target as HTMLElement | null;
      if (objetivo && (["INPUT", "TEXTAREA", "SELECT"].includes(objetivo.tagName) || objetivo.isContentEditable)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (evento.key === "Escape") {
        actualizar({ llamada: null }, true);
        return;
      }
      if (evento.key !== "ArrowDown" && evento.key !== "ArrowUp") return;
      const indice = llamadas.findIndex((llamada) => llamada.id === seleccionada);
      const destino = llamadas[indice + (evento.key === "ArrowDown" ? 1 : -1)];
      if (!destino) return;
      evento.preventDefault();
      actualizar({ llamada: destino.id }, true);
      document.getElementById(`fila-${destino.id}`)?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [seleccionada, llamadas, actualizar]);

  const [exportando, setExportando] = useState(false);
  const exportar = async () => {
    setExportando(true);
    try {
      avisar(await descargarCsv(consulta));
    } catch {
      avisar("No se pudo exportar el historial. Inténtalo de nuevo.", "error");
    } finally {
      setExportando(false);
    }
  };

  const ordenar = (columna: "fecha" | "duracion") => {
    const siguiente: OrdenDeLlamadas =
      columna === "fecha" ? (orden === "reciente" ? "antigua" : "reciente") : orden === "mas_larga" ? "mas_corta" : "mas_larga";
    actualizar({ orden: siguiente === "reciente" ? null : siguiente });
  };

  const hoyResumen = pedido.data?.hoy;
  const porDevolver = pedido.data?.conteos?.porDevolver ?? 0;

  return (
    <div className="flex h-screen flex-col">
      <TiraDePagina icono={PhoneCall} titulo="Llamadas">
        <SeccionesDeLlamadas actual="historial" />
        <span className="flex-1" />
        {hoyResumen ? (
          <div className="flex flex-wrap items-center gap-1.5 text-sm" aria-label="Resumen de hoy">
            <span className="mr-0.5 font-semibold text-muted">Hoy:</span>
            <Insignia tono="morado">{hoyResumen.llamadas === 1 ? "1 conversación" : `${hoyResumen.llamadas} conversaciones`}</Insignia>
            <Insignia tono="exito">{hoyResumen.conCita} con cita</Insignia>
            {hoyResumen.duracionMediaSecs != null ? <Insignia tono="neutro">{mmss(hoyResumen.duracionMediaSecs)} de media</Insignia> : null}
            {porDevolver > 0 ? (
              <button
                type="button"
                onClick={() => actualizar({ filtro: "por_devolver" })}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
              >
                <Insignia tono="aviso">{porDevolver === 1 ? "1 recado por devolver" : `${porDevolver} recados por devolver`}</Insignia>
              </button>
            ) : null}
          </div>
        ) : null}
      </TiraDePagina>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-linea px-8 py-3">
            <label className="relative flex h-10 w-72 items-center">
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted" aria-hidden="true" />
              <span className="sr-only">Buscar en el historial</span>
              <input
                type="search"
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
                placeholder="Buscar número, nombre o servicio"
                className="field h-10 w-full pl-9 pr-3 text-sm"
              />
            </label>
            <Selector etiqueta="Resultado" valor={filtro} porDefecto="todas" opciones={RESULTADOS} onCambiar={(valor) => actualizar({ filtro: valor === "todas" ? null : valor })} />
            <Selector etiqueta="Canal" valor={canal} porDefecto="" opciones={CANALES} onCambiar={(valor) => actualizar({ canal: valor || null })} />
            <Selector etiqueta="Ánimo del cliente" valor={sentimiento} porDefecto="" opciones={SENTIMIENTOS} onCambiar={(valor) => actualizar({ animo: valor || null })} />
            <Selector etiqueta="Fecha" valor={periodo} porDefecto="30" opciones={PERIODOS} onCambiar={(valor) => actualizar({ periodo: valor === "30" ? null : valor })} />
            {hayFiltros ? (
              <button
                type="button"
                onClick={() => {
                  setBusqueda("");
                  router.replace(seleccionada ? `${pathname}?llamada=${seleccionada}` : pathname, { scroll: false });
                }}
                className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-morado-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Quitar filtros
              </button>
            ) : null}
            <span className="flex-1" />
            <button type="button" onClick={() => void exportar()} disabled={exportando || total === 0} className="btn-secondary h-10 px-4 text-sm">
              {exportando ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
              Exportar CSV
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {pedido.isLoading ? (
              <div className="space-y-px p-8" aria-label="Cargando llamadas">
                {Array.from({ length: 8 }, (_, indice) => (
                  <div key={indice} className="h-14 rounded-xl bg-relleno-fuerte motion-safe:animate-pulse" aria-hidden="true" />
                ))}
              </div>
            ) : pedido.isError ? (
              <SectionErrorState className="m-8" message="No se pudieron cargar las llamadas." onRetry={() => void pedido.refetch()} />
            ) : llamadas.length === 0 ? (
              <div className="flex justify-center p-12">
                <p className="max-w-md rounded-2xl border border-dashed border-linea bg-relleno px-6 py-5 text-center text-sm leading-6 text-muted">
                  {hayFiltros
                    ? "Ninguna conversación cumple estos filtros. Prueba con otro periodo o quita la búsqueda."
                    : "Todavía no hay llamadas. La actividad aparecerá aquí cuando la recepcionista atienda a un cliente."}
                </p>
              </div>
            ) : (
              <TablaDeLlamadas
                llamadas={llamadas}
                timeZone={timeZone}
                hoy={hoy}
                orden={orden}
                seleccionada={seleccionada}
                onOrdenar={ordenar}
                onAbrir={(id) => actualizar({ llamada: id === seleccionada ? null : id }, true)}
                actualizando={pedido.isFetching && !pedido.isLoading}
              />
            )}
          </div>

          {total > 0 ? (
            // pr-20: el botón flotante de las cookies vive en esa esquina.
            <div className="flex shrink-0 items-center gap-3 border-t border-linea py-2.5 pl-8 pr-20 text-sm text-muted">
              <span>
                <strong className="font-semibold tabular-nums text-tinta-2">
                  {pagina * porPagina + 1}–{pagina * porPagina + llamadas.length}
                </strong>{" "}
                de <strong className="font-semibold tabular-nums text-tinta-2">{total}</strong>
              </span>
              <span className="flex-1" />
              <label className="flex items-center gap-2">
                Por página
                <select
                  value={porPagina}
                  onChange={(evento) => actualizar({ por: evento.target.value === "50" ? null : evento.target.value })}
                  className="field h-9 px-2 text-sm text-tinta"
                >
                  {TAMAÑOS.map((tamaño) => (
                    <option key={tamaño} value={tamaño}>
                      {tamaño}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => actualizar({ pagina: pagina - 1 > 0 ? String(pagina - 1) : null })}
                disabled={pagina === 0}
                aria-label="Página anterior"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-linea bg-superficie text-tinta-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => actualizar({ pagina: String(pagina + 1) })}
                disabled={(pagina + 1) * porPagina >= total}
                aria-label="Página siguiente"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-linea bg-superficie text-tinta-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>

        {seleccionada ? (
          <DetalleDeLlamada
            key={seleccionada}
            callId={seleccionada}
            timeZone={timeZone}
            onCerrar={() => actualizar({ llamada: null }, true)}
            avisar={avisar}
          />
        ) : null}
      </div>
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </div>
  );
}

/** Desplegable en pastilla; en morado cuando filtra algo. */
function Selector<T extends string>({
  etiqueta,
  valor,
  porDefecto,
  opciones,
  onCambiar,
}: {
  etiqueta: string;
  valor: T;
  porDefecto: T;
  opciones: ReadonlyArray<{ valor: T; texto: string }>;
  onCambiar: (valor: T) => void;
}) {
  const activo = valor !== porDefecto;
  return (
    <label className="relative">
      <span className="sr-only">{etiqueta}</span>
      <select
        value={valor}
        onChange={(evento) => onCambiar(evento.target.value as T)}
        className={`h-10 appearance-none rounded-full border bg-superficie pl-3.5 pr-8 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${
          activo ? "border-lavado-borde bg-lavado text-morado-tinta" : "border-linea text-tinta-2"
        }`}
      >
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.texto}
          </option>
        ))}
      </select>
      <ChevronLeft className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 -rotate-90 text-muted" aria-hidden="true" />
    </label>
  );
}

function CabeceraOrdenable({
  texto,
  activo,
  ascendente,
  onClick,
}: {
  texto: string;
  activo: boolean;
  ascendente: boolean;
  onClick: () => void;
}) {
  const Flecha = ascendente ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 uppercase tracking-[0.1em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${activo ? "text-morado-tinta" : "hover:text-tinta"}`}
    >
      {texto}
      {activo ? <Flecha className="h-3 w-3" aria-hidden="true" /> : null}
    </button>
  );
}

function TablaDeLlamadas({
  llamadas,
  timeZone,
  hoy,
  orden,
  seleccionada,
  onOrdenar,
  onAbrir,
  actualizando,
}: {
  llamadas: Call[];
  timeZone: string;
  hoy: string;
  orden: OrdenDeLlamadas;
  seleccionada: string | null;
  onOrdenar: (columna: "fecha" | "duracion") => void;
  onAbrir: (id: string) => void;
  actualizando: boolean;
}) {
  const columnas =
    // Caben con el detalle abierto (460 px) en una pantalla de 1366.
    "grid grid-cols-[minmax(132px,1fr)_92px_96px_56px_minmax(118px,0.7fr)_minmax(160px,2fr)_40px] items-center gap-3";
  return (
    <div role="table" aria-label="Historial de llamadas" aria-busy={actualizando} className={actualizando ? "opacity-70 transition-opacity" : ""}>
      <div role="row" className={`${columnas} sticky top-0 z-10 border-b border-linea bg-relleno px-8 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted`}>
        <span role="columnheader">Cliente</span>
        <span role="columnheader" aria-sort={orden === "reciente" ? "descending" : orden === "antigua" ? "ascending" : "none"}>
          <CabeceraOrdenable texto="Fecha" activo={orden === "reciente" || orden === "antigua"} ascendente={orden === "antigua"} onClick={() => onOrdenar("fecha")} />
        </span>
        <span role="columnheader">Canal</span>
        <span role="columnheader" aria-sort={orden === "mas_larga" ? "descending" : orden === "mas_corta" ? "ascending" : "none"}>
          <CabeceraOrdenable texto="Duración" activo={orden === "mas_larga" || orden === "mas_corta"} ascendente={orden === "mas_corta"} onClick={() => onOrdenar("duracion")} />
        </span>
        <span role="columnheader">Resultado</span>
        <span role="columnheader">Reserva o resumen</span>
        <span role="columnheader" className="text-center">Ánimo</span>
      </div>
      {llamadas.map((llamada) => (
        <FilaDeLlamada
          key={llamada.id}
          llamada={llamada}
          columnas={columnas}
          timeZone={timeZone}
          hoy={hoy}
          elegida={llamada.id === seleccionada}
          onAbrir={() => onAbrir(llamada.id)}
        />
      ))}
    </div>
  );
}

function FilaDeLlamada({
  llamada,
  columnas,
  timeZone,
  hoy,
  elegida,
  onAbrir,
}: {
  llamada: Call;
  columnas: string;
  timeZone: string;
  hoy: string;
  elegida: boolean;
  onAbrir: () => void;
}) {
  const chat = esChatDeWhatsapp(llamada);
  const resultado = resultadoDeLlamada(llamada);
  const reserva = llamada.booking && !llamada.booking.isCancelled ? llamada.booking : null;
  const servicios = reserva?.services?.map((servicio) => servicio.name).join(" + ");
  const importe =
    reserva?.services?.length && reserva.services.every((servicio) => servicio.priceCents != null)
      ? reserva.services.reduce((suma, servicio) => suma + (servicio.priceCents ?? 0), 0)
      : null;
  const nombre = reserva?.clientName ?? llamada.recado?.nombre ?? null;
  const Animo = llamada.sentiment ? ICONO_DE_ANIMO[llamada.sentiment] : null;

  return (
    <button
      id={`fila-${llamada.id}`}
      type="button"
      role="row"
      aria-selected={elegida}
      onClick={onAbrir}
      className={`${columnas} w-full border-b border-linea-suave px-8 py-2.5 text-left text-sm transition focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-morado ${
        elegida ? "bg-lavado shadow-[inset_3px_0_0_rgb(var(--morado))]" : "hover:bg-relleno"
      }`}
    >
      <span role="cell" className="min-w-0">
        <span className="block truncate font-semibold tabular-nums text-tinta">{formatPhoneLocal(llamada.fromNumber) ?? "Número oculto"}</span>
        {nombre ? <span className="block truncate text-xs text-muted">{nombre}</span> : null}
      </span>
      <span role="cell" className="tabular-nums text-apagado">{momentoCorto(llamada.startedAt, timeZone, hoy)}</span>
      <span role="cell" className="flex items-center gap-1.5 text-apagado">
        {chat ? <MessageCircle className="h-4 w-4 text-morado" aria-hidden="true" /> : <PhoneCall className="h-4 w-4 text-morado" aria-hidden="true" />}
        {chat ? "WhatsApp" : "Voz"}
      </span>
      <span role="cell" className="tabular-nums text-apagado">{chat ? "—" : mmss(llamada.durationSecs)}</span>
      <span role="cell">
        <Insignia tono={TONO_DE_RESULTADO[resultado.tono]} icono={resultado.icono}>
          {resultado.texto}
        </Insignia>
      </span>
      <span role="cell" className="min-w-0">
        {reserva ? (
          <span className="flex items-center gap-1.5 truncate text-tinta-2">
            <CalendarCheck className="h-4 w-4 shrink-0 text-morado-tinta" aria-hidden="true" />
            <span className="truncate">
              {[servicios || "Reserva creada", reserva.professional?.name, importe != null ? formatPrice(importe) : null].filter(Boolean).join(" · ")}
            </span>
          </span>
        ) : (
          <span className={`line-clamp-2 ${llamada.summary ? "text-apagado" : "text-muted"}`}>
            {llamada.summary ?? "Sin resumen de la conversación."}
          </span>
        )}
      </span>
      <span role="cell" className="flex justify-center text-apagado" title={sentimentLabel(llamada.sentiment) ?? undefined}>
        {Animo ? <Animo className="h-[18px] w-[18px]" aria-label={sentimentLabel(llamada.sentiment) ?? undefined} /> : <span aria-label="Sin dato">—</span>}
      </span>
    </button>
  );
}
