import { describe, it, expect } from "vitest";
import {
  adaptManagedPromptForTelnyx,
  buildTelnyxAssistantName,
  buildTelnyxAssistantPayload,
  buildTelnyxHangupTool,
  buildTelnyxTransferTool,
  buildTelnyxVoiceTools,
  toTelnyxWebhookTool,
} from "../../src/lib/telnyxAssistantPayload.js";
import { resolverIdiomas } from "../../src/lib/idiomas/resolver.js";
import type { CodigoDeIdioma } from "../../src/lib/idiomas/catalogo.js";

/** El perfil de idiomas que el sync le pasa al builder. */
const idiomas = (
  languages: CodigoDeIdioma[],
  voiceLanguage: CodigoDeIdioma = "es-ES"
) => resolverIdiomas({ languages, voiceLanguage, voiceGender: "femenina" });

describe("buildTelnyxAssistantName", () => {
  it("genera un nombre estable y determinista por negocio y agente", () => {
    expect(buildTelnyxAssistantName("biz1", "agent1")).toBe(
      "alhabla-biz1-agent1"
    );
  });
});

describe("buildTelnyxTransferTool", () => {
  it("produce la tool nativa transfer con from, un solo destino con nombre, mensaje en caliente y detección de buzón", () => {
    const tool = buildTelnyxTransferTool({
      from: "+34930453218",
      to: "+34600111222",
      businessName: "Peluquería Ejemplo",
    });

    expect(tool).toEqual({
      type: "transfer",
      transfer: {
        from: "+34930453218",
        targets: [{ name: "Responsable del negocio", to: "+34600111222" }],
        warm_transfer_instructions:
          "Habla en español. En una sola frase, di que eres la recepcionista de Peluquería Ejemplo y que le pasas a un cliente: su nombre si lo dijo y qué quiere. No hagas preguntas ni esperes respuesta.",
        voicemail_detection: {
          detection_mode: "premium",
          on_voicemail_detected: { action: "stop_transfer" },
        },
      },
    });
    // Sin campos que el SDK no declare ni descripción propia (la genera
    // Telnyx) ni warm_transfer_acceptance (solo con ai_assistant_start).
    expect(Object.keys(tool.transfer).sort()).toEqual([
      "from",
      "targets",
      "voicemail_detection",
      "warm_transfer_instructions",
    ]);
  });

  it("buildTelnyxAssistantPayload la añade entre las de webhook y hangup solo si se pasa transferenciaAlDueno", () => {
    const base = {
      businessId: "biz1",
      agentId: "agent1",
      businessName: "Peluquería Ejemplo",
      instructions: "i",
      greeting: "",
      idiomas: idiomas(["es-ES"]),
      voice: "Telnyx.Ultra.isabel",
      tools: [
        {
          name: "get_catalog",
          description: "d",
          url: "https://api.example.test/t",
          properties: {},
        },
      ],
    };
    const con = buildTelnyxAssistantPayload({
      ...base,
      transferenciaAlDueno: { from: "+34930453218", to: "+34600111222" },
    });
    expect(con.tools!.map((tool) => tool.type)).toEqual([
      "webhook",
      "transfer",
      "hangup",
    ]);

    const sin = buildTelnyxAssistantPayload({ ...base, transferenciaAlDueno: null });
    expect(sin.tools!.map((tool) => tool.type)).toEqual(["webhook", "hangup"]);
    expect(buildTelnyxAssistantPayload(base).tools!.map((tool) => tool.type)).toEqual(
      ["webhook", "hangup"]
    );
  });
});

describe("toTelnyxWebhookTool", () => {
  it("mapea una tool a la forma webhook de Telnyx, con POST por defecto", () => {
    const tool = toTelnyxWebhookTool({
      name: "check_availability",
      description: "Consulta huecos libres",
      url: "https://api.alhabla.ai/webhooks/retell/tools/check_availability",
      properties: { fecha: { type: "string" } },
      required: ["fecha"],
    });

    expect(tool).toEqual({
      type: "webhook",
      timeout_ms: undefined,
      webhook: {
        name: "check_availability",
        description: "Consulta huecos libres",
        url: "https://api.alhabla.ai/webhooks/retell/tools/check_availability",
        method: "POST",
        body_parameters: {
          type: "object",
          properties: { fecha: { type: "string" } },
          required: ["fecha"],
        },
        headers: undefined,
      },
    });
  });

  it("respeta un método HTTP explícito y cabeceras", () => {
    const tool = toTelnyxWebhookTool({
      name: "get_catalog",
      description: "Obtiene el catálogo",
      url: "https://api.alhabla.ai/webhooks/retell/tools/get_catalog",
      method: "GET",
      properties: {},
      headers: [{ name: "X-Internal", value: "1" }],
      timeoutMs: 5000,
    });

    expect(tool.webhook.method).toBe("GET");
    expect(tool.webhook.headers).toEqual([{ name: "X-Internal", value: "1" }]);
  });

  it("pone el timeout al nivel de la tool, que es donde Telnyx lo aplica", () => {
    const tool = toTelnyxWebhookTool({
      name: "get_catalog",
      description: "Obtiene el catálogo",
      url: "https://api.alhabla.ai/webhooks/telnyx/tools/get_catalog",
      properties: {},
      timeoutMs: 20000,
    });

    expect(tool.timeout_ms).toBe(20000);
    expect(tool.webhook).not.toHaveProperty("timeout_ms");
  });
});

