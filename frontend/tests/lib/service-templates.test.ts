import { describe, it, expect } from "vitest";
import { getServiceTemplate, SERVICE_TEMPLATES } from "@/lib/service-templates";

describe("getServiceTemplate", () => {
  it("devuelve la plantilla del tipo de negocio pedido", () => {
    expect(getServiceTemplate("barberia")).toBe(SERVICE_TEMPLATES.barberia);
  });

  it("cada plantilla tiene al menos un servicio con nombre y duración", () => {
    for (const template of Object.values(SERVICE_TEMPLATES)) {
      expect(template.length).toBeGreaterThan(0);
      for (const service of template) {
        expect(service.name.length).toBeGreaterThan(0);
        expect(service.durationMinutes).toBeGreaterThan(0);
      }
    }
  });
});
