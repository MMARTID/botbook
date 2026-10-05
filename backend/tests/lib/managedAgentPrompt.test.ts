import { describe, it, expect } from "vitest";
import {
  AgentSettingsSchema,
  buildManagedAgentPrompt,
  parseAgentSettings,
  DEFAULT_AGENT_SETTINGS,
} from "../../src/lib/managedAgentPrompt.js";
import { idiomasQueHabla } from "../../src/lib/idiomas/catalogo.js";

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

    expect(conDetalles).toContain(
      "## Información del negocio\nSolo trabaja con cita previa."
    );
    expect(sinDetalles).not.toContain("## Información del negocio");
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

  // Desde el 2026-10-05, con los idiomas del principal (antes, solo
  // español).
  it("a configuraciones guardadas antes de los idiomas les da los del español sin perder ajustes", () => {
    const parsed = parseAgentSettings({
      version: 1,
      tone: "professional",
      primaryGoal: "customer_service",
      responseStyle: "balanced",
      escalation: "request_callback",
      voiceGender: "masculina",
    });

    expect(parsed.languages).toEqual(idiomasQueHabla("es-ES"));
    expect(parsed.voiceGender).toBe("masculina");
    expect(parsed.tone).toBe("professional");
  });

  it("corrige una selección sin español, repetida o con un idioma retirado sin perder el resto", () => {
    expect(
      parseAgentSettings({
        ...DEFAULT_AGENT_SETTINGS,
        tone: "direct",
        languages: ["ca-ES"],
      })
    ).toEqual({
      ...DEFAULT_AGENT_SETTINGS,
      tone: "direct",
      // Una cooficial guardada con principal español (reglas anteriores):
      // atiende en ella, como hacía.
      languages: idiomasQueHabla("ca-ES"),
      voiceLanguage: "ca-ES",
    });
    expect(
      parseAgentSettings({
        ...DEFAULT_AGENT_SETTINGS,
        escalation: "request_callback",
        languages: ["es-ES", "xx-XX", "en-GB", "en-GB"],
        voiceLanguage: "en-GB",
      })
    ).toEqual({
      ...DEFAULT_AGENT_SETTINGS,
      escalation: "request_callback",
      languages: idiomasQueHabla("en-GB"),
      voiceLanguage: "en-GB",
    });
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

  // Hasta el 2026-10-05 se rechazaba y caía al fallback completo; ahora el
  // principal manda y los idiomas salen de él.
  it("un voiceLanguage que no está entre los languages guardados manda", () => {
    const parsed = parseAgentSettings({
      ...DEFAULT_AGENT_SETTINGS,
      tone: "direct",
      languages: ["es-ES"],
      voiceLanguage: "fr-FR",
    });

    expect(parsed).toEqual({
      ...DEFAULT_AGENT_SETTINGS,
      tone: "direct",
      languages: idiomasQueHabla("fr-FR"),
      voiceLanguage: "fr-FR",
    });
  });
});

