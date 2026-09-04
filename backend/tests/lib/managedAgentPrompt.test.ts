import { describe, it, expect } from "vitest";
import {
  buildManagedAgentPrompt,
  parseAgentSettings,
  DEFAULT_AGENT_SETTINGS,
} from "../../src/lib/managedAgentPrompt.js";

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

describe("parseAgentSettings — voiceGender", () => {
  // Regresión: voiceGender se añadió después de que hubiera negocios reales
  // con agentSettings ya guardados. Sin el .default() en el schema, esos
  // valores existentes (sin la clave voiceGender) fallarían el parseo
  // completo y perderían también tono/objetivo/estilo/escalado ya
  // personalizados, cayendo al fallback genérico DEFAULT_AGENT_SETTINGS.
  it("cae a voiceGender=femenina sin perder el resto de ajustes ya guardados", () => {
    const settingsGuardadosAntesDelCampoNuevo = {
      version: 1,
      tone: "direct",
      primaryGoal: "lead_capture",
      responseStyle: "balanced",
      escalation: "request_callback",
    };

    const parsed = parseAgentSettings(settingsGuardadosAntesDelCampoNuevo);

    expect(parsed.voiceGender).toBe("femenina");
    expect(parsed.tone).toBe("direct");
    expect(parsed.primaryGoal).toBe("lead_capture");
    expect(parsed.responseStyle).toBe("balanced");
    expect(parsed.escalation).toBe("request_callback");
  });

  it("respeta voiceGender=masculina cuando ya está guardado", () => {
    const parsed = parseAgentSettings({ ...DEFAULT_AGENT_SETTINGS, voiceGender: "masculina" });

    expect(parsed.voiceGender).toBe("masculina");
  });
});
