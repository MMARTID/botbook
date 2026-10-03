import { describe, it, expect } from "vitest";
import {
  anotarHerramientas,
  conVozFuerte,
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

  it("descarta los picos de duración casi cero entre dos silencios", () => {
    const salida = silencedetect([
      [0, 1],
      [3, 9.4], // voz de 1 a 3
      [9.41, 12], // chasquido de 10 ms: no es voz
    ]);

    expect(segmentosDeVoz(salida, 12)).toEqual([{ inicio: 1, fin: 3 }]);
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
    expect(
      medirTurnos(cliente, recepcionista).largas.map((t) => t.latencia)
    ).toEqual([6]);
  });
});

describe("conVozFuerte", () => {
  it("se queda con los tramos suaves que tienen voz de verdad", () => {
    const suaves = [
      { inicio: 0.5, fin: 3 }, // frase: arranque suave y parte fuerte
      { inicio: 8.4, fin: 8.6 }, // clic del fondo: no pasa del fuerte
    ];
    const fuertes = [{ inicio: 0.7, fin: 2.8 }];

    expect(conVozFuerte(suaves, fuertes)).toEqual([{ inicio: 0.5, fin: 3 }]);
  });
});

describe("anotarHerramientas", () => {
  const turno = (inicio: number, latencia: number) => ({
    finDelCliente: inicio - latencia,
    inicioDeLaRecepcionista: inicio,
    latencia,
  });
  // El saludo empieza en el segundo 1 de la grabación, a las 10:00:00.
  const hora = (segundo: number) =>
    new Date(
      Date.UTC(2026, 9, 3, 10, 0, 0) + (segundo - 1) * 1000
    ).toISOString();
  const medida = {
    turnos: [turno(8, 0.9), turno(20, 2.8)],
    largas: [],
    solapes: 0,
  };

  it("marca los turnos con un mensaje tool entre el cliente y la respuesta", () => {
    const mensajes = [
      { role: "assistant", text: "Hola, ¿en qué te ayudo?", sentAt: hora(1) },
      { role: "user", text: "¿Tenéis hueco?", sentAt: hora(6) },
      { role: "assistant", text: "Claro.", sentAt: hora(9) },
      { role: "user", text: "El jueves.", sentAt: hora(17) },
      { role: "assistant", text: "", sentAt: hora(17.6) },
      { role: "tool", text: '{"huecos":[]}', sentAt: hora(18.4) },
      { role: "assistant", text: "Está completo.", sentAt: hora(24) },
    ];

    expect(
      anotarHerramientas(medida, mensajes, 1)?.map((t) => t.conHerramienta)
    ).toEqual([false, true]);
  });

  it("sin saludo con hora no anota", () => {
    expect(
      anotarHerramientas(medida, [{ role: "user", text: "Hola" }], 1)
    ).toBeNull();
  });
});

describe("percentil", () => {
  it("rango más cercano, y null sin datos", () => {
    expect(percentil([0.9, 0.5, 0.7, 1.4], 50)).toBe(0.7);
    expect(percentil([0.9, 0.5, 0.7, 1.4], 95)).toBe(1.4);
    expect(percentil([], 50)).toBeNull();
  });
});
