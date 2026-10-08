import { describe, it, expect } from "vitest";
import { destinoTrasLogin } from "@/lib/login-next";

describe("destinoTrasLogin", () => {
  it("vuelve a la ruta interna pedida y, sin next, al panel", () => {
    expect(destinoTrasLogin("?next=%2Fcheckout%3Fplan%3Dpro")).toBe(
      "/checkout?plan=pro"
    );
    expect(destinoTrasLogin("")).toBe("/");
    expect(destinoTrasLogin("?next=")).toBe("/");
  });

  it("nunca sale del dominio (redirect abierto)", () => {
    expect(destinoTrasLogin("?next=https%3A%2F%2Fmalo.com")).toBe("/");
    expect(destinoTrasLogin("?next=%2F%2Fmalo.com%2Fx")).toBe("/");
    expect(destinoTrasLogin("?next=javascript%3Aalert(1)")).toBe("/");
  });

  it("no se deja engañar por la barra invertida ni por tabuladores", () => {
    // El navegador lee `/\malo.com` y `/<tab>/malo.com` como `//malo.com`.
    expect(destinoTrasLogin("?next=%2F%5Cmalo.com")).toBe("/");
    expect(destinoTrasLogin("?next=%2F%09%2Fmalo.com")).toBe("/");
    expect(destinoTrasLogin("?next=%2F%0A%2Fmalo.com")).toBe("/");
  });

  it("conserva la ruta, la query y el ancla de un destino interno", () => {
    expect(destinoTrasLogin("?next=%2Fagenda%3Fdia%3D2026-10-08%23hoy")).toBe(
      "/agenda?dia=2026-10-08#hoy"
    );
  });
});
