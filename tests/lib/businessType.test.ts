import { describe, it, expect } from "vitest";
import {
  detectBusinessTypeFromPlaceTypes,
  isBusinessType,
  normalizeBusinessType,
} from "../../src/lib/businessType.js";

describe("businessType", () => {
  describe("isBusinessType", () => {
    it("acepta valores válidos", () => {
      expect(isBusinessType("peluqueria")).toBe(true);
      expect(isBusinessType("other")).toBe(true);
    });

    it("rechaza valores inválidos", () => {
      expect(isBusinessType("invalid")).toBe(false);
      expect(isBusinessType(null)).toBe(false);
      expect(isBusinessType(123)).toBe(false);
    });
  });

  describe("normalizeBusinessType", () => {
    it("normaliza slugs de landing", () => {
      expect(normalizeBusinessType("peluqueria")).toBe("peluqueria");
      expect(normalizeBusinessType("centro-de-estetica")).toBe("centro-de-estetica");
    });

    it("devuelve other para valores desconocidos", () => {
      expect(normalizeBusinessType("unknown")).toBe("other");
    });
  });

  describe("detectBusinessTypeFromPlaceTypes", () => {
    it("detecta fisioterapia", () => {
      expect(
        detectBusinessTypeFromPlaceTypes([
          "physiotherapist",
          "health",
          "point_of_interest",
          "establishment",
        ])
      ).toBe("fisioterapia");
    });

    it("detecta peluquería", () => {
      expect(
        detectBusinessTypeFromPlaceTypes([
          "hair_care",
          "point_of_interest",
          "establishment",
        ])
      ).toBe("peluqueria");
    });

    it("detecta barbería", () => {
      expect(
        detectBusinessTypeFromPlaceTypes(["barber_shop", "establishment"])
      ).toBe("barberia");
    });

    it("detecta centro de estética", () => {
      expect(
        detectBusinessTypeFromPlaceTypes(["beauty_salon", "spa", "establishment"])
      ).toBe("centro-de-estetica");
    });

    it("detecta salón de uñas", () => {
      expect(
        detectBusinessTypeFromPlaceTypes(["nail_salon", "establishment"])
      ).toBe("salon-de-unas");
    });

    it("devuelve other cuando no hay coincidencia", () => {
      expect(
        detectBusinessTypeFromPlaceTypes([
          "restaurant",
          "point_of_interest",
          "establishment",
        ])
      ).toBe("other");
    });

    it("devuelve other para arrays vacíos o nulos", () => {
      expect(detectBusinessTypeFromPlaceTypes([])).toBe("other");
      expect(detectBusinessTypeFromPlaceTypes(null)).toBe("other");
      expect(detectBusinessTypeFromPlaceTypes(undefined)).toBe("other");
    });
  });
});
