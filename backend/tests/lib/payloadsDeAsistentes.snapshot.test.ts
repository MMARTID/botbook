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
import {
  resolverIdiomas,
  saludoDelNegocio,
} from "../../src/lib/idiomas/resolver.js";

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
        idiomas: resolverIdiomas({
          languages: ["es-ES"],
          voiceLanguage: "es-ES",
          voiceGender: "femenina",
        }),
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
        idiomas: resolverIdiomas({
          languages: ["es-ES", "en-GB"],
          voiceLanguage: "es-ES",
          voiceGender: "femenina",
        }),
        voice: "Telnyx.NaturalHD.x",
        includeHangupTool: false,
      })
    ).toMatchSnapshot();
  });

  // Un nivel por idioma principal regional: voz de Soniox, Soniox para
  // entender y el saludo en su idioma (catálogo en lib/idiomas). Solo lo que
  // depende del idioma, para que la instantánea diga qué cambió.
  for (const [principal, otros] of [
    ["ca-ES", ["es-ES", "en-GB"]],
    ["eu-ES", ["es-ES"]],
    ["gl-ES", ["es-ES", "fr-FR"]],
  ] as const) {
    it(`assistant de la recepcionista con ${principal} como idioma principal`, () => {
      const idiomas = resolverIdiomas({
        languages: [...otros, principal],
        voiceLanguage: principal,
        voiceGender: "femenina",
      });
      const payload = buildTelnyxAssistantPayload({
        businessId: "neg_1",
        agentId: "ag_1",
        businessName: "Perruqueria Anna",
        instructions: "Ets la recepcionista de {{nombre_negocio}}.",
        greeting: saludoDelNegocio(idiomas, "Perruqueria Anna"),
        idiomas,
        voice: idiomas.voz.id,
        boostedKeywords: ["Tall", "Laura"],
      });
      expect({
        greeting: payload.greeting,
        voiceSettings: payload.voiceSettings,
        transcription: payload.transcription,
        interruptionSettings: payload.interruptionSettings,
      }).toMatchSnapshot();
    });
  }

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
          idiomas: resolverIdiomas({
            languages: ["es-ES"],
            voiceLanguage: "es-ES",
            voiceGender: "femenina",
          }),
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
