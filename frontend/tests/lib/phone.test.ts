import { describe, it, expect } from "vitest";
import {
  E164_PHONE_REGEX,
  esFijoEspanol,
  esMovilEspanol,
  formatearMovil,
  inferirTipoDeLinea,
  normalizarMovil,
} from "@/lib/phone";

describe("normalizarMovil", () => {
  it.each([
    ["600 123 456", "+34600123456"],
    ["600123456", "+34600123456"],
    ["+34 600 123 456", "+34600123456"],
    ["0034600123456", "+34600123456"],
    ["34600123456", "+34600123456"],
    ["+33 6 12 34 56 78", "+33612345678"],
    ["600-123-456", "+34600123456"],
    ["(600) 123.456", "+34600123456"],
    ["  +34600123456  ", "+34600123456"],
  ])("convierte %s en %s", (entrada, esperado) => {
    expect(normalizarMovil(entrada)).toBe(esperado);
  });

  it.each([["12345"], [""], ["abc"], ["+0034600123456"], ["600 123 45"]])(
    "rechaza %s",
    (entrada) => {
      expect(normalizarMovil(entrada)).toBeNull();
    }
  );

  it("solo devuelve números que cumplen la expresión del backend", () => {
    for (const entrada of [
      "600 123 456",
      "+33 6 12 34 56 78",
      "0034600123456",
    ]) {
      expect(normalizarMovil(entrada)).toMatch(E164_PHONE_REGEX);
    }
  });
});

describe("esFijoEspanol", () => {
  it("reconoce los fijos españoles (8xx y 9xx)", () => {
    expect(esFijoEspanol("+34930453218")).toBe(true);
    expect(esFijoEspanol("+34810000000")).toBe(true);
  });

  it("no marca móviles ni números de otros países", () => {
    expect(esFijoEspanol("+34600123456")).toBe(false);
    expect(esFijoEspanol("+34700123456")).toBe(false);
    expect(esFijoEspanol("+33912345678")).toBe(false);
  });
});

describe("formatearMovil", () => {
  it("agrupa un número español de tres en tres", () => {
    expect(formatearMovil("+34930453218")).toBe("+34 930 453 218");
    expect(formatearMovil("+34600123456")).toBe("+34 600 123 456");
  });

  it("agrupa otros países tras el prefijo sin romper", () => {
    expect(formatearMovil("+33612345678")).toBe("+33 612 345 678");
    expect(formatearMovil("+391234567890")).toBe("+39 123 456 789 0");
  });

  it("devuelve tal cual lo que no es E.164", () => {
    expect(formatearMovil("600123456")).toBe("600123456");
  });
});

describe("esMovilEspanol", () => {
  it("reconoce los 6xx y 7xx españoles y nada más", () => {
    expect(esMovilEspanol("+34600123456")).toBe(true);
    expect(esMovilEspanol("+34700123456")).toBe(true);
    expect(esMovilEspanol("+34930453218")).toBe(false);
    expect(esMovilEspanol("+33612345678")).toBe(false);
  });
});

describe("inferirTipoDeLinea", () => {
  it("propone «fijo» con un fijo español y «móvil de trabajo» con un móvil español", () => {
    expect(inferirTipoDeLinea("+34 930 111 222")).toBe("fijo");
    expect(inferirTipoDeLinea("600 123 456")).toBe("movil_trabajo");
  });

  it("no propone nada sin teléfono, con uno inválido o de otro país", () => {
    expect(inferirTipoDeLinea(null)).toBeNull();
    expect(inferirTipoDeLinea(undefined)).toBeNull();
    expect(inferirTipoDeLinea("")).toBeNull();
    expect(inferirTipoDeLinea("12345")).toBeNull();
    expect(inferirTipoDeLinea("+33 6 12 34 56 78")).toBeNull();
  });
});
