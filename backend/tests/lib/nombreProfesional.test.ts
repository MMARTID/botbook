import { describe, expect, it } from "vitest";
import {
  esNombreProvisional,
  nombreParaElCliente,
} from "../../src/lib/nombreProfesional.js";

describe("nombreProfesional", () => {
  it("reconoce los nombres provisionales del alta («Profesional N»)", () => {
    expect(esNombreProvisional("Profesional 1")).toBe(true);
    expect(esNombreProvisional("profesional 12")).toBe(true);
    expect(esNombreProvisional("  Profesional 3 ")).toBe(true);
  });

  it("deja pasar los nombres reales, aunque contengan la palabra", () => {
    expect(esNombreProvisional("Ernesto")).toBe(false);
    expect(esNombreProvisional("Profesional de color")).toBe(false);
    expect(esNombreProvisional("")).toBe(false);
    expect(esNombreProvisional(null)).toBe(false);
  });

  it("nombreParaElCliente calla el provisional y devuelve el real", () => {
    expect(nombreParaElCliente("Profesional 2")).toBeNull();
    expect(nombreParaElCliente("Ernesto")).toBe("Ernesto");
    expect(nombreParaElCliente(undefined)).toBeNull();
  });
});
