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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveTelnyxVoiceId", () => {
  it("elige la primera voz que coincide en idioma y género", async () => {
    mockedListVoices.mockResolvedValue(SPANISH_VOICES);

    const voiceId = await resolveTelnyxVoiceId("es-ES", "femenina");

    expect(voiceId).toBe("Telnyx.Ultra.female-1");
  });

  it("es insensible a mayúsculas en el idioma", async () => {
    mockedListVoices.mockResolvedValue([
      { id: "v1", language: "ES-es", gender: "Female" },
    ]);

    expect(await resolveTelnyxVoiceId("es-es", "femenina")).toBe("v1");
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

  it("no aplica ninguna voz preferida para la voz masculina (no hay ninguna configurada)", async () => {
    mockedListVoices.mockResolvedValue(SPANISH_VOICES);

    const voiceId = await resolveTelnyxVoiceId("es-ES", "masculina");

    expect(voiceId).toBe("Telnyx.Ultra.male-1");
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

  it("nunca es elegible con catalán habilitado, sin consultar la API de voces", async () => {
    const result = await resolveTelnyxEligibility({
      ...DEFAULT_AGENT_SETTINGS,
      languages: ["es-ES", "ca-ES"],
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/catal/i);
    expect(mockedListVoices).not.toHaveBeenCalled();
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
