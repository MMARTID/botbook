import { describe, it, expect } from "vitest";
import {
  anotarHerramientas,
  medirTurnos,
  percentil,
  respuestasConHerramienta,
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

describe("respuestasConHerramienta", () => {
  it("marca las respuestas que llegaron tras una herramienta, en orden", () => {
    expect(
      respuestasConHerramienta([
        { role: "assistant", text: "Hola, ¿en qué te ayudo?" }, // saludo
        { role: "user", text: "¿Tenéis hueco el jueves?" },
        { role: "assistant", text: "" }, // llamada a la herramienta
        { role: "tool", text: '{"huecos":[]}' },
        { role: "assistant", text: "El jueves está completo." },
        { role: "user", text: "Vale." },
        { role: "user", text: "¿Y el viernes?" }, // dos frases, una respuesta
        { role: "assistant", text: "El viernes sí." },
        { role: "user", text: "Adiós." },
        { role: "assistant", text: "" },
        { role: "tool", text: '{"result":"ok"}' }, // colgar: sin respuesta
      ])
    ).toEqual([true, false]);
  });
});

describe("anotarHerramientas", () => {
  const turno = (inicio: number, latencia: number) => ({
    finDelCliente: inicio - latencia,
    inicioDeLaRecepcionista: inicio,
    latencia,
  });

  it("empareja por orden, contando las respuestas largas", () => {
    const medida = {
      turnos: [turno(5, 0.8), turno(20, 1.2)],
      largas: [turno(12, 6)],
      solapes: 0,
    };

    expect(
      anotarHerramientas(medida, [false, true, true])?.map((t) => [
        t.latencia,
        t.conHerramienta,
      ])
    ).toEqual([
      [0.8, false],
      [1.2, true],
    ]);
  });

  it("no anota si el audio y la transcripción no cuadran", () => {
    const medida = { turnos: [turno(5, 0.8)], largas: [], solapes: 0 };

    expect(anotarHerramientas(medida, [false, true])).toBeNull();
  });

  it("un solape que no era respuesta (un chasquido al colgar) no impide anotar", () => {
    const medida = { turnos: [turno(5, 0.8)], largas: [], solapes: 1 };

    expect(anotarHerramientas(medida, [true])?.[0].conHerramienta).toBe(true);
  });
});

describe("percentil", () => {
  it("rango más cercano, y null sin datos", () => {
    expect(percentil([0.9, 0.5, 0.7, 1.4], 50)).toBe(0.7);
    expect(percentil([0.9, 0.5, 0.7, 1.4], 95)).toBe(1.4);
    expect(percentil([], 50)).toBeNull();
  });
});
