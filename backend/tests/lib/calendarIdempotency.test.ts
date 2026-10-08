import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { buildCalendarIdempotencyKey } from "../../src/lib/calendarIdempotency.js";
import { hashDeIdempotencia } from "../../src/adapters/calendar/eventoDeCalendario.js";
import {
  nombreDeFichero,
  uidDeEvento,
} from "../../src/adapters/calendar/caldav/ics.js";

/** Nombre del .ics que crea el adaptador CalDAV para una clave. */
function nombreDelEvento(
  entrada: Parameters<typeof buildCalendarIdempotencyKey>[0]
): string {
  return nombreDeFichero(
    uidDeEvento(hashDeIdempotencia(buildCalendarIdempotencyKey(entrada)))
  );
}

// Los nombres de dos eventos reales de iCloud (cita cmub4tmbc y la anterior
// del mismo cliente, octubre de 2026). Si cambiara la fórmula —también el
// separador—, los eventos ya creados dejarían de casar con sus reintentos.
describe("buildCalendarIdempotencyKey", () => {
  it("da los nombres de evento que guarda producción", () => {
    expect(
      nombreDelEvento({
        callId: "panel:6ec88ab0-34e5-481a-99e4-71b6730a793b",
        startDateTime: "2026-10-07T08:45:00.000Z",
        durationMinutes: 100,
        distintivo: "6ec88ab0-34e5-481a-99e4-71b6730a793b",
      })
    ).toBe(
      "alhabla-74ad48456ba8a0e0ba5786d18a9e50ffe2b6dbe8e7a9b50dca1d27e54543576b.ics"
    );
    expect(
      nombreDelEvento({
        callId: "cmub4bo9s002js601gun25q49",
        startDateTime: "2026-10-10T09:00:00+02:00",
        durationMinutes: 90,
      })
    ).toBe(
      "alhabla-e91dc128157be600b411d5ae5bb0d4f01c19651d77d32f658681e1285137d8aa.ics"
    );
  });

  it("sin distintivo, la clave es la de siempre; con él, otra", () => {
    const base = {
      callId: "cmub4bo9s002js601gun25q49",
      startDateTime: "2026-10-10T09:00:00+02:00",
      durationMinutes: 90,
    };
    expect(buildCalendarIdempotencyKey({ ...base, distintivo: null })).toBe(
      buildCalendarIdempotencyKey(base)
    );
    expect(buildCalendarIdempotencyKey({ ...base, distintivo: "x" })).not.toBe(
      buildCalendarIdempotencyKey(base)
    );
  });

  it("el fuente no lleva bytes NUL literales (el separador va como escape)", () => {
    const fuente = readFileSync(
      new URL("../../src/lib/calendarIdempotency.ts", import.meta.url)
    );
    expect(fuente.includes(0)).toBe(false);
  });
});
