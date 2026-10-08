import { describe, it, expect } from "vitest";
import { comprobarEntornoDeTest } from "../integration/helpers/entornoDeTest.js";

describe("comprobarEntornoDeTest", () => {
  it("deja pasar la base y el Redis de test", () => {
    expect(() =>
      comprobarEntornoDeTest({
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/alhabla_test",
        REDIS_URL: "redis://localhost:6379/1",
      })
    ).not.toThrow();
  });

  it("se niega a vaciar la base de desarrollo o la de producción", () => {
    expect(() =>
      comprobarEntornoDeTest({
        DATABASE_URL: "postgresql://u:p@postgres:5432/botbook",
        REDIS_URL: "redis://localhost:6379/1",
      })
    ).toThrow(/no termina en _test/);
  });

  it("se niega a vaciar el Redis de desarrollo", () => {
    for (const REDIS_URL of ["redis://localhost:6379", "redis://localhost:6379/0"]) {
      expect(() =>
        comprobarEntornoDeTest({
          DATABASE_URL: "postgresql://u:p@localhost:5432/alhabla_test",
          REDIS_URL,
        })
      ).toThrow(/índice 0/);
    }
  });

  it("sin variables no sigue", () => {
    expect(() => comprobarEntornoDeTest({})).toThrow(/no es una URL válida/);
  });
});
