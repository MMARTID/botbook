"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Clock3, HelpCircle, Loader2, RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";
import { getPendingBookings, provisionPhoneNumber } from "@/lib/api";
import { formatClock, formatDayLabel } from "@/lib/format";
import { enlaceTel } from "@/lib/llamadas";
import type { Business, PendingBooking } from "@/lib/types";
import { useMinutesWarning } from "@/hooks/use-aviso-de-minutos";
import { useOperationalStatus, type OperationalStatusItem, type OperationalTone } from "@/components/operational-status";
import { CuerpoDeHoja, HojaInferior } from "@/components/movil/hoja-inferior";
import { AzulejoIcono, TONOS, type Tono } from "@/components/movil/piezas";

/** «Jueves, 1 de octubre» es un título; a mitad de frase va «el jueves, 1
 * de octubre» (y «hoy», «mañana» sin artículo). */
export function diaEnFrase(dia: string) {
  if (dia === "Hoy" || dia === "Mañana") return dia.toLowerCase();
  return `el ${dia.charAt(0).toLowerCase()}${dia.slice(1)}`;
}

export function cuandoPedia(cita: PendingBooking, timeZone: string) {
  if (!cita.requestedAt) return null;
  return `${diaEnFrase(formatDayLabel(cita.requestedAt, timeZone))} a las ${formatClock(cita.requestedAt, timeZone)}`;
}

/**
 * Lo que el negocio tiene que saber del servicio, resumido para el chip de
 * Inicio: las cuatro señales de siempre (operational-status.tsx, la fuente
 * única), más las citas que se quedaron sin reservar y los minutos del plan.
 */
export function useEstadoDelServicio(business: Business | undefined) {
  const operativo = useOperationalStatus(business, business?.agents?.[0]?.active !== false);
  const pendientesQuery = useQuery({
    queryKey: ["pending-bookings"],
    queryFn: getPendingBookings,
    enabled: Boolean(business),
    refetchInterval: 5 * 60_000,
  });
  const minutos = useMinutesWarning();

  const problemas = operativo.items.filter((item) => item.tone === "error" || item.tone === "warning");
  const pendientes = pendientesQuery.data ?? [];
  const avisos = problemas.length + (pendientes.length > 0 ? 1 : 0) + (minutos ? 1 : 0);
  const rojo = problemas.some((item) => item.tone === "error") || pendientes.length > 0 || Boolean(minutos?.exhausted);
  const sinComprobar = operativo.items.some((item) => item.tone === "unknown") || pendientesQuery.isError;

  return {
    ...operativo,
    pendientesQuery,
    pendientes,
    minutos,
    avisos,
    rojo,
    sinComprobar,
    cargando: operativo.isLoading || pendientesQuery.isLoading,
  };
}

export type EstadoDelServicio = ReturnType<typeof useEstadoDelServicio>;
type Estado = EstadoDelServicio;

export function tonoDelEstado(estado: Estado): Tono {
  if (estado.cargando) return "neutro";
  if (estado.avisos > 0) return estado.rojo ? "error" : "aviso";
  return estado.sinComprobar ? "neutro" : "exito";
}

/** «Todo en marcha», «2 avisos»…: el texto del chip, en móvil y escritorio. */
export function textoDelEstado(estado: Estado) {
  return estado.cargando
    ? "Comprobando…"
    : estado.avisos > 0
      ? estado.avisos === 1
        ? "1 aviso"
        : `${estado.avisos} avisos`
      : estado.sinComprobar
        ? "Sin comprobar"
        : "Todo en marcha";
}