describe("buildTelnyxHangupTool", () => {
  it("construye la tool nativa de colgar", () => {
    expect(buildTelnyxHangupTool("Cuelga al terminar")).toEqual({
      type: "hangup",
      hangup: { description: "Cuelga al terminar" },
    });
  });
});

describe("adaptManagedPromptForTelnyx", () => {
  it("sustituye {{nombre_negocio}} por el nombre real del negocio, en texto plano", () => {
    const result = adaptManagedPromptForTelnyx(
      "Eres la recepcionista virtual de {{nombre_negocio}}.",
      "Peluquería Ejemplo"
    );

    expect(result).toBe("Eres la recepcionista virtual de Peluquería Ejemplo.");
  });

  it("traduce {{user_number}} (variable nativa de Retell) a {{telnyx_end_user_target}}", () => {
    const result = adaptManagedPromptForTelnyx(
      "Para el teléfono usa {{user_number}} si está disponible.",
      "Peluquería Ejemplo"
    );

    expect(result).toBe(
      "Para el teléfono usa {{telnyx_end_user_target}} si está disponible."
    );
  });

  it("traduce el patrón anidado current_time de Retell a la variante CON ZONA de Telnyx (nunca a la UTC a secas)", () => {
    const result = adaptManagedPromptForTelnyx(
      "Momento actual en la zona del negocio:\n{{current_time_{{zona_horaria}} }}",
      "Peluquería Ejemplo"
    );

    // {{telnyx_current_time}} sin sufijo es UTC (issue #122).
    expect(result).toBe(
      "Momento actual en la zona del negocio:\n{{telnyx_current_time_Europe/Madrid}}"
    );
    expect(result).not.toContain("{{telnyx_current_time}}");
  });

  it("la zona literal ya escrita por managedAgentPrompt ({{current_time_Europe/Madrid}}) también va a la variante con zona", () => {
    const result = adaptManagedPromptForTelnyx(
      "Momento actual en la zona del negocio:\n{{current_time_Atlantic/Canary}}",
      "Peluquería Ejemplo",
      "Atlantic/Canary"
    );

    expect(result).toBe(
      "Momento actual en la zona del negocio:\n{{telnyx_current_time_Atlantic/Canary}}"
    );
  });

  it("no toca el texto si no hay ninguna variable de Retell", () => {
    const result = adaptManagedPromptForTelnyx(
      "Eres una recepcionista breve y profesional.",
      "Peluquería Ejemplo"
    );

    expect(result).toBe("Eres una recepcionista breve y profesional.");
  });

  it("sustituye {{zona_horaria}} suelta por la zona real del negocio, sin romper el patrón anidado de current_time", () => {
    const result = adaptManagedPromptForTelnyx(
      "Usa la zona {{zona_horaria}} en las tools.\n{{current_time_{{zona_horaria}} }}",
      "Peluquería Ejemplo",
      "Atlantic/Canary"
    );

    expect(result).toBe(
      "Usa la zona Atlantic/Canary en las tools.\n{{telnyx_current_time_Atlantic/Canary}}"
    );
  });

  it("una zona desconocida cae a Europe/Madrid: Telnyx dejaría el placeholder sin resolver", () => {
    const result = adaptManagedPromptForTelnyx(
      "Zona {{zona_horaria}}.\n{{current_time_{{zona_horaria}} }}",
      "Peluquería Ejemplo",
      "Marte/Olympus"
    );

    expect(result).toBe(
      "Zona Europe/Madrid.\n{{telnyx_current_time_Europe/Madrid}}"
    );
  });

  it("usa Europe/Madrid como zona por defecto si no se indica", () => {
    const result = adaptManagedPromptForTelnyx(
      "Zona: {{zona_horaria}}.",
      "Peluquería Ejemplo"
    );

    expect(result).toBe("Zona: Europe/Madrid.");
  });
});

