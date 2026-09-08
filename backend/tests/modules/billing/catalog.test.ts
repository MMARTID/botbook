import { describe, expect, it } from "vitest";
import { BILLING_PLANS } from "../../../src/modules/billing/catalog.js";

describe("BILLING_PLANS", () => {
  it("mantiene los precios de minutos extra aprobados", () => {
    expect(BILLING_PLANS.inicio.extraMinuteCents).toBe(45);
    expect(BILLING_PLANS.pro.extraMinuteCents).toBe(40);
    expect(BILLING_PLANS.scale.extraMinuteCents).toBe(35);
  });
});
