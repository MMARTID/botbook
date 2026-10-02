/**
 * El historial en CSV para abrirlo en Excel o Numbers. Separador «;» y BOM
 * UTF-8: es lo que el Excel en español abre en columnas y con tildes sin
 * pasar por el asistente de importación. Decimales con coma por lo mismo.
 */

export const MAX_FILAS_CSV = 5000;

export type LlamadaParaCsv = {
  startedAt: Date;
  voiceProvider: string;
  fromNumber: string | null;
  durationSecs: number | null;
  sentiment: string | null;
  summary: string | null;
  booking: {
    isCancelled: boolean;
    rescheduledToId: string | null;
    programedAt: Date;
    clientName: string | null;
    professional: { name: string } | null;
    services: Array<{ name: string; priceCents: number | null }>;
  } | null;
  recado: { atendidoAt: string | null } | null;
};

const SENTIMIENTOS: Record<string, string> = {
  POSITIVE: "Satisfecho",
  NEUTRAL: "Neutral",
  NEGATIVE: "Insatisfecho",
};

/** Lo mismo que la columna «Resultado» de la tabla, en palabras. */
export function resultadoDeLlamada(llamada: LlamadaParaCsv): string {
  if (llamada.recado && !llamada.recado.atendidoAt)
    return "Recado por devolver";
  if (llamada.booking && !llamada.booking.isCancelled) return "Reserva";
  if (llamada.booking?.rescheduledToId) return "Reserva modificada";
  if (llamada.recado) return "Recado devuelto";
  return "Sin cita";
}

/**
 * Una celda de texto que viene de una conversación (nombres, resúmenes) no
 * puede empezar por un carácter que Excel interprete como fórmula: el
 * nombre que dicta un cliente por teléfono acabaría ejecutándose. Se le
 * antepone un apóstrofo, como recomienda OWASP.
 */
export function celda(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  let texto = String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** «612 345 678» para los móviles españoles (con espacios Excel no lo toma
 * por número ni por fórmula); el resto, tal cual tras `celda`. */
function telefono(numero: string | null): string {
  if (!numero) return "";
  const espanol = numero.match(/^\+34(\d{3})(\d{3})(\d{3})$/);
  return espanol ? `${espanol[1]} ${espanol[2]} ${espanol[3]}` : numero;
}

function euros(centimos: number): string {
  return (centimos / 100).toFixed(2).replace(".", ",");
}

export function generarCsv(
  llamadas: LlamadaParaCsv[],
  timezone: string
): string {
  const fecha = new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const hora = new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const cabecera = [
    "Fecha",
    "Hora",
    "Canal",
    "Teléfono",
    "Duración (seg)",
    "Resultado",
    "Cliente",
    "Servicios",
    "Profesional",
    "Precio (€)",
    "Fecha de la cita",
    "Sentimiento",
    "Resumen",
  ];
  const filas = llamadas.map((llamada) => {
    const reserva = llamada.booking;
    const servicios = reserva?.services ?? [];
    const conPrecio =
      servicios.length > 0 && servicios.every((s) => s.priceCents != null);
    const esChat = llamada.voiceProvider === "whatsapp";
    return [
      fecha.format(llamada.startedAt),
      hora.format(llamada.startedAt),
      esChat ? "WhatsApp" : "Voz",
      telefono(llamada.fromNumber),
      esChat ? null : (llamada.durationSecs ?? 0),
      resultadoDeLlamada(llamada),
      reserva?.clientName ?? null,
      servicios.map((s) => s.name).join(" + ") || null,
      reserva?.professional?.name ?? null,
      conPrecio
        ? euros(servicios.reduce((total, s) => total + (s.priceCents ?? 0), 0))
        : null,
      reserva
        ? `${fecha.format(reserva.programedAt)} ${hora.format(reserva.programedAt)}`
        : null,
      llamada.sentiment ? (SENTIMIENTOS[llamada.sentiment] ?? null) : null,
      llamada.summary,
    ]
      .map(celda)
      .join(";");
  });
  return `\uFEFF${[cabecera.map(celda).join(";"), ...filas].join("\r\n")}\r\n`;
}
