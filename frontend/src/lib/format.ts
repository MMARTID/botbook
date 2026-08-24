import type { CallOutcome, CallStatus } from "./types";

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

export function formatCalendarEventDate(value: string | null, timeZone: string) {
  if (!value) return { date: "Fecha pendiente", time: null, allDay: false };

  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = allDay ? new Date(`${value}T12:00:00`) : new Date(value);

  return {
    date: new Intl.DateTimeFormat("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: allDay ? "UTC" : timeZone,
    }).format(date),
    time: allDay
      ? "Todo el día"
      : new Intl.DateTimeFormat("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone,
        }).format(date),
    allDay,
  };
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
