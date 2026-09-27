import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  buildTelnyxAssistantPayload,
  buildTelnyxVoiceTools,
} from "../../src/lib/telnyxAssistantPayload.js";
import {
  buildGestorAssistantPayload,
  buildGestorTools,
} from "../../src/lib/gestorPayload.js";

/**
 * Instantáneas de los payloads que llegan a la API de Telnyx. Sirven de red
 * para refactorizar los builders: si una instantánea cambia, el payload
 * enviado a Telnyx ha cambiado (y con él el `telnyxConfigHash`, que forzaría
 * un updateAssistant en todos los agentes). Actualizarlas solo a propósito.
 */
const BASE_URL = "https://api.alhabla.test/";

describe("payloads de asistentes (instantáneas)", () => {
  it("tools de voz de la recepcionista", () => {
    expect(buildTelnyxVoiceTools(BASE_URL)).toMatchSnapshot();
  });

  it("assistant de la recepcionista, completo con transferencia y palabras clave", () => {
    expect(
      buildTelnyxAssistantPayload({
        businessId: "neg_1",
        agentId: "ag_1",
        businessName: "Peluquería Ana",
        timezone: "Europe/Madrid",
        instructions:
          "Hola {{nombre_negocio}}, llama {{user_number}} a las {{current_time_{{zona_horaria}}}} ({{zona_horaria}}).",
        greeting: "Peluquería Ana, dígame.",
        language: "es",
        voice: "Telnyx.Ultra.blanca",
        tools: buildTelnyxVoiceTools(BASE_URL),
        transferenciaAlDueno: { from: "+34910000000", to: "+34600000000" },
        boostedKeywords: ["Corte", "Laura"],
      })
    ).toMatchSnapshot();
  });

  it("assistant de la recepcionista, mínimo (sin tools, voz Natural)", () => {
    expect(
      buildTelnyxAssistantPayload({
        businessId: "neg_2",
        agentId: "ag_2",
        businessName: "Barbería",
        instructions: "Prompt manual.",
        greeting: "",
        language: "multi",
        voice: "Telnyx.NaturalHD.x",
        includeHangupTool: false,
      })
    ).toMatchSnapshot();
  });

  it("tools del Gestor", () => {
    expect(buildGestorTools(BASE_URL)).toMatchSnapshot();
  });

  it("assistant del Gestor", () => {
    expect(buildGestorAssistantPayload(BASE_URL)).toMatchSnapshot();
  });

  // Las instantáneas ordenan las claves; el hash del JSON serializado (el
  // mismo cálculo que `telnyxConfigHash`) prueba además que el orden de las
  // claves, y por tanto los bytes enviados, no cambian.
  it("el JSON enviado es idéntico byte a byte (hash)", () => {
    const hash = (p: unknown) =>
      createHash("sha256").update(JSON.stringify(p)).digest("hex");
    expect({
      recepcionista: hash(
        buildTelnyxAssistantPayload({
          businessId: "neg_1",
          agentId: "ag_1",
          businessName: "Peluquería Ana",
          timezone: "Europe/Madrid",
          instructions: "Prompt {{nombre_negocio}}",
          greeting: "Hola",
          language: "es",
          voice: "Telnyx.Ultra.blanca",
          tools: buildTelnyxVoiceTools(BASE_URL),
          transferenciaAlDueno: { from: "+34910000000", to: "+34600000000" },
          boostedKeywords: ["Corte"],
        })
      ),
      gestor: hash(buildGestorAssistantPayload(BASE_URL)),
    }).toMatchSnapshot();
  });
});
