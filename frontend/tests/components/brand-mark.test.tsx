import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandMark } from "@/components/brand-mark";

describe("BrandMark", () => {
  it("fija el tamaño con className y se llama «Alhabla»", () => {
    render(<BrandMark className="h-11 w-11" />);
    const logo = screen.getByRole("img", { name: "Alhabla" });
    expect(logo).toHaveClass("h-11", "w-11");
  });

  // Fuera de Next (claude.ai/design) no existe public/: con una ruta
  // /brand/... la tarjeta y los diseños salen con la imagen rota.
  it("lleva el isotipo dentro como data URI, sin depender de public/", () => {
    render(<BrandMark />);
    const src = screen
      .getByRole("img", { name: "Alhabla" })
      .getAttribute("src");
    expect(src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    const svg = decodeURIComponent(src!.split(",").slice(1).join(","));
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 1254 1254"/);
    expect(svg).toContain("</svg>");
  });
});
