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
    mockedListVoices.mockResolvedValue([
      { id: "v1", language: "ES-es", gender: "female" },
    ]);

    expect(await resolveTelnyxVoiceId("es-ES", "femenina")).toBe("v1");
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
    const SERENA = "Minimax.speech-2.8-turbo.Spanish_SereneWoman";
    const catalanConSerena = {
      ...DEFAULT_AGENT_SETTINGS,
      languages: ["es-ES" as const, "ca-ES" as const],
      voiceLanguage: "ca-ES" as const,
      voz: SERENA,
    };

    it("atiende ella si sigue en la cuenta", async () => {
      mockedListVoices.mockImplementation(async (proveedor) =>
        proveedor === "minimax"
          ? [{ id: SERENA, language: "es-ES", gender: "female" }]
          : []
      );

      const result = await resolveTelnyxEligibility(catalanConSerena);

      expect(result.voiceId).toBe(SERENA);
      expect(mockedListVoices).toHaveBeenCalledWith("minimax");
    });

    it("si ya no está, prueba las demás de su género del catálogo antes que la red de seguridad", async () => {
      mockedListVoices.mockImplementation(async (proveedor) =>
        proveedor === "soniox" ? SONIOX_VOICES : []
      );

      const result = await resolveTelnyxEligibility(catalanConSerena);

      expect(result.voiceId).toBe("Soniox.tts-rt-v2.Marta");
      // MiniMax (Serena) y Soniox (Marta, la siguiente): una consulta por
      // proveedor, no una por voz, y sin llegar a Azure.
      expect(mockedListVoices).toHaveBeenCalledTimes(2);
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
