import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  planAllowsCatalanOnRetell,
  resolveDesiredOrchestrator,
} from "../../src/lib/voiceOrchestrator.js";

const ORIGINAL_ENV = {
  STRIPE_PRICE_INICIO: process.env.STRIPE_PRICE_INICIO,
  STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO,
  STRIPE_PRICE_SCALE: process.env.STRIPE_PRICE_SCALE,
};

beforeEach(() => {
  process.env.STRIPE_PRICE_INICIO = "price_inicio";
  process.env.STRIPE_PRICE_PRO = "price_pro";
  process.env.STRIPE_PRICE_SCALE = "price_scale";
});

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("planAllowsCatalanOnRetell", () => {
  it("permite catalán en Retell para Pro y Scale", () => {
    expect(planAllowsCatalanOnRetell({ stripePriceId: "price_pro" })).toBe(true);
    expect(planAllowsCatalanOnRetell({ stripePriceId: "price_scale" })).toBe(true);
  });

  it("no lo permite en el plan Inicio", () => {
    expect(planAllowsCatalanOnRetell({ stripePriceId: "price_inicio" })).toBe(false);
  });

  it("no lo permite sin priceId ni plan legacy (sin suscripción activa)", () => {
    expect(planAllowsCatalanOnRetell({ stripePriceId: null, plan: null })).toBe(false);
    expect(planAllowsCatalanOnRetell({})).toBe(false);
  });

  it("no lo permite con un priceId que no resuelve a ningún plan conocido", () => {
    expect(planAllowsCatalanOnRetell({ stripePriceId: "price_desconocido" })).toBe(false);
  });

  // Mismo criterio que planFeatures.resolvePlanId: sin suscripción
  // sincronizada manda la columna legacy `plan`. Antes este módulo solo
  // miraba el precio de Stripe y dejaba fuera a esos negocios.
  it("respeta la columna legacy `plan` cuando no hay priceId", () => {
    expect(planAllowsCatalanOnRetell({ stripePriceId: null, plan: "pro" })).toBe(true);
    expect(planAllowsCatalanOnRetell({ stripePriceId: null, plan: "enterprise" })).toBe(true);
    expect(planAllowsCatalanOnRetell({ stripePriceId: null, plan: "basic" })).toBe(false);
  });

  it("el precio de Stripe manda sobre la columna legacy", () => {
    expect(planAllowsCatalanOnRetell({ stripePriceId: "price_inicio", plan: "pro" })).toBe(false);
  });
});

describe("resolveDesiredOrchestrator", () => {
  it("usa Retell cuando catalán está activo y el plan es Pro", () => {
    expect(
      resolveDesiredOrchestrator({
        languages: ["es-ES", "ca-ES"],
        stripePriceId: "price_pro",
      })
    ).toBe("retell");
  });

  it("usa Retell cuando catalán está activo y el plan es Scale", () => {
    expect(
      resolveDesiredOrchestrator({
        languages: ["es-ES", "ca-ES"],
        stripePriceId: "price_scale",
      })
    ).toBe("retell");
  });

  it("usa Telnyx cuando catalán está activo pero el plan es Inicio", () => {
    expect(
      resolveDesiredOrchestrator({
        languages: ["es-ES", "ca-ES"],
        stripePriceId: "price_inicio",
      })
    ).toBe("telnyx");
  });

  it("usa Telnyx cuando catalán no está activo, sea cual sea el plan", () => {
    expect(
      resolveDesiredOrchestrator({
        languages: ["es-ES", "en-GB"],
        stripePriceId: "price_scale",
      })
    ).toBe("telnyx");
  });

  it("usa Telnyx si catalán está activo pero no hay plan (sin suscripción)", () => {
    expect(
      resolveDesiredOrchestrator({
        languages: ["es-ES", "ca-ES"],
        stripePriceId: null,
      })
    ).toBe("telnyx");
  });

  it("usa Retell con catalán y plan legacy Pro sin priceId", () => {
    expect(
      resolveDesiredOrchestrator({
        languages: ["es-ES", "ca-ES"],
        stripePriceId: null,
        plan: "pro",
      })
    ).toBe("retell");
  });
});
