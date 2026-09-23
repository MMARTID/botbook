import { describe, expect, it } from "vitest";
import { esDestinoInterno } from "@/lib/preview/url";

describe("destino de previsualización", () => {
  it("solo acepta destinos internos", () => {
    expect(esDestinoInterno("/blog/x")).toBe(true);
    expect(esDestinoInterno("//evil.example")).toBe(false);
    expect(esDestinoInterno("https://evil.example")).toBe(false);
  });
});
