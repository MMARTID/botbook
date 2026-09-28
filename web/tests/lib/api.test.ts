import { describe, it, expect, beforeEach, vi } from "vitest";
import { api, createDemoWebCall } from "@/lib/api";

const RESPUESTA = {
  assistantId: "assistant-demo",
  niche: "peluqueria",
  maxDurationSeconds: 60,
};

describe("createDemoWebCall", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Regresión: la demo pública llamaba a fetch("/api/backend/demo/web-call")
  // directamente, saltándose el cliente `api` (y con él
  // NEXT_PUBLIC_API_BASE_URL). Ese rewrite de next.config.mjs solo resuelve a
  // localhost:3000, así que en producción la demo fallaba siempre (AGENTS.md
  // § Key Components › DemoVoiceCall).
  it("usa el cliente api centralizado, no una ruta hardcodeada", async () => {
    const postSpy = vi
      .spyOn(api, "post")
      .mockResolvedValue({ data: RESPUESTA });

    const result = await createDemoWebCall("peluqueria");

    expect(postSpy).toHaveBeenCalledWith(
      "/demo/web-call",
      { niche: "peluqueria" },
      { timeout: 15000 }
    );
    expect(result).toEqual(RESPUESTA);
  });

  it("no manda niche ni placeId cuando no se indican", async () => {
    const postSpy = vi
      .spyOn(api, "post")
      .mockResolvedValue({ data: RESPUESTA });

    await createDemoWebCall();

    expect(postSpy).toHaveBeenCalledWith(
      "/demo/web-call",
      {},
      { timeout: 15000 }
    );
  });

  it("manda un timeout acotado para no dejar 'Conectando demo…' colgado", async () => {
    const postSpy = vi
      .spyOn(api, "post")
      .mockResolvedValue({ data: RESPUESTA });

    await createDemoWebCall("barberia");

    const [, , config] = postSpy.mock.calls[0];
    expect(config).toMatchObject({ timeout: expect.any(Number) });
    expect((config as { timeout: number }).timeout).toBeGreaterThan(0);
  });

  it("incluye el negocio elegido en Google Places cuando lo hay", async () => {
    const postSpy = vi
      .spyOn(api, "post")
      .mockResolvedValue({ data: RESPUESTA });

    await createDemoWebCall("peluqueria", "place_123");

    expect(postSpy).toHaveBeenCalledWith(
      "/demo/web-call",
      { niche: "peluqueria", placeId: "place_123" },
      { timeout: 15000 }
    );
  });
});
