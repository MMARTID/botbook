import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroHilos } from "@/components/hero-hilos";

/**
 * El fondo del hero es puro ambiente: no debe anunciarse, no debe interceptar
 * el puntero y, sobre todo, debe respetar `prefers-reduced-motion` (un solo
 * fotograma quieto, sin bucle). El ratón solo se escucha con `pointer: fine`;
 * en táctil los hilos siguen meciéndose pero no hay listener que seguir.
 */

function contextoFalso() {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
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

describe("HeroHilos", () => {
  let contexto: CanvasRenderingContext2D;

  beforeEach(() => {
    contexto = contextoFalso();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => contexto);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("es decorativo: oculto al lector de pantalla, sin puntero y solo desde md", () => {
    simularMedios({ punteroFino: true, movimientoReducido: false });
    render(<HeroHilos />);

    const canvas = screen.getByTestId("hero-hilos");
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas.className).toContain("pointer-events-none");
    expect(canvas.className).toContain("hidden");
    expect(canvas.className).toContain("md:block");
  });

  it("sin reduced-motion arranca el bucle de animación", () => {
    simularMedios({ punteroFino: true, movimientoReducido: false });
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");

    render(<HeroHilos />);

    expect(rafSpy).toHaveBeenCalled();
  });

  it("con prefers-reduced-motion pinta un solo fotograma y no arranca ningún bucle", () => {
    simularMedios({ punteroFino: true, movimientoReducido: true });
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");

    render(<HeroHilos />);

    expect(rafSpy).not.toHaveBeenCalled();
    // Los hilos siguen ahí, quietos: el fotograma estático sí se dibuja.
    expect(contexto.stroke).toHaveBeenCalled();
  });

  it("en táctil sigue animando pero no escucha el ratón", () => {
    simularMedios({ punteroFino: false, movimientoReducido: false });
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");
    const escuchar = vi.spyOn(window, "addEventListener");

    render(<HeroHilos />);

    expect(rafSpy).toHaveBeenCalled();
    expect(escuchar).not.toHaveBeenCalledWith("mousemove", expect.any(Function), expect.anything());
  });

  it("con puntero fino escucha el ratón y lo suelta al desmontar", () => {
    simularMedios({ punteroFino: true, movimientoReducido: false });
    const escuchar = vi.spyOn(window, "addEventListener");
    const quitar = vi.spyOn(window, "removeEventListener");
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");

    const { unmount } = render(<HeroHilos />);
    expect(escuchar).toHaveBeenCalledWith("mousemove", expect.any(Function), expect.anything());

    unmount();

    expect(cancelSpy).toHaveBeenCalled();
    expect(quitar).toHaveBeenCalledWith("mousemove", expect.any(Function));
  });

  /**
   * Conduce el bucle a mano con un rAF falso que entrega timestamps a la
   * cadencia pedida, como haría un navegador capado (Safari a 30 fps con
   * bajo consumo o en según qué monitor).
   */
  function conducirFotogramas({ fps, segundos }: { fps: number; segundos: number }) {
    const cola: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cola.push(cb);
      return cola.length;
    });
    const render = () => {
      let ahora = 1000;
      const paso = 1000 / fps;
      for (let n = 0; n < fps * segundos; n++) {
        ahora += paso;
        const cb = cola.shift();
        if (!cb) break;
        cb(ahora);
      }
    };
    return render;
  }

  it("apaga el ratón (modo ligero) si el navegador no pasa de ~45 fps de forma sostenida", () => {
    simularMedios({ punteroFino: true, movimientoReducido: false });
    const avanzar = conducirFotogramas({ fps: 30, segundos: 5 });

    render(<HeroHilos />);
    avanzar();

    expect(screen.getByTestId("hero-hilos")).toHaveAttribute("data-modo", "ligero");
  });

  it("a 60 fps el ratón sigue activo", () => {
    simularMedios({ punteroFino: true, movimientoReducido: false });
    const avanzar = conducirFotogramas({ fps: 60, segundos: 5 });

    render(<HeroHilos />);
    avanzar();

    expect(screen.getByTestId("hero-hilos")).not.toHaveAttribute("data-modo");
  });

  it("la primera ventana de 2 s no cuenta: la carga de la página siempre da tirones", () => {
    simularMedios({ punteroFino: true, movimientoReducido: false });
    const avanzar = conducirFotogramas({ fps: 30, segundos: 1.5 });

    render(<HeroHilos />);
    avanzar();

    expect(screen.getByTestId("hero-hilos")).not.toHaveAttribute("data-modo");
  });

  it("no lanza cuando el navegador no da contexto 2D", () => {
    simularMedios({ punteroFino: true, movimientoReducido: false });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    expect(() => render(<HeroHilos />)).not.toThrow();
  });
});
