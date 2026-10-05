import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveTelnyxEligibility,
  resolveTelnyxVoiceId,
} from "../../src/lib/telnyxEligibility.js";
import { telnyxAiAdapter } from "../../src/adapters/telnyx/TelnyxAiAdapter.js";
import { DEFAULT_AGENT_SETTINGS } from "../../src/lib/managedAgentPrompt.js";

vi.mock("../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: { listVoices: vi.fn() },
}));

const mockedListVoices = vi.mocked(telnyxAiAdapter.listVoices);

const SPANISH_VOICES = [
  { id: "Telnyx.Ultra.female-1", language: "es-ES", gender: "Female" },
  { id: "Telnyx.Ultra.male-1", language: "es-ES", gender: "Male" },
  { id: "Telnyx.Ultra.female-mx", language: "es-MX", gender: "Female" },
];

// Así devuelve Telnyx las voces de Soniox: todas «en», sin acento.
const SONIOX_VOICES = [
  { id: "Soniox.tts-rt-v2.Nina", language: "en", gender: "female" },
  { id: "Soniox.tts-rt-v2.Marta", language: "en", gender: "female" },
  { id: "Soniox.tts-rt-v2.Sergio", language: "en", gender: "male" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveTelnyxVoiceId", () => {
  it("elige la primera voz que coincide en idioma y género", async () => {
    mockedListVoices.mockResolvedValue(SPANISH_VOICES);

    const voiceId = await resolveTelnyxVoiceId("es-ES", "femenina");

    expect(voiceId).toBe("Telnyx.Ultra.female-1");
  });

  it("es insensible a mayúsculas en el idioma que devuelve la API (no en el parámetro, que ya es un enum tipado)", async () => {
    // La reserva solo da Ultra (revisión del 2026-10-05): antes «v1».
    mockedListVoices.mockResolvedValue([
      { id: "Telnyx.Ultra.v1", language: "ES-es", gender: "female" },
    ]);

    expect(await resolveTelnyxVoiceId("es-ES", "femenina")).toBe(
      "Telnyx.Ultra.v1"
    );
  });

  it("devuelve null si no hay ninguna voz compatible", async () => {
    mockedListVoices.mockResolvedValue(SPANISH_VOICES);

    const voiceId = await resolveTelnyxVoiceId("fr-FR", "femenina");

    expect(voiceId).toBeNull();
  });

  it("prefiere la voz femenina elegida a mano (Blanca) sobre el primer match, si sigue disponible en la cuenta", async () => {
    mockedListVoices.mockResolvedValue([
      ...SPANISH_VOICES,
      {
        id: "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6",
        language: "es-ES",
        gender: "Female",
      },
    ]);

    const voiceId = await resolveTelnyxVoiceId("es-ES", "femenina");

    expect(voiceId).toBe("Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6");
  });

  it("cae al primer match si la voz femenina elegida a mano ya no está disponible en la cuenta", async () => {
    mockedListVoices.mockResolvedValue(SPANISH_VOICES);

    const voiceId = await resolveTelnyxVoiceId("es-ES", "femenina");

    expect(voiceId).toBe("Telnyx.Ultra.female-1");
  });

  it("prefiere la voz masculina elegida a mano (Marcos) sobre el primer match, si sigue disponible en la cuenta", async () => {
    mockedListVoices.mockResolvedValue([
      ...SPANISH_VOICES,
      {
        id: "Telnyx.Ultra.13ff5deb-2591-42ad-a356-63a04e524411",
        language: "es-ES",
        gender: "Male",
      },
    ]);

    const voiceId = await resolveTelnyxVoiceId("es-ES", "masculina");

    expect(voiceId).toBe("Telnyx.Ultra.13ff5deb-2591-42ad-a356-63a04e524411");
  });

  it("cae al primer match si la voz masculina elegida a mano ya no está disponible en la cuenta", async () => {
    mockedListVoices.mockResolvedValue(SPANISH_VOICES);

    const voiceId = await resolveTelnyxVoiceId("es-ES", "masculina");

    expect(voiceId).toBe("Telnyx.Ultra.male-1");
  });

  it("resuelve la voz curada de inglés (en-GB), independiente de la de español", async () => {
    mockedListVoices.mockResolvedValue([
      {
        id: "Telnyx.Ultra.2f251ac3-89a9-4a77-a452-704b474ccd01",
        language: "en-GB",
        gender: "Female",
      },
    ]);

    expect(await resolveTelnyxVoiceId("en-GB", "femenina")).toBe(
      "Telnyx.Ultra.2f251ac3-89a9-4a77-a452-704b474ccd01"
    );
  });

  it("resuelve la voz curada de francés (fr-FR), independiente de la de español", async () => {
    mockedListVoices.mockResolvedValue([
      {
        id: "Telnyx.Ultra.7345dfa5-ee04-44d2-abf4-29262b880ab4",
        language: "fr-FR",
        gender: "Male",
      },
    ]);

    expect(await resolveTelnyxVoiceId("fr-FR", "masculina")).toBe(
      "Telnyx.Ultra.7345dfa5-ee04-44d2-abf4-29262b880ab4"
    );
  });
});

