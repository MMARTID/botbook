"use client";

import { formatPrice } from "@/lib/format";
import { horaDelNegocio, minutosDelDia } from "@/lib/fechas-negocio";
import { colocarEnCarriles, horaDeMinutos, tramosCerrados } from "@/lib/agenda-escritorio";
import type { AgendaBooking, ScheduleInterval } from "@/lib/types";
import { finDeCita, importeDeCita, nombreDeCita } from "@/components/movil/hoja-cita";

export const ALTO_DE_HORA = 56;

/** Las horas del rango a la izquierda de la cuadrícula. */
export function RegletaDeHoras({ rango, alto = ALTO_DE_HORA }: { rango: { desde: number; hasta: number }; alto?: number }) {
  const horas = [];
  for (let minuto = rango.desde; minuto < rango.hasta; minuto += 60) horas.push(minuto);
  return (
    <div className="relative w-14 shrink-0" style={{ height: ((rango.hasta - rango.desde) / 60) * alto }} aria-hidden="true">
      {horas.map((minuto, indice) => (
        <span
          key={minuto}
          className="absolute right-2.5 text-xs font-medium tabular-nums text-muted"
          style={{ top: indice * alto - (indice === 0 ? 0 : 7) }}
        >
          {horaDeMinutos(minuto)}
        </span>
      ))}
    </div>
  );
}

/**
 * Un día en vertical: líneas de hora, lo cerrado sombreado, la línea de
 * «ahora» y cada cita como un bloque del alto de su duración. Las que se
 * solapan se reparten el ancho. La usan el día del Panel y la semana de la
 * Agenda (una columna por día).
 */
