import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  featuresParaLaApp,
  getPlanLimits,
  nextPlanId,
  planAllows,
  planesQueIncluyen,
  PlanLimitError,
  resolvePlanId,
} from "../../src/lib/planFeatures.js";

describe("resolvePlanId", () => {
  const originalPrice = process.env.STRIPE_PRICE_SCALE;

  beforeEach(() => {
    process.env.STRIPE_PRICE_SCALE = "price_scale_test";
  });

  afterEach(() => {
    if (originalPrice === undefined) {
      delete process.env.STRIPE_PRICE_SCALE;
    } else {
      process.env.STRIPE_PRICE_SCALE = originalPrice;
    }
  });

  it("el priceId de Stripe manda sobre la columna legacy", () => {
    expect(
      resolvePlanId({ stripePriceId: "price_scale_test", plan: "basic" })
    ).toBe("scale");
  });

  it("sin priceId usa la columna legacy (basic→inicio, enterprise→scale)", () => {
    expect(resolvePlanId({ stripePriceId: null, plan: "basic" })).toBe("inicio");
    expect(resolvePlanId({ stripePriceId: null, plan: "pro" })).toBe("pro");
    expect(resolvePlanId({ stripePriceId: null, plan: "enterprise" })).toBe(
      "scale"
    );
  });

  it("sin ninguna pista asume Inicio — nunca regala features", () => {
    expect(resolvePlanId({ stripePriceId: null, plan: null })).toBe("inicio");
    expect(resolvePlanId({ stripePriceId: "price_desconocido", plan: "raro" })).toBe(
      "inicio"
    );
  });
});

describe("límites y features por plan", () => {
  it("profesionales: 3 en Inicio, 10 en Pro, sin límite en Scale", () => {
    expect(getPlanLimits("inicio").maxProfessionals).toBe(3);
    expect(getPlanLimits("pro").maxProfessionals).toBe(10);
    expect(getPlanLimits("scale").maxProfessionals).toBeNull();
  });

  it("las features de Pro están incluidas en Scale, y Inicio no tiene ninguna", () => {
    expect(getPlanLimits("inicio").features).toHaveLength(0);
    for (const feature of getPlanLimits("pro").features) {
      expect(planAllows("scale", feature)).toBe(true);
    }
    expect(planAllows("pro", "analitica_avanzada")).toBe(false);
    expect(planAllows("pro", "multi_sede")).toBe(false);
    expect(planAllows("scale", "analitica_avanzada")).toBe(true);
  });

  // Decisión del usuario del 2026-10-05: la voz y los idiomas de las voces
  // Ultra, en todos los planes; catalán, euskera y gallego, en Pro y Scale.
  it("las lenguas locales son de Pro y Scale, y el candado lo dice así", () => {
    expect(planAllows("inicio", "lenguas_locales")).toBe(false);
    expect(planAllows("pro", "lenguas_locales")).toBe(true);
    expect(planAllows("scale", "lenguas_locales")).toBe(true);
    expect(planesQueIncluyen("lenguas_locales")).toBe("Pro y Scale");
    expect(planesQueIncluyen("analitica_avanzada")).toBe("Scale");
  });

  it("la app recibe también «voz_idioma» donde hay lenguas locales, para el panel anterior", () => {
    expect(featuresParaLaApp("inicio")).toEqual([]);
    expect(featuresParaLaApp("pro")).toEqual([
      "recordatorios_cita",
      "resumen_semanal",
      "lenguas_locales",
      "voz_idioma",
    ]);
    expect(featuresParaLaApp("scale")).toContain("voz_idioma");
  });

  it("nextPlanId sube de escalón y devuelve null en el más alto", () => {
    expect(nextPlanId("inicio")).toBe("pro");
    expect(nextPlanId("pro")).toBe("scale");
    expect(nextPlanId("scale")).toBeNull();
  });
});

describe("PlanLimitError", () => {
  it("transporta code, planId y limit para que la ruta arme el 403", () => {
    const error = new PlanLimitError({
      code: "PLAN_LIMIT_PROFESSIONALS",
      planId: "inicio",
      limit: 3,
      message: "Tu plan incluye hasta 3 profesionales activos.",
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("PLAN_LIMIT_PROFESSIONALS");
    expect(error.planId).toBe("inicio");
    expect(error.limit).toBe(3);
  });
});
