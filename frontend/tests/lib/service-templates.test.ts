import { describe, it, expect } from "vitest";
import {
  getServiceTemplate,
  getServiceTemplateCategories,
  SERVICE_TEMPLATE_CATEGORIES,
} from "@/lib/service-templates";
import { BUSINESS_TYPES } from "@/lib/business-type";

describe("getServiceTemplateCategories", () => {
  it("devuelve las categorías del tipo de negocio pedido", () => {
    expect(getServiceTemplateCategories("barberia")).toBe(
      SERVICE_TEMPLATE_CATEGORIES.barberia
    );
  });

  it("cada tipo de negocio tiene al menos una categoría, y cada categoría al menos un servicio con nombre y duración", () => {
    for (const businessType of BUSINESS_TYPES) {
      const categories = SERVICE_TEMPLATE_CATEGORIES[businessType];
      expect(categories.length).toBeGreaterThan(0);
      for (const category of categories) {
        expect(category.category.length).toBeGreaterThan(0);
        expect(category.services.length).toBeGreaterThan(0);
        for (const service of category.services) {
          expect(service.name.length).toBeGreaterThan(0);
          expect(service.durationMinutes).toBeGreaterThan(0);
        }
      }
    }
  });

  it("cada tipo de negocio ofrece al menos 4 servicios en total, para poder cumplir el mínimo del onboarding", () => {
    for (const businessType of BUSINESS_TYPES) {
      const total = getServiceTemplate(businessType).length;
      expect(total).toBeGreaterThanOrEqual(4);
    }
  });

  it("no repite el mismo nombre de servicio en dos categorías del mismo negocio", () => {
    for (const businessType of BUSINESS_TYPES) {
      const names = getServiceTemplate(businessType).map((service) => service.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe("getServiceTemplate", () => {
  it("aplana todas las categorías de un tipo de negocio en una sola lista", () => {
    const flat = getServiceTemplate("barberia");
    const fromCategories = SERVICE_TEMPLATE_CATEGORIES.barberia.flatMap(
      (category) => category.services
    );

    expect(flat).toEqual(fromCategories);
  });
});