describe("resolveTelnyxEligibility", () => {
  it("es elegible cuando hay una voz compatible y no hay catalán", async () => {
    mockedListVoices.mockResolvedValue(SPANISH_VOICES);

    const result = await resolveTelnyxEligibility(DEFAULT_AGENT_SETTINGS);

    expect(result).toEqual({
      eligible: true,
      status: "eligible",
      reason: null,
      voiceId: "Telnyx.Ultra.female-1",
    });
  });

  it("con catalán como idioma principal es elegible con la voz de Soniox del género pedido", async () => {
    mockedListVoices.mockResolvedValue(SONIOX_VOICES);

    const result = await resolveTelnyxEligibility({
      ...DEFAULT_AGENT_SETTINGS,
      languages: ["es-ES", "ca-ES"],
      voiceLanguage: "ca-ES",
    });

    expect(result).toEqual({
      eligible: true,
      status: "eligible",
      reason: null,
      voiceId: "Soniox.tts-rt-v2.Marta",
    });
    expect(mockedListVoices).toHaveBeenCalledWith("soniox");
  });

  it("con euskera o gallego como principal y voz masculina usa Sergio", async () => {
    mockedListVoices.mockResolvedValue(SONIOX_VOICES);

    for (const idioma of ["eu-ES", "gl-ES"] as const) {
      const result = await resolveTelnyxEligibility({
        ...DEFAULT_AGENT_SETTINGS,
        voiceGender: "masculina",
        languages: ["es-ES", idioma],
        voiceLanguage: idioma,
      });
      expect(result.voiceId).toBe("Soniox.tts-rt-v2.Sergio");
    }
  });

  it("sin la voz de Soniox elegida cae a otra del mismo género, y sin ninguna no es elegible", async () => {
    mockedListVoices.mockResolvedValue([
      { id: "Soniox.tts-rt-v2.Nina", language: "en", gender: "female" },
    ]);
    const conOtra = await resolveTelnyxEligibility({
      ...DEFAULT_AGENT_SETTINGS,
      languages: ["es-ES", "ca-ES"],
      voiceLanguage: "ca-ES",
    });
    expect(conOtra.voiceId).toBe("Soniox.tts-rt-v2.Nina");

    mockedListVoices.mockResolvedValue([]);
    const sinVoz = await resolveTelnyxEligibility({
      ...DEFAULT_AGENT_SETTINGS,
      languages: ["es-ES", "ca-ES"],
      voiceLanguage: "ca-ES",
    });
    expect(sinVoz.eligible).toBe(false);
    expect(sinVoz.reason).toMatch(/voz Soniox/);
  });

  it("la voz de Soniox de reserva nunca es una Ultra del mismo género", async () => {
    mockedListVoices.mockResolvedValue(SPANISH_VOICES);

    const result = await resolveTelnyxEligibility({
      ...DEFAULT_AGENT_SETTINGS,
      languages: ["es-ES", "ca-ES"],
      voiceLanguage: "ca-ES",
    });

    expect(result.eligible).toBe(false);
  });

  it("con catalán activo usa la voz de Soniox aunque el principal guardado sea español", async () => {
    mockedListVoices.mockResolvedValue(SONIOX_VOICES);

    const result = await resolveTelnyxEligibility({
      ...DEFAULT_AGENT_SETTINGS,
      languages: ["es-ES", "ca-ES"],
    });

    expect(result.voiceId).toBe("Soniox.tts-rt-v2.Marta");
  });

  describe("con una voz elegida por el dueño", () => {
    const catalanConSergio = {
      ...DEFAULT_AGENT_SETTINGS,
      languages: ["es-ES" as const, "ca-ES" as const],
      voiceLanguage: "ca-ES" as const,
      voz: "Soniox.tts-rt-v2.Sergio",
    };

    it("atiende ella si sigue en la cuenta, aunque el género guardado sea otro", async () => {
      mockedListVoices.mockResolvedValue(SONIOX_VOICES);

      const result = await resolveTelnyxEligibility(catalanConSergio);

      expect(result.voiceId).toBe("Soniox.tts-rt-v2.Sergio");
    });

    it("si ya no está, la red de seguridad busca otra de su proveedor y género, con una sola consulta", async () => {
      mockedListVoices.mockResolvedValue([
        { id: "Soniox.tts-rt-v2.Marta", language: "en", gender: "female" },
        { id: "Soniox.tts-rt-v2.Daniel", language: "en", gender: "male" },
      ]);

      const result = await resolveTelnyxEligibility(catalanConSergio);

      expect(result.voiceId).toBe("Soniox.tts-rt-v2.Daniel");
      expect(mockedListVoices).toHaveBeenCalledTimes(1);
    });
  });

  it("no es elegible si la cuenta no tiene voz compatible", async () => {
    mockedListVoices.mockResolvedValue([]);

    const result = await resolveTelnyxEligibility(DEFAULT_AGENT_SETTINGS);

    expect(result.eligible).toBe(false);
    expect(result.status).toBe("ineligible");
    expect(result.voiceId).toBeNull();
    expect(result.reason).toMatch(/voz Telnyx compatible/);
  });

  it("no es elegible y no lanza si la API de voces falla", async () => {
    mockedListVoices.mockRejectedValue(new Error("Telnyx down"));

    const result = await resolveTelnyxEligibility(DEFAULT_AGENT_SETTINGS);

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("Telnyx down");
  });
});