/** Chip de 44 px de la cabecera de Inicio; abre la hoja del estado. */
export function ChipDeEstado({ estado, onAbrir }: { estado: Estado; onAbrir: () => void }) {
  const tono = TONOS[tonoDelEstado(estado)];
  const texto = textoDelEstado(estado);

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`Estado del servicio: ${texto}`}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${tono.fondo} ${tono.texto} ${tono.borde}`}
    >
      {estado.cargando ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <span className={`h-2 w-2 rounded-full ${tono.punto}`} aria-hidden="true" />
      )}
      {texto}
    </button>
  );
}

const TONO_DE_SEÑAL: Record<OperationalTone, { texto: string; punto: string }> = {
  ok: { texto: "text-exito", punto: "bg-exito" },
  warning: { texto: "text-aviso", punto: "bg-aviso-icono" },
  error: { texto: "text-error", punto: "bg-error" },
  waiting: { texto: "text-apagado", punto: "bg-tenue" },
  unknown: { texto: "text-apagado", punto: "bg-tenue" },
};

// Los problemas primero: el negocio necesita ver lo que falla antes que lo
// que ya funciona solo (el mismo orden que la franja de escritorio).
const GRAVEDAD: Record<OperationalTone, number> = { error: 0, warning: 1, unknown: 2, waiting: 3, ok: 4 };

/**
 * Hoja «Estado del servicio»: el titular y cada señal con su acción. Lo que
 * en escritorio es una franja de cuatro tarjetas, aquí solo ocupa sitio
 * cuando el dueño lo pide.
 */
export function HojaEstado({
  abierta,
  onCerrar,
  estado,
  timeZone,
}: {
  abierta: boolean;
  onCerrar: () => void;
  estado: Estado;
  timeZone: string;
}) {
  return (
    <HojaInferior abierta={abierta} onCerrar={onCerrar} titulo="Estado del servicio">
      <CuerpoDeHoja>
        <ContenidoDelEstado estado={estado} timeZone={timeZone} onCerrar={onCerrar} />
      </CuerpoDeHoja>
    </HojaInferior>
  );
}

/** El titular y las señales con su acción: lo mismo en la hoja del móvil y
 * en el diálogo del escritorio. */
export function ContenidoDelEstado({
  estado,
  timeZone,
  onCerrar,
  enlacesDeEscritorio = false,
}: {
  estado: Estado;
  timeZone: string;
  onCerrar: () => void;
  /** En escritorio los ajustes del agente son secciones de /agente, no
   * pantallas propias: los enlaces se quedan como vienen. */
  enlacesDeEscritorio?: boolean;
}) {
  const queryClient = useQueryClient();
  const reintento = useMutation({
    mutationFn: async () => {
      const resultado = await provisionPhoneNumber();
      if (!resultado.success) throw new Error(resultado.error ?? "La compra del número no se completó.");
      return resultado;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["phone-number"] }),
  });

  const tono = tonoDelEstado(estado);
  const titular = estado.cargando
    ? "Comprobando el estado del servicio…"
    : estado.avisos === 0
      ? estado.sinComprobar
        ? "No hemos podido comprobarlo todo. Vuelve a abrir esto en un momento."
        : "Todo funcionando correctamente"
      : estado.rojo
        ? estado.avisos === 1
          ? "Un asunto requiere tu atención"
          : `${estado.avisos} asuntos requieren tu atención`
        : estado.avisos === 1
          ? "Un asunto conviene revisarlo"
          : `${estado.avisos} asuntos conviene revisarlos`;
  const IconoTitular: LucideIcon = estado.cargando ? Loader2 : estado.avisos > 0 ? AlertTriangle : estado.sinComprobar ? HelpCircle : Check;
  const señales = [...estado.items].sort((a, b) => GRAVEDAD[a.tone] - GRAVEDAD[b.tone]);
  const primeraPendiente = estado.pendientes[0];

  return (
    <>
      <p
        className={`flex items-center gap-2 rounded-[14px] px-3.5 py-3 text-sm font-bold ring-1 ring-inset ${TONOS[tono].fondo} ${TONOS[tono].texto} ${TONOS[tono].anillo}`}
        role="status"
      >
        <IconoTitular className={`h-[18px] w-[18px] shrink-0 ${estado.cargando ? "animate-spin" : ""}`} aria-hidden="true" />
        {titular}
      </p>
      <ul className="mt-3 overflow-hidden rounded-[20px] border border-linea">
        {primeraPendiente ? (
          <FilaDeSeñal
            icono={TriangleAlert}
            etiqueta={estado.pendientes.length === 1 ? "Cita sin reservar" : `${estado.pendientes.length} citas sin reservar`}
            valor={`${primeraPendiente.clientName ?? "Un cliente"} pedía ${cuandoPedia(primeraPendiente, timeZone) ?? "una cita"}`}
            tono="error"
            accion={
              primeraPendiente.clientPhone ? (
                <a href={enlaceTel(primeraPendiente.clientPhone)} className={CLASES_ACCION}>
                  Llamar
                </a>
              ) : null
            }
          />
        ) : null}
        {estado.minutos ? (
          <FilaDeSeñal
            icono={Clock3}
            etiqueta="Minutos del plan"
            valor={estado.minutos.exhausted ? "Agotados" : `Te queda un ${estado.minutos.remainingPct} %`}
            tono={estado.minutos.exhausted ? "error" : "warning"}
            accion={
              <Link href="/ajustes/facturacion" onClick={onCerrar} className={CLASES_ACCION}>
                Ver consumo
              </Link>
            }
          />
        ) : null}
        {señales.map((señal) => (
          <FilaDeSeñal
            key={señal.key}
            icono={señal.icon}
            etiqueta={señal.label}
            valor={señal.value}
            tono={señal.tone}
            accion={<AccionDeSeñal señal={señal} onCerrar={onCerrar} reintento={reintento} enlacesDeEscritorio={enlacesDeEscritorio} />}
          />
        ))}
      </ul>
      {reintento.isError ? (
        <p className="mt-3 text-sm leading-6 text-error" role="alert">
          {(reintento.error as { response?: { status?: number } })?.response?.status === 402
            ? "Tu plan todavía no está activo y sin él no podemos asignarte un número."
            : "No hemos podido asignarte el número. Inténtalo otra vez en unos minutos; si sigue fallando, escríbenos a hola@alhabla.ai."}
        </p>
      ) : null}
    </>
  );
}

const CLASES_ACCION =
  "inline-flex min-h-11 shrink-0 items-center px-1 text-sm font-bold text-morado-tinta underline underline-offset-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado disabled:opacity-60";

/** Los enlaces de las señales apuntan a la versión de escritorio; en el
 * móvil cada ajuste del agente tiene su pantalla. */
function hrefMovil(href: string) {
  const seccion = new URLSearchParams(href.split("?")[1] ?? "").get("section");
  if (href.startsWith("/agente") && seccion === "calendar-section") return "/agente/calendario";
  if (href.startsWith("/agente") && seccion === "agent-settings") return "/agente/comportamiento";
  return href;
}

function AccionDeSeñal({
  señal,
  onCerrar,
  reintento,
  enlacesDeEscritorio,
}: {
  señal: OperationalStatusItem;
  onCerrar: () => void;
  reintento: { mutate: () => void; isPending: boolean };
  enlacesDeEscritorio: boolean;
}) {
  if (!señal.action) return null;
  if ("href" in señal.action) {
    return (
      <Link href={enlacesDeEscritorio ? señal.action.href : hrefMovil(señal.action.href)} onClick={onCerrar} className={CLASES_ACCION}>
        {señal.action.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => reintento.mutate()} disabled={reintento.isPending} className={`${CLASES_ACCION} gap-1`}>
      {reintento.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
      {señal.action.label}
    </button>
  );
}

function FilaDeSeñal({
  icono,
  etiqueta,
  valor,
  tono,
  accion,
}: {
  icono: LucideIcon;
  etiqueta: string;
  valor: string;
  tono: OperationalTone;
  accion?: React.ReactNode;
}) {
  const t = TONO_DE_SEÑAL[tono];
  return (
    <li className="flex min-h-[68px] items-center gap-3 border-b border-linea-suave px-3.5 py-3 last:border-b-0">
      <AzulejoIcono icono={icono} tamaño="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{etiqueta}</p>
        <p className={`mt-0.5 flex items-start gap-1.5 text-[15px] font-semibold leading-snug ${t.texto}`}>
          <span className={`mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full ${t.punto}`} aria-hidden="true" />
          <span className="min-w-0">{valor}</span>
        </p>
      </div>
      {accion}
    </li>
  );
}
