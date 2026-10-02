"use client";

import { useEffect, useRef, useState } from "react";
import { INICIALES_DE_DIA, diaLargo, minutosDelDia, numeroDelDia } from "@/lib/fechas-negocio";
import { horaDeMinutos, tramosDelDia } from "@/lib/agenda-escritorio";
import type { AgendaBooking, BusinessSchedule } from "@/lib/types";
import { nombreDeCita } from "@/components/movil/hoja-cita";
import { ALTO_DE_HORA, ColumnaDelDia, RegletaDeHoras } from "@/components/escritorio/columna-del-dia";

const NOMBRES_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const PASO_MINUTOS = 15;
const UMBRAL_DE_ARRASTRE_PX = 6;

type Arrastre = {
  cita: AgendaBooking;
  x: number;
  y: number;
  /** Minutos entre el borde de arriba del bloque y donde se agarró. */
  agarre: number;
  activo: boolean;
};

/**
 * La semana en cuadrícula (wireframe 1e): una columna por día, lo cerrado
 * sombreado, hoy resaltado. Una cita se abre con un clic y se mueve
 * arrastrándola a otro hueco; al soltarla se pide confirmación (el padre
 * comprueba antes el hueco real).
 */
export function SemanaEnCuadricula({
  dias,
  citasPorDia,
  rango,
  horario,
  timeZone,
  ahora,
  hoy,
  seleccionada,
  onAbrir,
  onElegirDia,
  onSoltar,
}: {
  dias: string[];
  citasPorDia: Map<string, AgendaBooking[]>;
  rango: { desde: number; hasta: number };
  horario: BusinessSchedule | null;
  timeZone: string;
  ahora: Date;
  hoy: string;
  seleccionada: string | null;
  onAbrir: (cita: AgendaBooking) => void;
  onElegirDia: (dia: string) => void;
  /** null si no se puede mover (sin calendario conectado). */
  onSoltar: ((cita: AgendaBooking, dia: string, minuto: number) => void) | null;
}) {
  const columnasRef = useRef<HTMLDivElement>(null);
  const arrastreRef = useRef<Arrastre | null>(null);
  const acabaDeArrastrar = useRef(false);
  const [fantasma, setFantasma] = useState<{ cita: AgendaBooking; columna: number; minuto: number } | null>(null);
  const fantasmaRef = useRef(fantasma);
  fantasmaRef.current = fantasma;
  const altoTotal = ((rango.hasta - rango.desde) / 60) * ALTO_DE_HORA;

  useEffect(() => {
    const destino = (x: number, y: number, arrastre: Arrastre) => {
      const caja = columnasRef.current?.getBoundingClientRect();
      if (!caja) return null;
      const columna = Math.min(dias.length - 1, Math.max(0, Math.floor(((x - caja.left) / caja.width) * dias.length)));
      const bruto = rango.desde + ((y - caja.top) / ALTO_DE_HORA) * 60 - arrastre.agarre;
      const ajustado = Math.round(bruto / PASO_MINUTOS) * PASO_MINUTOS;
      const minuto = Math.min(rango.hasta - arrastre.cita.durationMinutes, Math.max(rango.desde, ajustado));
      return { columna, minuto };
    };
    const mover = (evento: PointerEvent) => {
      const arrastre = arrastreRef.current;
      if (!arrastre) return;
      if (!arrastre.activo) {
        if (Math.hypot(evento.clientX - arrastre.x, evento.clientY - arrastre.y) < UMBRAL_DE_ARRASTRE_PX) return;
        arrastre.activo = true;
      }
      evento.preventDefault();
      const sitio = destino(evento.clientX, evento.clientY, arrastre);
      if (sitio) setFantasma({ cita: arrastre.cita, ...sitio });
    };
    const soltar = () => {
      const arrastre = arrastreRef.current;
      arrastreRef.current = null;
      const sitio = fantasmaRef.current;
      setFantasma(null);
      if (!arrastre?.activo || !sitio || !onSoltar) return;
      // El clic que el navegador manda tras soltar no debe abrir la cita;
      // si se soltó fuera del bloque no llega ninguno, y la marca caduca.
      acabaDeArrastrar.current = true;
      window.setTimeout(() => {
        acabaDeArrastrar.current = false;
      }, 0);
      const diaOriginal = dias.findIndex((dia) => citasPorDia.get(dia)?.some((cita) => cita.id === arrastre.cita.id));
      const minutoOriginal = minutosDelDia(arrastre.cita.programedAt, timeZone);
      if (sitio.columna === diaOriginal && sitio.minuto === minutoOriginal) return;
      onSoltar(arrastre.cita, dias[sitio.columna], sitio.minuto);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  }, [dias, citasPorDia, rango, onSoltar, timeZone]);

  const empezar = (cita: AgendaBooking, evento: React.PointerEvent<HTMLButtonElement>) => {
    if (evento.button !== 0 || !onSoltar) return;
    const caja = columnasRef.current?.getBoundingClientRect();
    if (!caja) return;
    const minutoPuntero = rango.desde + ((evento.clientY - caja.top) / ALTO_DE_HORA) * 60;
    arrastreRef.current = {
      cita,
      x: evento.clientX,
      y: evento.clientY,
      agarre: minutoPuntero - minutosDelDia(cita.programedAt, timeZone),
      activo: false,
    };
  };

  const abrir = (cita: AgendaBooking) => {
    if (acabaDeArrastrar.current) {
      acabaDeArrastrar.current = false;
      return;
    }
    onAbrir(cita);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 border-b border-[#e5e5e5] bg-white">
        <div className="w-14 shrink-0" />
        {dias.map((dia, indice) => {
          const numero = citasPorDia.get(dia)?.length ?? 0;
          const esHoy = dia === hoy;
          return (
            <button
              key={dia}
              type="button"
              onClick={() => onElegirDia(dia)}
              aria-label={`Ver el ${diaLargo(dia).toLowerCase()}, ${numero === 1 ? "1 cita" : `${numero} citas`}`}
              className={`flex min-w-0 flex-1 items-baseline justify-center gap-1.5 border-l border-[#f0f0f0] py-2.5 text-sm transition hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6] ${
                esHoy ? "font-bold text-[#6d28d9]" : dia < hoy ? "text-[#a1a1aa]" : "font-semibold text-[#27272a]"
              }`}
            >
              <span>{NOMBRES_CORTOS[indice] ?? INICIALES_DE_DIA[indice]}</span>
              <span
                className={`tabular-nums ${esHoy ? "inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#8b5cf6] text-white" : ""}`}
              >
                {numeroDelDia(dia)}
              </span>
              {numero > 0 ? <span className="text-xs font-semibold text-muted">· {numero}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex pb-6 pt-3">
          <RegletaDeHoras rango={rango} />
          <div ref={columnasRef} className="relative flex min-w-0 flex-1 select-none" style={{ height: altoTotal }}>
            {dias.map((dia) => {
              const tramos = tramosDelDia(horario, dia);
              return (
                <div key={dia} className={`flex min-w-0 flex-1 border-l border-[#f0f0f0] ${dia === hoy ? "bg-[#faf8ff]" : ""}`}>
                  <ColumnaDelDia
                    citas={citasPorDia.get(dia) ?? []}
                    rango={rango}
                    tramos={tramos}
                    timeZone={timeZone}
                    ahora={ahora}
                    esHoy={dia === hoy}
                    seleccionada={seleccionada}
                    onAbrir={abrir}
                    compacta
                    cerradoTodoElDia={tramos !== null && tramos.length === 0}
                    arrastrable={onSoltar ? { onEmpezar: empezar, arrastrando: fantasma?.cita.id ?? null } : undefined}
                  />
                </div>
              );
            })}
            {fantasma ? (
              <div
                className="pointer-events-none absolute z-40 rounded-lg border-2 border-dashed border-[#6d28d9] bg-[#ede9fe]/90 px-2 py-1 text-xs font-bold text-[#6d28d9] shadow-lg"
                style={{
                  left: `calc(${(fantasma.columna / dias.length) * 100}% + 3px)`,
                  width: `calc(${100 / dias.length}% - 6px)`,
                  top: ((fantasma.minuto - rango.desde) / 60) * ALTO_DE_HORA + 1,
                  height: Math.max(22, (fantasma.cita.durationMinutes / 60) * ALTO_DE_HORA - 2),
                }}
                aria-hidden="true"
              >
                <span className="tabular-nums">{horaDeMinutos(fantasma.minuto)}</span> · {nombreDeCita(fantasma.cita)}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
