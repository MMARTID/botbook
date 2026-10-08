import { describe, it, expect, afterEach, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { act, render, waitFor } from "@testing-library/react";

import { useMovimientoReducido } from "@/hooks/use-movimiento-reducido";
import { Reveal } from "@/components/scroll-reveal";
import { LlamadaScroll } from "@/components/llamada-scroll";
import { CountUp } from "@/components/count-up";

/**
 * Con `prefers-reduced-motion: reduce`, el servidor no sabe la preferencia y
 * pinta la versión animada; el primer render del cliente tiene que pintar lo
 * mismo o React descarta el HTML y rehace toda la raíz (siete errores
 * «Hydration failed» en la portada, 2026-09-29). La versión quieta solo
 * puede llegar después de montar.
 *
 * framer-motion lee la preferencia una vez, con
 * `matchMedia("(prefers-reduced-motion)")`, y la sigue con un oyente de
 * cambios: `addListener` hasta la v10 y `addEventListener("change")` desde la
 * v11. La consulta falsa de aquí admite las dos y deja cambiarla entre el
 * «servidor» y el cliente.
 */

const oyentes = new Set<() => void>();
const consultaMovimiento = {
  matches: false,
  media: "(prefers-reduced-motion)",
  onchange: null,
  addListener: (f: () => void) => oyentes.add(f),
  removeListener: (f: () => void) => oyentes.delete(f),
  addEventListener: (tipo: string, f: () => void) => {
    if (tipo === "change") oyentes.add(f);
  },
  removeEventListener: (tipo: string, f: () => void) => {
    if (tipo === "change") oyentes.delete(f);
  },
  dispatchEvent: () => false,
};

window.matchMedia = ((query: string) =>
  query.includes("prefers-reduced-motion")
    ? consultaMovimiento
    : {
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as typeof window.matchMedia;

function preferirMovimientoReducido(reducir: boolean) {
  consultaMovimiento.matches = reducir;
  oyentes.forEach((f) => f());
}

let raiz: Root | null = null;

afterEach(() => {
  act(() => raiz?.unmount());
  raiz = null;
  document.body.innerHTML = "";
  preferirMovimientoReducido(false);
});

/**
 * Pinta `ui` como el servidor (sin preferencia conocida) y la hidrata con la
 * preferencia del visitante. Devuelve el contenedor y los errores y avisos de
 * hidratación que haya dado React.
 */
async function hidratar(ui: ReactElement, { reducir }: { reducir: boolean }) {
  // jsdom tiene `window`, así que framer-motion usa useLayoutEffect también
  // al pintar en «servidor» y React avisa; en Node de verdad no pasa.
  const silencio = vi.spyOn(console, "error").mockImplementation(() => {});
  preferirMovimientoReducido(false);
  const html = renderToString(ui);
  silencio.mockRestore();
  preferirMovimientoReducido(reducir);

  const contenedor = document.createElement("div");
  contenedor.innerHTML = html;
  document.body.appendChild(contenedor);

  const errores: string[] = [];
  const consola = vi.spyOn(console, "error").mockImplementation((...args) => {
    errores.push(args.map(String).join(" "));
  });
  try {
    await act(async () => {
      raiz = hydrateRoot(contenedor, ui, {
        onRecoverableError: (error) => errores.push(String(error)),
      });
    });
  } finally {
    consola.mockRestore();
  }
  return { contenedor, errores };
}

describe("useMovimientoReducido", () => {
  it("vale false en el primer render y la preferencia real tras montar", () => {
    preferirMovimientoReducido(true);
    const valores: boolean[] = [];
    function Sonda() {
      valores.push(useMovimientoReducido());
      return null;
    }
    render(<Sonda />);
    expect(valores[0]).toBe(false);
    expect(valores.at(-1)).toBe(true);
  });

  it("sin movimiento reducido vale siempre false", () => {
    const valores: boolean[] = [];
    function Sonda() {
      valores.push(useMovimientoReducido());
      return null;
    }
    render(<Sonda />);
    expect(valores.every((v) => v === false)).toBe(true);
  });
});

describe("hidratación con movimiento reducido", () => {
  it("Reveal hidrata sin errores y deja el contenido a la vista", async () => {
    const { contenedor, errores } = await hidratar(
      <Reveal y={14}>Contenido</Reveal>,
      { reducir: true }
    );
    expect(errores).toEqual([]);
    const bloque = contenedor.firstElementChild as HTMLElement;
    await waitFor(() => expect(bloque.style.opacity).toBe("1"));
    expect(bloque.style.transform).toBe("none");
  });

  it("LlamadaScroll hidrata sin errores y pasa a la versión quieta", async () => {
    const { contenedor, errores } = await hidratar(<LlamadaScroll />, {
      reducir: true,
    });
    expect(errores).toEqual([]);
    expect(contenedor.textContent).toContain(
      "En tu bolsillo: una llamada, de principio a fin."
    );
    expect(document.documentElement.hasAttribute("data-relato")).toBe(false);
  });

  it("CountUp hidrata sin errores y enseña la cifra entera", async () => {
    const { contenedor, errores } = await hidratar(<CountUp value="78%" />, {
      reducir: true,
    });
    expect(errores).toEqual([]);
    expect(contenedor.textContent).toBe("78%");
  });
});

describe("sin movimiento reducido todo sigue igual", () => {
  it("Reveal espera oculto a entrar en pantalla", async () => {
    const { contenedor, errores } = await hidratar(
      <Reveal y={14}>Contenido</Reveal>,
      { reducir: false }
    );
    expect(errores).toEqual([]);
    const bloque = contenedor.firstElementChild as HTMLElement;
    expect(bloque.style.opacity).toBe("0");
    expect(bloque.style.transform).toContain("translateY(14px)");
  });

  it("LlamadaScroll monta el escenario fijo", async () => {
    const { contenedor, errores } = await hidratar(<LlamadaScroll />, {
      reducir: false,
    });
    expect(errores).toEqual([]);
    expect(contenedor.textContent).not.toContain("de principio a fin");
    expect(
      contenedor.querySelector("nav[aria-label='Pasos de la llamada']")
    ).not.toBeNull();
  });

  it("CountUp arranca desde cero", async () => {
    const { contenedor, errores } = await hidratar(<CountUp value="78%" />, {
      reducir: false,
    });
    expect(errores).toEqual([]);
    expect(contenedor.textContent).toBe("0%");
  });
});
