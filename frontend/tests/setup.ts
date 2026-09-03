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
}
