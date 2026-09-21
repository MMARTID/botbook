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
});