export function ColumnaDelDia({
  citas,
  rango,
  tramos,
  timeZone,
  ahora,
  esHoy,
  seleccionada,
  onAbrir,
  alto = ALTO_DE_HORA,
  compacta = false,
  cerradoTodoElDia = false,
  arrastrable,
}: {
  citas: AgendaBooking[];
  rango: { desde: number; hasta: number };
  /** null = sin horario conocido: no se sombrea nada. */
  tramos: ScheduleInterval[] | null;
  timeZone: string;
  ahora: Date;
  esHoy: boolean;
  seleccionada?: string | null;
  onAbrir: (cita: AgendaBooking) => void;
  alto?: number;
  /** En la semana: una línea por bloque, sin precio. */
  compacta?: boolean;
  cerradoTodoElDia?: boolean;
  /** Arrastrar una cita para moverla (solo la semana de la Agenda). */
  arrastrable?: {
    onEmpezar: (cita: AgendaBooking, evento: React.PointerEvent<HTMLButtonElement>) => void;
    arrastrando: string | null;
  };
}) {
  const altoTotal = ((rango.hasta - rango.desde) / 60) * alto;
  const aPx = (minutos: number) => ((minutos - rango.desde) / 60) * alto;
  const colocadas = colocarEnCarriles(
    citas,
    (cita) => minutosDelDia(cita.programedAt, timeZone),
    (cita) => minutosDelDia(cita.programedAt, timeZone) + cita.durationMinutes
  );
  const minutoAhora = minutosDelDia(ahora, timeZone);
  const lineas = [];
  for (let minuto = rango.desde + 60; minuto < rango.hasta; minuto += 60) lineas.push(minuto);

  return (
    <div className="relative min-w-0 flex-1" style={{ height: altoTotal }}>
      {lineas.map((minuto) => (
        <div key={minuto} className="absolute inset-x-0 border-t border-linea-suave" style={{ top: aPx(minuto) }} aria-hidden="true" />
      ))}
      {cerradoTodoElDia ? (
        <div
          className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgb(var(--relleno))_0,rgb(var(--relleno))_7px,rgb(var(--relleno-fuerte))_7px,rgb(var(--relleno-fuerte))_14px)]"
          aria-hidden="true"
        >
          <span className="absolute left-2 top-2 text-xs font-semibold text-muted">Cerrado</span>
        </div>
      ) : (
        tramosCerrados(tramos, rango).map((tramo) => (
          <div
            key={tramo.desde}
            className="absolute inset-x-0 bg-[repeating-linear-gradient(135deg,rgb(var(--superficie))_0,rgb(var(--superficie))_7px,rgb(var(--relleno-fuerte))_7px,rgb(var(--relleno-fuerte))_14px)]"
            style={{ top: aPx(tramo.desde), height: aPx(tramo.hasta) - aPx(tramo.desde) }}
            aria-hidden="true"
          />
        ))
      )}
      {colocadas.map(({ item: cita, inicio, fin, carril, carriles }) => {
        const pasada = finDeCita(cita) <= ahora;
        const elegida = seleccionada === cita.id;
        const importe = importeDeCita(cita);
        const altoBloque = Math.max(22, aPx(fin) - aPx(inicio) - 2);
        const corto = altoBloque < 44;
        const detalle = [cita.professional?.name, cita.clientName].filter(Boolean).join(" · ");
        return (
          <button
            key={cita.id}
            type="button"
            onClick={() => onAbrir(cita)}
            onPointerDown={arrastrable && !pasada ? (evento) => arrastrable.onEmpezar(cita, evento) : undefined}
            aria-pressed={elegida}
            aria-label={`${horaDelNegocio(cita.programedAt, timeZone)}, ${nombreDeCita(cita)}${detalle ? `, ${detalle}` : ""}`}
            className={`absolute overflow-hidden rounded-lg border text-left transition-shadow focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado focus-visible:ring-offset-1 ${
              elegida
                ? "z-10 border-morado-tinta bg-morado text-white shadow-[0_6px_16px_rgba(109,40,217,0.3)]"
                : pasada
                  ? "border-linea bg-relleno text-apagado-2"
                  : "border-lavado-borde bg-lavado text-tinta-2 hover:shadow-[0_4px_12px_rgba(109,40,217,0.15)]"
            } ${arrastrable?.arrastrando === cita.id ? "opacity-40" : ""} ${arrastrable && !pasada ? "cursor-grab active:cursor-grabbing" : ""}`}
            style={{
              top: aPx(inicio) + 1,
              height: altoBloque,
              left: `calc(${(carril / carriles) * 100}% + 3px)`,
              width: `calc(${100 / carriles}% - 6px)`,
            }}
          >
            <span className={`block px-2 ${corto ? "py-0.5" : "py-1.5"}`}>
              <span className={`flex items-baseline gap-1.5 text-xs leading-4 ${corto ? "truncate" : ""}`}>
                <span className={`shrink-0 font-bold tabular-nums ${elegida ? "text-white" : pasada ? "" : "text-morado-tinta"}`}>
                  {horaDelNegocio(cita.programedAt, timeZone)}
                </span>
                <span className="truncate font-bold">{nombreDeCita(cita)}</span>
                {!compacta && importe != null && !corto ? (
                  <span className="ml-auto shrink-0 font-semibold tabular-nums">{formatPrice(importe)}</span>
                ) : null}
              </span>
              {!corto && detalle ? (
                <span className={`mt-0.5 block truncate text-xs leading-4 ${elegida ? "text-white/85" : "text-muted"}`}>{detalle}</span>
              ) : null}
            </span>
          </button>
        );
      })}
      {esHoy && minutoAhora >= rango.desde && minutoAhora <= rango.hasta ? (
        <div className="pointer-events-none absolute inset-x-0 z-30" style={{ top: aPx(minutoAhora) }} aria-label={`Ahora, ${horaDeMinutos(minutoAhora)}`}>
          <span className="absolute -left-1 -top-[4.5px] h-[9px] w-[9px] rounded-full bg-morado" aria-hidden="true" />
          <span className="block h-0.5 bg-morado" aria-hidden="true" />
        </div>
      ) : null}
    </div>
  );
}
