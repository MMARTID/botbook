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

    expect(prompt).toContain("{{nombre_negocio}}");
    expect(prompt).toContain("{{user_number}}");
    expect(prompt).toContain("{{current_time_{{zona_horaria}} }}");
    expect(prompt).toContain("get_catalog");
    expect(prompt).not.toContain("{{servicios_disponibles}}");
  });

  it("reutiliza la variable nativa del número de quien llama", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
    });

    expect(prompt).toContain("{{user_number}}");
    expect(prompt).not.toContain("telefono_de_quien_llama");
    expect(prompt).not.toContain("fecha_actual");
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

    expect(prompt).toContain("Eres la recepcionista virtual de {{nombre_negocio}}.");
    expect(prompt).toContain("corte, barba o ambos");
  });

  it("incluye los detalles del negocio solo cuando están verificados", () => {
    const conDetalles = buildManagedAgentPrompt({
      businessName: "Barbería Ejemplo",
      businessDetails: "Solo trabaja con cita previa.",
      settings: DEFAULT_AGENT_SETTINGS,
    });
    const sinDetalles = buildManagedAgentPrompt({
      businessName: "Barbería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
    });

    expect(conDetalles).toContain("Solo trabaja con cita previa.");
    expect(sinDetalles).not.toContain("Información del negocio:");
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

  it("consulta el catálogo bajo demanda y reutiliza una alternativa ya comprobada", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
    });

    expect(prompt).toContain("consulta get_catalog una vez");
    expect(prompt).toContain("No repitas check_availability");
    expect(prompt).toContain("suggestedNextSlot");
    expect(prompt).toContain("availabilityToken");
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

  it("añade español a configuraciones guardadas antes de los idiomas sin perder ajustes", () => {
    const parsed = parseAgentSettings({
      version: 1,
      tone: "professional",
      primaryGoal: "customer_service",
      responseStyle: "balanced",
      escalation: "request_callback",
      voiceGender: "masculina",
    });

    expect(parsed.languages).toEqual(["es-ES"]);
    expect(parsed.voiceGender).toBe("masculina");
    expect(parsed.tone).toBe("professional");
  });

  it("rechaza una selección sin español o con idiomas repetidos", () => {
    expect(parseAgentSettings({ ...DEFAULT_AGENT_SETTINGS, languages: ["ca-ES"] })).toEqual(DEFAULT_AGENT_SETTINGS);
    expect(parseAgentSettings({ ...DEFAULT_AGENT_SETTINGS, languages: ["es-ES", "ca-ES", "ca-ES"] })).toEqual(DEFAULT_AGENT_SETTINGS);
  });
});

describe("buildManagedAgentPrompt — idiomas", () => {
  it("conserva la instrucción monolingüe de español por defecto", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
    });

    expect(prompt).toContain("Habla siempre en español de España");
  });

  it("indica saludo español y cambio automático para inglés, francés y catalán", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: {
        ...DEFAULT_AGENT_SETTINGS,
        languages: ["es-ES", "en-GB", "fr-FR", "ca-ES"],
      },
    });

    expect(prompt).toContain("Empieza siempre con el saludo en español de España");
    expect(prompt).toContain("inglés, francés, catalán");
    expect(prompt).toContain("acompaña el cambio sin pedirle que elija uno");
    expect(prompt).not.toContain("Habla siempre en español de España");
  });
});
