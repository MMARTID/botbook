import { describe, it, expect } from "vitest";
import { errorDeTramos, resumenDeHorario } from "@/lib/horario";
import type { BusinessSchedule, ScheduleDay } from "@/lib/types";

const abierto = (...tramos: [string, string][]): ScheduleDay => ({
  enabled: true,
  intervals: tramos.map(([start, end]) => ({ start, end })),
});
const cerrado: ScheduleDay = { enabled: false, intervals: [] };

function horario(dias: Partial<BusinessSchedule["week"]>): BusinessSchedule {
  return {
    version: 1,
    week: {
      monday: cerrado,
      tuesday: cerrado,
      wednesday: cerrado,
      thursday: cerrado,
      friday: cerrado,
      saturday: cerrado,
      sunday: cerrado,
      ...dias,
    },
  };
}

describe("resumenDeHorario", () => {
  it("agrupa los días seguidos que abren igual", () => {
    const partido = abierto(["09:00", "14:00"], ["16:30", "20:30"]);
    expect(
      resumenDeHorario(
        horario({
          monday: partido,
          tuesday: partido,
          wednesday: partido,
          thursday: partido,
          friday: partido,
          saturday: abierto(["09:00", "14:00"]),
        })
      )
    ).toBe("L–V 9:00–14:00, 16:30–20:30 · S 9:00–14:00");
  });

  it("no agrupa días iguales que no van seguidos", () => {
    const mañana = abierto(["10:00", "14:00"]);
    expect(resumenDeHorario(horario({ monday: mañana, wednesday: mañana }))).toBe("L 10:00–14:00 · X 10:00–14:00");
  });

  it("dice cuándo no abre nunca", () => {
    expect(resumenDeHorario(horario({}))).toBe("Cerrado toda la semana");
  });
});

describe("errorDeTramos", () => {
  it("un día cerrado nunca tiene error", () => {
    expect(errorDeTramos(cerrado)).toBeNull();
  });

  it("explica cada fallo como lo valida el backend", () => {
    expect(errorDeTramos({ enabled: true, intervals: [] })).toBe("Un día abierto necesita al menos un tramo.");
    expect(errorDeTramos(abierto(["14:00", "09:00"]))).toBe("El cierre debe ser posterior a la apertura.");
    expect(errorDeTramos(abierto(["16:00", "20:00"], ["09:00", "17:00"]))).toBe("Los tramos no pueden solaparse.");
    expect(errorDeTramos(abierto(["16:00", "20:00"], ["09:00", "14:00"]))).toBeNull();
  });
});