describe("AgentSettings — la voz elegida", () => {
  const CATALAN = {
    ...DEFAULT_AGENT_SETTINGS,
    languages: ["es-ES", "ca-ES"],
    voiceLanguage: "ca-ES",
  };

  it("se guarda si atiende, con el género de la voz", () => {
    const guardado = AgentSettingsSchema.parse({
      ...CATALAN,
      voiceGender: "femenina",
      voz: "Soniox.tts-rt-v2.Sergio",
    });

    expect(guardado.voz).toBe("Soniox.tts-rt-v2.Sergio");
    expect(guardado.voiceGender).toBe("masculina");
  });

  it("se olvida si no atiende: de otro idioma principal", () => {
    expect(
      AgentSettingsSchema.parse({
        ...DEFAULT_AGENT_SETTINGS,
        voz: "Soniox.tts-rt-v2.Sergio",
      })
    ).not.toHaveProperty("voz");
  });

  it("rechaza una voz que no es del catálogo", () => {
    expect(
      AgentSettingsSchema.safeParse({
        ...DEFAULT_AGENT_SETTINGS,
        voz: "Telnyx.Ultra.inventada",
      }).success
    ).toBe(false);
  });

  it("parseAgentSettings la conserva y descarta una desconocida sin tocar el resto", () => {
    expect(
      parseAgentSettings({ ...CATALAN, voz: "Soniox.tts-rt-v2.Sergio" })
    ).toMatchObject({
      voz: "Soniox.tts-rt-v2.Sergio",
      voiceGender: "masculina",
    });

    // También las de Azure y MiniMax, retiradas del catálogo el 2026-10-05.
    const conDesconocida = parseAgentSettings({
      ...CATALAN,
      tone: "direct",
      voz: "Azure.ca-ES-JoanaNeural",
    });
    expect(conDesconocida).not.toHaveProperty("voz");
    expect(conDesconocida).toMatchObject({
      tone: "direct",
      voiceLanguage: "ca-ES",
    });
  });
});

