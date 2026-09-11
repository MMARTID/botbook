import type {
  CallEscalationReason,
  CallOutcome,
  CallSentiment,
  CallStatus,
} from "./types";

export function formatCurrency(cents?: number | null) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format((cents ?? 0) / 100);
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/**
 * Precio en euros sin decimales cuando son redondos: un salón anuncia
 * «18 €», no «18,00 €».
 */
export function formatPrice(cents?: number | null) {
  if (cents == null) return null;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Agrupa un número español como se lee en voz alta: 692 13 84 56. */
export function formatPhone(value?: string | null) {
  if (!value) return null;
  const compact = value.replace(/\s+/g, "");
  const match = compact.match(/^(\+34)?(\d{9})$/);
  if (!match) return value;
  const [, prefix, digits] = match;
  const grouped = `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
  return prefix ? `${prefix} ${grouped}` : grouped;
}

/** Hora de un día concreto en la zona del negocio: «17:00». */
export function formatClock(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

/**
 * Cabecera de día para la agenda. «Hoy» y «Mañana» ganan al nombre del día:
 * es lo que el negocio necesita distinguir de un vistazo.
 */
export function formatDayLabel(value: string, timeZone: string) {
  const dayKey = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    }).format(date);

  const target = new Date(value);
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  if (dayKey(target) === dayKey(now)) return "Hoy";
  if (dayKey(target) === dayKey(tomorrow)) return "Mañana";

  const label = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(target);

  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatDuration(seconds?: number | null) {
  if (!seconds) return "0s";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

export function statusLabel(status: CallStatus) {
  const labels: Record<CallStatus, string> = {
    INITIATED: "Iniciando",
    IN_PROGRESS: "En curso",
    COMPLETED: "Completada",
    FAILED: "Fallida",
    TIMED_OUT: "Sin respuesta a tiempo",
  };
  return labels[status];
}

/** Etiqueta en español del resultado clasificado de una llamada. `null` es una
 * llamada aún sin clasificar (el job de clasificación corre tras colgar). */
export function outcomeLabel(outcome: CallOutcome | null) {
  if (!outcome) return "Sin clasificar";
  const labels: Record<CallOutcome, string> = {
    RESOLVED: "Resuelta",
    LEAD_CAPTURED: "Cliente potencial",
    FRUSTRATED: "Cliente frustrado",
    ESCALATED: "Escalada",
    NO_ANSWER: "Sin respuesta",
  };
  return labels[outcome];
}

/** Tono semántico para colorear el resultado — no toda llamada "sin resolver"
 * es un fallo del agente, así que NO_ANSWER y sin clasificar quedan neutros. */
export function outcomeTone(outcome: CallOutcome | null): "success" | "warning" | "neutral" {
  if (outcome === "RESOLVED" || outcome === "LEAD_CAPTURED") return "success";
  if (outcome === "FRUSTRATED" || outcome === "ESCALATED") return "warning";
  return "neutral";
}

/** Etiqueta en español del tono/sentimiento del cliente detectado por Retell.
 * Eje distinto al resultado (outcome): esto es cómo se sintió, no qué pasó. */
export function sentimentLabel(sentiment: CallSentiment | null) {
  const labels: Record<CallSentiment, string> = {
    POSITIVE: "Satisfecho",
    NEUTRAL: "Neutral",
    NEGATIVE: "Insatisfecho",
  };
  return sentiment ? labels[sentiment] : null;
}

export function sentimentTone(sentiment: CallSentiment | null): "success" | "warning" | "neutral" {
  if (sentiment === "POSITIVE") return "success";
  if (sentiment === "NEGATIVE") return "warning";
  return "neutral";
}

/**
 * Por qué una llamada no acabó en cita, explicado para el negocio y no para
 * quien programó el sistema. `NO_APLICA` devuelve null: significa que no hubo
 * ningún problema, y anunciarlo solo añade ruido.
 */
export function escalationReasonLabel(reason: CallEscalationReason | null) {
  if (!reason || reason === "NO_APLICA") return null;
  const labels: Record<Exclude<CallEscalationReason, "NO_APLICA">, string> = {
    CLIENTE_LO_PIDIO: "El cliente pidió hablar con una persona",
    FALLO_TECNICO: "Falló la agenda o la consulta de disponibilidad",
    FUERA_DE_HORARIO: "Lo que pedía caía fuera de tu horario",
    CONSULTA_COMPLEJA: "La consulta iba más allá de lo que puede resolver",
  };
  return labels[reason];
}

/** Versión corta del motivo, para caber en un chip de la lista de llamadas. */
export function escalationReasonChip(reason: CallEscalationReason | null) {
  if (!reason || reason === "NO_APLICA") return null;
  const labels: Record<Exclude<CallEscalationReason, "NO_APLICA">, string> = {
    CLIENTE_LO_PIDIO: "Pidió una persona",
    FALLO_TECNICO: "Fallo técnico",
    FUERA_DE_HORARIO: "Fuera de horario",
    CONSULTA_COMPLEJA: "Consulta compleja",
  };
  return labels[reason];
}
