import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BusinessScheduleSchema,
  checkBusinessHours,
  checkBookingRestrictions,
  formatScheduleForPrompt,
  DEFAULT_BUSINESS_SCHEDULE,
} from "../../src/lib/businessSchedule.js";

const europeMadrid = "Europe/Madrid";

function buildSchedule(
  overrides: Partial<Record<keyof typeof DEFAULT_BUSINESS_SCHEDULE.week, { enabled: boolean; intervals: Array<{ start: string; end: string }> }>> = {}
) {
  return {
    version: 1 as const,
    week: {
      ...DEFAULT_BUSINESS_SCHEDULE.week,
      ...overrides,
    },
  };
}

describe("BusinessScheduleSchema", () => {
  it("acepta el horario por defecto", () => {
    const result = BusinessScheduleSchema.safeParse(DEFAULT_BUSINESS_SCHEDULE);
    expect(result.success).toBe(true);
  });

  it("rechaza un horario sin version", () => {
    const result = BusinessScheduleSchema.safeParse({ week: DEFAULT_BUSINESS_SCHEDULE.week });
    expect(result.success).toBe(false);
  });

  it("rechaza formato de hora incorrecto", () => {
    const schedule = buildSchedule({
      monday: { enabled: true, intervals: [{ start: "9:00", end: "18:00" }] },
    });
    const result = BusinessScheduleSchema.safeParse(schedule);
    expect(result.success).toBe(false);
  });

  it("rechaza cierre anterior a apertura", () => {
    const schedule = buildSchedule({
      monday: { enabled: true, intervals: [{ start: "18:00", end: "09:00" }] },
    });
    const result = BusinessScheduleSchema.safeParse(schedule);
    expect(result.success).toBe(false);
  });

  it("rechaza día abierto sin tramos", () => {
    const schedule = buildSchedule({
      monday: { enabled: true, intervals: [] },
    });
    const result = BusinessScheduleSchema.safeParse(schedule);
    expect(result.success).toBe(false);
  });

  it("rechaza tramos solapados", () => {
    const schedule = buildSchedule({
      monday: {
        enabled: true,
        intervals: [
          { start: "09:00", end: "13:00" },
          { start: "12:00", end: "18:00" },
        ],
      },
    });
    const result = BusinessScheduleSchema.safeParse(schedule);
    expect(result.success).toBe(false);
  });

  it("acepta hasta 3 tramos no solapados", () => {
    const schedule = buildSchedule({
      monday: {
        enabled: true,
        intervals: [
          { start: "09:00", end: "11:00" },
          { start: "11:00", end: "13:00" },
          { start: "15:00", end: "18:00" },
        ],
      },
    });
    const result = BusinessScheduleSchema.safeParse(schedule);
    expect(result.success).toBe(true);
  });
});

describe("checkBusinessHours", () => {
  it("detecta horario dentro del horario comercial", () => {
    const result = checkBusinessHours(DEFAULT_BUSINESS_SCHEDULE, europeMadrid, "2026-08-10T10:00:00+02:00", 60);
    expect(result.success).toBe(true);
    expect(result.isOpen).toBe(true);
    expect(result.code).toBe("WITHIN_BUSINESS_HOURS");
  });

  it("detecta horario fuera del horario comercial", () => {
    const result = checkBusinessHours(DEFAULT_BUSINESS_SCHEDULE, europeMadrid, "2026-08-10T20:00:00+02:00", 60);
    expect(result.success).toBe(true);
    expect(result.isOpen).toBe(false);
    expect(result.code).toBe("OUTSIDE_BUSINESS_HOURS");
  });

  it("detecta día cerrado", () => {
    const result = checkBusinessHours(DEFAULT_BUSINESS_SCHEDULE, europeMadrid, "2026-08-09T10:00:00+02:00", 60);
    expect(result.success).toBe(true);
    expect(result.isOpen).toBe(false);
  });

  it("respeta el timezone: una misma hora UTC se evalúa distinta en Madrid y UTC", () => {
    // En agosto Madrid está en UTC+2: 07:00 UTC = 09:00 Madrid (dentro del horario).
    const madridResult = checkBusinessHours(DEFAULT_BUSINESS_SCHEDULE, europeMadrid, "2026-08-10T07:00:00Z", 60);
    expect(madridResult.success && madridResult.isOpen).toBe(true);

    // En UTC 07:00 sigue siendo temprano, fuera del horario comercial.
    const utcResult = checkBusinessHours(DEFAULT_BUSINESS_SCHEDULE, "UTC", "2026-08-10T07:00:00Z", 60);
    expect(utcResult.success && utcResult.isOpen).toBe(false);
  });

  it("rechaza horario mal formateado", () => {
    const result = checkBusinessHours(DEFAULT_BUSINESS_SCHEDULE, europeMadrid, "no-es-una-fecha", 60);
    expect(result.success).toBe(false);
    expect(result.code).toBe("INVALID_DATE_TIME");
  });

  it("devuelve BUSINESS_HOURS_NOT_CONFIGURED si el schedule no es válido", () => {
    const result = checkBusinessHours({ invalid: true }, europeMadrid, "2026-08-10T10:00:00+02:00", 60);
    expect(result.success).toBe(false);
    expect(result.code).toBe("BUSINESS_HOURS_NOT_CONFIGURED");
  });

  it("detecta cita que cruza el cierre", () => {
    const result = checkBusinessHours(DEFAULT_BUSINESS_SCHEDULE, europeMadrid, "2026-08-10T17:30:00+02:00", 60);
    expect(result.success).toBe(true);
    expect(result.isOpen).toBe(false);
  });

  it("acepta cita exacta al inicio y fin del tramo", () => {
    // +02:00 explícito (offset real de Madrid en agosto) — nunca una fecha
    // "naive": new Date() interpreta una fecha sin zona horaria como hora
    // LOCAL DEL SISTEMA que ejecuta el test, no como hora de Madrid. En este
    // Mac (CEST) coincidían por casualidad; en el runner de GitHub Actions
    // (UTC) el desfase de 2h desplazaba el fin de la cita a las 20:00,
    // fuera del tramo 09:00–18:00 — el test fallaba solo en CI. Regresión
    // real encontrada por el pipeline de CI/CD el 2026-09-04.
    const result = checkBusinessHours(DEFAULT_BUSINESS_SCHEDULE, europeMadrid, "2026-08-10T09:00:00+02:00", 540);
    expect(result.success).toBe(true);
    expect(result.isOpen).toBe(true);
  });
});

