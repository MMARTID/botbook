import { describe, it, expect, beforeEach } from "vitest";
import { isPlanId, savePendingPlan, getPendingPlan, consumePendingPlan, hasAuthToken } from "@/lib/billing-navigation";

describe("isPlanId", () => {
  it("acepta los 3 ids de plan válidos", () => {
    expect(isPlanId("inicio")).toBe(true);
    expect(isPlanId("pro")).toBe(true);
    expect(isPlanId("scale")).toBe(true);
  });

  it("rechaza null y valores desconocidos", () => {
    expect(isPlanId(null)).toBe(false);
    expect(isPlanId("premium")).toBe(false);
    expect(isPlanId("")).toBe(false);
  });
});

describe("pending plan (localStorage)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("guarda y recupera el plan pendiente", () => {
    savePendingPlan("pro");
    expect(getPendingPlan()).toBe("pro");
  });

  it("devuelve null si no hay plan pendiente guardado", () => {
    expect(getPendingPlan()).toBeNull();
  });

  it("consumePendingPlan lo devuelve y lo borra", () => {
    savePendingPlan("scale");
    expect(consumePendingPlan()).toBe("scale");
    expect(getPendingPlan()).toBeNull();
  });
});

describe("hasAuthToken", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("es false sin ningún token guardado", () => {
    expect(hasAuthToken()).toBe(false);
  });

  it("es true con alhabla_token", () => {
    window.localStorage.setItem("alhabla_token", "jwt_123");
    expect(hasAuthToken()).toBe(true);
  });

  it("también reconoce las claves legacy token/jwt", () => {
    window.localStorage.setItem("token", "legacy_jwt");
    expect(hasAuthToken()).toBe(true);
  });
});
