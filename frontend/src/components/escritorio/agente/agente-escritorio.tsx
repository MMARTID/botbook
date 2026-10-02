"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { getBookingSettings } from "@/lib/api";
import {
  ajustePorSeccion,
  esAjusteDelAgente,
  getNextAgentSetupSection,
  type AjusteDelAgente,
} from "@/lib/agent-configuration";
import { getCalendarState } from "@/lib/calendar-state";
import type { Business } from "@/lib/types";
import { OPERATIONAL_TONE, useOperationalStatus } from "@/components/operational-status";
import { isBusinessSchedule } from "@/components/business-hours-editor";
import { ProveedorDeMarco, type MarcoDeAjuste } from "@/components/marco-de-ajuste";
import { Insignia } from "@/components/movil/piezas";
import { CalendarioMovil } from "@/components/movil/agente/calendario-movil";
import { CapacidadMovil } from "@/components/movil/agente/capacidad-movil";
import { ComportamientoMovil } from "@/components/movil/agente/comportamiento-movil";
import { HorarioMovil } from "@/components/movil/agente/horario-movil";
import { InformacionMovil } from "@/components/movil/agente/informacion-movil";
import { TiraDePagina } from "@/components/escritorio/piezas";
import { Dialogo } from "@/components/escritorio/dialogo";
import { ServiciosEscritorio } from "@/components/escritorio/agente/servicios-escritorio";
import { ProfesionalesEscritorio } from "@/components/escritorio/agente/profesionales-escritorio";

// Horario, capacidad, calendario, información y comportamiento son las mismas
// pantallas que en el móvil, dentro del marco de escritorio. Servicios y
// profesionales tienen la suya: aquí caben la tabla y la matriz de niveles.
const PANTALLAS: Record<AjusteDelAgente, (props: { business: Business }) => React.ReactNode> = {
  horario: HorarioMovil,
  capacidad: CapacidadMovil,
  servicios: ServiciosEscritorio,
  profesionales: ProfesionalesEscritorio,
  calendario: CalendarioMovil,
  informacion: InformacionMovil,
  comportamiento: ComportamientoMovil,
};

const TITULOS: Record<AjusteDelAgente, string> = {
  horario: "Horario",
  capacidad: "Capacidad",
  servicios: "Servicios",
  profesionales: "Profesionales",
  calendario: "Calendario",
  informacion: "Información",
  comportamiento: "Comportamiento",
};

const INDICE: Array<{ grupo: string; ajustes: AjusteDelAgente[] }> = [
  { grupo: "Disponibilidad", ajustes: ["horario", "capacidad"] },
  { grupo: "Catálogo y equipo", ajustes: ["servicios", "profesionales"] },
  { grupo: "Agenda y conocimiento", ajustes: ["calendario", "informacion"] },
  { grupo: "Cómo atiende", ajustes: ["comportamiento"] },
];

type EstadoDelAjuste = "listo" | "pendiente" | "vacio";

const PUNTO: Record<EstadoDelAjuste, { clase: string; texto: string }> = {
  listo: { clase: "bg-exito", texto: "configurado" },
  pendiente: { clase: "bg-aviso-icono", texto: "pendiente" },
  vacio: { clase: "bg-linea-fuerte", texto: "sin rellenar" },
};

/**
 * El Agente en escritorio (wireframe 1k, con la barra de guardar de 1l): el
 * índice de ajustes a la izquierda con lo que falta en ámbar, el ajuste
 * abierto en el centro y el estado de la recepción a la derecha. Sustituye a
 * la página larga de bloques plegables, donde abrir uno empujaba a los demás.
 */
