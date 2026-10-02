/**
 * Fechas en la zona horaria del negocio, no en la del navegador: una cita de
 * las 00:30 pertenece a su día en Madrid aunque el dueño esté de viaje. Los
 * días se manejan como claves «AAAA-MM-DD» y la aritmética se hace a
 * mediodía UTC, donde ningún cambio de hora mueve el día.
 */

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** Inicial de cada día empezando en lunes, como en un calendario español. */
export const INICIALES_DE_DIA = ["L", "M", "X", "J", "V", "S", "D"];

const DIA_MS = 24 * 60 * 60 * 1000;

function aFecha(valor: Date | string) {
  return valor instanceof Date ? valor : new Date(valor);
}

/** «2026-10-01»: el día natural de un instante en la zona del negocio. */
export function claveDeDia(valor: Date | string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(aFecha(valor));
}

/** «09:41» en la zona del negocio. */
export function horaDelNegocio(valor: Date | string, timeZone: string) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(aFecha(valor));
}

/** Minutos desde la medianoche del negocio. */
export function minutosDelDia(valor: Date | string, timeZone: string) {
  const [horas, minutos] = horaDelNegocio(valor, timeZone).split(":").map(Number);
  return horas * 60 + minutos;
}

function mediodia(clave: string) {
  const [año, mes, dia] = clave.split("-").map(Number);
  return new Date(Date.UTC(año, mes - 1, dia, 12));
}

export function sumarDias(clave: string, dias: number) {
  return new Date(mediodia(clave).getTime() + dias * DIA_MS).toISOString().slice(0, 10);
}

/** 0 = lunes … 6 = domingo. */
export function diaDeLaSemana(clave: string) {
  return (mediodia(clave).getUTCDay() + 6) % 7;
}

export function lunesDe(clave: string) {
  return sumarDias(clave, -diaDeLaSemana(clave));
}

export function numeroDelDia(clave: string) {
  return mediodia(clave).getUTCDate();
}

/** «Jueves, 1 de octubre». */
export function diaLargo(clave: string) {
  const fecha = mediodia(clave);
  return `${DIAS[fecha.getUTCDay()]}, ${fecha.getUTCDate()} de ${MESES[fecha.getUTCMonth()]}`;
}

/** «Hoy», «Mañana», «Ayer» o el día largo. */
export function etiquetaDeDia(clave: string, hoy: string) {
  if (clave === hoy) return "Hoy";
  if (clave === sumarDias(hoy, 1)) return "Mañana";
  if (clave === sumarDias(hoy, -1)) return "Ayer";
  return diaLargo(clave);
}

/** «28 sep – 4 oct» o «5 – 11 oct». */
export function rangoDeSemana(lunes: string) {
  const inicio = mediodia(lunes);
  const fin = mediodia(sumarDias(lunes, 6));
  const mismoMes = inicio.getUTCMonth() === fin.getUTCMonth();
  return `${inicio.getUTCDate()}${mismoMes ? "" : ` ${MESES_CORTOS[inicio.getUTCMonth()]}`} – ${fin.getUTCDate()} ${MESES_CORTOS[fin.getUTCMonth()]}`;
}

/**
 * Un instante seguro para pedir citas «desde el principio de este día» sin
 * calcular el desfase de la zona: 26 h antes de su mediodía UTC es la
 * medianoche de UTC+14, la zona más adelantada. Lo que sobra se filtra por
 * clave.
 */
export function instanteAntesDelDia(clave: string) {
  return new Date(mediodia(clave).getTime() - 26 * 60 * 60 * 1000).toISOString();
}

function desfaseEnMinutos(instante: number, timeZone: string) {
  const texto =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(new Date(instante))
      .find((parte) => parte.type === "timeZoneName")?.value ?? "GMT";
  const partes = texto.match(/GMT([+-])(\d{2}):(\d{2})/);
  return partes ? (partes[1] === "-" ? -1 : 1) * (Number(partes[2]) * 60 + Number(partes[3])) : 0;
}

/** La medianoche de un día en la zona del negocio, como instante ISO: el
 * «desde» exacto de los filtros por fecha (dos pasadas por el cambio de hora). */
export function inicioDelDia(clave: string, timeZone: string) {
  const [año, mes, dia] = clave.split("-").map(Number);
  const supuesto = Date.UTC(año, mes - 1, dia);
  const primero = supuesto - desfaseEnMinutos(supuesto, timeZone) * 60_000;
  return new Date(supuesto - desfaseEnMinutos(primero, timeZone) * 60_000).toISOString();
}
