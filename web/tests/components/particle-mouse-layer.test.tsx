import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ParticleMouseLayer } from "@/components/particle-mouse-layer";

/**
 * Solo debe animar en escritorio (`pointer: fine`) y sin
 * `prefers-reduced-motion`. En cualquier otro caso el bucle ni arranca — es
 * la propiedad que lo hace seguro de tener en todas las superficies públicas
 * sin arriesgar el móvil, que es donde vivían los bugs anteriores.
 */

function contextoFalso() {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
}

function simularMedios(config: { punteroFino: boolean; movimientoReducido: boolean }) {
  window.matchMedia = ((query: string) => {
    const matches = query.includes("pointer") ? config.punteroFino : config.movimientoReducido;
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  }) as unknown as typeof window.matchMedia;
}

describe("ParticleMouseLayer", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => contextoFalso());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("es decorativo: no lo anuncia el lector de pantalla ni intercepta el puntero", () => {
    simularMedios({ punteroFino: true, movimientoReducido: false });
    render(<ParticleMouseLayer />);

    const capa = screen.getByTestId("particle-mouse-layer");
    expect(capa).toHaveAttribute("aria-hidden", "true");
    expect(capa.className).toContain("pointer-events-none");
  });

  it("con puntero fino y sin reduced-motion, arranca el bucle", () => {
    simularMedios({ punteroFino: true, movimientoReducido: false });
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");

    render(<ParticleMouseLayer />);

    expect(rafSpy).toHaveBeenCalled();
  });

  it("en táctil (sin puntero fino) no arranca el bucle", () => {
    simularMedios({ punteroFino: false, movimientoReducido: false });
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");

    render(<ParticleMouseLayer />);

    expect(rafSpy).not.toHaveBeenCalled();
  });

  it("con prefers-reduced-motion no arranca el bucle aunque haya puntero fino", () => {
    simularMedios({ punteroFino: true, movimientoReducido: true });
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");

    render(<ParticleMouseLayer />);

    expect(rafSpy).not.toHaveBeenCalled();
  });

  it("cancela la animación y suelta los listeners al desmontar", () => {
    simularMedios({ punteroFino: true, movimientoReducido: false });
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");
    const quitarListener = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<ParticleMouseLayer />);
    unmount();

    expect(cancelSpy).toHaveBeenCalled();
    expect(quitarListener).toHaveBeenCalledWith("mousemove", expect.any(Function));
  });

  it("no lanza cuando el navegador no da contexto 2D", () => {
    simularMedios({ punteroFino: true, movimientoReducido: false });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    expect(() => render(<ParticleMouseLayer />)).not.toThrow();
  });
});
