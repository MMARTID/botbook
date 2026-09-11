import { describe, it, expect } from "vitest";
import {
  adaptManagedPromptForTelnyx,
  buildTelnyxAssistantName,
  buildTelnyxAssistantPayload,
  buildTelnyxHangupTool,
  toTelnyxWebhookTool,
} from "../../src/lib/telnyxAssistantPayload.js";

describe("buildTelnyxAssistantName", () => {
  it("genera un nombre estable y determinista por negocio y agente", () => {
    expect(buildTelnyxAssistantName("biz1", "agent1")).toBe(
      "alhabla-biz1-agent1"
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
        timeout_ms: undefined,
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
    expect(tool.webhook.timeout_ms).toBe(5000);
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

  it("traduce el patrón anidado current_time de Retell a la variable de sistema de Telnyx", () => {
    const result = adaptManagedPromptForTelnyx(
      "Momento actual en la zona del negocio:\n{{current_time_{{zona_horaria}} }}",
      "Peluquería Ejemplo"
    );

    expect(result).toBe(
      "Momento actual en la zona del negocio:\n{{telnyx_current_time}}"
    );
  });

  it("no toca el texto si no hay ninguna variable de Retell", () => {
    const result = adaptManagedPromptForTelnyx(
      "Eres una recepcionista breve y profesional.",
      "Peluquería Ejemplo"
    );

    expect(result).toBe("Eres una recepcionista breve y profesional.");
  });
});

describe("buildTelnyxAssistantPayload", () => {
  const baseInput = {
    businessId: "biz1",
    agentId: "agent1",
    businessName: "Peluquería Ejemplo",
    instructions: "Eres la recepcionista de Peluquería Ejemplo.",
    greeting: "Hola, gracias por llamar. ¿En qué te puedo ayudar?",
    language: "es",
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

  it("usa el nombre determinista y propaga instructions/greeting/voz sin transformarlos", () => {
    const payload = buildTelnyxAssistantPayload(baseInput);

    expect(payload.name).toBe("alhabla-biz1-agent1");
    expect(payload.instructions).toBe(baseInput.instructions);
    expect(payload.greeting).toBe(baseInput.greeting);
    expect(payload.voiceSettings?.voice).toBe("Telnyx.Ultra.Isabel");
  });

  it("fija voice_speed a 1.1 — decisión explícita del usuario 2026-09-12", () => {
    const payload = buildTelnyxAssistantPayload(baseInput);

    expect(payload.voiceSettings?.voice_speed).toBe(1.1);
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

  it("fija el modelo de transcripción y el idioma, y sesga con boostedKeywords", () => {
    const payload = buildTelnyxAssistantPayload({
      ...baseInput,
      language: "en",
      boostedKeywords: ["corte", "manicura"],
    });

    expect(payload.transcription).toEqual({
      model: "deepgram/nova-3",
      language: "en",
      settings: { keyterm: "corte,manicura" },
    });
  });

  it("omite settings.keyterm cuando no hay palabras clave", () => {
    const payload = buildTelnyxAssistantPayload(baseInput);

    expect(payload.transcription?.settings).toBeUndefined();
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
    expect(payload.telephonySettings?.time_limit_secs).toBe(10 * 60);
  });

  it("permite sobrescribir los límites de silencio y duración", () => {
    const payload = buildTelnyxAssistantPayload({
      ...baseInput,
      userIdleTimeoutSecs: 45,
      maxCallDurationSecs: 300,
    });

    expect(payload.telephonySettings?.user_idle_timeout_secs).toBe(45);
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
