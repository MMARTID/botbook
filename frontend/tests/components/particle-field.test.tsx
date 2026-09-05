import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ParticleField } from "@/components/particle-field";

/**
 * El campo ya no anima desde JavaScript: dibuja un tile por capa una sola vez
 * y a partir de ahí todo el movimiento es CSS del compositor. Estos tests
 * cubren lo que sí es observable sin motor de layout: accesibilidad, que se
 * genere un fondo por capa, que un cambio de alto (barra de direcciones del
 * móvil) NO lo regenere, y que no se filtren object URLs.
 */

function contextoFalso() {
  return {
    drawImage: vi.fn(),
    setTransform: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    globalAlpha: 1,
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
}

let contadorUrl = 0;

function prepararCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => contextoFalso());
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback
  ) {
    callback(new Blob(["x"], { type: "image/png" }));
  });
}

describe("ParticleField", () => {
  beforeEach(() => {
    contadorUrl = 0;
    prepararCanvas();
    URL.createObjectURL = vi.fn(() => `blob:tile-${++contadorUrl}`);
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("es decorativo: no lo anuncia el lector de pantalla ni intercepta el puntero", () => {
    render(<ParticleField />);

    const campo = screen.getByTestId("particle-field");
    expect(campo).toHaveAttribute("aria-hidden", "true");
    expect(campo.className).toContain("campo-particulas");
  });

  it("no lanza cuando el navegador no da contexto 2D", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    expect(() => render(<ParticleField />)).not.toThrow();
    expect(screen.getByTestId("particle-field")).toBeInTheDocument();
  });

  it("pinta un fondo repetible por cada capa de profundidad", async () => {
    render(<ParticleField />);

    await waitFor(() => {
      const capas = Array.from(
        screen.getByTestId("particle-field").querySelectorAll<HTMLElement>(".campo-particulas__deriva")
      );
      expect(capas).toHaveLength(3);
      for (const capa of capas) {
        expect(capa.style.backgroundImage).toContain("blob:tile-");
      }
    });
  });

  it("no anima desde JavaScript: nunca pide un fotograma", async () => {
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");

    render(<ParticleField />);
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());

    expect(rafSpy).not.toHaveBeenCalled();
  });

  // La barra de direcciones del móvil cambia `innerHeight` en cuanto se hace
  // scroll. Regenerar ahí hacía saltar el fondo de posición (bug reportado).
  it("un resize de solo altura (barra de direcciones móvil) no regenera los tiles", async () => {
    render(<ParticleField />);
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(3));

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: window.innerHeight - 80,
    });
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
  });

  it("un cambio de ancho real sí regenera los tiles", async () => {
    render(<ParticleField />);
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(3));

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 500 });
    window.dispatchEvent(new Event("resize"));

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(6));
    // Los tiles antiguos se liberan al sustituirlos.
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("libera los object URLs al desmontar", async () => {
    const { unmount } = render(<ParticleField />);
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(3));

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
  });
});
