import { describe, it, expect, beforeEach, vi } from "vitest";
import { api, createDemoWebCall, getGoogleAuthUrl } from "@/lib/api";

describe("getGoogleAuthUrl", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("no manda el parámetro acceptedTerms cuando no se indica", async () => {
    const getSpy = vi.spyOn(api, "get").mockResolvedValue({ data: { url: "https://accounts.google.com/oauth" } });

    const url = await getGoogleAuthUrl();

    expect(url).toBe("https://accounts.google.com/oauth");
    expect(getSpy).toHaveBeenCalledWith("/auth/google", { params: undefined });
  });

  it("manda acceptedTerms=true cuando se aceptaron los términos", async () => {
    const getSpy = vi.spyOn(api, "get").mockResolvedValue({ data: { url: "https://accounts.google.com/oauth" } });

    await getGoogleAuthUrl(true);

    expect(getSpy).toHaveBeenCalledWith("/auth/google", { params: { acceptedTerms: "true" } });
  });

  it("no manda el parámetro cuando acceptedTerms es false", async () => {
    const getSpy = vi.spyOn(api, "get").mockResolvedValue({ data: { url: "https://accounts.google.com/oauth" } });

    await getGoogleAuthUrl(false);

    expect(getSpy).toHaveBeenCalledWith("/auth/google", { params: undefined });
  });
});

describe("createDemoWebCall", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Regresión: el componente de la demo pública llamaba a fetch("/api/backend/demo/web-call")
  // directamente, saltándose el cliente `api` (y por tanto NEXT_PUBLIC_API_BASE_URL). El rewrite
  // de next.config.mjs solo resuelve a localhost:3000, así que en producción (Vercel) la demo
  // fallaba siempre. Esta prueba fija que la llamada pasa por `api.post`, igual que el resto del
  // cliente HTTP — ver Second-Brain "Retell" § Demo pública para el detalle completo.
  it("usa el cliente api centralizado, no una ruta hardcodeada", async () => {
    const postSpy = vi
      .spyOn(api, "post")
      .mockResolvedValue({ data: { callId: "call_123", accessToken: "token_abc" } });

    const result = await createDemoWebCall("peluqueria");

    expect(postSpy).toHaveBeenCalledWith("/demo/web-call", { niche: "peluqueria" }, { timeout: 15000 });
    expect(result).toEqual({ callId: "call_123", accessToken: "token_abc" });
  });

  it("no manda niche cuando no se indica", async () => {
    const postSpy = vi
      .spyOn(api, "post")
      .mockResolvedValue({ data: { callId: "call_123", accessToken: "token_abc" } });

    await createDemoWebCall();

    expect(postSpy).toHaveBeenCalledWith("/demo/web-call", {}, { timeout: 15000 });
  });

  it("manda un timeout acotado para no dejar 'Conectando demo…' colgado indefinidamente", async () => {
    const postSpy = vi
      .spyOn(api, "post")
      .mockResolvedValue({ data: { callId: "call_123", accessToken: "token_abc" } });

    await createDemoWebCall("barberia");

    const [, , config] = postSpy.mock.calls[0];
    expect(config).toMatchObject({ timeout: expect.any(Number) });
    expect((config as { timeout: number }).timeout).toBeGreaterThan(0);
  });
});
