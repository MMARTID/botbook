import type { CallStatus } from "./types";

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
    IN_PROGRESS: "En curso",
    COMPLETED: "Completada",
    FAILED: "Fallida",
  };
  return labels[status];
}
