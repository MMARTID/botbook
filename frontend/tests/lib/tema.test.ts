import { describe, it, expect, beforeEach, vi } from "vitest";
import { elegirTema, leerPreferencia, resolverTema } from "@/lib/tema";
import { CLAVE_DE_TEMA, SCRIPT_DE_TEMA } from "@/lib/tema-inicial";

function sistemaEnOscuro(oscuro: boolean) {
  window.matchMedia = vi.fn().mockImplementation((consulta: string) => ({
    matches: oscuro && consulta.includes("dark"),
    media: consulta,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.tema;
  sistemaEnOscuro(false);
});

describe("tema", () => {
  it("por defecto sigue al sistema", () => {
    expect(leerPreferencia()).toBe("sistema");
    expect(resolverTema("sistema")).toBe("claro");
    sistemaEnOscuro(true);
    expect(resolverTema("sistema")).toBe("oscuro");
  });

  it("elegir un tema lo aplica y lo recuerda; «sistema» borra la elección", () => {
    sistemaEnOscuro(true);
    elegirTema("claro");
    expect(localStorage.getItem(CLAVE_DE_TEMA)).toBe("claro");
    expect(document.documentElement.dataset.tema).toBe("claro");
    expect(leerPreferencia()).toBe("claro");

    elegirTema("sistema");
    expect(localStorage.getItem(CLAVE_DE_TEMA)).toBeNull();
    expect(document.documentElement.dataset.tema).toBe("oscuro");
  });

  it("ignora un valor guardado que no conoce", () => {
    localStorage.setItem(CLAVE_DE_TEMA, "azul");
    expect(leerPreferencia()).toBe("sistema");
  });

  it("el script del <head> pone el tema antes de pintar, con lo guardado o con el sistema", () => {
    sistemaEnOscuro(true);
    new Function(SCRIPT_DE_TEMA)();
    expect(document.documentElement.dataset.tema).toBe("oscuro");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    localStorage.setItem(CLAVE_DE_TEMA, "claro");
    new Function(SCRIPT_DE_TEMA)();
    expect(document.documentElement.dataset.tema).toBe("claro");
  });
});
