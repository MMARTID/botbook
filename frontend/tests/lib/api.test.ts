import { describe, it, expect, beforeEach, vi } from "vitest";
import { api, getGoogleAuthUrl } from "@/lib/api";

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
