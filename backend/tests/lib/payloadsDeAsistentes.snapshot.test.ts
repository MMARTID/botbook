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
  // entender (desde el 2026-10-05, con las pistas de los ocho idiomas que
  // habla) y el saludo en su idioma (catálogo en lib/idiomas). Solo lo que
  // depende del idioma, para que la instantánea diga qué cambió.
  for (const principal of ["ca-ES", "eu-ES", "gl-ES"] as const) {
    it(`assistant de la recepcionista con ${principal} como idioma principal`, () => {
      const idiomas = resolverIdiomas({
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

  // Idiomas y voces del 2026-10-05: el principal manda (saludo, familia de
  // voces e idiomas que habla). El caso «saludo en español con catalán
  // activo» se quitó con la simplificación de ese día: ya no se puede
  // elegir.
  for (const [caso, ajustes] of [
    ["saludo en alemán (su Ultra nativa y flux)", { voiceLanguage: "de-DE" }],
    [
      "español con una voz elegida que no es la de por defecto (Lara)",
      {
        voiceLanguage: "es-ES",
        voz: "Telnyx.Ultra.85b356c1-c638-404d-b986-f54a53d957d6",
      },
    ],
  ] as const) {
    it(`assistant de la recepcionista con ${caso}`, () => {
      const idiomas = resolverIdiomas({ ...ajustes, voiceGender: "femenina" });
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

  it("elegir la voz de por defecto (Blanca, Marcos, o Marta con catalán) no cambia el payload", () => {
    const payload = (ajustes: Parameters<typeof resolverIdiomas>[0]) => {
      const idiomas = resolverIdiomas(ajustes);
      return buildTelnyxAssistantPayload({
        businessId: "neg_1",
        agentId: "ag_1",
        businessName: "Peluquería Ana",
        instructions: "Prompt {{nombre_negocio}}",
        greeting: saludoDelNegocio(idiomas, "Peluquería Ana"),
        idiomas,
        voice: idiomas.voz.id,
        tools: buildTelnyxVoiceTools(BASE_URL),
      });
    };
    for (const [ajustes, voz] of [
      [
        {
          languages: ["es-ES"],
          voiceLanguage: "es-ES",
          voiceGender: "femenina",
        },
        "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6",
      ],
      [
        {
          languages: ["es-ES"],
          voiceLanguage: "es-ES",
          voiceGender: "masculina",
        },
        "Telnyx.Ultra.13ff5deb-2591-42ad-a356-63a04e524411",
      ],
      [
        {
          languages: ["es-ES", "ca-ES"],
          voiceLanguage: "ca-ES",
          voiceGender: "femenina",
        },
        "Soniox.tts-rt-v2.Marta",
      ],
    ] as const) {
      const sinElegir = payload(ajustes);
      expect(sinElegir.voiceSettings?.voice).toBe(voz);
      expect(JSON.stringify(payload({ ...ajustes, voz }))).toBe(
        JSON.stringify(sinElegir)
      );
    }
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