describe("AgentSettings — la voz elegida entre las de la familia (2026-10-05)", () => {
  const LARA = "Telnyx.Ultra.85b356c1-c638-404d-b986-f54a53d957d6";

  it("guarda una Ultra de España que no es la de por defecto, con su género", () => {
    const guardado = AgentSettingsSchema.parse({
      ...DEFAULT_AGENT_SETTINGS,
      voiceGender: "masculina",
      voz: LARA,
    });

    expect(guardado.voz).toBe(LARA);
    expect(guardado.voiceGender).toBe("femenina");
  });

  it("la olvida al pasar al catalán de principal (atienden Marta o Sergio) sin tocar el resto", () => {
    const guardado = AgentSettingsSchema.parse({
      ...DEFAULT_AGENT_SETTINGS,
      tone: "direct",
      voiceLanguage: "ca-ES",
      voz: LARA,
    });

    expect(guardado).not.toHaveProperty("voz");
    expect(guardado).toMatchObject({
      tone: "direct",
      languages: idiomasQueHabla("ca-ES"),
      voiceLanguage: "ca-ES",
    });
  });

  it("rechaza una id Ultra que no está en el catálogo", () => {
    expect(
      AgentSettingsSchema.safeParse({
        ...DEFAULT_AGENT_SETTINGS,
        voz: "Telnyx.Ultra.00000000-0000-0000-0000-000000000000",
      }).success
    ).toBe(false);
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

// Desde el 2026-10-05 habla siempre los siete de ULTRA_HABLA y, con un
// principal cooficial, también él (antes, solo los que activaba el dueño).
describe("buildManagedAgentPrompt — idiomas", () => {
  it("por defecto saluda en español y sigue en cualquiera de los siete", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
    });

    expect(prompt).toContain(
      "Empieza siempre con el saludo en español de España. Tras la primera intervención de quien llama, responde y continúa exclusivamente en el idioma que use si es uno de estos: español de España, inglés, francés, alemán, italiano, portugués, neerlandés. Si cambia entre esos idiomas, acompaña el cambio sin pedirle que elija uno. Las frases que estas instrucciones ponen entre comillas para decírselas a quien llama están en castellano: dilas traducidas al idioma de la conversación. No menciones que eres una IA salvo que te lo pregunten."
    );
    expect(prompt).not.toContain("Habla siempre en español de España");
  });

  // Tanda «A2 inglés» del laboratorio (2026-10-05): con la regla solo en
  // «## Rol», contestó en castellano a clientes que hablaban inglés en 5 de
  // 19 respuestas. El recordatorio va al final del prompt.
  it("cierra el prompt recordando el idioma, también en el resumen, el WhatsApp y la despedida", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
    });

    expect(prompt.endsWith(
      "## Idioma\nContesta cada turno en el idioma en que te habla quien llama si es uno de estos: español de España, inglés, francés, alemán, italiano, portugués, neerlandés; también el resumen de la reserva, la pregunta del WhatsApp y la despedida. No cambies de idioma por tu cuenta mientras siga hablando en el suyo."
    )).toBe(true);
  });

  it("con los idiomas de Retell (solo español) dice «Habla siempre en…» y no cierra con el recordatorio", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
      idiomas: ["es-ES"],
    });

    expect(prompt).toContain(
      "Habla siempre en español de España; no menciones que eres una IA salvo que te lo pregunten."
    );
    expect(prompt).not.toContain("## Idioma");
    expect(prompt).not.toContain("Empieza siempre con el saludo");
  });

  it("con los idiomas de Retell de un principal catalán (catalán y español) los lista a los dos", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Perruqueria Anna",
      settings: { ...DEFAULT_AGENT_SETTINGS, voiceLanguage: "ca-ES" },
      idiomas: ["es-ES", "ca-ES"],
    });

    expect(prompt).toContain(
      "Empieza siempre con el saludo en catalán. Tras la primera intervención de quien llama, responde y continúa exclusivamente en el idioma que use si es uno de estos: español de España, catalán."
    );
    expect(prompt).toContain(
      "si es uno de estos: español de España, catalán; también el resumen"
    );
  });

  it("los languages guardados no cambian la instrucción: manda el principal", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: { ...DEFAULT_AGENT_SETTINGS, languages: ["es-ES", "en-GB"] },
    });

    expect(prompt).toBe(
      buildManagedAgentPrompt({
        businessName: "Peluquería Ejemplo",
        settings: DEFAULT_AGENT_SETTINGS,
      })
    );
  });

  it("con inglés principal saluda en inglés", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: {
        ...DEFAULT_AGENT_SETTINGS,
        languages: ["es-ES", "en-GB", "fr-FR"],
        voiceLanguage: "en-GB",
      },
    });

    expect(prompt).toContain("Empieza siempre con el saludo en inglés.");
    expect(prompt).toContain("si es uno de estos: español de España, inglés, francés, alemán, italiano, portugués, neerlandés.");
  });

  it("con gallego principal saluda en gallego y habla todos sus idiomas", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: {
        ...DEFAULT_AGENT_SETTINGS,
        languages: ["es-ES", "en-GB", "gl-ES"],
        voiceLanguage: "gl-ES",
      },
    });

    expect(prompt).toContain("Empieza siempre con el saludo en gallego.");
    expect(prompt).toContain(
      "si es uno de estos: español de España, inglés, francés, gallego, alemán, italiano, portugués, neerlandés."
    );
    expect(prompt).not.toContain("contesta en español de España");
  });

  it("con catalán de principal saluda en catalán y lista los ocho con su nota", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Perruqueria Anna",
      settings: {
        ...DEFAULT_AGENT_SETTINGS,
        voiceLanguage: "ca-ES",
      },
    });

    expect(prompt).toContain(
      "Empieza siempre con el saludo en catalán. Tras la primera intervención de quien llama, responde y continúa exclusivamente en el idioma que use si es uno de estos: español de España, inglés, francés, catalán, alemán, italiano, portugués, neerlandés."
    );
    expect(prompt).toContain(
      "Si quien llama usa formas valencianas o baleares del catalán, adáptate a ellas."
    );
  });

  it("con saludo en alemán saluda en alemán", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Salon Anna",
      settings: {
        ...DEFAULT_AGENT_SETTINGS,
        languages: ["es-ES", "de-DE"],
        voiceLanguage: "de-DE",
      },
    });

    expect(prompt).toContain("Empieza siempre con el saludo en alemán.");
    expect(prompt).toContain("si es uno de estos: español de España, inglés, francés, alemán, italiano, portugués, neerlandés.");
  });
});

