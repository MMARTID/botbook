import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  normalizeRoiEstimate,
  saveRoiEstimate,
  getSavedRoiEstimate,
  activateRoiContext,
  getActiveRoiContext,
  calculateRoiImpact,
  calculatePlanValueContrast,
} from "@/lib/roi-context";

describe("normalizeRoiEstimate", () => {
  it("acepta un estimate válido y le pone version/updatedAt", () => {
    const result = normalizeRoiEstimate({ averageTicket: 40, missedAppointmentsPerWeek: 5 });
    expect(result).toMatchObject({ version: 1, averageTicket: 40, missedAppointmentsPerWeek: 5 });
    expect(typeof result?.updatedAt).toBe("number");
  });

  it("recorta (clamp) valores fuera de rango en vez de rechazarlos", () => {
    const result = normalizeRoiEstimate({ averageTicket: 9999, missedAppointmentsPerWeek: -5 });
    expect(result?.averageTicket).toBe(200); // ROI_LIMITS.ticket.max
    expect(result?.missedAppointmentsPerWeek).toBe(1); // ROI_LIMITS.appointments.min
  });

  it("redondea valores no enteros", () => {
    const result = normalizeRoiEstimate({ averageTicket: 40.6, missedAppointmentsPerWeek: 5 });
    expect(result?.averageTicket).toBe(41);
  });

  it("devuelve null si falta un campo o no es un objeto", () => {
    expect(normalizeRoiEstimate(null)).toBeNull();
    expect(normalizeRoiEstimate("42")).toBeNull();
    expect(normalizeRoiEstimate({ averageTicket: 40 })).toBeNull();
  });

  it("devuelve null si algún valor no es numérico", () => {
    expect(normalizeRoiEstimate({ averageTicket: "no-numero", missedAppointmentsPerWeek: 5 })).toBeNull();
  });
});

describe("persistencia en localStorage (saveRoiEstimate / getSavedRoiEstimate)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("guarda y recupera un estimate válido", () => {
    saveRoiEstimate({ averageTicket: 50, missedAppointmentsPerWeek: 4 });
    const saved = getSavedRoiEstimate();
    expect(saved).toMatchObject({ averageTicket: 50, missedAppointmentsPerWeek: 4 });
  });

  it("devuelve null si no hay nada guardado", () => {
    expect(getSavedRoiEstimate()).toBeNull();
  });

  it("no lanza si localStorage deniega el acceso (modo privado/hardened)", () => {
    const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => saveRoiEstimate({ averageTicket: 50, missedAppointmentsPerWeek: 4 })).not.toThrow();
    spy.mockRestore();
  });
});

describe("contexto activo con expiración (activateRoiContext / getActiveRoiContext)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.useRealTimers();
  });

  it("no hay contexto activo si nunca se activó", () => {
    expect(getActiveRoiContext()).toBeNull();
  });

  it("devuelve el contexto justo después de activarlo", () => {
    activateRoiContext({ averageTicket: 60, missedAppointmentsPerWeek: 2 });
    expect(getActiveRoiContext()).toMatchObject({ averageTicket: 60, missedAppointmentsPerWeek: 2 });
  });

  it("el contexto caduca pasada 1 hora y se limpia de sessionStorage", () => {
    vi.useFakeTimers();
    activateRoiContext({ averageTicket: 60, missedAppointmentsPerWeek: 2 });
    expect(getActiveRoiContext()).not.toBeNull();

    vi.advanceTimersByTime(60 * 60 * 1000 + 1000);

    expect(getActiveRoiContext()).toBeNull();
    expect(window.sessionStorage.getItem("alhabla_roi_context_v1")).toBeNull();
    vi.useRealTimers();
  });
});

describe("calculateRoiImpact", () => {
  it("multiplica citas semanales por 4 semanas y por el ticket medio", () => {
    const impact = calculateRoiImpact({ averageTicket: 50, missedAppointmentsPerWeek: 3 });
    expect(impact.monthlyAppointments).toBe(12);
    expect(impact.monthlyOpportunity).toBe(600);
    expect(impact.annualOpportunity).toBe(7200);
  });
});

describe("calculatePlanValueContrast", () => {
  it("calcula el múltiplo de valor y si la oportunidad cubre el plan", () => {
    const contrast = calculatePlanValueContrast(
      { averageTicket: 50, missedAppointmentsPerWeek: 3 },
      { price: 149 }
    );

    expect(contrast.monthlyOpportunity).toBe(600);
    expect(contrast.monthlyPlanCost).toBe(149);
    expect(contrast.monthlyDifference).toBe(451);
    expect(contrast.valueMultiple).toBeCloseTo(600 / 149);
    expect(contrast.appointmentsToCoverPlan).toBe(3); // ceil(149/50)
    expect(contrast.opportunityCoversPlan).toBe(true);
  });

  it("opportunityCoversPlan es false si la pérdida mensual no cubre el plan", () => {
    const contrast = calculatePlanValueContrast(
      { averageTicket: 10, missedAppointmentsPerWeek: 1 },
      { price: 149 }
    );

    expect(contrast.opportunityCoversPlan).toBe(false);
  });
});
