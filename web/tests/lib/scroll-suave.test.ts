import { describe, it, expect, afterEach } from "vitest";

import {
  escucharScrollSuave,
  progresoDe,
  scrollSuave,
} from "@/lib/scroll-suave";

/**
 * El scroll suave compartido por «En tu bolsillo» y «En tu negocio»: lo que
 * se puede comprobar sin layout ni fotogramas es que arranca en el scroll
 * real, que avisa al darse de alta y que el progreso de una sección va de 0 a
 * 1 como el de `useScroll`.
 */
describe("scroll-suave", () => {
  afterEach(() => {
    window.scrollY = 0;
  });

  it("avisa al darse de alta con el scroll real y se da de baja", () => {
    window.scrollY = 1200;
    const vistos: number[] = [];
    const baja = escucharScrollSuave((y) => vistos.push(y));
    expect(vistos[0]).toBe(1200);
    expect(scrollSuave()).toBe(1200);
    baja();
  });

  it("el progreso de una sección alta va de 0 a 1 y no se sale", () => {
    const seccion = document.createElement("section");
    Object.defineProperty(seccion, "offsetHeight", { value: 3000 });
    seccion.getBoundingClientRect = () =>
      ({ top: 1000 - window.scrollY }) as DOMRect;
    window.scrollY = 0;
    const recorrido = 3000 - window.innerHeight;
    expect(progresoDe(seccion, 500)).toBe(0);
    expect(progresoDe(seccion, 1000)).toBe(0);
    expect(progresoDe(seccion, 1000 + recorrido / 2)).toBeCloseTo(0.5);
    expect(progresoDe(seccion, 1000 + recorrido)).toBe(1);
    expect(progresoDe(seccion, 9000)).toBe(1);
  });
});
