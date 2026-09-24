import { describe, it, expect } from "vitest";
import { LimitadorEnMemoria } from "../../src/lib/limitadorEnMemoria.js";

describe("LimitadorEnMemoria", () => {
  it("deja pasar hasta el máximo y corta a partir de ahí", () => {
    const limitador = new LimitadorEnMemoria(3, 60_000);

    expect(limitador.permite("ip")).toBe(true);
    expect(limitador.permite("ip")).toBe(true);
    expect(limitador.permite("ip")).toBe(true);
    expect(limitador.permite("ip")).toBe(false);
  });

  it("cuenta por clave: una IP no gasta el cupo de otra", () => {
    const limitador = new LimitadorEnMemoria(1, 60_000);

    expect(limitador.permite("ip_a")).toBe(true);
    expect(limitador.permite("ip_b")).toBe(true);
    expect(limitador.permite("ip_a")).toBe(false);
  });

  it("vuelve a dejar pasar cuando la ventana caduca", async () => {
    const limitador = new LimitadorEnMemoria(1, 20);

    expect(limitador.permite("ip")).toBe(true);
    expect(limitador.permite("ip")).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(limitador.permite("ip")).toBe(true);
  });
});