describe("checkBookingRestrictions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00+02:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rechaza una fecha pasada aunque el negocio no tenga antelación mínima configurada (hallazgo #19 de la auditoría)", () => {
    // minAdvanceBookingMinutes null/undefined es el valor por defecto de
    // cualquier negocio nuevo — antes esto hacía saltar la comparación con
    // "ahora" por completo, así que una cita de ayer que encajara en el
    // horario semanal pasaba esta validación sin más.
    const result = checkBookingRestrictions(
      { minAdvanceBookingMinutes: null, maxAppointmentDurationMinutes: null },
      "2026-08-09T12:00:00+02:00",
      30
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("APPOINTMENT_IN_PAST");
    }
  });

  it("acepta una fecha futura cuando no hay antelación mínima configurada", () => {
    const result = checkBookingRestrictions(
      { minAdvanceBookingMinutes: null, maxAppointmentDurationMinutes: null },
      "2026-08-10T13:00:00+02:00",
      30
    );

    expect(result.success).toBe(true);
  });

  it("sigue exigiendo la antelación mínima configurada cuando la fecha es futura pero demasiado próxima", () => {
    const result = checkBookingRestrictions(
      { minAdvanceBookingMinutes: 120, maxAppointmentDurationMinutes: null },
      "2026-08-10T13:00:00+02:00", // solo 1h de antelación, hacen falta 2h
      30
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("MIN_ADVANCE_NOT_MET");
    }
  });

  it("rechaza por MAX_DURATION_EXCEEDED cuando la duración supera el máximo configurado", () => {
    const result = checkBookingRestrictions(
      { minAdvanceBookingMinutes: null, maxAppointmentDurationMinutes: 60 },
      "2026-08-10T13:00:00+02:00",
      90
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("MAX_DURATION_EXCEEDED");
    }
  });
});

describe("formatScheduleForPrompt", () => {
  it("formatea el horario por defecto en español, un día por frase", () => {
    const text = formatScheduleForPrompt(DEFAULT_BUSINESS_SCHEDULE);
    expect(text).toContain("Lunes: 09:00–18:00.");
    expect(text).toContain("Viernes: 09:00–18:00.");
    expect(text).toContain("Sábado: cerrado.");
    expect(text).toContain("Domingo: cerrado.");
  });

  it("lista varios tramos del mismo día separados por coma", () => {
    const schedule = buildSchedule({
      monday: { enabled: true, intervals: [{ start: "09:00", end: "13:00" }, { start: "16:00", end: "20:00" }] },
    });
    const text = formatScheduleForPrompt(schedule);
    expect(text).toContain("Lunes: 09:00–13:00, 16:00–20:00.");
  });

  it("devuelve un mensaje de fallback si el horario no es válido", () => {
    expect(formatScheduleForPrompt({ invalid: true })).toBe("Horario no configurado todavía.");
  });
});
