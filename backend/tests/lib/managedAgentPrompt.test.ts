import { describe, it, expect } from "vitest";
import { buildManagedAgentPrompt, DEFAULT_AGENT_SETTINGS } from "../../src/lib/managedAgentPrompt.js";

describe("buildManagedAgentPrompt", () => {
  it("incluye los placeholders de las variables dinámicas de Retell, no el dato horneado", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
    });

    expect(prompt).toContain("{{servicios_disponibles}}");
    expect(prompt).toContain("{{empleados}}");
    expect(prompt).toContain("{{horario_semanal}}");
  });

  it("no incluye ningún id ni nombre de servicio/empleado horneado en el texto", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
    });

    expect(prompt).not.toMatch(/HORARIO_ESTRUCTURADO_DEL_NEGOCIO/);
    expect(prompt).not.toContain('"schedule"');
  });

  it("incluye el nombre del negocio y las instrucciones de nicho", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Barbería Ejemplo",
      businessType: "barberia",
      settings: DEFAULT_AGENT_SETTINGS,
    });

    expect(prompt).toContain("Eres la recepcionista virtual de Barbería Ejemplo.");
    expect(prompt).toContain("corte, arreglo de barba o ambos");
  });

  it("incluye las restricciones de reserva cuando están configuradas", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Clínica Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
      minAdvanceBookingMinutes: 120,
      maxAppointmentDurationMinutes: 90,
    });

    expect(prompt).toContain("2 horas");
    expect(prompt).toContain("90 minutos");
  });
});
