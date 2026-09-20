import { describe, it, expect } from "vitest";
import { isBusinessType, normalizeBusinessType, detectBusinessTypeFromPlaceTypes } from "@/lib/business-type";

describe("isBusinessType", () => {
  it("acepta los tipos válidos", () => {
    expect(isBusinessType("peluqueria")).toBe(true);
    expect(isBusinessType("other")).toBe(true);
  });

  it("rechaza valores desconocidos o no-string", () => {
    expect(isBusinessType("spa")).toBe(false);
    expect(isBusinessType(123)).toBe(false);
    expect(isBusinessType(undefined)).toBe(false);
  });
});

describe("normalizeBusinessType", () => {
  it("devuelve el mismo valor si ya es un BusinessType válido", () => {
    expect(normalizeBusinessType("barberia")).toBe("barberia");
  });

  it("traduce un slug de nicho de landing a su BusinessType", () => {
    expect(normalizeBusinessType("centro-de-estetica")).toBe("centro-de-estetica");
  });

  it("cae a 'other' con cualquier valor no reconocido", () => {
    expect(normalizeBusinessType("spa-de-lujo")).toBe("other");
    expect(normalizeBusinessType(null)).toBe("other");
    expect(normalizeBusinessType(undefined)).toBe("other");
  });
});

describe("detectBusinessTypeFromPlaceTypes", () => {
  it("detecta barbería por palabra clave de Google Places", () => {
    expect(detectBusinessTypeFromPlaceTypes(["barber_shop", "point_of_interest"])).toBe("barberia");
  });

  it("detecta salón de uñas", () => {
    expect(detectBusinessTypeFromPlaceTypes(["nail_salon"])).toBe("salon-de-unas");
  });

  it("la comparación ignora mayúsculas/minúsculas", () => {
    expect(detectBusinessTypeFromPlaceTypes(["BARBER_SHOP"])).toBe("barberia");
  });

  it("cae a 'other' si ningún tipo coincide", () => {
    expect(detectBusinessTypeFromPlaceTypes(["restaurant", "food"])).toBe("other");
  });

  it("cae a 'other' con null/undefined/no-array", () => {
    expect(detectBusinessTypeFromPlaceTypes(null)).toBe("other");
    expect(detectBusinessTypeFromPlaceTypes(undefined)).toBe("other");
  });
});