describe("idiomas de Soniox y de Retell", () => {
  // Ajustes guardados con reglas anteriores: el principal es la cooficial
  // guardada como principal o, si no, la primera en orden canónico, y habla
  // solo esa.
  it("con euskera y gallego guardados a la vez habla una: la del principal o, si no, la primera en el orden de la lista", () => {
    const parsed = parseAgentSettings({
      ...DEFAULT_AGENT_SETTINGS,
      languages: ["gl-ES", "es-ES", "eu-ES"],
    });

    expect(parsed.languages).toEqual(idiomasQueHabla("eu-ES"));
    expect(parsed.voiceLanguage).toBe("eu-ES");
    expect(
      parseAgentSettings({
        ...DEFAULT_AGENT_SETTINGS,
        languages: ["gl-ES", "es-ES", "eu-ES"],
        voiceLanguage: "gl-ES",
      }).languages
    ).toEqual(idiomasQueHabla("gl-ES"));
  });

  it("con catalán, euskera o gallego activos el principal pasa a uno de ellos, sin perder el resto", () => {
    const parsed = parseAgentSettings({
      ...DEFAULT_AGENT_SETTINGS,
      tone: "direct",
      languages: ["es-ES", "en-GB", "gl-ES", "eu-ES"],
      voiceLanguage: "en-GB",
    });

    expect(parsed.voiceLanguage).toBe("eu-ES");
    expect(parsed.tone).toBe("direct");
  });

  // Hasta el 2026-10-05 un principal cooficial que no estaba activo caía
  // al fallback completo; ahora el principal manda.
  it("acepta catalán, euskera o gallego como idioma principal, también sin estar en los languages guardados", () => {
    const parsed = parseAgentSettings({
      ...DEFAULT_AGENT_SETTINGS,
      languages: ["es-ES", "eu-ES"],
      voiceLanguage: "eu-ES",
    });
    expect(parsed.voiceLanguage).toBe("eu-ES");

    expect(
      parseAgentSettings({
        ...DEFAULT_AGENT_SETTINGS,
        languages: ["es-ES"],
        voiceLanguage: "ca-ES",
      })
    ).toEqual({
      ...DEFAULT_AGENT_SETTINGS,
      languages: idiomasQueHabla("ca-ES"),
      voiceLanguage: "ca-ES",
    });
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

describe("buildManagedAgentPrompt — recados y post-conversación (PR 5)", () => {
  it("pide confirmar el teléfono del recado y llamar una vez a informar_al_negocio al terminar", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
    });

    expect(prompt).toContain("## Recados");
    expect(prompt).toContain("nunca uses el número desde el que llama sin que lo confirme");
    expect(prompt).toContain("## Al terminar la llamada");
    expect(prompt).toContain("llama UNA sola vez a informar_al_negocio");
    expect(prompt).toContain("No la uses durante la conversación");
    // Lo que no supo responder vuelve al dueño por el Gestor.
    expect(prompt).toContain("apúntalo en dudas_sin_respuesta");
  });
});

describe("buildManagedAgentPrompt — privacidad del número (docs/historico/PLAN-TELEFONIA-UX.md § 3, caso C)", () => {
  it("sin la opción, deja dar el teléfono del negocio y no añade la sección de privacidad", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Fisio a domicilio",
      settings: DEFAULT_AGENT_SETTINGS,
    });

    expect(prompt).not.toContain("## Privacidad");
    expect(prompt).toContain("dale el teléfono del negocio");
  });

  it("con ocultarNumeroDelNegocio prohíbe decir el número y manda tomar recado", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Fisio a domicilio",
      settings: DEFAULT_AGENT_SETTINGS,
      ocultarNumeroDelNegocio: true,
    });

    expect(prompt).toContain("## Privacidad");
    expect(prompt).toContain("No digas nunca el número de teléfono del negocio ni del propietario");
    expect(prompt).toContain("dile que el negocio le llamará");
    expect(prompt).not.toContain("dale el teléfono del negocio");
    expect(prompt).toContain("toma recado y dile que el negocio le llamará; no le des ningún teléfono");
  });
});

