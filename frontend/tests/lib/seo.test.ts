import { describe, it, expect } from "vitest";
import { absoluteUrl } from "@/lib/seo";

describe("absoluteUrl", () => {
  it("sin NEXT_PUBLIC_SITE_URL configurado, devuelve el path tal cual", () => {
    // No hay .env.local en el entorno de test, así que siteUrl es undefined.
    expect(absoluteUrl("/planes")).toBe("/planes");
  });

  it("usa '/' como path por defecto", () => {
    expect(absoluteUrl()).toBe("/");
  });
});
