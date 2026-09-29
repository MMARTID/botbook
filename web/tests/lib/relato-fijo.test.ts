import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { marcarRelato } from "@/lib/relato-fijo";

/**
 * «En tu bolsillo» y «En tu negocio» van seguidas y las dos marcan
 * `data-relato` en <html> mientras están a la vista. Al pasar de una a otra,
 * la que sale no puede borrar la marca que acaba de poner la que entra (el
 * orden de los avisos de IntersectionObserver no está garantizado).
 */

const avisos = new Map<Element, IntersectionObserverCallback>();

class ObservadorFalso {
  constructor(private readonly aviso: IntersectionObserverCallback) {}
  observe(el: Element) {
    avisos.set(el, this.aviso);
  }
  unobserve() {}
  disconnect() {}
}

function avisar(el: Element, aLaVista: boolean) {
  avisos.get(el)?.(
    [{ isIntersecting: aLaVista, target: el } as IntersectionObserverEntry],
    {} as IntersectionObserver
  );
}

const html = () => document.documentElement;

describe("marcarRelato", () => {
  beforeEach(() => {
    avisos.clear();
    vi.stubGlobal("IntersectionObserver", ObservadorFalso);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    html().removeAttribute("data-relato");
  });

  it("marca <html> mientras la sección está a la vista", () => {
    const seccion = document.createElement("section");
    const limpiar = marcarRelato(seccion);

    avisar(seccion, true);
    expect(html()).toHaveAttribute("data-relato");
    avisar(seccion, false);
    expect(html()).not.toHaveAttribute("data-relato");

    limpiar();
  });

  it("al pasar a la siguiente sección, la que sale no borra la marca", () => {
    const bolsillo = document.createElement("section");
    const negocio = document.createElement("section");
    const limpiarBolsillo = marcarRelato(bolsillo);
    const limpiarNegocio = marcarRelato(negocio);

    avisar(bolsillo, true);
    avisar(negocio, true);
    avisar(bolsillo, false);
    expect(html()).toHaveAttribute("data-relato");

    avisar(negocio, false);
    expect(html()).not.toHaveAttribute("data-relato");

    limpiarBolsillo();
    limpiarNegocio();
  });

  it("al desmontar solo quita la marca si no queda otra sección a la vista", () => {
    const bolsillo = document.createElement("section");
    const negocio = document.createElement("section");
    const limpiarBolsillo = marcarRelato(bolsillo);
    const limpiarNegocio = marcarRelato(negocio);
    avisar(bolsillo, true);
    avisar(negocio, true);

    limpiarBolsillo();
    expect(html()).toHaveAttribute("data-relato");
    limpiarNegocio();
    expect(html()).not.toHaveAttribute("data-relato");
  });
});