describe("buildManagedAgentPrompt — pasar la llamada al dueño (fase 4)", () => {
  const activa = {
    modo: "si_lo_pide" as const,
    destino: "+34600111222",
    origen: "+34930453218",
    activa: true,
  };

  it("sin transferencia (o inactiva) no menciona la herramienta transfer", () => {
    const sinNada = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
    });
    const inactiva = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
      transferenciaAlDueno: { ...activa, modo: "nunca", activa: false },
    });

    for (const prompt of [sinNada, inactiva]) {
      expect(prompt).not.toContain("## Pasar la llamada");
      expect(prompt).not.toContain("(transfer)");
    }
  });

  it("«si el cliente lo pide»: solo a petición clara, recado primero para quejas y pagos, y retoma si no cogen", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
      transferenciaAlDueno: activa,
    });

    expect(prompt).toContain("## Pasar la llamada");
    expect(prompt).toContain("herramienta de transferencia (transfer)");
    expect(prompt).toContain("Pásala solo si el cliente pide de forma clara");
    expect(prompt).toContain("ofrece primero tomar recado");
    expect(prompt).not.toContain("Solo dentro del horario de apertura");
    expect(prompt).toContain("Pásala una sola vez por llamada");
    expect(prompt).toContain(
      "Si la transferencia falla o el responsable no contesta, la llamada sigue contigo"
    );
    expect(prompt).toContain("si prefiere que le llamen o dejar recado");
    // El bloque va antes del informe final, no dentro de él.
    expect(prompt.indexOf("## Pasar la llamada")).toBeLessThan(
      prompt.indexOf("## Al terminar la llamada")
    );
  });

  it("«siempre que sea posible»: también quejas, urgencias y pagos, pero solo en horario", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
      transferenciaAlDueno: { ...activa, modo: "siempre" },
    });

    expect(prompt).toContain("## Pasar la llamada");
    expect(prompt).toContain("una queja, una urgencia, una pregunta sobre pagos");
    expect(prompt).toContain("Solo dentro del horario de apertura del negocio");
    expect(prompt).toContain("fuera de ese horario no la pases, toma recado");
    expect(prompt).not.toContain("Pásala solo si el cliente pide de forma clara");
  });

  it("parseAgentSettings conserva pasarLlamadas y rechaza valores que no sean los tres modos", () => {
    expect(
      parseAgentSettings({ ...DEFAULT_AGENT_SETTINGS, pasarLlamadas: "siempre" })
        .pasarLlamadas
    ).toBe("siempre");
    expect(parseAgentSettings(DEFAULT_AGENT_SETTINGS).pasarLlamadas).toBeUndefined();
    // Un valor inválido solo se pierde él: el resto de ajustes se conserva.
    expect(
      parseAgentSettings({ ...DEFAULT_AGENT_SETTINGS, pasarLlamadas: "a_veces" })
    ).toEqual(DEFAULT_AGENT_SETTINGS);
  });
});

describe("buildManagedAgentPrompt — chat por WhatsApp (fase 2)", () => {
  it("explica el marcador [WhatsApp …], veta end_call en chat y da por dado el consentimiento", () => {
    const prompt = buildManagedAgentPrompt({
      businessName: "Peluquería Ejemplo",
      settings: DEFAULT_AGENT_SETTINGS,
    });

    expect(prompt).toContain("## Chat por WhatsApp");
    expect(prompt).toContain("[WhatsApp · número · fecha y hora]");
    expect(prompt).toContain("única fuente fiable del número desde el que escribe");
    expect(prompt).toContain("no uses end_call");
    expect(prompt).toContain("usa smsConsent: true");
    expect(prompt).toContain("ha pulsado Cambiar en el recordatorio");
  });
});
