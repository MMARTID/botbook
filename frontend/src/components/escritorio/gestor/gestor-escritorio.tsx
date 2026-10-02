"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, MessageSquareText } from "lucide-react";
import { getAgenda, getCambiosDelGestor, getGestor } from "@/lib/api";
import { claveDeDia, horaDelNegocio, instanteAntesDelDia } from "@/lib/fechas-negocio";
import type { Business, CambioDelGestor } from "@/lib/types";
import { useAhora } from "@/hooks/use-es-movil";
import { GestorChat, IndicadorDeWhatsapp } from "@/components/gestor-chat";
import { Insignia, type Tono } from "@/components/movil/piezas";
import { SelectorSegmentado, TiraDePagina } from "@/components/escritorio/piezas";

const DURACION_DE_UNA_PROPUESTA_MS = 24 * 60 * 60 * 1000;

const ESTADOS: Record<CambioDelGestor["estado"], { texto: string; tono: Tono }> = {
  pendiente: { texto: "Pendiente", tono: "morado" },
  en_curso: { texto: "En curso", tono: "morado" },
  hecho: { texto: "Hecho", tono: "exito" },
  fallido: { texto: "No se pudo hacer", tono: "error" },
  descartado: { texto: "Descartado", tono: "neutro" },
  sustituido: { texto: "Sustituido", tono: "neutro" },
  caducado: { texto: "Caducado", tono: "neutro" },
};

const FILTROS = [
  { valor: "todo", texto: "Todo" },
  { valor: "pendientes", texto: "Pendientes" },
  { valor: "hechos", texto: "Hechos" },
] as const;
type Filtro = (typeof FILTROS)[number]["valor"];

/**
 * El Gestor en escritorio (wireframe 1m, con el registro de 1n): la misma
 * conversación que en WhatsApp a la izquierda y, a la derecha, lo que da
 * contexto a lo que se le pide — la propuesta que espera respuesta, la
 * agenda de hoy y todo lo que el Gestor ha cambiado o propuesto.
 */
