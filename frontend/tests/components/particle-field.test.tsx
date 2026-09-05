import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ParticleField } from "@/components/particle-field";

/**
 * jsdom no trae contexto 2D de canvas. Estos tests cubren el contrato que sí
 * es observable sin pintar: accesibilidad, respeto a `prefers-reduced-motion`
 * y limpieza al desmontar.
 */

function contextoFalso() {
  return {
    clearRect: vi.fn(),
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

function simularMovimientoReducido(reducido: boolean) {
  const oyentes = new Set<() => void>();
  window.matchMedia = ((query: string) => ({
    matches: reducido,
    media: query,
    onchange: null,
    addEventListener: (_evento: string, oyente: () => void) => oyentes.add(oyente),
    removeEventListener: (_evento: string, oyente: () => void) => oyentes.delete(oyente),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe("ParticleField", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => contextoFalso()
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("es decorativo: no lo anuncia el lector de pantalla ni intercepta el puntero", () => {
    simularMovimientoReducido(false);

    render(<ParticleField />);

    const campo = screen.getByTestId("particle-field");
    expect(campo).toHaveAttribute("aria-hidden", "true");
    expect(campo.className).toContain("pointer-events-none");
  });

  it("no lanza cuando el navegador no da contexto 2D", () => {
    simularMovimientoReducido(false);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    expect(() => render(<ParticleField />)).not.toThrow();
    expect(screen.getByTestId("particle-field")).toBeInTheDocument();
  });

  it("con prefers-reduced-motion no arranca el bucle de animación", () => {
    simularMovimientoReducido(true);
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");

    render(<ParticleField />);

    // El fondo se pinta una vez, pero sin animar: nunca se pide un fotograma.
    expect(rafSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("particle-field")).toBeInTheDocument();
  });

  it("sin esa preferencia sí anima", () => {
    simularMovimientoReducido(false);
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");

    render(<ParticleField />);

    expect(rafSpy).toHaveBeenCalled();
  });

  it("cancela la animación y suelta los listeners al desmontar", () => {
    simularMovimientoReducido(false);
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");
    const quitarListener = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<ParticleField />);
    unmount();

    expect(cancelSpy).toHaveBeenCalled();
    expect(quitarListener).toHaveBeenCalledWith("resize", expect.any(Function));
  });
});
