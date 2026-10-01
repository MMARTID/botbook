import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { LlamadaScroll } from "@/components/llamada-scroll";
import {
  ALTO_BOLSILLO_VH,
  leerTelefono,
} from "@/lib/transicion-bolsillo-negocio";

/**
 * «En tu bolsillo» acaba tumbando el teléfono para «En tu negocio», que la
 * solapa: la sección mide lo que dice `lib/transicion-bolsillo-negocio.ts` y
 * publica dónde deja el teléfono para que la escena 3D ponga encima la
 * pantalla del portátil.
 */
describe("LlamadaScroll", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-relato");
  });

  it("pinta los tres pasos con el alto de la transición", () => {
    render(<LlamadaScroll />);

    const seccion = document.getElementById("como-funciona") as HTMLElement;
    expect(seccion.style.height).toBe(`${ALTO_BOLSILLO_VH}vh`);
    expect(
      screen.getByRole("heading", { level: 2, name: "En tu bolsillo" })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^Ir al paso/ })
    ).toHaveLength(3);
  });

  it("publica dónde queda el teléfono tumbado al montar y lo retira al desmontar", () => {
    const { unmount } = render(<LlamadaScroll />);

    // En jsdom no hay layout: en un escenario sin medidas el teléfono
    // tumbado no tiene ancho, pero está publicado.
    expect(leerTelefono()).toMatchObject({ y: 0, ancho: 0, alto: 0 });

    unmount();
    expect(leerTelefono()).toBeNull();
  });
});
