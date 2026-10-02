import { exportarLlamadasCsv } from "./api";
import { inicioDelDia, sumarDias } from "./fechas-negocio";
import type { CallSentiment, CanalDeLlamada, ConsultaDeLlamadas, FiltroDeLlamadas, OrdenDeLlamadas } from "./types";

/**
 * Los filtros del historial de llamadas, iguales en escritorio y en móvil:
 * viven en la URL (`filtro`, `canal`, `animo`, `periodo`, `q`, `orden`) y se
 * convierten en la consulta al backend y a la exportación a CSV.
 */

export const RESULTADOS: Array<{ valor: FiltroDeLlamadas; texto: string; corto: string }> = [
  { valor: "todas", texto: "Todos los resultados", corto: "Todas" },
  { valor: "con_cita", texto: "Con cita", corto: "Con cita" },
  { valor: "por_devolver", texto: "Recados por devolver", corto: "Por devolver" },
  { valor: "sin_cita", texto: "Sin cita", corto: "Sin cita" },
];
export const CANALES: Array<{ valor: CanalDeLlamada | ""; texto: string; corto: string }> = [
  { valor: "", texto: "Voz y WhatsApp", corto: "Todos" },
  { valor: "voz", texto: "Solo llamadas", corto: "Llamadas" },
  { valor: "whatsapp", texto: "Solo WhatsApp", corto: "WhatsApp" },
];
export const SENTIMIENTOS: Array<{ valor: CallSentiment | ""; texto: string; corto: string }> = [
  { valor: "", texto: "Cualquier ánimo", corto: "Cualquiera" },
  { valor: "POSITIVE", texto: "Satisfecho", corto: "Satisfecho" },
  { valor: "NEUTRAL", texto: "Neutral", corto: "Neutral" },
  { valor: "NEGATIVE", texto: "Insatisfecho", corto: "Insatisfecho" },
];
export const PERIODOS = [
  { valor: "hoy", texto: "Hoy", dias: 1 },
  { valor: "7", texto: "Últimos 7 días", dias: 7 },
  { valor: "30", texto: "Últimos 30 días", dias: 30 },
  { valor: "90", texto: "Últimos 90 días", dias: 90 },
  { valor: "todo", texto: "Desde el principio", dias: null },
] as const;
export type Periodo = (typeof PERIODOS)[number]["valor"];
const ORDENES: ReadonlyArray<{ valor: OrdenDeLlamadas }> = [
  { valor: "reciente" },
  { valor: "antigua" },
  { valor: "mas_larga" },
  { valor: "mas_corta" },
];

export type FiltrosDeLlamadas = {
  filtro: FiltroDeLlamadas;
  canal: CanalDeLlamada | "";
  sentimiento: CallSentiment | "";
  periodo: Periodo;
  q: string;
  orden: OrdenDeLlamadas;
};

/** El valor de un parámetro de la URL si es uno de los permitidos. */
function uno<T extends string>(valor: string | null, opciones: ReadonlyArray<{ valor: T }>, porDefecto: T): T {
  return opciones.find((opcion) => opcion.valor === valor)?.valor ?? porDefecto;
}

/** El escritorio mira los últimos 30 días; el móvil, desde el principio. */
export function leerFiltros(parametros: URLSearchParams, periodoPorDefecto: Periodo): FiltrosDeLlamadas {
  return {
    filtro: uno(parametros.get("filtro"), RESULTADOS, "todas"),
    canal: uno(parametros.get("canal"), CANALES, ""),
    sentimiento: uno(parametros.get("animo"), SENTIMIENTOS, ""),
    periodo: uno(parametros.get("periodo"), PERIODOS, periodoPorDefecto),
    q: parametros.get("q") ?? "",
    orden: uno(parametros.get("orden"), ORDENES, "reciente"),
  };
}

export function consultaDeFiltros(filtros: FiltrosDeLlamadas, hoy: string, timeZone: string): ConsultaDeLlamadas {
  const periodo = PERIODOS.find((opcion) => opcion.valor === filtros.periodo);
  return {
    filtro: filtros.filtro,
    canal: filtros.canal || undefined,
    sentimiento: filtros.sentimiento || undefined,
    desde: periodo?.dias ? inicioDelDia(sumarDias(hoy, -(periodo.dias - 1)), timeZone) : undefined,
    q: filtros.q.length >= 2 ? filtros.q : undefined,
    orden: filtros.orden,
  };
}

/**
 * Descarga el CSV de lo filtrado y devuelve el aviso para el dueño. En el
 * móvil, el navegador lo abre con su hoja de compartir o de descargas.
 */
export async function descargarCsv(consulta: ConsultaDeLlamadas): Promise<string> {
  const { blob, nombre, omitidas } = await exportarLlamadasCsv(consulta);
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return omitidas > 0
    ? `Descargadas las 5.000 más recientes; quedan ${omitidas.toLocaleString("es-ES")} fuera. Acota las fechas para el resto.`
    : "Historial descargado.";
}
