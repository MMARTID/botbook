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

  // Bug real reportado: en móvil, la barra de direcciones del navegador se
  // colapsa o reaparece al hacer scroll, y eso dispara un `resize` sin que el
  // dispositivo haya cambiado — antes, cualquier resize volvía a sembrar el
  // campo entero con posiciones aleatorias nuevas, así que el usuario veía
  // las partículas "saltar" de sitio en mitad de un scroll suave.
  it("un resize con solo la altura cambiada (barra de direcciones móvil) no resiembra el campo", async () => {
    simularMovimientoReducido(false);
    const randomSpy = vi.spyOn(Math, "random");

    render(<ParticleField />);
    const llamadasIniciales = randomSpy.mock.calls.length;

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: window.innerHeight - 80,
    });
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(randomSpy.mock.calls.length).toBe(llamadasIniciales);
  });

  it("un resize con el ancho cambiado (giro de pantalla real) sí resiembra el campo", async () => {
    simularMovimientoReducido(false);
    const randomSpy = vi.spyOn(Math, "random");

    render(<ParticleField />);
    const llamadasIniciales = randomSpy.mock.calls.length;

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(randomSpy.mock.calls.length).toBeGreaterThan(llamadasIniciales);
  });
});
