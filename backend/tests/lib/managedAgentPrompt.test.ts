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
    // La zona va escrita literalmente, no anidada dentro de la variable:
    // Retell no documenta que resuelva una variable dentro de otra.
    expect(prompt).toContain("{{current_time_Europe/Madrid}}");
    expect(prompt).toContain("get_catalog");
    expect(prompt).not.toContain("{{servicios_disponibles}}");
  });

  it("escribe la zona real del negocio en la hora actual del agente", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
      timezone: "Atlantic/Canary",
    });

    expect(prompt).toContain("{{current_time_Atlantic/Canary}}");
    expect(prompt).not.toContain("{{current_time_Europe/Madrid}}");
  });

  it("cae a Europe/Madrid si la zona del negocio no es válida", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
      timezone: "Marte/Olympus",
    });

    expect(prompt).toContain("{{current_time_Europe/Madrid}}");
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

    expect(prompt).toContain(
      "Eres la recepcionista virtual de {{nombre_negocio}}."
    );
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
    const parsed = parseAgentSettings({
      ...DEFAULT_AGENT_SETTINGS,
      voiceGender: "masculina",
    });

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
    expect(
      parseAgentSettings({ ...DEFAULT_AGENT_SETTINGS, languages: ["ca-ES"] })
    ).toEqual(DEFAULT_AGENT_SETTINGS);
    expect(
      parseAgentSettings({
        ...DEFAULT_AGENT_SETTINGS,
        languages: ["es-ES", "ca-ES", "ca-ES"],
      })
    ).toEqual(DEFAULT_AGENT_SETTINGS);
  });
});

describe("parseAgentSettings — voiceLanguage", () => {
  it("cae a voiceLanguage=es-ES en ajustes guardados antes de este campo", () => {
    const parsed = parseAgentSettings({
      version: 1,
      tone: "warm",
      primaryGoal: "bookings",
      responseStyle: "concise",
      escalation: "take_message",
      voiceGender: "masculina",
      languages: ["es-ES"],
    });

    expect(parsed.voiceLanguage).toBe("es-ES");
  });

  it("respeta un voiceLanguage guardado si está entre los idiomas activados", () => {
    const parsed = parseAgentSettings({
      ...DEFAULT_AGENT_SETTINGS,
      languages: ["es-ES", "en-GB"],
      voiceLanguage: "en-GB",
    });

    expect(parsed.voiceLanguage).toBe("en-GB");
  });

  it("rechaza voiceLanguage fuera de los idiomas activados y cae al fallback completo", () => {
    const parsed = parseAgentSettings({
      ...DEFAULT_AGENT_SETTINGS,
      languages: ["es-ES"],
      voiceLanguage: "fr-FR",
    });

    expect(parsed).toEqual(DEFAULT_AGENT_SETTINGS);
  });
});

describe("buildManagedAgentPrompt — WhatsApp, duración y confirmación única (hallazgos de la llamada real a Barbería, 2026-09-14)", () => {
  it("pregunta por WhatsApp, no por SMS, para la confirmación y el recordatorio", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Barbería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
    });

    expect(prompt).toContain(
      "¿puedo enviarte la confirmación y un recordatorio por WhatsApp a este número?"
    );
    expect(prompt).not.toContain("por SMS a este número");
  });

  it("instruye a no preguntar la duración salvo que supere los 80 minutos o el cliente la pida", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Barbería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
    });

    expect(prompt).toContain("no le preguntes qué duración quiere");
    expect(prompt).toContain("supera los 80 minutos");
  });

  it("instruye a no pedir confirmaciones sueltas de datos individuales", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Barbería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
    });

    expect(prompt).toContain(
      "No pidas confirmaciones sueltas de datos individuales"
    );
  });
});

describe("buildManagedAgentPrompt — WhatsApp al cliente y lista de espera (PR 4)", () => {
  const base = {
    businessName: "Peluquería Ejemplo",
    settings: DEFAULT_AGENT_SETTINGS,
  };

  it("anuncia el WhatsApp de Alhabla solo si el cliente aceptó y book_appointment devuelve mensajeCliente whatsapp", () => {
    const prompt = buildManagedAgentPrompt(base);
    expect(prompt).toContain("un WhatsApp de Alhabla");
    expect(prompt).toContain("mensajeCliente");
    expect(prompt).toContain("no menciones ningún mensaje");
    expect(prompt).not.toContain("Alhabla Reservas");
  });

  it("mantiene la oferta de aviso por WhatsApp por defecto y con listaDeEspera: true", () => {
    for (const prompt of [
      buildManagedAgentPrompt(base),
      buildManagedAgentPrompt({ ...base, listaDeEspera: true }),
    ]) {
      expect(prompt).toContain("te aviso por WhatsApp si se libera esa hora");
      expect(prompt).toContain("notify_when_available con la hora original");
      expect(prompt).not.toContain("no uses notify_when_available");
    }
    // Sin el flag, la salida es byte a byte la de siempre.
    expect(buildManagedAgentPrompt(base)).toBe(
      buildManagedAgentPrompt({ ...base, listaDeEspera: true })
    );
  });

  it("con listaDeEspera: false no promete avisos e instruye a no usar notify_when_available", () => {
    const prompt = buildManagedAgentPrompt({ ...base, listaDeEspera: false });
    expect(prompt).not.toContain("te aviso por WhatsApp");
    expect(prompt).toContain("no uses notify_when_available");
    expect(prompt).toContain("invítale a volver a llamar más adelante");
    // Sin huecos: la línea sustituye a la otra, no la borra.
    expect(prompt).not.toContain("\n\n\n");
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

    expect(prompt).toContain(
      "Empieza siempre con el saludo en español de España"
    );
    expect(prompt).toContain("inglés, francés, catalán");
    expect(prompt).toContain("acompaña el cambio sin pedirle que elija uno");
    expect(prompt).not.toContain("Habla siempre en español de España");
  });
});

// Tres niveles por profesional y servicio (17-09-2026): el prompt es lo que
// convierte la recomendación de la herramienta en conducta al teléfono.
describe("buildManagedAgentPrompt — profesionales y especialidades", () => {
  const prompt = buildManagedAgentPrompt({
    businessName: "Peluquería Ejemplo",
    settings: DEFAULT_AGENT_SETTINGS,
  });

  it("no pregunta con quién quiere la cita: respeta el nombre si lo dice y deja la asignación al sistema", () => {
    expect(prompt).toContain("No preguntes con quién quiere la cita");
    expect(prompt).not.toContain("preferencia de profesional");
    expect(prompt).toContain(
      "solo si el cliente ha pedido a alguien por su nombre"
    );
  });

  it("explica la recomendación única y cómo reservar si el cliente insiste", () => {
    expect(prompt).toContain("## Profesionales");
    expect(prompt).toContain("propón UNA sola vez");
    expect(prompt).toContain("professionalConfirmed: true");
    expect(prompt).toContain("PROFESSIONAL_CONFIRMATION_REQUIRED");
  });

  it("prohíbe decir que a alguien no se le da bien un servicio o mencionar niveles", () => {
    expect(prompt).toContain(
      "Nunca digas ni insinúes que un profesional no hace un servicio"
    );
    expect(prompt).toContain("Nunca menciones niveles");
  });

  it("deja decir en positivo con quién queda la cita cuando es especialista", () => {
    expect(prompt).toContain("assignedProfessional");
    expect(prompt).toContain("isSpecialist");
  });
});