// La API lista las nativas de alemán, italiano y neerlandés sin región
// («de», «it», «nl»): antes la reserva las comparaba con «de-DE» y nunca
// las encontraba (2026-10-05).
describe("resolveTelnyxVoiceId — reserva con los locales de Telnyx", () => {
  it("reconoce las nativas sin región como de su idioma", async () => {
    mockedListVoices.mockResolvedValue([
      { id: "Telnyx.Ultra.de-1", language: "de", gender: "Female" },
      { id: "Telnyx.Ultra.it-1", language: "it", gender: "Male" },
      { id: "Telnyx.Ultra.nl-1", language: "nl", gender: "Female" },
    ]);

    expect(await resolveTelnyxVoiceId("de-DE", "femenina")).toBe(
      "Telnyx.Ultra.de-1"
    );
    expect(await resolveTelnyxVoiceId("it-IT", "masculina")).toBe(
      "Telnyx.Ultra.it-1"
    );
    expect(await resolveTelnyxVoiceId("nl-NL", "femenina")).toBe(
      "Telnyx.Ultra.nl-1"
    );
  });

  it("no da de reserva una voz deprecada ni, en español, una de otro acento", async () => {
    mockedListVoices.mockResolvedValue([
      {
        id: "Telnyx.Ultra.deprecada",
        language: "es-ES",
        gender: "Female",
        deprecated: true,
      },
      {
        id: "Telnyx.Ultra.mexicana",
        language: "es-ES",
        gender: "Female",
        accent: "Mexican",
      },
      {
        id: "Telnyx.Ultra.castellana",
        language: "es-ES",
        gender: "Female",
        accent: "Castilian",
      },
    ]);

    expect(await resolveTelnyxVoiceId("es-ES", "femenina")).toBe(
      "Telnyx.Ultra.castellana"
    );
  });

  // Revisión del 2026-10-05: con el volcado real de la API sin las voces
  // del catálogo, la reserva daba Telnyx.KokoroTTS.ef_dora (es-ES, sin
  // acento), una voz monolingüe que no habla el inglés activo.
  it("de reserva solo da una Ultra, nunca de otro modelo ni de las que la curación excluye", async () => {
    mockedListVoices.mockResolvedValue([
      { id: "Telnyx.KokoroTTS.ef_dora", language: "es-ES", gender: "Female" },
      {
        id: "Telnyx.Ultra.latina",
        language: "es-ES",
        gender: "Female",
        accent: "Latin American",
      },
      {
        id: "Telnyx.Ultra.castellana",
        language: "es-ES",
        gender: "Female",
        accent: "Castilian",
      },
      { id: "Telnyx.KokoroTTS.bm_george", language: "en-GB", gender: "Male" },
      // Caspian - Oracle: excluida (efecto de eco).
      {
        id: "Telnyx.Ultra.d7862948-75c3-4c7c-ae28-2959fe166f49",
        language: "en-GB",
        gender: "Male",
      },
      { id: "Telnyx.Ultra.britanico", language: "en-GB", gender: "Male" },
    ]);

    expect(await resolveTelnyxVoiceId("es-ES", "femenina")).toBe(
      "Telnyx.Ultra.castellana"
    );
    expect(await resolveTelnyxVoiceId("en-GB", "masculina")).toBe(
      "Telnyx.Ultra.britanico"
    );
    const conIngles = await resolveTelnyxEligibility({
      ...DEFAULT_AGENT_SETTINGS,
      languages: ["es-ES", "en-GB"],
    });
    expect(conIngles.voiceId).toBe("Telnyx.Ultra.castellana");
  });

  it("sin ninguna Ultra de su idioma en la cuenta no es elegible, aunque haya voces de otros modelos", async () => {
    mockedListVoices.mockResolvedValue([
      { id: "Telnyx.KokoroTTS.ff_siwis", language: "fr-FR", gender: "Female" },
    ]);

    const result = await resolveTelnyxEligibility({
      ...DEFAULT_AGENT_SETTINGS,
      languages: ["es-ES", "fr-FR"],
      voiceLanguage: "fr-FR",
    });

    expect(result.eligible).toBe(false);
    expect(result.voiceId).toBeNull();
  });

  it("un negocio que saluda en alemán es elegible con la voz alemana del catálogo", async () => {
    mockedListVoices.mockResolvedValue([
      {
        id: "Telnyx.Ultra.e00dd3df-19e7-4cd4-827a-7ff6687b6954",
        language: "de",
        gender: "Male",
      },
    ]);

    const result = await resolveTelnyxEligibility({
      ...DEFAULT_AGENT_SETTINGS,
      voiceGender: "masculina",
      languages: ["es-ES", "de-DE"],
      voiceLanguage: "de-DE",
    });

    expect(result).toEqual({
      eligible: true,
      status: "eligible",
      reason: null,
      voiceId: "Telnyx.Ultra.e00dd3df-19e7-4cd4-827a-7ff6687b6954",
    });
    expect(mockedListVoices).toHaveBeenCalledWith("telnyx");
  });

  it("con catalán activo y saludo en español usa la voz de Soniox", async () => {
    mockedListVoices.mockResolvedValue(SONIOX_VOICES);

    const result = await resolveTelnyxEligibility({
      ...DEFAULT_AGENT_SETTINGS,
      voiceGender: "masculina",
      languages: ["es-ES", "ca-ES"],
      voiceLanguage: "es-ES",
    });

    expect(result.voiceId).toBe("Soniox.tts-rt-v2.Sergio");
    expect(mockedListVoices).toHaveBeenCalledWith("soniox");
  });
});
