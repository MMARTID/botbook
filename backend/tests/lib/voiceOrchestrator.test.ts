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
    expect(planAllowsCatalanOnRetell("price_pro")).toBe(true);
    expect(planAllowsCatalanOnRetell("price_scale")).toBe(true);
  });

  it("no lo permite en el plan Inicio", () => {
    expect(planAllowsCatalanOnRetell("price_inicio")).toBe(false);
  });

  it("no lo permite sin priceId (sin suscripción activa)", () => {
    expect(planAllowsCatalanOnRetell(null)).toBe(false);
    expect(planAllowsCatalanOnRetell(undefined)).toBe(false);
  });

  it("no lo permite con un priceId que no resuelve a ningún plan conocido", () => {
    expect(planAllowsCatalanOnRetell("price_desconocido")).toBe(false);
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
});
