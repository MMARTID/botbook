import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { LlamadaScroll } from "@/components/llamada-scroll";
import {
  ALTO_BOLSILLO_VH,
  leerEsquinaTelefono,
} from "@/lib/transicion-bolsillo-negocio";

/**
 * «En tu bolsillo» acaba volcando el teléfono hacia «En tu negocio», que la
 * solapa: la sección mide lo que dice `lib/transicion-bolsillo-negocio.ts` y
 * publica dónde deja la esquina del teléfono para que la escena 3D ponga la
 * tapa del portátil encima.
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

  it("publica la esquina del teléfono al montar y la retira al desmontar", () => {
    const { unmount } = render(<LlamadaScroll />);

    // En jsdom no hay layout: la esquina cae en el (0, 0) de un escenario sin
    // medidas, pero está publicada.
    expect(leerEsquinaTelefono()).toEqual({ x: 0, y: 0, radio: 0 });

    unmount();
    expect(leerEsquinaTelefono()).toBeNull();
  });
});
