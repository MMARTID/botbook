"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Lock, PhoneCall, Sparkles } from "lucide-react";
import { getCallAnalytics } from "@/lib/api";
import { getPlanLimitInfo } from "@/lib/plan-limit";
import { outcomeLabel, sentimentLabel } from "@/lib/format";
import {
  DIA_CORTO,
  DIA_LARGO,
  duracionMedia,
  lecturaRapida,
  nivelDeCelda,
  rejillaDeLlamadas,
  type Rejilla,
} from "@/lib/analitica";
import type { Business, BusinessSchedule, CallAnalytics, CallOutcome, CallSentiment } from "@/lib/types";
import { isBusinessSchedule } from "@/components/business-hours-editor";
import { SectionErrorState } from "@/components/section-card";
import { SelectorSegmentado, TiraDePagina } from "@/components/escritorio/piezas";
import { SeccionesDeLlamadas } from "@/components/escritorio/llamadas/secciones-de-llamadas";

const PERIODOS = [
  { valor: "7", texto: "7 días" },
  { valor: "30", texto: "30 días" },
  { valor: "90", texto: "90 días" },
] as const;
type Periodo = (typeof PERIODOS)[number]["valor"];

/** Del hueco sin llamadas a la hora con más: la escala del mapa de calor. */
const NIVELES = ["bg-relleno-fuerte", "bg-morado/15", "bg-morado/30", "bg-morado/50", "bg-morado/75", "bg-morado"];

/** Lo que se ve, difuminado, detrás de la invitación a Scale. No son datos de nadie. */
const MUESTRA: CallAnalytics = {
  days: 30,
  totals: { calls: 164, minutes: 412, averageDurationSecs: 151, bookings: 71, cancelledBookings: 6, waitlistLeads: 9 },
  outcomes: [
    { outcome: "RESOLVED", count: 98 },
    { outcome: "LEAD_CAPTURED", count: 26 },
    { outcome: "ESCALATED", count: 19 },
  ],
  sentiments: [
    { sentiment: "POSITIVE", count: 112 },
    { sentiment: "NEUTRAL", count: 43 },
    { sentiment: "NEGATIVE", count: 9 },
  ],
  byHour: [],
  byWeekday: [],
  byWeekdayHour: [1, 2, 3, 4, 5, 6].flatMap((weekday) =>
    [9, 10, 11, 12, 13, 16, 17, 18, 19].map((hour) => ({
      weekday,
      hour,
      count: ((weekday * 7 + hour * 3) % 6) + (hour >= 11 && hour <= 12 ? 4 : 0),
    }))
  ),
  topServices: [
    { service: "Corte", count: 58 },
    { service: "Color", count: 31 },
    { service: "Barba", count: 22 },
  ],
};

/**
 * Analítica avanzada de escritorio (wireframe 1i): cuatro cifras, el mapa de
 * calor de cuándo llaman, el resultado, los servicios, el sentimiento y una
 * lectura rápida en palabras. Sin el plan Scale se ve la misma pantalla
 * difuminada con la invitación encima (1j), no una página casi vacía.
 */
