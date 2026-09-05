import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Con `globals: false`, @testing-library/react no detecta `afterEach` en el
// ámbito global y no limpia el DOM sola entre tests — hay que registrarlo a mano.
afterEach(() => {
  cleanup();
});

// jsdom no implementa estos observers (usados por RangeSlider, Reveal, CountUp
// vía framer-motion) — sin un stub, los componentes que los usan lanzan al montar.
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== "undefined") {
  window.ResizeObserver ??= ObserverStub as unknown as typeof ResizeObserver;
  window.IntersectionObserver ??= ObserverStub as unknown as typeof IntersectionObserver;

  // jsdom no trae contexto de canvas y avisa por consola en cada render de
  // ParticleField. Devolver null sin ruido: el componente ya sabe rendirse.
  HTMLCanvasElement.prototype.getContext = () => null;

  // jsdom tampoco implementa matchMedia, que ParticleField consulta para
  // respetar `prefers-reduced-motion`. Por defecto responde «sin preferencia»;
  // los tests que necesiten lo contrario lo sobrescriben.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
