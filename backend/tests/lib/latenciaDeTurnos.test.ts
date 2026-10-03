import { describe, it, expect } from "vitest";
import {
  medirTurnos,
  percentil,
  segmentosDeVoz,
} from "../../src/lib/latenciaDeTurnos.js";

/** Salida de silencedetect a partir de los silencios [inicio, fin]. */
function silencedetect(silencios: Array<[number, number | null]>): string {
  return silencios
    .flatMap(([inicio, fin]) => [
      `[silencedetect @ 0x1] silence_start: ${inicio}`,
      ...(fin === null
        ? []
        : [
            `[silencedetect @ 0x1] silence_end: ${fin} | silence_duration: ${fin - inicio}`,
          ]),
    ])
    .join("\n");
}

describe("segmentosDeVoz", () => {
  it("devuelve los tramos con voz, uniendo las pausas cortas entre palabras", () => {
    const salida = silencedetect([
      [0, 1],
      [2.5, 2.7], // pausa de 0,2 s: misma frase
      [4, 6],
      [8, null], // silencio hasta el final
    ]);

    expect(segmentosDeVoz(salida, 10)).toEqual([
      { inicio: 1, fin: 4 },
      { inicio: 6, fin: 8 },
    ]);
  });
});

describe("medirTurnos", () => {
  const recepcionista = [
    { inicio: 0.5, fin: 3 }, // saludo: no cuenta
    { inicio: 6.8, fin: 9 }, // responde 0,8 s después del cliente
    { inicio: 11, fin: 12 }, // empieza con el cliente hablando: solape
    { inicio: 20, fin: 21 }, // 6 s después: espera de herramienta, no cuenta
  ];
  const cliente = [
    { inicio: 3.5, fin: 6 },
    { inicio: 10, fin: 11.5 },
    { inicio: 13, fin: 14 },
  ];

  it("mide la espera tras cada intervención y separa los solapes", () => {
    const { turnos, solapes } = medirTurnos(cliente, recepcionista);

    expect(turnos).toHaveLength(1);
    expect(turnos[0].latencia).toBeCloseTo(0.8);
    expect(solapes).toBe(1);
  });

  it("los huecos largos solo cuentan si se sube el máximo", () => {
    expect(
      medirTurnos(cliente, recepcionista, 10).turnos.map((t) => t.latencia)
    ).toEqual([expect.closeTo(0.8), 6]);
  });
});

describe("percentil", () => {
  it("rango más cercano, y null sin datos", () => {
    expect(percentil([0.9, 0.5, 0.7, 1.4], 50)).toBe(0.7);
    expect(percentil([0.9, 0.5, 0.7, 1.4], 95)).toBe(1.4);
    expect(percentil([], 50)).toBeNull();
  });
});
