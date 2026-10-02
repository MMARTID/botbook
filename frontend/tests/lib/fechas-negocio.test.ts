import { describe, it, expect } from "vitest";
import {
  claveDeDia,
  diaDeLaSemana,
  diaLargo,
  etiquetaDeDia,
  horaDelNegocio,
  instanteAntesDelDia,
  lunesDe,
  minutosDelDia,
  rangoDeSemana,
  sumarDias,
} from "@/lib/fechas-negocio";

describe("fechas en la zona del negocio", () => {
  it("una cita de las 00:30 en Madrid es de su día aunque en UTC sea el anterior", () => {
    expect(claveDeDia("2026-10-01T22:30:00Z", "Europe/Madrid")).toBe("2026-10-02");
    expect(horaDelNegocio("2026-10-01T22:30:00Z", "Europe/Madrid")).toBe("00:30");
    expect(minutosDelDia("2026-10-02T08:15:00Z", "Europe/Madrid")).toBe(10 * 60 + 15);
  });

  it("suma días sin que el cambio de hora mueva el día", () => {
    expect(sumarDias("2026-10-24", 1)).toBe("2026-10-25");
    expect(sumarDias("2026-10-25", 1)).toBe("2026-10-26");
    expect(sumarDias("2026-10-01", -1)).toBe("2026-09-30");
  });

  it("la semana empieza en lunes", () => {
    expect(diaDeLaSemana("2026-09-28")).toBe(0);
    expect(diaDeLaSemana("2026-10-04")).toBe(6);
    expect(lunesDe("2026-10-02")).toBe("2026-09-28");
    expect(lunesDe("2026-10-04")).toBe("2026-09-28");
    expect(lunesDe("2026-10-05")).toBe("2026-10-05");
  });

  it("nombra los días como se dicen", () => {
    expect(diaLargo("2026-10-01")).toBe("Jueves, 1 de octubre");
    expect(etiquetaDeDia("2026-10-02", "2026-10-02")).toBe("Hoy");
    expect(etiquetaDeDia("2026-10-03", "2026-10-02")).toBe("Mañana");
    expect(etiquetaDeDia("2026-10-01", "2026-10-02")).toBe("Ayer");
    expect(etiquetaDeDia("2026-09-29", "2026-10-02")).toBe("Martes, 29 de septiembre");
  });

  it("el rango de una semana solo repite el mes si cambia", () => {
    expect(rangoDeSemana("2026-09-28")).toBe("28 sep – 4 oct");
    expect(rangoDeSemana("2026-10-05")).toBe("5 – 11 oct");
  });

  it("pide desde antes de la medianoche de la zona más adelantada", () => {
    const instante = new Date(instanteAntesDelDia("2026-09-28"));
    // Medianoche del lunes en UTC+14 = domingo 10:00 UTC.
    expect(instante.toISOString()).toBe("2026-09-27T10:00:00.000Z");
    expect(claveDeDia(instante, "Europe/Madrid") <= "2026-09-28").toBe(true);
  });
});
