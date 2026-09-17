import { describe, it, expect } from "vitest";
import { resolveInicioDeSemana } from "../../src/jobs/sendWeeklySummary.js";

/** Cómo se ve ese instante en el reloj de Madrid. */
function enMadrid(fecha: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(fecha);
}

describe("resolveInicioDeSemana", () => {
  it("ancla la ventana al lunes a las 00:00 de Madrid", () => {
    // Miércoles 23 de septiembre de 2026, 12:00 en Madrid.
    const inicio = resolveInicioDeSemana(new Date("2026-09-23T10:00:00Z"));

    expect(enMadrid(inicio)).toContain("21/09/2026");
    expect(enMadrid(inicio)).toContain("00:00");
  });

  it("devuelve el mismo lunes para cualquier momento de esa semana", () => {
    const lunes = resolveInicioDeSemana(new Date("2026-09-21T06:00:00Z"));
    const domingo = resolveInicioDeSemana(new Date("2026-09-27T20:00:00Z"));

    expect(lunes.getTime()).toBe(domingo.getTime());
  });

  it("no se desplaza con el cambio de hora de octubre", () => {
    // El domingo 25 de octubre de 2026 se retrasa el reloj: la semana que
    // acaba ese día tiene 169 horas, no 168.
    const inicio = resolveInicioDeSemana(new Date("2026-10-26T06:00:00Z"));

    expect(enMadrid(inicio)).toContain("26/10/2026");
    expect(enMadrid(inicio)).toContain("00:00");
  });

  it("no se desplaza con el cambio de hora de marzo", () => {
    const inicio = resolveInicioDeSemana(new Date("2026-03-30T06:00:00Z"));

    expect(enMadrid(inicio)).toContain("30/03/2026");
    expect(enMadrid(inicio)).toContain("00:00");
  });

  it("usa el día local, no el UTC, a última hora del domingo", () => {
    // 22:30 UTC del domingo 4 de enero ya son las 23:30 del domingo en
    // Madrid: sigue siendo la semana que empezó el lunes 29 de diciembre.
    const inicio = resolveInicioDeSemana(new Date("2026-01-04T22:30:00Z"));

    expect(enMadrid(inicio)).toContain("29/12/2025");
  });
});
