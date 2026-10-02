import type { BusinessSchedule, ScheduleDay, WeekDay } from "./types";

export const DIAS_DEL_HORARIO: Array<{ key: WeekDay; nombre: string; inicial: string }> = [
  { key: "monday", nombre: "Lunes", inicial: "L" },
  { key: "tuesday", nombre: "Martes", inicial: "M" },
  { key: "wednesday", nombre: "Miércoles", inicial: "X" },
  { key: "thursday", nombre: "Jueves", inicial: "J" },
  { key: "friday", nombre: "Viernes", inicial: "V" },
  { key: "saturday", nombre: "Sábado", inicial: "S" },
  { key: "sunday", nombre: "Domingo", inicial: "D" },
];

/** «09:00» → «9:00»: en una línea de resumen sobra el cero. */
function hora(valor: string) {
  return valor.replace(/^0(\d)/, "$1");
}

function tramos(dia: ScheduleDay) {
  if (!dia.enabled || dia.intervals.length === 0) return "";
  return dia.intervals.map((tramo) => `${hora(tramo.start)}–${hora(tramo.end)}`).join(", ");
}

/**
 * El horario en una línea, agrupando los días seguidos que abren igual:
 * «L–V 9:00–14:00, 16:30–20:30 · S 9:00–14:00». Es lo que enseña el índice
 * del Agente en el móvil, donde no cabe «5 días abiertos con horario propio».
 */
export function resumenDeHorario(horario: BusinessSchedule) {
  const partes: string[] = [];
  let indice = 0;
  while (indice < DIAS_DEL_HORARIO.length) {
    const firma = tramos(horario.week[DIAS_DEL_HORARIO[indice].key]);
    if (!firma) {
      indice += 1;
      continue;
    }
    let fin = indice;
    while (
      fin + 1 < DIAS_DEL_HORARIO.length &&
      tramos(horario.week[DIAS_DEL_HORARIO[fin + 1].key]) === firma
    ) {
      fin += 1;
    }
    const dias =
      fin === indice
        ? DIAS_DEL_HORARIO[indice].inicial
        : `${DIAS_DEL_HORARIO[indice].inicial}–${DIAS_DEL_HORARIO[fin].inicial}`;
    partes.push(`${dias} ${firma}`);
    indice = fin + 1;
  }
  return partes.length > 0 ? partes.join(" · ") : "Cerrado toda la semana";
}

/**
 * El mismo criterio que valida el backend (lib/businessSchedule.ts), dicho
 * antes de guardar y debajo del día que lo incumple.
 */
export function errorDeTramos(dia: ScheduleDay): string | null {
  if (!dia.enabled) return null;
  if (dia.intervals.length === 0) return "Un día abierto necesita al menos un tramo.";
  if (dia.intervals.some((tramo) => tramo.start >= tramo.end)) {
    return "El cierre debe ser posterior a la apertura.";
  }
  const ordenados = [...dia.intervals].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < ordenados.length; i += 1) {
    if (ordenados[i].start < ordenados[i - 1].end) return "Los tramos no pueden solaparse.";
  }
  return null;
}
