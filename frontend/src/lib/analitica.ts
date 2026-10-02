import type { BusinessSchedule, CallAnalytics, WeekDay } from "./types";

/** 1 = lunes … 7 = domingo, como `byWeekday` de la analítica. */
const DIA_DEL_HORARIO: Record<number, WeekDay> = {
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
  7: "sunday",
};

export const DIA_CORTO = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const DIA_LARGO = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const LOS_DIAS = ["", "los lunes", "los martes", "los miércoles", "los jueves", "los viernes", "los sábados", "los domingos"];

/** Desde esta hora, «por la tarde». */
const HORA_DE_LA_TARDE = 15;

export type Rejilla = {
  dias: number[];
  horas: number[];
  /** Llamadas de un día a una hora (0 si no hubo). */
  llamadas: (dia: number, hora: number) => number;
  maximo: number;
  /** Las que entraron a horas que el mapa no enseña (de madrugada). */
  fuera: number;
};

/** Sin horario que diga otra cosa, el mapa va de las 7 a las 22. */
const PRIMERA_HORA = 7;
const ULTIMA_HORA = 22;

function horasAbiertas(horario: BusinessSchedule | null, dia: number) {
  const tramos = horario?.week[DIA_DEL_HORARIO[dia]];
  if (!tramos?.enabled) return [];
  const horas: number[] = [];
  for (const tramo of tramos.intervals) {
    const [hi, mi] = tramo.start.split(":").map(Number);
    const [hf, mf] = tramo.end.split(":").map(Number);
    const desde = hi + mi / 60;
    const hasta = hf + mf / 60;
    for (let hora = Math.floor(desde); hora < hasta; hora++) horas.push(hora);
  }
  return horas;
}

/**
 * Filas y columnas del mapa de calor: los días que abre el negocio (o en los
 * que hubo llamadas) y de la primera a la última hora con horario o con
 * llamadas. Las llamadas de madrugada (fuera de 7–22 h y del horario) no
 * estiran el mapa a 24 columnas casi vacías: se cuentan aparte. Sin horario
 * ni llamadas, lunes a sábado de 9 a 20.
 */
export function rejillaDeLlamadas(datos: Pick<CallAnalytics, "byWeekdayHour">, horario: BusinessSchedule | null): Rejilla {
  const celdas = new Map<number, number>();
  for (const celda of datos.byWeekdayHour ?? []) celdas.set(celda.weekday * 100 + celda.hour, celda.count);

  const dias = new Set<number>();
  const horas = new Set<number>();
  for (let dia = 1; dia <= 7; dia++) {
    const abiertas = horasAbiertas(horario, dia);
    if (abiertas.length > 0) dias.add(dia);
    for (const hora of abiertas) horas.add(hora);
  }
  for (const celda of datos.byWeekdayHour ?? []) {
    dias.add(celda.weekday);
    if (horas.has(celda.hour) || (celda.hour >= PRIMERA_HORA && celda.hour <= ULTIMA_HORA)) horas.add(celda.hour);
  }
  if (dias.size === 0) for (let dia = 1; dia <= 6; dia++) dias.add(dia);
  if (horas.size === 0) for (let hora = 9; hora <= 20; hora++) horas.add(hora);

  const listaDeHoras = Array.from(horas);
  const primera = Math.min(...listaDeHoras);
  const ultima = Math.max(...listaDeHoras);
  const fuera = (datos.byWeekdayHour ?? [])
    .filter((celda) => celda.hour < primera || celda.hour > ultima)
    .reduce((total, celda) => total + celda.count, 0);
  return {
    dias: Array.from(dias).sort((a, b) => a - b),
    horas: Array.from({ length: ultima - primera + 1 }, (_, indice) => primera + indice),
    llamadas: (dia, hora) => celdas.get(dia * 100 + hora) ?? 0,
    maximo: Math.max(0, ...Array.from(celdas.values())),
    fuera,
  };
}

/** De 0 (sin llamadas) a 5 (la hora con más llamadas). */
export function nivelDeCelda(llamadas: number, maximo: number) {
  if (llamadas <= 0 || maximo <= 0) return 0;
  return Math.max(1, Math.ceil((llamadas / maximo) * 5));
}

function mayuscula(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * «Lectura rápida»: dos o tres frases sacadas de las cifras, sin inventar
 * nada. El pico es la franja de dos horas seguidas con más llamadas; el hueco,
 * la primera media jornada abierta en la que no entró ninguna.
 */
export function lecturaRapida(datos: CallAnalytics, rejilla: Rejilla, horario: BusinessSchedule | null): string[] {
  const total = datos.totals.calls;
  if (total < 10) return ["Todavía hay pocas llamadas en este periodo para sacar conclusiones."];

  const frases: string[] = [];
  let pico = { llamadas: 0, dia: 0, hora: 0 };
  for (const dia of rejilla.dias) {
    for (const hora of rejilla.horas) {
      const llamadas = rejilla.llamadas(dia, hora) + rejilla.llamadas(dia, hora + 1);
      if (llamadas > pico.llamadas) pico = { llamadas, dia, hora };
    }
  }
  if (pico.llamadas >= 3) {
    frases.push(`El pico es ${LOS_DIAS[pico.dia]} de ${pico.hora} a ${pico.hora + 2} h.`);
  }

  // Un hueco con pocas llamadas en total no dice nada.
  if (total >= 30) {
    hueco: for (const dia of rejilla.dias) {
      const abiertas = horasAbiertas(horario, dia);
      for (const [parte, enLaParte] of [
        ["por la mañana", (hora: number) => hora < HORA_DE_LA_TARDE],
        ["por la tarde", (hora: number) => hora >= HORA_DE_LA_TARDE],
      ] as const) {
        const horas = abiertas.filter(enLaParte);
        if (horas.length >= 2 && horas.every((hora) => rejilla.llamadas(dia, hora) === 0)) {
          frases.push(`${mayuscula(LOS_DIAS[dia])} ${parte} no entra ninguna llamada.`);
          break hueco;
        }
      }
    }
  }

  if (datos.totals.bookings > 0) {
    const porCada100 = Math.round((datos.totals.bookings / total) * 100);
    frases.push(`${datos.totals.bookings} citas reservadas: ${porCada100} por cada 100 llamadas.`);
  }
  if (datos.totals.waitlistLeads > 0) {
    frases.push(
      datos.totals.waitlistLeads === 1
        ? "Un cliente espera a que se libere un hueco."
        : `${datos.totals.waitlistLeads} clientes esperan a que se libere un hueco.`
    );
  }
  return frases;
}

/** «2m 31s»; por debajo del minuto, «45s». */
export function duracionMedia(segundos: number) {
  const minutos = Math.floor(segundos / 60);
  return minutos > 0 ? `${minutos}m ${segundos % 60}s` : `${segundos}s`;
}
