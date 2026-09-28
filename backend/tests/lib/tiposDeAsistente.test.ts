import { describe, it, expect } from "vitest";
import {
  PREFIJO_ASSISTANT_DE_DEMO,
  TIPOS_DE_ASISTENTE,
} from "../../src/lib/tiposDeAsistente.js";
import { construirToolsDeWebhook } from "../../src/lib/telnyxAssistantPayload.js";

const BASE_URL = "https://api.alhabla.test/";

describe("TIPOS_DE_ASISTENTE", () => {
  it("cada tipo con tools las sirve por su canal: ruta, cabeceras y timeout", () => {
    for (const tipo of Object.values(TIPOS_DE_ASISTENTE)) {
      if (!tipo.tools || !tipo.canalDeTools) continue;
      const canal = tipo.canalDeTools;
      for (const tool of tipo.tools(BASE_URL)) {
        expect(tool.url).toBe(
          `https://api.alhabla.test${canal.ruta}/${tool.name}`
        );
        expect(tool.headers).toEqual(canal.cabeceras);
        expect(tool.timeoutMs).toBe(canal.timeoutMs);
      }
    }
  });

  it("los nombres de tools no se repiten dentro de un tipo", () => {
    for (const tipo of Object.values(TIPOS_DE_ASISTENTE)) {
      const nombres = (tipo.tools?.(BASE_URL) ?? []).map((t) => t.name);
      expect(new Set(nombres).size).toBe(nombres.length);
    }
  });

  it("nombres en Telnyx: por agente, prefijo de demo y fijo del Gestor", () => {
    const ids = { businessId: "neg", agentId: "ag" };
    expect(TIPOS_DE_ASISTENTE.recepcionista.nombreEnTelnyx(ids)).toBe(
      "alhabla-neg-ag"
    );
    expect(TIPOS_DE_ASISTENTE.demo.nombreEnTelnyx(ids)).toBe(
      PREFIJO_ASSISTANT_DE_DEMO
    );
    expect(TIPOS_DE_ASISTENTE.gestor.nombreEnTelnyx(ids)).toBe(
      "alhabla-gestor"
    );
  });
});

describe("construirToolsDeWebhook", () => {
  it("omite `required` si la definición no lo trae y copia las cabeceras", () => {
    const canal = {
      ruta: "/webhooks/telnyx/otro",
      cabeceras: [{ name: "X-A", value: "{{a}}" }],
      timeoutMs: 1000,
    };
    const [tool] = construirToolsDeWebhook("https://x/", canal, [
      { name: "t", description: "d", properties: {} },
    ]);
    expect(tool).toEqual({
      name: "t",
      description: "d",
      url: "https://x/webhooks/telnyx/otro/t",
      method: "POST",
      properties: {},
      headers: [{ name: "X-A", value: "{{a}}" }],
      timeoutMs: 1000,
    });
    expect(tool.headers).not.toBe(canal.cabeceras);
  });
});
