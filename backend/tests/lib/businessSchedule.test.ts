import { describe, it, expect } from "vitest";
import {
  BusinessScheduleSchema,
  checkBusinessHours,
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
    const result = checkBusinessHours(DEFAULT_BUSINESS_SCHEDULE, europeMadrid, "2026-08-10T10:00:00", 60);
    expect(result.success).toBe(true);
    expect(result.isOpen).toBe(true);
    expect(result.code).toBe("WITHIN_BUSINESS_HOURS");
  });

  it("detecta horario fuera del horario comercial", () => {
    const result = checkBusinessHours(DEFAULT_BUSINESS_SCHEDULE, europeMadrid, "2026-08-10T20:00:00", 60);
    expect(result.success).toBe(true);
    expect(result.isOpen).toBe(false);
    expect(result.code).toBe("OUTSIDE_BUSINESS_HOURS");
  });

  it("detecta día cerrado", () => {
    const result = checkBusinessHours(DEFAULT_BUSINESS_SCHEDULE, europeMadrid, "2026-08-09T10:00:00", 60);
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
    const result = checkBusinessHours({ invalid: true }, europeMadrid, "2026-08-10T10:00:00", 60);
    expect(result.success).toBe(false);
    expect(result.code).toBe("BUSINESS_HOURS_NOT_CONFIGURED");
  });

  it("detecta cita que cruza el cierre", () => {
    const result = checkBusinessHours(DEFAULT_BUSINESS_SCHEDULE, europeMadrid, "2026-08-10T17:30:00", 60);
    expect(result.success).toBe(true);
    expect(result.isOpen).toBe(false);
  });

  it("acepta cita exacta al inicio y fin del tramo", () => {
    const result = checkBusinessHours(DEFAULT_BUSINESS_SCHEDULE, europeMadrid, "2026-08-10T09:00:00", 540);
    expect(result.success).toBe(true);
    expect(result.isOpen).toBe(true);
  });
});
