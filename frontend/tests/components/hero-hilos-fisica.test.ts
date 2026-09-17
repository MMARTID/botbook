import { describe, it, expect } from "vitest";
import {
  avanzarTela,
  crearTela,
  desplazamientoMaximo,
  pasoTela,
  PASO_FISICA,
  SUBPASOS_MAXIMOS,
} from "@/components/hero-hilos-fisica";

/**
 * La tela del hero explotaba en Safari: a 30 fps (modo de bajo consumo,
 * pestaña de fondo) una sacudida crecía sin límite en segundos, mientras que
 * a 144 fps en Chromium se apagaba y nadie lo vio. Estos tests fijan lo que
 * tiene que cumplir la física independientemente de la tasa de refresco.
 */

const HILOS = 51;
const PUNTOS = 109;
const PASO_X = 12;
const SIN_CURSOR = { x: 0, y: 0, vy: 0, fuerza: 0 };

/** Sacudida determinista de ±10 px en toda la tela. */
function sacudir(tela: ReturnType<typeof crearTela>) {
  let semilla = 1;
  for (let q = 0; q < tela.desplazamiento.length; q++) {
    semilla = (semilla * 1664525 + 1013904223) >>> 0;
    tela.desplazamiento[q] = (semilla / 4294967296 - 0.5) * 20;
  }
}

/** Simula `segundos` con fotogramas de `dt`, como haría el navegador. */
function simularFotogramas(tela: ReturnType<typeof crearTela>, dt: number, segundos: number) {
  for (let t = 0; t < segundos; t += dt) avanzarTela(tela, dt, SIN_CURSOR, PASO_X);
}

describe("física de los hilos", () => {
  it.each([
    ["144 fps", 1 / 144],
    ["60 fps", 1 / 60],
    ["30 fps (Safari en bajo consumo)", 1 / 30],
  ])("una sacudida se apaga sola a %s", (_nombre, dt) => {
    const tela = crearTela(HILOS, PUNTOS);
    sacudir(tela);
    const inicial = desplazamientoMaximo(tela);

    simularFotogramas(tela, dt, 2);
    const aLosDosSegundos = desplazamientoMaximo(tela);
    simularFotogramas(tela, dt, 4);
    const aLosSeisSegundos = desplazamientoMaximo(tela);

    expect(aLosDosSegundos).toBeLessThan(inicial);
    expect(aLosSeisSegundos).toBeLessThan(0.5);
  });

  it("un fotograma muy lento no acumula deuda de tiempo ni hace más subpasos del tope", () => {
    const tela = crearTela(HILOS, PUNTOS);
    sacudir(tela);

    const pasos = avanzarTela(tela, 1, SIN_CURSOR, PASO_X);

    expect(pasos).toBe(SUBPASOS_MAXIMOS);
    expect(tela.acumulado).toBe(0);
    expect(desplazamientoMaximo(tela)).toBeLessThan(20);
  });

  it("un dt negativo (timestamp fuera de orden) no simula nada", () => {
    const tela = crearTela(HILOS, PUNTOS);
    sacudir(tela);
    const antes = Float32Array.from(tela.desplazamiento);

    const pasos = avanzarTela(tela, -0.01, SIN_CURSOR, PASO_X);

    expect(pasos).toBe(0);
    expect(tela.desplazamiento).toEqual(antes);
  });

  it("el cursor aparta los hilos que tiene cerca y no toca los lejanos", () => {
    const tela = crearTela(HILOS, PUNTOS);
    // Todos los hilos en reposo a la altura 300; el cursor justo debajo del
    // punto central del hilo central.
    tela.ultimaAltura.fill(300);
    const centro = Math.floor(HILOS / 2) * PUNTOS + Math.floor(PUNTOS / 2);
    const cursor = { x: Math.floor(PUNTOS / 2) * PASO_X, y: 330, vy: 0, fuerza: 1 };

    for (let n = 0; n < 12; n++) pasoTela(tela, PASO_FISICA, cursor, PASO_X);

    // El hilo está por encima del cursor (dy < 0), así que sube.
    expect(tela.desplazamiento[centro]).toBeLessThan(-0.5);
    // A 900 px del cursor no pasa nada.
    expect(tela.desplazamiento[Math.floor(HILOS / 2) * PUNTOS]).toBe(0);
  });
});
