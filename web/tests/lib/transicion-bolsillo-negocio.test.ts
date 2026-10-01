import { describe, it, expect } from "vitest";

import {
  ALTO_BOLSILLO_VH,
  ALTO_NEGOCIO_VH,
  BOLSILLO_P,
  BOLSILLO_VH,
  NEGOCIO_P,
  NEGOCIO_VH,
  SOLAPE_NEGOCIO_VH,
  HOLGURA_PANTALLA,
  PANTALLA_HTML,
  hayNegocioEnEscena,
  leerTelefono,
  marcarNegocioEnEscena,
  pantallaDelPortatil,
  publicarTelefono,
} from "@/lib/transicion-bolsillo-negocio";

/**
 * La transición «En tu bolsillo» → «En tu negocio» se reparte en vh de
 * scroll; de ahí salen las alturas de las dos secciones, el solape y los
 * puntos del progreso de cada una. Lo que importa es que casen entre sí.
 */
describe("transicion-bolsillo-negocio", () => {
  it("el cruce cae dentro del recorrido fijo de «En tu bolsillo» y al principio del de «En tu negocio»", () => {
    const recorridoBolsillo = ALTO_BOLSILLO_VH - 100;
    const recorridoNegocio = ALTO_NEGOCIO_VH - 100;
    // «En tu negocio» se pega arriba justo cuando empieza el cruce…
    expect(recorridoBolsillo * BOLSILLO_P.inicioCruce).toBeCloseTo(
      ALTO_BOLSILLO_VH - SOLAPE_NEGOCIO_VH
    );
    // …y el cruce dura lo mismo visto desde las dos secciones.
    expect(recorridoBolsillo * (1 - BOLSILLO_P.inicioCruce)).toBeCloseTo(
      BOLSILLO_VH.cruce
    );
    expect(recorridoNegocio * NEGOCIO_P.finCruce).toBeCloseTo(
      BOLSILLO_VH.cruce
    );
  });

  it("los pasos de cada sección conservan su scroll de antes", () => {
    const recorridoBolsillo = ALTO_BOLSILLO_VH - 100;
    const recorridoNegocio = ALTO_NEGOCIO_VH - 100;
    expect(recorridoBolsillo * BOLSILLO_P.finPasos).toBeCloseTo(
      BOLSILLO_VH.pasos
    );
    expect(recorridoNegocio * (1 - NEGOCIO_P.finZoom)).toBeCloseTo(
      NEGOCIO_VH.pasos
    );
    expect(BOLSILLO_P.finPasos).toBeLessThan(BOLSILLO_P.finVuelco);
    expect(BOLSILLO_P.finVuelco).toBeLessThan(BOLSILLO_P.inicioCruce);
    expect(NEGOCIO_P.finCruce).toBeLessThan(NEGOCIO_P.finZoom);
    // El texto de «En tu negocio» entra durante el zoom out, no después.
    expect(NEGOCIO_P.finCruce).toBeLessThan(NEGOCIO_P.inicioTitulo);
    expect(NEGOCIO_P.inicioTitulo).toBeLessThan(NEGOCIO_P.finTitulo);
    expect(NEGOCIO_P.finTitulo).toBeLessThanOrEqual(NEGOCIO_P.finZoom);
  });

  it("cada tramo del relevo dura más de una muesca de rueda (~13 vh)", () => {
    for (const vh of [
      BOLSILLO_VH.vuelco,
      BOLSILLO_VH.estirado,
      BOLSILLO_VH.cruce,
      NEGOCIO_VH.zoom,
    ]) {
      expect(vh).toBeGreaterThanOrEqual(26);
    }
  });

  it("la pantalla del portátil envuelve al teléfono tumbado, centrada en él", () => {
    const telefono = { x: 880, y: 420, ancho: 600, alto: 286, radio: 49 };
    const pantalla = pantallaDelPortatil(telefono);
    expect(pantalla.x).toBe(880);
    expect(pantalla.y).toBe(420);
    expect(pantalla.ancho).toBeCloseTo(600 * HOLGURA_PANTALLA);
    expect(pantalla.alto / pantalla.ancho).toBeCloseTo(
      PANTALLA_HTML.alto / PANTALLA_HTML.ancho
    );
    expect(pantalla.ancho).toBeGreaterThan(telefono.ancho);
    expect(pantalla.alto).toBeGreaterThan(telefono.alto);
  });

  it("guarda dónde queda el teléfono tumbado y si «En tu negocio» va con escena", () => {
    expect(leerTelefono()).toBeNull();
    expect(hayNegocioEnEscena()).toBe(false);

    publicarTelefono({ x: 880, y: 420, ancho: 540, alto: 258, radio: 44 });
    marcarNegocioEnEscena(true);
    expect(leerTelefono()).toEqual({
      x: 880,
      y: 420,
      ancho: 540,
      alto: 258,
      radio: 44,
    });
    expect(hayNegocioEnEscena()).toBe(true);

    publicarTelefono(null);
    marcarNegocioEnEscena(false);
    expect(leerTelefono()).toBeNull();
    expect(hayNegocioEnEscena()).toBe(false);
  });
});
