import { describe, it, expect } from "vitest";
import {
  esLineaDeClientesEspanola,
  formatearTelefonoLegible,
  isValidE164Phone,
} from "../../src/lib/phone.js";

describe("formatearTelefonoLegible", () => {
  it("+34930454394 → +34 930 454 394; otros tal cual", () => {
    expect(formatearTelefonoLegible("+34930454394")).toBe("+34 930 454 394");
    expect(formatearTelefonoLegible("+34692138456")).toBe("+34 692 138 456");
    expect(formatearTelefonoLegible("+33612345678")).toBe("+33612345678");
    expect(formatearTelefonoLegible("+3493045439")).toBe("+3493045439");
    expect(formatearTelefonoLegible("TEMP-abc")).toBe("TEMP-abc");
  });
});

describe("isValidE164Phone", () => {
  it("acepta E.164 y rechaza el resto", () => {
    expect(isValidE164Phone("+34600123456")).toBe(true);
    expect(isValidE164Phone("600123456")).toBe(false);
    expect(isValidE164Phone("+34 600 123 456")).toBe(false);
  });
});

describe("esLineaDeClientesEspanola", () => {
  it("acepta móviles (6xx, 71x-79x) y fijos geográficos (8xx/9xx, segundo dígito 1-8)", () => {
    expect(esLineaDeClientesEspanola("+34600123456")).toBe(true);
    expect(esLineaDeClientesEspanola("+34712345678")).toBe(true);
    expect(esLineaDeClientesEspanola("+34799999999")).toBe(true);
    expect(esLineaDeClientesEspanola("+34911222333")).toBe(true);
    expect(esLineaDeClientesEspanola("+34981234567")).toBe(true);
    expect(esLineaDeClientesEspanola("+34810123456")).toBe(true);
    expect(esLineaDeClientesEspanola("+34881234567")).toBe(true);
  });

  it("rechaza tarificación adicional, gratuitos, personales, nómadas e internacionales", () => {
    expect(esLineaDeClientesEspanola("+34806123456")).toBe(false);
    expect(esLineaDeClientesEspanola("+34803123456")).toBe(false);
    expect(esLineaDeClientesEspanola("+34905123456")).toBe(false);
    expect(esLineaDeClientesEspanola("+34907123456")).toBe(false);
    expect(esLineaDeClientesEspanola("+34902123456")).toBe(false);
    expect(esLineaDeClientesEspanola("+34900123456")).toBe(false);
    expect(esLineaDeClientesEspanola("+34800123456")).toBe(false);
    expect(esLineaDeClientesEspanola("+34700123456")).toBe(false);
    expect(esLineaDeClientesEspanola("+34512345678")).toBe(false);
    expect(esLineaDeClientesEspanola("+34990123456")).toBe(false);
    expect(esLineaDeClientesEspanola("+447911123456")).toBe(false);
    expect(esLineaDeClientesEspanola("+33612345678")).toBe(false);
    expect(esLineaDeClientesEspanola("+3460012345")).toBe(false);
    expect(esLineaDeClientesEspanola("+346001234567")).toBe(false);
    expect(esLineaDeClientesEspanola("600123456")).toBe(false);
    expect(esLineaDeClientesEspanola("TEMP-abc")).toBe(false);
  });
});
