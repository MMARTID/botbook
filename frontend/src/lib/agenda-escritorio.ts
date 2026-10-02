import type { AgendaBooking, BusinessSchedule, ScheduleInterval, WeekDay } from "./types";
import { DIAS_DEL_HORARIO } from "./horario";
import { diaDeLaSemana, minutosDelDia } from "./fechas-negocio";

/**
 * Geometría de la agenda de escritorio (la semana en cuadrícula, el día del
 * Panel): qué horas se pintan, qué está cerrado y cómo se reparten las citas
 * que se solapan. Todo en minutos desde la medianoche del negocio.
 */

/** `business.schedule` llega como JSON libre; solo vale si tiene semana. */
export function horarioDelNegocio(valor: unknown): BusinessSchedule | null {
  if (!valor || typeof valor !== "object") return null;
  const semana = (valor as { week?: unknown }).week;
  return semana && typeof semana === "object" ? (valor as BusinessSchedule) : null;
}

function aMinutos(hora: string) {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

export function claveDelDiaDeLaSemana(clave: string): WeekDay {
  return DIAS_DEL_HORARIO[diaDeLaSemana(clave)].key;
}

/** Los tramos abiertos de un día concreto: la excepción de esa fecha
 * (festivo, horario especial) manda sobre el patrón semanal. */
export function tramosDelDia(horario: BusinessSchedule | null, clave: string): ScheduleInterval[] | null {
  if (!horario) return null;
  const excepcion = horario.exceptions?.find((candidata) => candidata.date === clave);
  if (excepcion) return excepcion.closed ? [] : excepcion.intervals;
  const dia = horario.week[claveDelDiaDeLaSemana(clave)];
  if (!dia) return null;
  return dia.enabled ? dia.intervals : [];
}

/**
 * Las horas que pinta la cuadrícula: de la primera apertura a la última
 * hora de cierre de los días que se ven, en horas enteras, ampliadas para
 * que quepa cualquier cita que caiga fuera. Sin horario, de 9 a 20.
 */
export function rangoDeHoras(
  horario: BusinessSchedule | null,
  dias: string[],
  citas: Array<Pick<AgendaBooking, "programedAt" | "durationMinutes">>,
  timeZone: string
): { desde: number; hasta: number } {
  let desde = Infinity;
  let hasta = -Infinity;
  for (const dia of dias) {
    for (const tramo of tramosDelDia(horario, dia) ?? []) {
      desde = Math.min(desde, aMinutos(tramo.start));
      hasta = Math.max(hasta, aMinutos(tramo.end));
    }
  }
  for (const cita of citas) {
    const inicio = minutosDelDia(cita.programedAt, timeZone);
    desde = Math.min(desde, inicio);
    hasta = Math.max(hasta, Math.min(24 * 60, inicio + cita.durationMinutes));
  }
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta <= desde) return { desde: 9 * 60, hasta: 20 * 60 };
  return { desde: Math.floor(desde / 60) * 60, hasta: Math.min(24 * 60, Math.ceil(hasta / 60) * 60) };
}

/** Los huecos cerrados de un día dentro del rango pintado (antes de abrir,
 * la pausa de mediodía, después de cerrar), para sombrearlos. */
export function tramosCerrados(
  tramos: ScheduleInterval[] | null,
  rango: { desde: number; hasta: number }
): Array<{ desde: number; hasta: number }> {
  if (tramos === null) return [];
  const abiertos = tramos
    .map((tramo) => ({ desde: aMinutos(tramo.start), hasta: aMinutos(tramo.end) }))
    .sort((a, b) => a.desde - b.desde);
  const cerrados: Array<{ desde: number; hasta: number }> = [];
  let cursor = rango.desde;
  for (const abierto of abiertos) {
    if (abierto.desde > cursor) cerrados.push({ desde: cursor, hasta: Math.min(abierto.desde, rango.hasta) });
    cursor = Math.max(cursor, abierto.hasta);
  }
  if (cursor < rango.hasta) cerrados.push({ desde: cursor, hasta: rango.hasta });
  return cerrados.filter((tramo) => tramo.hasta > tramo.desde);
}

export type Colocada<T> = { item: T; inicio: number; fin: number; carril: number; carriles: number };

/**
 * Reparte en carriles las citas que se solapan (dos profesionales a la
 * misma hora): cada grupo de citas encadenadas por solapes comparte el
 * ancho de la columna, y cada cita va al primer carril libre.
 */
export function colocarEnCarriles<T>(items: T[], inicio: (item: T) => number, fin: (item: T) => number): Colocada<T>[] {
  const ordenadas = items
    .map((item) => ({ item, inicio: inicio(item), fin: Math.max(inicio(item) + 1, fin(item)) }))
    .sort((a, b) => a.inicio - b.inicio || b.fin - a.fin);
  const resultado: Colocada<T>[] = [];
  let grupo: Colocada<T>[] = [];
  let finDelGrupo = -Infinity;
  const cerrarGrupo = () => {
    const carriles = grupo.reduce((maximo, colocada) => Math.max(maximo, colocada.carril + 1), 0);
    for (const colocada of grupo) resultado.push({ ...colocada, carriles });
    grupo = [];
  };
  for (const actual of ordenadas) {
    if (actual.inicio >= finDelGrupo && grupo.length > 0) cerrarGrupo();
    const ocupados = new Set(grupo.filter((otra) => otra.fin > actual.inicio).map((otra) => otra.carril));
    let carril = 0;
    while (ocupados.has(carril)) carril += 1;
    grupo.push({ ...actual, carril, carriles: 1 });
    finDelGrupo = grupo.length === 1 ? actual.fin : Math.max(finDelGrupo, actual.fin);
  }
  if (grupo.length > 0) cerrarGrupo();
  return resultado;
}

/** «09:00» de un número de minutos. */
export function horaDeMinutos(minutos: number) {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

/** El importe de varias citas, solo con las que tienen precio completo. */
export function importeDeCitas(citas: Array<Pick<AgendaBooking, "services">>) {
  let total = 0;
  let alguna = false;
  for (const cita of citas) {
    if (cita.services.length > 0 && cita.services.every((servicio) => servicio.priceCents != null)) {
      total += cita.services.reduce((suma, servicio) => suma + (servicio.priceCents ?? 0), 0);
      alguna = true;
    }
  }
  return alguna ? total : null;
}
