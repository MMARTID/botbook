import { describe, it, expect } from "vitest";
import { duracionMedia, lecturaRapida, nivelDeCelda, rejillaDeLlamadas } from "@/lib/analitica";
import type { BusinessSchedule, CallAnalytics } from "@/lib/types";

const cerrado = { enabled: false, intervals: [] };
const partido = { enabled: true, intervals: [{ start: "09:00", end: "14:00" }, { start: "16:30", end: "20:30" }] };
const HORARIO: BusinessSchedule = {
  version: 1,
  week: {
    monday: partido,
    tuesday: partido,
    wednesday: partido,
    thursday: partido,
    friday: partido,
    saturday: { enabled: true, intervals: [{ start: "09:00", end: "14:00" }, { start: "16:00", end: "19:00" }] },
    sunday: cerrado,
  },
};

function datos(celdas: Array<[number, number, number]>, totales: Partial<CallAnalytics["totals"]> = {}): CallAnalytics {
  const llamadas = celdas.reduce((total, [, , cuenta]) => total + cuenta, 0);
  return {
    days: 30,
    totals: { calls: llamadas, minutes: 0, averageDurationSecs: 0, bookings: 0, cancelledBookings: 0, waitlistLeads: 0, ...totales },
    outcomes: [],
    sentiments: [],
    byHour: [],
    byWeekday: [],
    byWeekdayHour: celdas.map(([weekday, hour, count]) => ({ weekday, hour, count })),
    topServices: [],
  };
}

describe("rejillaDeLlamadas", () => {
  it("enseña los días que abre y sus horas, de la primera a la última", () => {
    const rejilla = rejillaDeLlamadas(datos([[5, 11, 4]]), HORARIO);
    expect(rejilla.dias).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rejilla.horas[0]).toBe(9);
    expect(rejilla.horas.at(-1)).toBe(20);
    expect(rejilla.llamadas(5, 11)).toBe(4);
    expect(rejilla.llamadas(5, 12)).toBe(0);
    expect(rejilla.fuera).toBe(0);
  });

  it("un domingo con llamadas aparece aunque cierre, y la madrugada no estira el mapa: se cuenta aparte", () => {
    const rejilla = rejillaDeLlamadas(datos([[7, 21, 2], [3, 2, 1], [5, 11, 4]]), HORARIO);
    expect(rejilla.dias).toContain(7);
    expect(rejilla.horas.at(-1)).toBe(21);
    expect(rejilla.horas[0]).toBe(9);
    expect(rejilla.fuera).toBe(1);
  });

  it("sin horario ni llamadas, de lunes a sábado de 9 a 20", () => {
    const rejilla = rejillaDeLlamadas(datos([]), null);
    expect(rejilla.dias).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rejilla.horas).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });
});

describe("nivelDeCelda", () => {
  it("va de 0 sin llamadas a 5 en la hora con más", () => {
    expect(nivelDeCelda(0, 10)).toBe(0);
    expect(nivelDeCelda(1, 10)).toBe(1);
    expect(nivelDeCelda(5, 10)).toBe(3);
    expect(nivelDeCelda(10, 10)).toBe(5);
  });
});

describe("lecturaRapida", () => {
  it("con pocas llamadas no saca conclusiones", () => {
    const pocas = datos([[5, 11, 3]]);
    expect(lecturaRapida(pocas, rejillaDeLlamadas(pocas, HORARIO), HORARIO)).toEqual([
      "Todavía hay pocas llamadas en este periodo para sacar conclusiones.",
    ]);
  });

  it("dice el pico de dos horas, la media jornada sin llamadas, las citas y la demanda en espera", () => {
    // Todos los días abiertos tienen llamadas por la mañana y por la tarde,
    // menos el sábado por la tarde.
    const celdas: Array<[number, number, number]> = [];
    for (const dia of [1, 2, 3, 4, 5]) celdas.push([dia, 10, 2], [dia, 18, 2]);
    celdas.push([6, 10, 2], [5, 11, 8], [5, 12, 6]);
    const muchas = datos(celdas, { bookings: 18, waitlistLeads: 3 });
    const frases = lecturaRapida(muchas, rejillaDeLlamadas(muchas, HORARIO), HORARIO);
    expect(frases).toEqual([
      "El pico es los viernes de 11 a 13 h.",
      "Los sábados por la tarde no entra ninguna llamada.",
      "18 citas reservadas: 50 por cada 100 llamadas.",
      "3 clientes esperan a que se libere un hueco.",
    ]);
  });
});

describe("duracionMedia", () => {
  it("minutos y segundos, o solo segundos", () => {
    expect(duracionMedia(151)).toBe("2m 31s");
    expect(duracionMedia(45)).toBe("45s");
  });
});
