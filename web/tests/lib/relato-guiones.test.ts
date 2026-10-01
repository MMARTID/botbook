import { describe, it, expect } from "vitest";

import { nicheLandings, type NicheSlug } from "@/lib/niche-landings";
import {
  GUION_GENERAL,
  GUIONES_SECTOR,
  HORA_CITA,
  guionDe,
  relato,
  sumarMinutos,
} from "@/lib/relato-guiones";

const SECTORES = Object.keys(nicheLandings) as NicheSlug[];

/**
 * Los guiones del relato iPhone → portátil: uno por landing, la misma
 * historia con el vocabulario de cada sector.
 */
describe("relato-guiones", () => {
  it("hay un guion por sector y la portada usa el general", () => {
    expect(Object.keys(GUIONES_SECTOR).sort()).toEqual([...SECTORES].sort());
    expect(guionDe()).toBe(GUION_GENERAL);
    for (const sector of SECTORES) {
      expect(guionDe(sector)).toBe(GUIONES_SECTOR[sector]);
    }
  });

  it("suma minutos a una hora", () => {
    expect(sumarMinutos("17:30", 90)).toBe("19:00");
    expect(sumarMinutos("17:30", 45)).toBe("18:15");
    expect(sumarMinutos("09:50", 15)).toBe("10:05");
  });

  it.each([
    ["general", GUION_GENERAL] as const,
    ...SECTORES.map((s) => [s, GUIONES_SECTOR[s]] as const),
  ])("el guion %s cuenta la historia completa con sus nombres", (_, guion) => {
    const r = relato(guion);
    expect(r.saludo).toContain(guion.negocio);
    expect(r.propone).toContain(guion.profesional);
    // La agenda: la cuarta fila es el hueco libre, con su duración.
    expect(r.agenda).toHaveLength(6);
    expect(r.agenda[3].hora).toBe(HORA_CITA);
    expect(r.agenda[3].detalle).toContain(`${guion.servicio.minutos} min`);
    // Un hueco de 30 minutos no cabe: el servicio dura más.
    expect(guion.servicio.minutos).toBeGreaterThan(30);
    // Las tres notificaciones de la pantalla de bloqueo.
    expect(r.avisos).toHaveLength(3);
    expect(r.avisos[0].texto).toContain(guion.cliente.nombre);
    expect(r.avisos[1].texto).toContain(guion.servicio.nombre);
    expect(r.avisos[2].texto).toContain(guion.cliente.nombre);
    // El asistente reparte las citas de quien falta a su compañera.
    expect(r.asistente.baja).toContain(guion.profesional);
    expect(r.asistente.orden).toContain(guion.companera);
    expect(guion.companera).not.toBe(guion.profesional);
    // Los teléfonos son del rango sin atribuir (79…).
    expect(guion.cliente.telefono).toMatch(/^\+34 79/);
  });

  it("los profesionales de cada sector son los de su landing (el Gestor)", () => {
    for (const sector of SECTORES) {
      const { chat } = nicheLandings[sector].ownerAssistant;
      const g = GUIONES_SECTOR[sector];
      expect(chat.ownerMessage).toContain(g.profesional);
      expect(chat.proposal).toContain(g.companera);
    }
  });
});