export function GestorEscritorio({ business, hasToken }: { business: Business; hasToken: boolean | null }) {
  // Misma clave que el chat: comparten la petición.
  const estado = useQuery({ queryKey: ["gestor"], queryFn: getGestor, enabled: hasToken === true });
  const activo = estado.data?.disponible && estado.data.activoEnNegocio;

  return (
    <div className="flex h-screen flex-col">
      <TiraDePagina icono={MessageSquareText} titulo="Tu gestor">
        <span className="badge-soft">Beta</span>
        <span className="flex-1" />
        {estado.data?.whatsapp ? <IndicadorDeWhatsapp whatsapp={estado.data.whatsapp} className="text-[13px]" /> : null}
      </TiraDePagina>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <GestorChat hasToken={hasToken} enEscritorio />
        </div>
        {activo ? (
          <aside
            aria-label="Contexto del gestor"
            className="hidden w-[340px] shrink-0 space-y-6 overflow-y-auto border-l border-linea bg-relleno px-5 py-6 lg:block"
          >
            <ContextoDelGestor business={business} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function ContextoDelGestor({ business }: { business: Business }) {
  const timeZone = business.timezone || "Europe/Madrid";
  const ahora = useAhora();
  const hoy = claveDeDia(ahora, timeZone);
  const [filtro, setFiltro] = useState<Filtro>("todo");

  const cambios = useQuery({ queryKey: ["gestor-cambios"], queryFn: getCambiosDelGestor, retry: false });
  // Misma clave y misma petición que el Panel: la caché sirve a los dos.
  const agenda = useQuery({
    queryKey: ["agenda-panel", hoy],
    queryFn: () => getAgenda(9, 200, 0, instanteAntesDelDia(hoy)),
  });

  const lista = cambios.data ?? [];
  const pendiente = lista.find((cambio) => cambio.estado === "pendiente" && cambio.caduca && new Date(cambio.caduca) > ahora);
  const visibles = lista.filter((cambio) =>
    filtro === "pendientes" ? cambio.estado === "pendiente" : filtro === "hechos" ? cambio.estado === "hecho" : true
  );
  const deHoy = (agenda.data?.bookings ?? [])
    .filter((cita) => claveDeDia(cita.programedAt, timeZone) === hoy)
    .sort((a, b) => a.programedAt.localeCompare(b.programedAt));

  return (
    <>
      {pendiente ? <PropuestaPendiente cambio={pendiente} ahora={ahora} timeZone={timeZone} /> : null}

      <section aria-labelledby="agenda-de-hoy">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="agenda-de-hoy" className="text-sm font-bold text-tinta">
            Agenda de hoy
          </h2>
          <Link
            href="/agenda"
            className="inline-flex items-center gap-1 rounded text-xs font-semibold text-morado-tinta hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
          >
            Ver la agenda
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        {agenda.isLoading ? (
          <div className="mt-3 h-20 rounded-2xl bg-relleno-fuerte motion-safe:animate-pulse" aria-hidden="true" />
        ) : agenda.isError ? (
          <p className="mt-2 text-sm text-muted">No se pudo cargar la agenda.</p>
        ) : deHoy.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No hay citas hoy.</p>
        ) : (
          <ul className="mt-2.5 space-y-1.5">
            {deHoy.map((cita) => (
              <li key={cita.id}>
                <Link
                  href={`/agenda?cita=${cita.id}`}
                  className="flex gap-3 rounded-[10px] px-1.5 py-1 text-sm hover:bg-relleno-fuerte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
                >
                  <span className="w-11 shrink-0 font-semibold tabular-nums text-tinta">{horaDelNegocio(cita.programedAt, timeZone)}</span>
                  <span className="min-w-0 truncate text-tinta-2">
                    {cita.services.map((servicio) => servicio.name).join(" + ") || "Cita"}
                    {cita.professional ? <span className="text-muted"> · {cita.professional.name}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="cambios-del-gestor">
        <h2 id="cambios-del-gestor" className="text-sm font-bold text-tinta">
          Cambios del gestor
        </h2>
        <div className="mt-2.5">
          <SelectorSegmentado etiqueta="Qué cambios ver" opciones={FILTROS} valor={filtro} onCambiar={setFiltro} />
        </div>
        {cambios.isLoading ? (
          <div className="mt-3 h-24 rounded-2xl bg-relleno-fuerte motion-safe:animate-pulse" aria-hidden="true" />
        ) : cambios.isError ? (
          <p className="mt-3 text-sm text-muted">No se pudo cargar el registro de cambios.</p>
        ) : visibles.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            {filtro === "todo" ? "Todavía no te ha propuesto ningún cambio." : filtro === "pendientes" ? "Nada pendiente." : "Nada hecho en los últimos 30 días."}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {visibles.map((cambio) => (
              <FilaDeCambio key={cambio.id} cambio={cambio} ahora={ahora} timeZone={timeZone} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="puede-hacer">
        <h2 id="puede-hacer" className="text-sm font-bold text-tinta">
          Puede hacer por ti
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted">
          Apuntar, mover o cancelar citas · ausencias y cierres · servicios, equipo y horario. Nada cambia hasta que
          pulses el botón de su propuesta.
        </p>
      </section>
    </>
  );
}

function PropuestaPendiente({ cambio, ahora, timeZone }: { cambio: CambioDelGestor; ahora: Date; timeZone: string }) {
  const caduca = new Date(cambio.caduca!);
  const queda = Math.max(0, Math.min(1, (caduca.getTime() - ahora.getTime()) / DURACION_DE_UNA_PROPUESTA_MS));
  return (
    <section aria-labelledby="propuesta-pendiente" className="rounded-2xl border border-lavado-borde bg-superficie p-4">
      <h2 id="propuesta-pendiente" className="text-sm font-bold text-tinta">
        1 propuesta pendiente
      </h2>
      <p className="mt-1 line-clamp-3 text-sm leading-6 text-tinta-2">{cambio.resumen}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-relleno-fuerte" aria-hidden="true">
        <div className="h-full rounded-full bg-morado" style={{ width: `${Math.round(queda * 100)}%` }} />
      </div>
      <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted">
        <Clock className="h-3 w-3" aria-hidden="true" />
        Caduca {fechaRelativa(caduca, ahora, timeZone)}. Confírmala o descártala en la conversación.
      </p>
    </section>
  );
}

function FilaDeCambio({ cambio, ahora, timeZone }: { cambio: CambioDelGestor; ahora: Date; timeZone: string }) {
  const estado = ESTADOS[cambio.estado];
  const apagado = cambio.estado === "descartado" || cambio.estado === "sustituido" || cambio.estado === "caducado";
  return (
    <li
      className={`rounded-2xl border bg-superficie p-3 ${cambio.estado === "pendiente" ? "border-lavado-borde" : "border-linea"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Insignia tono={estado.tono}>{estado.texto}</Insignia>
        <span className="text-xs tabular-nums text-muted">
          {cambio.estado === "pendiente" && cambio.caduca
            ? `caduca ${fechaRelativa(new Date(cambio.caduca), ahora, timeZone)}`
            : fechaRelativa(new Date(cambio.en), ahora, timeZone)}
        </span>
      </div>
      <p className={`mt-1.5 line-clamp-2 text-sm leading-5 ${apagado ? "text-muted" : "text-tinta"}`}>{cambio.resumen}</p>
    </li>
  );
}

/** «hoy 09:12», «ayer 18:40», «mañana 13:41» o «28 sept 11:05», en la hora del negocio. */
function fechaRelativa(fecha: Date, ahora: Date, timeZone: string) {
  const dia = claveDeDia(fecha, timeZone);
  const hoy = claveDeDia(ahora, timeZone);
  const hora = horaDelNegocio(fecha, timeZone);
  const diferencia = Math.round((Date.parse(`${dia}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000);
  if (diferencia === 0) return `hoy ${hora}`;
  if (diferencia === -1) return `ayer ${hora}`;
  if (diferencia === 1) return `mañana ${hora}`;
  const corta = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone }).format(fecha);
  return `${corta} ${hora}`;
}