export function AnaliticaEscritorio({ business }: { business: Business }) {
  const router = useRouter();
  const pathname = usePathname();
  const parametros = useSearchParams();
  const pedido = parametros.get("dias");
  const periodo: Periodo = PERIODOS.some((opcion) => opcion.valor === pedido) ? (pedido as Periodo) : "30";
  const horario = isBusinessSchedule(business.schedule) ? business.schedule : null;

  const consulta = useQuery({
    queryKey: ["call-analytics", Number(periodo)],
    queryFn: () => getCallAnalytics(Number(periodo)),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const limiteDelPlan = consulta.error ? getPlanLimitInfo(consulta.error) : null;

  const cambiarPeriodo = (valor: Periodo) => {
    const siguientes = new URLSearchParams(parametros.toString());
    if (valor === "30") siguientes.delete("dias");
    else siguientes.set("dias", valor);
    const texto = siguientes.toString();
    router.replace(texto ? `${pathname}?${texto}` : pathname, { scroll: false });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <TiraDePagina icono={PhoneCall} titulo="Llamadas">
        <SeccionesDeLlamadas actual="analitica" />
        <span className="flex-1" />
        {limiteDelPlan ? null : (
          <SelectorSegmentado etiqueta="Periodo" opciones={PERIODOS} valor={periodo} onCambiar={cambiarPeriodo} />
        )}
      </TiraDePagina>
      <div className="flex-1 px-8 py-6">
        {limiteDelPlan ? (
          <AnaliticaBloqueada horario={horario} />
        ) : consulta.isError ? (
          <SectionErrorState
            message="No se pudo cargar la analítica. Inténtalo de nuevo en unos minutos."
            onRetry={() => void consulta.refetch()}
          />
        ) : consulta.data ? (
          <div className={consulta.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={consulta.isPlaceholderData}>
            <Cuadro datos={consulta.data} horario={horario} />
          </div>
        ) : (
          <Esqueleto />
        )}
      </div>
    </div>
  );
}

function Cuadro({ datos, horario }: { datos: CallAnalytics; horario: BusinessSchedule | null }) {
  const rejilla = rejillaDeLlamadas(datos, horario);
  const { totals } = datos;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-4 gap-4">
        <Cifra etiqueta="Llamadas atendidas" valor={String(totals.calls)} detalle={`${totals.minutes} ${totals.minutes === 1 ? "minuto" : "minutos"}`} />
        <Cifra etiqueta="Duración media" valor={duracionMedia(totals.averageDurationSecs)} />
        <Cifra
          etiqueta="Citas reservadas"
          valor={String(totals.bookings)}
          detalle={
            totals.cancelledBookings > 0
              ? `${totals.cancelledBookings} ${totals.cancelledBookings === 1 ? "cancelada" : "canceladas"}`
              : undefined
          }
        />
        <Cifra etiqueta="Demanda en espera" valor={String(totals.waitlistLeads)} detalle="Apuntados a avisos de hueco" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <section className="panel p-5 xl:col-span-2" aria-labelledby="cuando-llaman">
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <h2 id="cuando-llaman" className="text-base font-bold text-tinta">
              Cuándo llaman
            </h2>
            <span className="text-sm text-muted">hora local del negocio</span>
            <Leyenda />
          </div>
          <MapaDeCalor rejilla={rejilla} />
          {rejilla.fuera > 0 ? (
            <p className="mt-2 text-xs text-muted">
              {rejilla.fuera === 1
                ? "Además, 1 entró de madrugada, a una hora que el mapa no enseña."
                : `Además, ${rejilla.fuera} entraron de madrugada, a horas que el mapa no enseña.`}
            </p>
          ) : null}
        </section>
        <Barras
          titulo="Resultado de las llamadas"
          filas={datos.outcomes.map((fila) => ({
            // Mismas etiquetas que el historial: una llamada no puede ser
            // «Escalada» aquí y «Derivada al negocio» allí.
            etiqueta: outcomeLabel(fila.outcome as CallOutcome) ?? fila.outcome,
            cuenta: fila.count,
          }))}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Barras titulo="Servicios más pedidos" filas={datos.topServices.map((fila) => ({ etiqueta: fila.service, cuenta: fila.count }))} />
        <Barras
          titulo="Sentimiento del cliente"
          filas={datos.sentiments.map((fila) => ({
            etiqueta: sentimentLabel(fila.sentiment as CallSentiment) ?? fila.sentiment,
            cuenta: fila.count,
          }))}
        />
        <section className="rounded-3xl border border-lavado-borde bg-lavado p-5" aria-labelledby="lectura-rapida">
          <h2 id="lectura-rapida" className="flex items-center gap-2 text-base font-bold text-tinta">
            <Sparkles className="h-4 w-4 text-morado" aria-hidden="true" />
            Lectura rápida
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-tinta-2">
            {lecturaRapida(datos, rejilla, horario).map((frase) => (
              <li key={frase}>{frase}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Cifra({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <article className="panel min-w-0 p-5">
      <p className="truncate text-sm font-semibold text-apagado">{etiqueta}</p>
      <p className="mt-1.5 text-[32px] font-extrabold leading-none tracking-[-0.03em] tabular-nums text-tinta">{valor}</p>
      {detalle ? <p className="mt-2 truncate text-sm text-muted">{detalle}</p> : null}
    </article>
  );
}

function Leyenda() {
  return (
    <span className="ml-auto flex items-center gap-1.5 text-xs text-muted" aria-hidden="true">
      Menos
      {NIVELES.map((clase) => (
        <span key={clase} className={`h-3 w-3 rounded-[3px] ${clase}`} />
      ))}
      Más
    </span>
  );
}

function MapaDeCalor({ rejilla }: { rejilla: Rejilla }) {
  return (
    <table className="mt-4 w-full table-fixed border-separate border-spacing-1">
      <caption className="sr-only">Llamadas por día de la semana y hora, en la hora local del negocio</caption>
      <thead>
        <tr>
          <th className="w-11" aria-hidden="true" />
          {rejilla.horas.map((hora) => (
            <th key={hora} scope="col" className="text-[11px] font-semibold tabular-nums text-muted">
              {String(hora).padStart(2, "0")}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rejilla.dias.map((dia) => (
          <tr key={dia}>
            <th scope="row" className="text-left text-xs font-semibold text-apagado">
              <abbr title={DIA_LARGO[dia]} className="no-underline">
                {DIA_CORTO[dia]}
              </abbr>
            </th>
            {rejilla.horas.map((hora) => {
              const llamadas = rejilla.llamadas(dia, hora);
              const texto = `${DIA_LARGO[dia]} de ${hora} a ${hora + 1} h: ${llamadas === 1 ? "1 llamada" : `${llamadas} llamadas`}`;
              return (
                <td key={hora} title={texto} className="p-0">
                  <span className={`block h-7 rounded-md ${NIVELES[nivelDeCelda(llamadas, rejilla.maximo)]}`} aria-hidden="true" />
                  <span className="sr-only">{texto}</span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Barras({ titulo, filas }: { titulo: string; filas: Array<{ etiqueta: string; cuenta: number }> }) {
  const maximo = Math.max(1, ...filas.map((fila) => fila.cuenta));
  return (
    <section className="panel min-w-0 p-5">
      <h2 className="text-base font-bold text-tinta">{titulo}</h2>
      {filas.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Sin datos en este periodo.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {filas.map((fila) => (
            <li key={fila.etiqueta}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-semibold text-tinta-2">{fila.etiqueta}</span>
                <span className="tabular-nums text-muted">{fila.cuenta}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-relleno-fuerte">
                <div className="h-full rounded-full bg-morado" style={{ width: `${Math.max(4, Math.round((fila.cuenta / maximo) * 100))}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Esqueleto() {
  return (
    <div role="status" className="grid gap-4">
      <span className="sr-only">Cargando la analítica…</span>
      <div className="grid grid-cols-4 gap-4" aria-hidden="true">
        {[0, 1, 2, 3].map((indice) => (
          <div key={indice} className="h-[118px] rounded-3xl bg-relleno-fuerte motion-safe:animate-pulse" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3" aria-hidden="true">
        <div className="h-72 rounded-3xl bg-relleno-fuerte motion-safe:animate-pulse xl:col-span-2" />
        <div className="h-72 rounded-3xl bg-relleno-fuerte motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

function AnaliticaBloqueada({ horario }: { horario: BusinessSchedule | null }) {
  return (
    <div className="relative">
      {/* Sin nada que enfocar dentro: aria-hidden basta para que el lector de
          pantalla salte la vista previa y lea solo la invitación. */}
      <div aria-hidden="true" className="pointer-events-none select-none blur-[6px]">
        <Cuadro datos={MUESTRA} horario={horario} />
      </div>
      <div className="absolute inset-0 flex items-start justify-center px-4 pt-24">
        <section className="w-full max-w-lg rounded-3xl border border-lavado-borde bg-elevada p-8 text-center shadow-[0_24px_60px_rgba(0,0,0,0.14)]">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-lavado text-morado" aria-hidden="true">
            <Lock className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-xl font-bold tracking-[-0.02em] text-tinta">Analítica avanzada, con el plan Scale</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            Horas punta, resultado y sentimiento de cada conversación, servicios más pedidos y demanda que no pudiste
            atender: los datos para decidir horarios, personal y servicios.
          </p>
          <Link href="/ajustes/facturacion" className="btn-primary mt-6 inline-flex px-6">
            Ampliar a Scale
          </Link>
        </section>
      </div>
    </div>
  );
}
