import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

/**
 * «En tu negocio» pinta todo su marcado con React (los textos tienen que estar
 * en el HTML) y deja el movimiento a `en-tu-negocio-escena.ts`, que trae
 * three.js: solo se descarga cuando la sección se acerca. Sin WebGL o con
 * `prefers-reduced-motion`, versión quieta.
 */

const { montarEscena, reducido } = vi.hoisted(() => ({
  montarEscena: vi.fn(),
  reducido: { valor: false },
}));

vi.mock("@/components/en-tu-negocio-escena", () => ({ montarEscena }));
vi.mock("framer-motion", async (original) => ({
  ...(await original<typeof import("framer-motion")>()),
  useReducedMotion: () => reducido.valor,
}));

import { EnTuNegocioScroll } from "@/components/en-tu-negocio";

const avisos: { el: Element; aviso: IntersectionObserverCallback }[] = [];

class ObservadorFalso {
  constructor(private readonly aviso: IntersectionObserverCallback) {}
  observe(el: Element) {
    avisos.push({ el, aviso: this.aviso });
  }
  unobserve() {}
  disconnect() {
    for (let i = avisos.length - 1; i >= 0; i--) {
      if (avisos[i].aviso === this.aviso) avisos.splice(i, 1);
    }
  }
}

/** La sección entra en el margen de carga (y en pantalla). */
function acercar(el: Element) {
  for (const { el: observado, aviso } of [...avisos]) {
    if (observado !== el) continue;
    aviso(
      [{ isIntersecting: true, target: el } as IntersectionObserverEntry],
      {} as IntersectionObserver
    );
  }
}

const seccion = () => document.getElementById("en-tu-negocio") as HTMLElement;

describe("EnTuNegocioScroll", () => {
  beforeEach(() => {
    avisos.length = 0;
    reducido.valor = false;
    montarEscena.mockReset();
    vi.stubGlobal("IntersectionObserver", ObservadorFalso);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute("data-relato");
  });

  it("pinta los tres pasos en el HTML, con el primero activo", () => {
    render(<EnTuNegocioScroll />);

    expect(
      screen.getByRole("heading", { level: 2, name: "En tu negocio" })
    ).toBeInTheDocument();
    const pasos = screen.getAllByRole("button", { name: /^Ir al paso/ });
    expect(pasos.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Ir al paso 01: Tu panel",
      "Ir al paso 02: Llamadas",
      "Ir al paso 03: Asistente",
    ]);
    expect(pasos[0]).toHaveAttribute("aria-current", "step");
    expect(pasos[1]).not.toHaveAttribute("aria-current");
    // La lista para lectores de pantalla lleva el texto entero de cada paso.
    const lista = seccion().querySelector("ol.sr-only");
    expect(lista?.textContent).toContain(
      "Cada llamada, con su grabación y su transcripción."
    );
  });

  it("no descarga la escena hasta que la sección se acerca, y la desmonta al salir", async () => {
    const desmontar = vi.fn();
    montarEscena.mockReturnValue(desmontar);
    const { unmount } = render(<EnTuNegocioScroll />);
    expect(montarEscena).not.toHaveBeenCalled();

    acercar(seccion());

    await waitFor(() =>
      expect(montarEscena).toHaveBeenCalledWith(seccion(), expect.any(Function))
    );
    unmount();
    expect(desmontar).toHaveBeenCalledTimes(1);
  });

  it("si el modelo 3D no llega (la escena avisa después) pasa a la versión quieta", async () => {
    let alFallar: (error: unknown) => void = () => {};
    montarEscena.mockImplementation((_raiz, aviso) => {
      alFallar = aviso;
      return () => {};
    });
    render(<EnTuNegocioScroll />);
    acercar(seccion());
    await waitFor(() => expect(montarEscena).toHaveBeenCalled());

    act(() => alFallar(new Error("404 /modelos/macbook.glb")));

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "En tu negocio: todo lo que pasa, en tu panel.",
      })
    ).toBeInTheDocument();
  });

  it("acredita el modelo 3D con autor, origen y licencia (CC BY 4.0)", () => {
    render(<EnTuNegocioScroll />);

    expect(screen.getByRole("link", { name: "jackbaeten" })).toHaveAttribute(
      "href",
      "https://sketchfab.com/jackbaeten"
    );
    expect(screen.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/"
    );
    expect(
      screen.getByRole("link", { name: "«macbook pro M3 16 inch 2024»" })
    ).toHaveAttribute(
      "href",
      expect.stringContaining("sketchfab.com/3d-models")
    );
  });

  it("sin WebGL (la escena lanza) pasa a la versión quieta", async () => {
    montarEscena.mockImplementation(() => {
      throw new Error("Error creating WebGL context.");
    });
    render(<EnTuNegocioScroll />);

    acercar(seccion());

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "En tu negocio: todo lo que pasa, en tu panel.",
      })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Ir al paso/ })).toBeNull();
  });

  it("con movimiento reducido pinta la versión quieta y no carga la escena", async () => {
    reducido.valor = true;
    render(<EnTuNegocioScroll />);

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "En tu negocio: todo lo que pasa, en tu panel.",
      })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3 + 9);
    acercar(seccion());
    expect(montarEscena).not.toHaveBeenCalled();
  });
});