describe("buildTelnyxAssistantPayload", () => {
  const baseInput = {
    businessId: "biz1",
    agentId: "agent1",
    businessName: "Peluquería Ejemplo",
    instructions: "Eres la recepcionista de Peluquería Ejemplo.",
    greeting: "Hola, gracias por llamar. ¿En qué te puedo ayudar?",
    idiomas: idiomas(["es-ES"]),
    voice: "Telnyx.Ultra.Isabel",
  };

  it("traduce las variables de Retell del prompt a las de sistema de Telnyx", () => {
    const payload = buildTelnyxAssistantPayload({
      ...baseInput,
      instructions: "Hola {{nombre_negocio}}, usa {{user_number}}.",
    });

    expect(payload.instructions).toBe(
      "Hola Peluquería Ejemplo, usa {{telnyx_end_user_target}}."
    );
  });

  it("propaga la zona horaria del negocio a {{zona_horaria}} del prompt", () => {
    const payload = buildTelnyxAssistantPayload({
      ...baseInput,
      timezone: "Atlantic/Canary",
      instructions: "startDateTime en la zona {{zona_horaria}}.",
    });

    expect(payload.instructions).toBe("startDateTime en la zona Atlantic/Canary.");
  });

  it("usa el nombre determinista y propaga instructions/greeting/voz sin transformarlos", () => {
    const payload = buildTelnyxAssistantPayload(baseInput);

    expect(payload.name).toBe("alhabla-biz1-agent1");
    expect(payload.instructions).toBe(baseInput.instructions);
    expect(payload.greeting).toBe(baseInput.greeting);
    expect(payload.voiceSettings?.voice).toBe("Telnyx.Ultra.Isabel");
  });

  it("activa expressive_mode (matices emocionales SSML, solo disponible en voces Ultra)", () => {
    const payload = buildTelnyxAssistantPayload(baseInput);

    expect(payload.voiceSettings?.expressive_mode).toBe(true);
  });

  it("añade ruido de oficina de fondo a volumen bajo en vez de silencio total", () => {
    const payload = buildTelnyxAssistantPayload(baseInput);

    expect(payload.voiceSettings?.background_audio).toEqual({
      type: "predefined_media",
      value: "office",
      volume: 0.2,
    });
  });

  it("fija el modelo LLM primario y su fallback — decisión explícita del usuario 2026-09-12; el modelo NO afecta al coste (ai-voice-assistant es tarifa plana por minuto, confirmado con una llamada real)", () => {
    const payload = buildTelnyxAssistantPayload(baseInput);

    expect(payload.model).toBe("openai/gpt-5.6-luna");
    expect(payload.fallbackConfig).toEqual({ model: "moonshotai/Kimi-K2.6" });
  });

  it("nunca fija dynamic_variables_webhook_url — el flujo normal no depende de él", () => {
    const payload = buildTelnyxAssistantPayload(baseInput);

    expect(payload).not.toHaveProperty("dynamic_variables_webhook_url");
  });

  it("activa data_retention — Telnyx rechaza grabación con data_retention=false (verificado en vivo 2026-09-11)", () => {
    const payload = buildTelnyxAssistantPayload(baseInput);

    expect(payload.privacySettings).toEqual({ data_retention: true });
  });

  it("activa send_conversation_message_events — sin él, ai.conversations.messages nunca se rellena en llamadas de voz", () => {
    const payload = buildTelnyxAssistantPayload(baseInput);

    expect(payload.telephonySettings?.send_conversation_message_events).toBe(
      true
    );
  });

  // Desde el 2026-10-05 con principal español habla los siete de
  // ULTRA_HABLA: flux en modo multi (antes «es», solo español).
  it("fija el modelo de transcripción y el idioma, y sesga con boostedKeywords", () => {
    const payload = buildTelnyxAssistantPayload({
      ...baseInput,
      idiomas: idiomas(["es-ES"]),
      boostedKeywords: ["corte", "manicura"],
    });

    expect(payload.transcription).toEqual({
      model: "deepgram/flux",
      language: "multi",
      settings: {
        keyterm: "corte,manicura",
        eot_threshold: 0.8,
        eot_timeout_ms: 5000,
        eager_eot_threshold: 0.4,
        smart_format: true,
        numerals: true,
      },
    });
  });

  it("omite keyterm pero mantiene la config de fin de turno y formato inteligente cuando no hay palabras clave", () => {
    const payload = buildTelnyxAssistantPayload(baseInput);

    expect(payload.transcription?.settings).toEqual({
      eot_threshold: 0.8,
      eot_timeout_ms: 5000,
      eager_eot_threshold: 0.4,
      smart_format: true,
      numerals: true,
    });
  });

  it("fija wait_seconds bajo en start_speaking_plan, recomendación de Telnyx para flux", () => {
    const payload = buildTelnyxAssistantPayload(baseInput);

    expect(payload.interruptionSettings?.start_speaking_plan).toEqual({
      wait_seconds: 0.1,
    });
  });

  it("activa Interruption Prediction con el punto de partida recomendado por Telnyx (evita que un \"sí\"/\"vale\" corte al agente)", () => {
    const payload = buildTelnyxAssistantPayload(baseInput);

    expect(payload.interruptionSettings?.interrupt_prediction_threshold).toBe(0.4);
  });

  describe("con catalán, euskera o gallego (Soniox)", () => {
    // Desde el 2026-10-05 el principal manda: con catalán habla ocho
    // idiomas (los `languages` que se pasan aquí no cuentan).
    const sonioxInput = {
      ...baseInput,
      idiomas: idiomas(["es-ES", "en-GB", "ca-ES"], "ca-ES"),
      voice: "Soniox.tts-rt-v2.Marta",
    };

    it("transcribe con Soniox fijando los idiomas del negocio y sus palabras clave", () => {
      const payload = buildTelnyxAssistantPayload({
        ...sonioxInput,
        boostedKeywords: ["corte", "Laura"],
      });

      expect(payload.transcription).toEqual({
        model: "soniox/stt-rt-v5",
        language: "auto",
        settings: {
          language_hints: ["es", "ca"],
          context: "corte,Laura",
          enable_endpoint_detection: true,
          max_endpoint_delay_ms: 500,
        },
      });
    });

    it("no manda los ajustes de turno de flux, que Soniox no tiene", () => {
      const payload = buildTelnyxAssistantPayload(sonioxInput);

      expect(payload.transcription?.settings).not.toHaveProperty("keyterm");
      expect(payload.transcription?.settings).not.toHaveProperty("eot_threshold");
      expect(payload.interruptionSettings).toEqual({
        start_speaking_plan: {
          wait_seconds: 0.1,
          transcription_endpointing_plan: {
            on_punctuation_seconds: 0.1,
            on_no_punctuation_seconds: 0.5,
            on_number_seconds: 0.5,
          },
        },
      });
    });

    it("la voz de Soniox arranca en el idioma principal, sin expressive_mode", () => {
      const payload = buildTelnyxAssistantPayload({
        ...sonioxInput,
        idiomas: idiomas(["es-ES", "ca-ES", "eu-ES"], "eu-ES"),
      });

      expect(payload.voiceSettings).toMatchObject({
        voice: "Soniox.tts-rt-v2.Marta",
        language: "eu",
        expressive_mode: false,
      });
    });

    // Ajustes guardados con las reglas anteriores (saludo en castellano
    // con catalán activo): atiende en catalán, como hacía.
    it("con ajustes anteriores de saludo en castellano y catalán activo, atiende en catalán con Soniox", () => {
      const payload = buildTelnyxAssistantPayload({
        ...sonioxInput,
        idiomas: idiomas(["es-ES", "ca-ES"], "es-ES"),
      });

      expect(payload.voiceSettings).toMatchObject({
        voice: "Soniox.tts-rt-v2.Marta",
        language: "ca",
        expressive_mode: false,
      });
      expect(payload.transcription).toMatchObject({
        model: "soniox/stt-rt-v5",
        settings: {
          language_hints: ["es", "ca"],
        },
      });
    });

    it("si la cuenta da una voz Ultra de reserva, conserva su modo expresivo y no lleva idioma", () => {
      const payload = buildTelnyxAssistantPayload({
        ...sonioxInput,
        voice: "Telnyx.Ultra.Isabel",
      });

      expect(payload.transcription?.model).toBe("soniox/stt-rt-v5");
      expect(payload.voiceSettings).toMatchObject({ expressive_mode: true });
      expect(payload.voiceSettings).not.toHaveProperty("language");
    });
  });

  it("activa grabación dual y aplica los límites por defecto de silencio/duración", () => {
    const payload = buildTelnyxAssistantPayload(baseInput);

    expect(payload.telephonySettings?.recording_settings).toEqual({
      enabled: true,
      format: "wav",
      channels: "dual",
      stop_on_conversation_end: true,
    });
    expect(payload.telephonySettings?.user_idle_timeout_secs).toBe(30);
    expect(payload.telephonySettings?.user_idle_reply_secs).toBe(12);
    expect(payload.telephonySettings?.time_limit_secs).toBe(10 * 60);
  });

  it("desactiva la supresión de ruido a nivel de assistant (la hace Call Control por llamada, ver TelnyxAiAdapter)", () => {
    const payload = buildTelnyxAssistantPayload(baseInput);

    expect(payload.telephonySettings?.noise_suppression).toBe("disabled");
  });

  it("permite sobrescribir los límites de silencio y duración", () => {
    const payload = buildTelnyxAssistantPayload({
      ...baseInput,
      userIdleTimeoutSecs: 45,
      userIdleReplySecs: 20,
      maxCallDurationSecs: 300,
    });

    expect(payload.telephonySettings?.user_idle_timeout_secs).toBe(45);
    expect(payload.telephonySettings?.user_idle_reply_secs).toBe(20);
    expect(payload.telephonySettings?.time_limit_secs).toBe(300);
  });

  it("añade la tool de colgar al final por defecto", () => {
    const payload = buildTelnyxAssistantPayload({
      ...baseInput,
      tools: [
        {
          name: "check_availability",
          description: "d",
          url: "https://x/y",
          properties: {},
        },
      ],
    });

    expect(payload.tools).toHaveLength(2);
    expect(payload.tools?.[0]).toMatchObject({ type: "webhook" });
    expect(payload.tools?.[1]).toEqual({
      type: "hangup",
      hangup: {
        description: "Cuelga la llamada cuando la conversación haya terminado.",
      },
    });
  });

  it("omite la tool de colgar si includeHangupTool es false", () => {
    const payload = buildTelnyxAssistantPayload({
      ...baseInput,
      includeHangupTool: false,
    });

    expect(payload.tools).toEqual([]);
  });

  it("propaga insightGroupId cuando se indica", () => {
    const payload = buildTelnyxAssistantPayload({
      ...baseInput,
      insightGroupId: "insight_grp_1",
    });

    expect(payload.insightGroupId).toBe("insight_grp_1");
  });
});