export function AgenteEscritorio({ business }: { business: Business }) {
  const router = useRouter();
  const pathname = usePathname();
  const parametros = useSearchParams();
  const ajustes = useQuery({ queryKey: ["booking-settings"], queryFn: getBookingSettings });

  const [destino, setDestino] = useState<HTMLDivElement | null>(null);
  const [pendientes, setPendientes] = useState(false);
  const [irA, setIrA] = useState<AjusteDelAgente | null>(null);
  const marco = useMemo<MarcoDeAjuste>(
    () => ({ tipo: "escritorio", destinoDeLaBarra: destino, alCambiarPendientes: setPendientes }),
    [destino]
  );

  const servicios = ajustes.data?.services.length ?? 0;
  const profesionales = ajustes.data?.professionals.length ?? 0;
  const calendario = getCalendarState(business);
  const conHorario = isBusinessSchedule(business.schedule);

  const estados: Record<AjusteDelAgente, EstadoDelAjuste> = {
    horario: conHorario ? "listo" : "pendiente",
    capacidad: "listo",
    servicios: ajustes.isLoading ? "vacio" : servicios > 0 ? "listo" : "pendiente",
    profesionales: ajustes.isLoading ? "vacio" : profesionales > 0 ? "listo" : "pendiente",
    calendario: calendario.connected ? "listo" : "pendiente",
    informacion: business.businessDetails?.trim() ? "listo" : "vacio",
    comportamiento: "listo",
  };

  // El ajuste abierto vive en la URL. Los enlaces de siempre
  // (`?section=services`) siguen valiendo; sin ninguno, lo primero que falta.
  const pedido = parametros.get("ajuste");
  const porSeccion = ajustePorSeccion(parametros.get("section"));
  const primeroPendiente = ajustes.data
    ? ajustePorSeccion(
        getNextAgentSetupSection({
          hasSchedule: conHorario,
          serviceCount: servicios,
          professionalCount: profesionales,
          hasCalendar: calendario.connected,
        })
      )
    : null;
  const abierto: AjusteDelAgente = pedido && esAjusteDelAgente(pedido) ? pedido : (porSeccion ?? primeroPendiente ?? "horario");

  const ir = useCallback(
    (ajuste: AjusteDelAgente) => {
      setIrA(null);
      router.replace(`${pathname}?ajuste=${ajuste}`, { scroll: false });
    },
    [pathname, router]
  );
  const elegir = (ajuste: AjusteDelAgente) => {
    if (ajuste === abierto) return;
    if (pendientes) setIrA(ajuste);
    else ir(ajuste);
  };

  const Pantalla = PANTALLAS[abierto];

  return (
    <div className="flex h-screen flex-col">
      <TiraDePagina icono={Bot} titulo="Tu agente">
        <EstadoDelAgente business={business} />
      </TiraDePagina>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Ajustes del agente" className="w-56 shrink-0 overflow-y-auto border-r border-linea px-3 py-5">
          {INDICE.map(({ grupo, ajustes: delGrupo }, indice) => (
            <div key={grupo} className={indice > 0 ? "mt-5" : ""}>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{grupo}</p>
              <ul className="mt-1.5 space-y-0.5">
                {delGrupo.map((ajuste) => {
                  const elegido = ajuste === abierto;
                  const punto = PUNTO[estados[ajuste]];
                  const cuenta = ajuste === "servicios" ? servicios : ajuste === "profesionales" ? profesionales : null;
                  return (
                    <li key={ajuste}>
                      <button
                        type="button"
                        onClick={() => elegir(ajuste)}
                        aria-current={elegido ? "page" : undefined}
                        className={`flex min-h-10 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${
                          elegido ? "bg-lavado text-morado-tinta" : "text-tinta-2 hover:bg-relleno"
                        }`}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${punto.clase}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">
                          {TITULOS[ajuste]}
                          {cuenta ? <span className="font-medium text-muted"> · {cuenta}</span> : null}
                        </span>
                        <span className="sr-only">({punto.texto})</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
            <div className={`mx-auto w-full ${abierto === "servicios" ? "max-w-[1100px]" : "max-w-[760px]"}`}>
              <ProveedorDeMarco value={marco}>
                <Pantalla key={abierto} business={business} />
              </ProveedorDeMarco>
            </div>
          </div>
          {/* La barra de guardar de la pantalla abierta se monta aquí. */}
          <div ref={setDestino} />
        </div>

        {/* La tabla de servicios necesita el ancho: ahí el estado se queda en
            la insignia de la franja de título. */}
        {abierto === "servicios" ? null : (
          <aside aria-label="Estado de la recepción" className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-linea bg-relleno px-5 py-6 xl:block">
            <EstadoDeLaRecepcion business={business} />
          </aside>
        )}
      </div>

      <Dialogo
        abierto={irA !== null}
        onCerrar={() => setIrA(null)}
        titulo="Tienes cambios sin guardar"
        descripcion={`Si pasas a ${irA ? TITULOS[irA] : "otro ajuste"}, se pierden los cambios de ${TITULOS[abierto]}.`}
        pie={
          <>
            <button type="button" onClick={() => setIrA(null)} className="btn-secondary h-10 px-4">
              Seguir editando
            </button>
            <button type="button" onClick={() => irA && ir(irA)} className="btn-primary h-10 px-4">
              Descartar cambios
            </button>
          </>
        }
      />
    </div>
  );
}

function EstadoDelAgente({ business }: { business: Business }) {
  const { items, isLoading } = useOperationalStatus(business, business.agents?.[0]?.active !== false);
  if (isLoading) return null;
  const atencion = items.filter((item) => item.tone === "error" || item.tone === "warning").length;
  return atencion > 0 ? <Insignia tono="aviso">Requiere atención</Insignia> : <Insignia tono="exito">Atendiendo</Insignia>;
}

/** Las mismas señales que el Panel, en una columna. */
function EstadoDeLaRecepcion({ business }: { business: Business }) {
  const { items, isLoading } = useOperationalStatus(business, business.agents?.[0]?.active !== false);
  return (
    <section aria-labelledby="estado-de-la-recepcion">
      <h2 id="estado-de-la-recepcion" className="text-sm font-bold text-tinta">
        Estado de la recepción
      </h2>
      {isLoading ? (
        <div className="mt-3 h-40 rounded-2xl bg-relleno-fuerte motion-safe:animate-pulse" aria-hidden="true" />
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => {
            const tono = OPERATIONAL_TONE[item.tone];
            return (
              <li key={item.key} className="flex items-start gap-2.5 rounded-2xl border border-linea bg-superficie px-3 py-2.5">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tono.dot}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted">{item.label}</span>
                  <span className={`block text-sm font-semibold ${tono.text}`}>{item.value}</span>
                  {item.action && "href" in item.action ? (
                    <Link
                      href={item.action.href}
                      className="mt-0.5 inline-block rounded text-xs font-semibold text-morado-tinta underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
                    >
                      {item.action.label}
                    </Link>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
