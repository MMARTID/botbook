import { describe, it, expect, afterEach } from "vitest";
import { render } from "@testing-library/react";

import { PantallaBloqueo } from "@/components/pantalla-bloqueo";
import { desbloqueo, pintarBloqueo } from "@/lib/pantalla-bloqueo";
import { GUIONES_SECTOR } from "@/lib/relato-guiones";
import { BLOQUEO_VH } from "@/lib/transicion-bolsillo-negocio";

/**
 * La pantalla de bloqueo del relevo: el marcado sale del guion y
 * `pintarBloqueo` enciende cada pieza en su tramo.
 */
describe("pantalla de bloqueo", () => {
  afterEach(() => {
    window.innerWidth = 1024;
  });

  it("pinta la hora y las tres notificaciones del guion", () => {
    const g = GUIONES_SECTOR.fisioterapia;
    const { container } = render(<PantallaBloqueo guion={g} />);
    expect(container.textContent).toContain("17:04");
    expect(container.textContent).toContain("Llamada atendida");
    expect(container.textContent).toContain(`${g.servicio.nombre} · jueves`);
    expect(container.querySelectorAll('[data-bloqueo^="aviso-"]')).toHaveLength(
      3
    );
  });

  it("enciende cada pieza en su tramo y apila en pantallas estrechas", () => {
    const { container } = render(
      <PantallaBloqueo guion={GUIONES_SECTOR.barberia} />
    );
    const raiz = container.firstElementChild as HTMLElement;
    const opacidad = (clave: string) =>
      Number(
        (raiz.querySelector(`[data-bloqueo="${clave}"]`) as HTMLElement).style
          .opacity
      );

    pintarBloqueo(raiz, 0);
    expect(opacidad("reloj")).toBe(0);
    expect(opacidad("aviso-0")).toBe(0);

    pintarBloqueo(raiz, BLOQUEO_VH.avisos[0][1]);
    expect(opacidad("reloj")).toBe(1);
    expect(opacidad("aviso-0")).toBe(1);
    expect(opacidad("aviso-1")).toBe(0);
    expect(raiz.hasAttribute("data-pila")).toBe(false);

    window.innerWidth = 390;
    pintarBloqueo(raiz, BLOQUEO_VH.avisos[2][1]);
    expect(raiz.hasAttribute("data-pila")).toBe(true);
    // En la pila, los avisos anteriores quedan detrás, más apagados.
    expect(opacidad("aviso-2")).toBe(1);
    expect(opacidad("aviso-0")).toBeLessThan(1);
  });

  it("se desbloquea durante la primera parte del zoom out", () => {
    const [a, b] = BLOQUEO_VH.desbloqueo;
    expect(desbloqueo(a)).toBe(0);
    expect(desbloqueo(b)).toBe(1);
    expect(BLOQUEO_VH.avisos[2][1]).toBeLessThan(a);
  });
});
