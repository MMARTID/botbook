import { describe, it, expect } from "vitest";
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
  it("pinta la hora y el aviso real de la cita nueva, con sus botones", () => {
    const g = GUIONES_SECTOR.fisioterapia;
    const { container } = render(<PantallaBloqueo guion={g} />);
    expect(container.textContent).toContain("17:04");
    // El texto de avisoNuevaReserva (backend, modules/whatsapp/mensajes.ts).
    expect(container.textContent).toContain(
      `${g.negocio}: nueva cita. ${g.cliente.nombre}, jueves 17:30`
    );
    expect(container.textContent).toContain("Ya está en tu agenda.");
    expect(container.textContent).toContain("Ver agenda de hoy");
  });

  it("enciende cada pieza en su tramo", () => {
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

    pintarBloqueo(raiz, BLOQUEO_VH.reloj[1]);
    expect(opacidad("reloj")).toBe(1);

    pintarBloqueo(raiz, BLOQUEO_VH.avisos[0][1]);
    expect(opacidad("aviso-0")).toBe(1);
  });

  it("se desbloquea durante la primera parte del zoom out", () => {
    const [a, b] = BLOQUEO_VH.desbloqueo;
    expect(desbloqueo(a)).toBe(0);
    expect(desbloqueo(b)).toBe(1);
    expect(BLOQUEO_VH.avisos[0][1]).toBeLessThan(a);
  });
});
