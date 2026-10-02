import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BILLING_PLANS,
  getAllFounderPriceIds,
  getFounderPriceId,
  getPlanByPriceId,
} from "../../../src/modules/billing/catalog.js";

describe("BILLING_PLANS", () => {
  it("mantiene los precios de minutos extra aprobados", () => {
    expect(BILLING_PLANS.inicio.extraMinuteCents).toBe(45);
    expect(BILLING_PLANS.pro.extraMinuteCents).toBe(40);
    expect(BILLING_PLANS.scale.extraMinuteCents).toBe(35);
  });
});

// Subida de precios 2026-10: los negocios que contrataron al precio de
// fundador tienen que seguir resolviendo a su plan aunque STRIPE_PRICE_INICIO
// ya apunte al precio nuevo — si no, getBillingSummary les devolvería
// plan/minutos/features a null.
describe("getPlanByPriceId con precio de fundador", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.STRIPE_PRICE_INICIO = "price_inicio_nuevo";
    process.env.STRIPE_PRICE_INICIO_FOUNDER = "price_inicio_fundador";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("reconoce el precio nuevo", () => {
    expect(getPlanByPriceId("price_inicio_nuevo")?.id).toBe("inicio");
  });

  it("sigue reconociendo el precio de fundador", () => {
    expect(getPlanByPriceId("price_inicio_fundador")?.id).toBe("inicio");
  });

  it("no reconoce un precio que no es de ningún plan", () => {
    expect(getPlanByPriceId("price_de_otra_cosa")).toBeUndefined();
  });
});

describe("precio de fundador", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("getFounderPriceId devuelve undefined si no hay precio de fundador configurado", () => {
    delete process.env.STRIPE_PRICE_INICIO_FOUNDER;
    expect(getFounderPriceId("inicio")).toBeUndefined();
  });

  it("getAllFounderPriceIds solo incluye los planes con precio de fundador configurado", () => {
    process.env.STRIPE_PRICE_INICIO_FOUNDER = "price_fundador_inicio";
    delete process.env.STRIPE_PRICE_PRO_FOUNDER;
    delete process.env.STRIPE_PRICE_SCALE_FOUNDER;

    expect(getAllFounderPriceIds()).toEqual(["price_fundador_inicio"]);
  });
});
