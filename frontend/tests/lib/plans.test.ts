import { describe, expect, it } from "vitest";
import { plans } from "../../src/lib/plans";

describe("planes", () => {
  it("muestra los precios de minutos extra aprobados", () => {
    expect(plans.find((plan) => plan.id === "inicio")?.extraPerMinute).toBe(0.45);
    expect(plans.find((plan) => plan.id === "pro")?.extraPerMinute).toBe(0.4);
    expect(plans.find((plan) => plan.id === "scale")?.extraPerMinute).toBe(0.35);
  });
});
