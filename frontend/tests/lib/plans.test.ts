import { describe, it, expect } from "vitest";
import { plans, starterPlan, formatPlanPrice, formatExtraMinute, formatIncludedMinutes } from "@/lib/plans";

describe("plans", () => {
  it("starterPlan es el primer plan de la lista (inicio)", () => {
    expect(starterPlan.id).toBe("inicio");
    expect(starterPlan).toBe(plans[0]);
  });

  it("solo un plan está marcado como featured", () => {
    expect(plans.filter((plan) => plan.featured)).toHaveLength(1);
  });
});

describe("formatPlanPrice", () => {
  it("añade el símbolo de euro sin decimales", () => {
    expect(formatPlanPrice(149)).toBe("149€");
  });
});

describe("formatExtraMinute", () => {
  it("usa coma decimal y añade la etiqueta por minuto", () => {
    expect(formatExtraMinute(0.6)).toBe("0,60€/min adicional");
  });

  it("redondea a dos decimales", () => {
    expect(formatExtraMinute(0.456)).toBe("0,46€/min adicional");
  });
});

describe("formatIncludedMinutes", () => {
  it("formatea miles con separador español", () => {
    expect(formatIncludedMinutes(1000)).toBe("1000");
    expect(formatIncludedMinutes(100)).toBe("100");
  });
});
