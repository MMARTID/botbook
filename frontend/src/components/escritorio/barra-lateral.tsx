"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity, ChevronsLeft, ChevronsRight, Clock3, Loader2, LogOut, Search } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { useBusiness } from "@/components/providers";
import { useMinutesWarning } from "@/hooks/use-aviso-de-minutos";
import { useEsMovil } from "@/hooks/use-es-movil";
import { clearAuthTokens } from "@/lib/billing-navigation";
import {
  ContenidoDelEstado,
  textoDelEstado,
  tonoDelEstado,
  useEstadoDelServicio,
} from "@/components/movil/estado-del-servicio";
import { TONOS } from "@/components/movil/piezas";
import { Dialogo } from "@/components/escritorio/dialogo";
import { CUENTA, OPERACION, RECEPCIONISTA, estaActivo, type Destino } from "@/components/escritorio/navegacion";
import { Tecla } from "@/components/escritorio/piezas";

/** Etiqueta que asoma a la derecha de un icono cuando la barra está plegada. */
function Bocadillo({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="presentation"
      className="pointer-events-none absolute left-full top-1/2 z-[60] ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#0a0a0a] px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}

function Enlace({
  destino,
  pathname,
  plegada,
  extra,
  punto = false,
}: {
  destino: Destino;
  pathname: string;
  plegada: boolean;
  /** La insignia de «por devolver» de Llamadas, la de Beta del Gestor. */
  extra?: React.ReactNode;
  /** Plegada, la insignia se queda en un punto ámbar sobre el icono. */
  punto?: boolean;
}) {
  const Icono = destino.icono;
  const activo = estaActivo(pathname, destino);
  return (
    <Link
      href={destino.href}
      aria-current={activo ? "page" : undefined}
      aria-label={plegada ? destino.etiqueta : undefined}
      className={`group relative flex min-h-10 items-center rounded-full border text-sm font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${
        plegada ? "mx-auto w-10 justify-center" : "gap-2.5 px-3"
      } ${
        activo
          ? "border-[#ddd6fe] bg-[#f3eeff] text-[#6d28d9]"
          : "border-transparent text-[#3f3f46] hover:bg-[#fafafa] hover:text-[#0a0a0a]"
      }`}
    >
      <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
      {plegada ? (
        <>
          <Bocadillo>{destino.etiqueta}</Bocadillo>
          {punto ? <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-[#9f7a15]" aria-hidden="true" /> : null}
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{destino.etiqueta}</span>
          {extra}
          {destino.tecla && !extra ? (
            <span className="hidden gap-0.5 opacity-0 transition-opacity group-hover:flex group-hover:opacity-100" aria-hidden="true">
              <Tecla>G</Tecla>
              <Tecla>{destino.tecla}</Tecla>
            </span>
          ) : null}
        </>
      )}
    </Link>
  );
}

function Grupo({ titulo, plegada, children }: { titulo: string; plegada: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      {plegada ? (
        <div className="mx-auto my-2 h-px w-6 bg-[#e5e5e5]" aria-hidden="true" />
      ) : (
        <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{titulo}</p>
      )}
      {children}
    </div>
  );
}

/**
 * Barra lateral del escritorio (wireframe 1a): se pliega a una franja de
 * iconos de 64 px con el botón de arriba, y sola en las pantallas de trabajo
 * (Agenda, Llamadas, Gestor), que necesitan el ancho. Arriba, siempre a la
 * vista, el estado del servicio y el buscador.
 */
export function BarraLateral({
  pathname,
  plegada,
  onAlternar,
  onBuscar,
  porDevolver,
}: {
  pathname: string;
  plegada: boolean;
  onAlternar: () => void;
  onBuscar: () => void;
  porDevolver: number;
}) {
  const { business } = useBusiness();
  const esMovil = useEsMovil();
  // La barra se pinta desde el servidor (oculta en móvil con CSS); sus
  // consultas, en cambio, solo cuando de verdad es escritorio.
  const estado = useEstadoDelServicio(esMovil === false ? business : undefined);
  const minutos = useMinutesWarning();
  const [estadoAbierto, setEstadoAbierto] = useState(false);
  const tono = TONOS[tonoDelEstado(estado)];
  const textoEstado = textoDelEstado(estado);
  const hayProblemaDePago =
    business?.callsSuspendedAt || business?.subscriptionStatus === "PAST_DUE" || business?.subscriptionStatus === "UNPAID";

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-[#e5e5e5] bg-white transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex ${
        plegada ? "w-16" : "w-60"
      }`}
    >
      <div className={`flex items-center pt-4 ${plegada ? "flex-col gap-2 px-2" : "gap-2.5 px-4"}`}>
        <Link
          href="/"
          aria-label="Ir al panel de Alhabla"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
        >
          <BrandMark className="h-9 w-9 shrink-0" />
          {plegada ? null : (
            <span className="min-w-0">
              <span className="block text-[15px] font-bold leading-5 text-[#0a0a0a]">Alhabla</span>
              <span className="block truncate text-[13px] leading-4 text-muted">{business?.name ?? "Mi negocio"}</span>
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={onAlternar}
          aria-label={plegada ? "Desplegar la barra lateral" : "Plegar la barra lateral"}
          aria-expanded={!plegada}
          className="group relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#71717a] transition hover:bg-[#f4f4f5] hover:text-[#0a0a0a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
        >
          {plegada ? <ChevronsRight className="h-4 w-4" aria-hidden="true" /> : <ChevronsLeft className="h-4 w-4" aria-hidden="true" />}
          {plegada ? <Bocadillo>Desplegar</Bocadillo> : null}
        </button>
      </div>

      <div className={`mt-3 space-y-2 ${plegada ? "px-2" : "px-3"}`}>
        <button
          type="button"
          onClick={() => setEstadoAbierto(true)}
          aria-label={`Estado del servicio: ${textoEstado}`}
          className={`group relative flex min-h-9 w-full items-center gap-2 rounded-full border text-[13px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${
            plegada ? "mx-auto h-9 w-9 justify-center" : "px-3"
          } ${tono.fondo} ${tono.texto} ${tono.borde}`}
        >
          {estado.cargando ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <span className={`h-2 w-2 shrink-0 rounded-full ${tono.punto}`} aria-hidden="true" />
          )}
          {plegada ? <Bocadillo>{textoEstado}</Bocadillo> : <span className="truncate">{textoEstado}</span>}
        </button>
        <button
          type="button"
          onClick={onBuscar}
          aria-label="Buscar (⌘K)"
          className={`group relative flex min-h-9 w-full items-center gap-2 rounded-[10px] border border-[#e5e5e5] bg-[#fafafa] text-sm text-muted transition hover:border-[#d4d4d8] hover:text-[#0a0a0a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${
            plegada ? "mx-auto h-9 w-9 justify-center" : "px-3"
          }`}
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          {plegada ? (
            <Bocadillo>Buscar · ⌘K</Bocadillo>
          ) : (
            <>
              <span className="flex-1 text-left">Buscar</span>
              <Tecla>⌘K</Tecla>
            </>
          )}
        </button>
      </div>

      <nav
        aria-label="Navegación principal"
        // Plegada no lleva scroll: los bocadillos tienen que poder asomar por
        // la derecha, y una franja de iconos cabe siempre.
        className={`mt-2 flex-1 ${plegada ? "px-2" : "overflow-y-auto px-3"}`}
      >
        <Grupo titulo="Operación" plegada={plegada}>
          {OPERACION.map((destino) => (
            <Enlace
              key={destino.href}
              destino={destino}
              pathname={pathname}
              plegada={plegada}
              punto={destino.href === "/llamadas" && porDevolver > 0}
              extra={
                destino.href === "/llamadas" && porDevolver > 0 ? (
                  <span
                    className="rounded-full bg-[#fef8e7] px-2 text-xs font-bold tabular-nums text-[#806012] ring-1 ring-inset ring-[#f0dfa8]"
                    aria-label={`${porDevolver} por devolver`}
                  >
                    {porDevolver}
                  </span>
                ) : undefined
              }
            />
          ))}
        </Grupo>
        <Grupo titulo="Recepcionista" plegada={plegada}>
          {RECEPCIONISTA.map((destino) => (
            <Enlace
              key={destino.href}
              destino={destino}
              pathname={pathname}
              plegada={plegada}
              extra={destino.href === "/asistente" ? <span className="badge-soft px-2 py-0.5 text-[11px]">Beta</span> : undefined}
            />
          ))}
        </Grupo>
      </nav>

      <div className={`border-t border-[#e5e5e5] pb-3 ${plegada ? "px-2" : "px-3"}`}>
        {minutos ? (
          plegada ? (
            <Link
              href="/ajustes/facturacion"
              aria-label={minutos.exhausted ? "Minutos del plan agotados" : `Te queda un ${minutos.remainingPct}% de tus minutos`}
              className="group relative mx-auto mt-3 flex h-9 w-9 items-center justify-center rounded-full border border-[#f0dfa8] bg-[#fef8e7] text-[#806012] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
            >
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              <Bocadillo>{minutos.exhausted ? "Minutos agotados" : `Queda un ${minutos.remainingPct}%`}</Bocadillo>
            </Link>
          ) : (
            <Link
              href="/ajustes/facturacion"
              className="mt-3 block rounded-2xl border border-[#f0dfa8] bg-[#fef8e7] p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
            >
              <span className="flex items-center gap-2 text-xs font-bold text-[#806012]">
                <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                {minutos.exhausted ? "Minutos del plan agotados" : `Te queda un ${minutos.remainingPct}% de tus minutos`}
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[#f0dfa8]/60" aria-hidden="true">
                <span className="block h-full rounded-full bg-[#9f7a15]" style={{ width: `${100 - (minutos.remainingPct ?? 0)}%` }} />
              </span>
              <span className="mt-1.5 block text-xs leading-5 text-[#52525b]">
                {minutos.exhausted
                  ? `Se siguen atendiendo${minutos.extraPrice ? ` a ${minutos.extraPrice}` : " como minutos extra"}.`
                  : "Ver consumo y planes"}
              </span>
            </Link>
          )
        ) : null}
        {hayProblemaDePago ? (
          <Link
            href="/ajustes/facturacion"
            aria-label={plegada ? "Requiere atención: revisa tu facturación" : undefined}
            className={`group relative mt-3 flex items-center gap-2 rounded-2xl border border-[#f0dfa8] bg-[#fef8e7] text-xs font-bold text-[#806012] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${
              plegada ? "mx-auto h-9 w-9 justify-center rounded-full" : "p-3"
            }`}
          >
            <Activity className="h-4 w-4 shrink-0" aria-hidden="true" />
            {plegada ? <Bocadillo>Revisa tu facturación</Bocadillo> : "Requiere atención: revisa tu facturación"}
          </Link>
        ) : null}
        <Grupo titulo="Cuenta" plegada={plegada}>
          {CUENTA.map((destino) => (
            <Enlace key={destino.href} destino={destino} pathname={pathname} plegada={plegada} />
          ))}
          <button
            type="button"
            onClick={() => {
              clearAuthTokens();
              window.location.assign("/login");
            }}
            aria-label={plegada ? "Cerrar sesión" : undefined}
            className={`group relative flex min-h-10 items-center rounded-full text-sm font-semibold text-[#71717a] transition hover:bg-[#fafafa] hover:text-[#0a0a0a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${
              plegada ? "mx-auto w-10 justify-center" : "w-full gap-2.5 px-3"
            }`}
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            {plegada ? <Bocadillo>Cerrar sesión</Bocadillo> : "Cerrar sesión"}
          </button>
        </Grupo>
      </div>

      <Dialogo abierto={estadoAbierto} onCerrar={() => setEstadoAbierto(false)} titulo="Estado del servicio" ancho="lg">
        <ContenidoDelEstado
          estado={estado}
          timeZone={business?.timezone || "Europe/Madrid"}
          onCerrar={() => setEstadoAbierto(false)}
          enlacesDeEscritorio
        />
      </Dialogo>
    </aside>
  );
}
