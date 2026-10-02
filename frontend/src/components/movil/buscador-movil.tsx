"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, LoaderCircle, Search } from "lucide-react";
import { CuerpoDeHoja, HojaInferior } from "@/components/movil/hoja-inferior";
import { CLASES_BOTON_REDONDO } from "@/components/movil/cabecera-movil";
import { useOpcionesDelBuscador } from "@/components/escritorio/buscador";

const EVENTO_ABRIR_BUSCADOR = "alhabla:abrir-buscador";

/** Abre el buscador desde cualquier pantalla (lo escucha el armazón). */
export function abrirBuscador() {
  window.dispatchEvent(new Event(EVENTO_ABRIR_BUSCADOR));
}

export function useAlPedirBuscador(abrir: () => void) {
  const abrirRef = useRef(abrir);
  abrirRef.current = abrir;
  useEffect(() => {
    const alPedir = () => abrirRef.current();
    window.addEventListener(EVENTO_ABRIR_BUSCADOR, alPedir);
    return () => window.removeEventListener(EVENTO_ABRIR_BUSCADOR, alPedir);
  }, []);
}

/** La lupa redonda de las cabeceras de Inicio, Agenda y Llamadas. */
export function BotonDeBuscar() {
  return (
    <button type="button" onClick={abrirBuscador} aria-label="Buscar" className={CLASES_BOTON_REDONDO}>
      <Search className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );
}

/**
 * El buscador del escritorio (⌘K) en el móvil: una hoja alta con el campo
 * arriba y los resultados en filas de un toque. Mismas opciones: pantallas,
 * citas, conversaciones, preguntar al gestor y copiar el número.
 */
export function BuscadorMovil({
  abierto,
  onCerrar,
  timeZone,
  avisar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  timeZone: string;
  avisar: (mensaje: string, tipo?: "success" | "error") => void;
}) {
  const [texto, setTexto] = useState("");
  const campoRef = useRef<HTMLInputElement>(null);
  const { opciones, consulta, buscando, sinResultados, error } = useOpcionesDelBuscador({
    abierto,
    texto,
    timeZone,
    onCerrar,
    avisar,
    conAtajos: false,
  });

  useEffect(() => {
    if (!abierto) return;
    setTexto("");
    // La hoja pone el foco en su «Cerrar» al abrirse; el campo lo toma justo
    // después para que se pueda escribir sin tocar nada más.
    const temporizador = window.setTimeout(() => campoRef.current?.focus(), 60);
    return () => window.clearTimeout(temporizador);
  }, [abierto]);

  return (
    <HojaInferior abierta={abierto} onCerrar={onCerrar} titulo="Buscar" etiquetaCerrar="Cerrar el buscador" alta>
      <div className="shrink-0 px-4 pb-2">
        <label className="relative flex items-center">
          <span className="sr-only">Buscar citas, llamadas o pantallas</span>
          {buscando ? (
            <LoaderCircle className="pointer-events-none absolute left-3.5 h-[18px] w-[18px] animate-spin text-morado" aria-hidden="true" />
          ) : (
            <Search className="pointer-events-none absolute left-3.5 h-[18px] w-[18px] text-apagado" aria-hidden="true" />
          )}
          <input
            ref={campoRef}
            type="search"
            enterKeyHint="search"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === "Enter" && opciones[0]) {
                evento.preventDefault();
                opciones[0].ejecutar();
              }
            }}
            placeholder="Nombre, teléfono, servicio…"
            className="field h-12 w-full pl-11 text-base"
          />
        </label>
      </div>
      <CuerpoDeHoja className="pb-6">
        <ul aria-label="Resultados">
          {opciones.map((opcion, indice) => {
            const Icono = opcion.icono;
            const primeraDelGrupo = indice === 0 || opciones[indice - 1].grupo !== opcion.grupo;
            return (
              <li key={opcion.clave}>
                {primeraDelGrupo ? (
                  <p className="pb-1 pt-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted" aria-hidden="true">
                    {opcion.grupo}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={opcion.ejecutar}
                  className="flex min-h-14 w-full items-center gap-3 border-b border-linea-suave py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-morado"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lavado text-morado" aria-hidden="true">
                    <Icono className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-tinta">{opcion.titulo}</span>
                    {opcion.detalle ? <span className="block truncate text-[13px] text-muted">{opcion.detalle}</span> : null}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-tenue" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
        {sinResultados ? <p className="pt-4 text-sm text-muted">No hay citas ni llamadas con «{consulta}».</p> : null}
        {error ? (
          <p className="pt-4 text-sm text-error" role="alert">
            No se ha podido buscar ahora mismo. Inténtalo de nuevo.
          </p>
        ) : null}
      </CuerpoDeHoja>
    </HojaInferior>
  );
}
