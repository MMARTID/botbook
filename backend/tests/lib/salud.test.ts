import { describe, it, expect } from "vitest";
import { comprobarSalud } from "../../src/lib/salud.js";

const bien = () => Promise.resolve("ok");
const mal = () => Promise.reject(new Error("caído"));

describe("comprobarSalud (GET /health)", () => {
  it("con todo bien, sale sano y lista cada dependencia", async () => {
    const resultado = await comprobarSalud({
      criticas: { postgres: bien, redis: bien },
      informativas: { telnyx: bien, retell: bien },
    });

    expect(resultado).toEqual({
      healthy: true,
      dependencies: { postgres: "ok", redis: "ok", telnyx: "ok", retell: "ok" },
    });
  });

  it("si cae Telnyx o Retell lo dice, pero sigue sano: el deploy no debe revertir por ellos", async () => {
    const resultado = await comprobarSalud({
      criticas: { postgres: bien, redis: bien },
      informativas: { telnyx: mal, retell: mal },
    });

    expect(resultado.healthy).toBe(true);
    expect(resultado.dependencies).toMatchObject({
      telnyx: "unhealthy",
      retell: "unhealthy",
    });
  });

  it.each(["postgres", "redis"])("si cae %s, no está sano", async (critica) => {
    const resultado = await comprobarSalud({
      criticas: { postgres: bien, redis: bien, [critica]: mal },
      informativas: { telnyx: bien },
    });

    expect(resultado.healthy).toBe(false);
    expect(resultado.dependencies[critica]).toBe("unhealthy");
  });

  it("sin claves de proveedores, solo salen las críticas", async () => {
    const resultado = await comprobarSalud({
      criticas: { postgres: bien, redis: bien },
      informativas: {},
    });

    expect(resultado.dependencies).toEqual({ postgres: "ok", redis: "ok" });
  });
});