describe("buildTelnyxVoiceTools — notify_when_available (PR 4)", () => {
  it("notify_when_available admite clientName opcional sin hacerlo obligatorio", () => {
    const tool = buildTelnyxVoiceTools("https://api.alhabla.ai").find(
      (t) => t.name === "notify_when_available"
    );
    expect(tool).toBeDefined();
    expect(tool!.properties.clientName).toEqual({
      type: "string",
      description: expect.stringContaining("reservar a su nombre"),
    });
    expect(tool!.required).toEqual(["startDateTime", "durationMinutes"]);
  });
});

describe("buildTelnyxVoiceTools — informar_al_negocio (PR 5, post-conversación)", () => {
  it("la tool existe, con el resultado obligatorio, el recado como objeto opcional y la cabecera del call_control_id", () => {
    const tool = buildTelnyxVoiceTools("https://api.alhabla.ai").find(
      (t) => t.name === "informar_al_negocio"
    );
    expect(tool).toBeDefined();
    expect(tool!.url).toBe(
      "https://api.alhabla.ai/webhooks/telnyx/tools/informar_al_negocio"
    );
    expect(tool!.required).toEqual(["resultado"]);
    expect(tool!.properties.resultado).toEqual(
      expect.objectContaining({
        type: "string",
        enum: ["RESOLVED", "FRUSTRATED", "NO_ANSWER", "ESCALATED", "LEAD_CAPTURED"],
      })
    );
    expect(tool!.properties.recado).toEqual(
      expect.objectContaining({
        type: "object",
        required: ["motivo"],
        properties: expect.objectContaining({
          telefono: expect.objectContaining({
            description: expect.stringContaining("Nunca lo rellenes por tu cuenta"),
          }),
        }),
      })
    );
    expect(tool!.headers).toEqual([
      { name: "X-Alhabla-Call-Control-Id", value: "{{call_control_id}}" },
    ]);
    // Opcional: solo cuando hubo preguntas que no supo responder.
    expect(tool!.properties.dudas_sin_respuesta).toEqual(
      expect.objectContaining({ type: "array", items: { type: "string" } })
    );
  });

  it("el payload del assistant activa la post-conversación", () => {
    const payload = buildTelnyxAssistantPayload({
      businessId: "biz_1",
      agentId: "agent_1",
      businessName: "Peluquería Ana",
      instructions: "x",
      timezone: "Europe/Madrid",
      greeting: "",
      idiomas: idiomas(["es-ES"]),
      voice: "Telnyx.KokoroTTS.af",
    });
    expect(payload.postConversationSettings).toEqual({ enabled: true });
  });
});
