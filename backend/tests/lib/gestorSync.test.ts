import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { telnyxAiAdapter } from "../../src/adapters/telnyx/TelnyxAiAdapter.js";
import { buildGestorAssistantPayload } from "../../src/lib/gestorPayload.js";
import { gestorAlDia, sincronizarGestor } from "../../src/lib/gestorSync.js";

vi.mock("../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: {
    createAssistant: vi.fn(),
    getAssistant: vi.fn(),
    updateAssistant: vi.fn(),
  },
}));

const mockedCreate = vi.mocked(telnyxAiAdapter.createAssistant);
const mockedGet = vi.mocked(telnyxAiAdapter.getAssistant);
const mockedUpdate = vi.mocked(telnyxAiAdapter.updateAssistant);

const LOCAL = buildGestorAssistantPayload("https://api.alhabla.ai");

/** Lo que devuelve Telnyx: lo nuestro más valores por defecto suyos. */
function remotoIgual() {
  return {
    id: "assistant-gestor",
    name: LOCAL.name,
    instructions: LOCAL.instructions,
    model: LOCAL.model,
    tools: (
      LOCAL.tools as Array<{ type: string; webhook: Record<string, unknown> }>
    ).map((t) => ({
      type: t.type,
      webhook: {
        ...t.webhook,
        timeout_ms: 20000,
        async: false,
        method: "POST",
      },
    })),
  };
}

describe("gestorAlDia", () => {
  it("ignora los valores por defecto que añade Telnyx y el orden de cabeceras", () => {
    const remoto = remotoIgual();
    remoto.tools[0].webhook.headers = [
      ...(remoto.tools[0].webhook.headers as unknown[]),
    ].reverse();
    expect(gestorAlDia(remoto, LOCAL)).toBe(true);
  });

  it("detecta drift en instrucciones, modelo, url, cabeceras o parámetros de una tool", () => {
    expect(
      gestorAlDia({ ...remotoIgual(), instructions: "otro prompt" }, LOCAL)
    ).toBe(false);
    expect(
      gestorAlDia({ ...remotoIgual(), model: "openai/gpt-4o-mini" }, LOCAL)
    ).toBe(false);

    const url = remotoIgual();
    url.tools[0].webhook.url =
      "https://otro.host/webhooks/telnyx/gestor/contexto_negocio";
    expect(gestorAlDia(url, LOCAL)).toBe(false);

    const cabecera = remotoIgual();
    cabecera.tools[0].webhook.headers = [
      { name: "X-Alhabla-Business", value: "{{business_id}}" },
    ];
    expect(gestorAlDia(cabecera, LOCAL)).toBe(false);

    const menos = remotoIgual();
    menos.tools = menos.tools.slice(1);
    expect(gestorAlDia(menos, LOCAL)).toBe(false);
  });
});

describe("sincronizarGestor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.BASE_URL = "https://api.alhabla.ai";
    process.env.TELNYX_GESTOR_ASSISTANT_ID = "assistant-gestor";
  });
  afterEach(() => {
    delete process.env.BASE_URL;
    delete process.env.TELNYX_GESTOR_ASSISTANT_ID;
  });

  it("sin BASE_URL no hace nada; sin id tampoco salvo con --crear", async () => {
    delete process.env.BASE_URL;
    expect(await sincronizarGestor()).toEqual({ estado: "sin_base_url" });
    process.env.BASE_URL = "https://api.alhabla.ai";
    delete process.env.TELNYX_GESTOR_ASSISTANT_ID;
    expect(await sincronizarGestor()).toEqual({ estado: "sin_id" });
    expect(mockedCreate).not.toHaveBeenCalled();

    mockedCreate.mockResolvedValueOnce({
      id: "assistant-nuevo",
      name: LOCAL.name,
      instructions: LOCAL.instructions,
    });
    expect(await sincronizarGestor({ crear: true })).toEqual({
      estado: "creado",
      id: "assistant-nuevo",
    });
    expect(mockedCreate).toHaveBeenCalledWith(LOCAL);
  });

  it("al día: no actualiza; con drift: actualiza con el payload completo", async () => {
    mockedGet.mockResolvedValueOnce(remotoIgual());
    expect(await sincronizarGestor()).toEqual({
      estado: "al_dia",
      id: "assistant-gestor",
    });
    expect(mockedUpdate).not.toHaveBeenCalled();

    mockedGet.mockResolvedValueOnce({
      ...remotoIgual(),
      instructions: "viejo",
    });
    mockedUpdate.mockResolvedValueOnce({
      id: "assistant-gestor",
      name: LOCAL.name,
      instructions: LOCAL.instructions,
    });
    expect(await sincronizarGestor()).toEqual({
      estado: "actualizado",
      id: "assistant-gestor",
    });
    expect(mockedUpdate).toHaveBeenCalledWith("assistant-gestor", LOCAL);
  });

  it("un error de Telnyx vuelve como estado error, sin lanzar", async () => {
    mockedGet.mockRejectedValueOnce(new Error("404"));
    expect(await sincronizarGestor()).toEqual({
      estado: "error",
      id: "assistant-gestor",
      motivo: "404",
    });
  });
});
