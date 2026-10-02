import { describe, it, expect } from "vitest";
import {
  colocarEnCarriles,
  horaDeMinutos,
  horarioDelNegocio,
  importeDeCitas,
  rangoDeHoras,
  tramosCerrados,
  tramosDelDia,
} from "@/lib/agenda-escritorio";
import type { AgendaBooking, BusinessSchedule } from "@/lib/types";

const abierto = (tramos: Array<[string, string]>) => ({
  enabled: true,
  intervals: tramos.map(([start, end]) => ({ start, end })),
});
const cerrado = { enabled: false, intervals: [] };
const partido = abierto([
  ["09:00", "14:00"],
  ["16:30", "20:30"],
]);

const HORARIO: BusinessSchedule = {
  version: 1,
  week: {
    monday: partido,
    tuesday: partido,
    wednesday: partido,
    thursday: partido,
    friday: partido,
    saturday: abierto([["10:00", "14:00"]]),
    sunday: cerrado,
  },
  exceptions: [{ date: "2026-10-12", closed: true, intervals: [], label: "Fiesta Nacional" }],
};

function cita(programedAt: string, durationMinutes: number, priceCents: Array<number | null> = []): AgendaBooking {
  return {
    id: programedAt,
    callId: "c",
    programedAt,
    durationMinutes,
    numberPeople: 1,
    clientPhone: null,
    professional: null,
    services: priceCents.map((precio, indice) => ({ id: `s${indice}`, name: "Corte", durationMinutes: 30, priceCents: precio })),
    externalEventId: null,
    externalCalendarProvider: null,
  };
}

describe("horarioDelNegocio", () => {
  it("solo acepta un horario con semana", () => {
    expect(horarioDelNegocio(HORARIO)).toBe(HORARIO);
    expect(horarioDelNegocio({})).toBeNull();
    expect(horarioDelNegocio(null)).toBeNull();
  });
});

describe("tramosDelDia", () => {
  it("usa el patrón de la semana y deja que una excepción lo cierre", () => {
    expect(tramosDelDia(HORARIO, "2026-10-05")).toEqual(partido.intervals); // lunes
    expect(tramosDelDia(HORARIO, "2026-10-04")).toEqual([]); // domingo cerrado
    expect(tramosDelDia(HORARIO, "2026-10-12")).toEqual([]); // festivo en lunes
    expect(tramosDelDia(null, "2026-10-05")).toBeNull();
  });
});

describe("rangoDeHoras", () => {
  it("va de la primera apertura a la última hora de cierre, en horas enteras", () => {
    expect(rangoDeHoras(HORARIO, ["2026-10-05", "2026-10-10"], [], "Europe/Madrid")).toEqual({
      desde: 9 * 60,
      hasta: 21 * 60,
    });
  });

  it("se amplía para que quepa una cita fuera del horario", () => {
    // 07:30 en Madrid (UTC+2) hasta las 08:15.
    const temprana = cita("2026-10-05T05:30:00Z", 45);
    expect(rangoDeHoras(HORARIO, ["2026-10-05"], [temprana], "Europe/Madrid").desde).toBe(7 * 60);
  });

  it("sin horario ni citas, de 9 a 20", () => {
    expect(rangoDeHoras(null, ["2026-10-05"], [], "Europe/Madrid")).toEqual({ desde: 540, hasta: 1200 });
  });
});

describe("tramosCerrados", () => {
  it("sombrea antes de abrir, la pausa de mediodía y después de cerrar", () => {
    expect(tramosCerrados(partido.intervals, { desde: 8 * 60, hasta: 21 * 60 })).toEqual([
      { desde: 480, hasta: 540 },
      { desde: 840, hasta: 990 },
      { desde: 1230, hasta: 1260 },
    ]);
  });

  it("sin horario conocido no sombrea nada", () => {
    expect(tramosCerrados(null, { desde: 540, hasta: 1200 })).toEqual([]);
  });
});

describe("colocarEnCarriles", () => {
  const intervalo = (inicio: number, fin: number) => ({ inicio, fin });

  it("una cita sola ocupa todo el ancho", () => {
    expect(colocarEnCarriles([intervalo(600, 630)], (i) => i.inicio, (i) => i.fin)).toEqual([
      { item: intervalo(600, 630), inicio: 600, fin: 630, carril: 0, carriles: 1 },
    ]);
  });

  it("dos que se solapan se reparten el ancho; la que viene después vuelve a tenerlo entero", () => {
    const colocadas = colocarEnCarriles(
      [intervalo(630, 780), intervalo(735, 780), intervalo(780, 810)],
      (i) => i.inicio,
      (i) => i.fin
    );
    expect(colocadas.map(({ carril, carriles }) => [carril, carriles])).toEqual([
      [0, 2],
      [1, 2],
      [0, 1],
    ]);
  });

  it("reutiliza el primer carril que queda libre dentro del mismo grupo", () => {
    const colocadas = colocarEnCarriles(
      [intervalo(600, 720), intervalo(610, 640), intervalo(650, 700)],
      (i) => i.inicio,
      (i) => i.fin
    );
    expect(colocadas.map(({ carril, carriles }) => [carril, carriles])).toEqual([
      [0, 2],
      [1, 2],
      [1, 2],
    ]);
  });
});

describe("importeDeCitas", () => {
  it("suma solo las citas con todos los precios", () => {
    expect(importeDeCitas([cita("x", 30, [1800]), cita("y", 30, [6500, null]), cita("z", 30, [2200])])).toBe(4000);
    expect(importeDeCitas([cita("y", 30, [null])])).toBeNull();
  });
});

describe("horaDeMinutos", () => {
  it("pone los ceros", () => {
    expect(horaDeMinutos(9 * 60 + 5)).toBe("09:05");
  });
});
