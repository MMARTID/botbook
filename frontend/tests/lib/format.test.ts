import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatCalendarEventDate,
  formatDuration,
  statusLabel,
  outcomeLabel,
  outcomeTone,
  sentimentLabel,
  sentimentTone,
} from "@/lib/format";

describe("formatCurrency", () => {
  it("convierte céntimos a euros formateados", () => {
    expect(formatCurrency(12345)).toBe("123,45 €");
  });

  it("trata null/undefined como 0", () => {
    expect(formatCurrency(null)).toBe("0,00 €");
    expect(formatCurrency(undefined)).toBe("0,00 €");
  });
});

describe("formatDate", () => {
  it("devuelve '-' si no hay fecha", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate(undefined)).toBe("-");
  });

  it("formatea una fecha ISO válida sin lanzar", () => {
    const result = formatDate("2026-09-04T10:30:00Z");
    expect(result).not.toBe("-");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("formatCalendarEventDate", () => {
  it("devuelve 'Fecha pendiente' si el valor es null", () => {
    expect(formatCalendarEventDate(null, "Europe/Madrid")).toEqual({
      date: "Fecha pendiente",
      time: null,
      allDay: false,
    });
  });

  it("detecta eventos de todo el día (solo fecha, sin hora)", () => {
    const result = formatCalendarEventDate("2026-09-04", "Europe/Madrid");
    expect(result.allDay).toBe(true);
    expect(result.time).toBe("Todo el día");
  });

  it("formatea un evento con hora en la zona horaria indicada", () => {
    const result = formatCalendarEventDate("2026-09-04T10:30:00Z", "Europe/Madrid");
    expect(result.allDay).toBe(false);
    expect(result.time).toBe("12:30");
  });
});

describe("formatDuration", () => {
  it("devuelve '0s' si no hay duración", () => {
    expect(formatDuration(null)).toBe("0s");
    expect(formatDuration(undefined)).toBe("0s");
    expect(formatDuration(0)).toBe("0s");
  });

  it("muestra solo segundos si dura menos de un minuto", () => {
    expect(formatDuration(45)).toBe("45s");
  });

  it("muestra minutos y segundos si dura un minuto o más", () => {
    expect(formatDuration(125)).toBe("2m 5s");
  });
});

describe("statusLabel", () => {
  it("traduce cada estado a español", () => {
    expect(statusLabel("IN_PROGRESS")).toBe("En curso");
    expect(statusLabel("COMPLETED")).toBe("Completada");
    expect(statusLabel("TIMED_OUT")).toBe("Sin respuesta a tiempo");
  });
});

describe("outcomeLabel / outcomeTone", () => {
  it("una llamada sin clasificar se etiqueta y colorea como neutra", () => {
    expect(outcomeLabel(null)).toBe("Sin clasificar");
    expect(outcomeTone(null)).toBe("neutral");
  });

  it("RESOLVED y LEAD_CAPTURED son tono success", () => {
    expect(outcomeTone("RESOLVED")).toBe("success");
    expect(outcomeTone("LEAD_CAPTURED")).toBe("success");
  });

  it("FRUSTRATED y ESCALATED son tono warning", () => {
    expect(outcomeTone("FRUSTRATED")).toBe("warning");
    expect(outcomeTone("ESCALATED")).toBe("warning");
  });

  it("NO_ANSWER no es ni éxito ni fallo del agente: tono neutral", () => {
    expect(outcomeTone("NO_ANSWER")).toBe("neutral");
  });
});

describe("sentimentLabel / sentimentTone", () => {
  it("sin sentimiento detectado devuelve null (no un texto vacío)", () => {
    expect(sentimentLabel(null)).toBeNull();
  });

  it("traduce y colorea cada sentimiento", () => {
    expect(sentimentLabel("POSITIVE")).toBe("Satisfecho");
    expect(sentimentTone("POSITIVE")).toBe("success");
    expect(sentimentTone("NEGATIVE")).toBe("warning");
    expect(sentimentTone("NEUTRAL")).toBe("neutral");
  });
});
