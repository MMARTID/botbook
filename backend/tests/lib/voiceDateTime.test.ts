import { describe, it, expect } from "vitest";
import {
  normalizeVoiceToolDateTime,
  timezoneOffsetMinutes,
} from "../../src/lib/voiceDateTime.js";

describe("timezoneOffsetMinutes", () => {
  it("devuelve el offset de Madrid en verano (+120) e invierno (+60)", () => {
    expect(
      timezoneOffsetMinutes(new Date("2026-08-15T12:00:00Z"), "Europe/Madrid")
    ).toBe(120);
    expect(
      timezoneOffsetMinutes(new Date("2026-12-15T12:00:00Z"), "Europe/Madrid")
    ).toBe(60);
  });

  it("devuelve 0 para Canarias en invierno (UTC+0)", () => {
    expect(
      timezoneOffsetMinutes(new Date("2026-12-15T12:00:00Z"), "Atlantic/Canary")
    ).toBe(0);
  });
});

describe("normalizeVoiceToolDateTime", () => {
  it("reinterpreta en hora local una hora hablada marcada como UTC — el caso real de la llamada perdida del 2026-09-14", () => {
    // "El viernes a las cuatro" enviado como 16:00+00:00: 16:00 UTC serían
    // las 18:00 en Madrid (cierre) — debe quedar como las 16:00 locales.
    const normalized = normalizeVoiceToolDateTime(
      "2026-09-18T16:00:00+00:00",
      "Europe/Madrid"
    );
    expect(normalized).toBe("2026-09-18T16:00:00+02:00");
    expect(new Date(normalized).toISOString()).toBe("2026-09-18T14:00:00.000Z");
  });

  it("trata la Z igual que +00:00", () => {
    expect(
      normalizeVoiceToolDateTime("2026-09-18T16:00:00Z", "Europe/Madrid")
    ).toBe("2026-09-18T16:00:00+02:00");
  });

  it("usa el offset de invierno cuando la fecha cae en horario de invierno", () => {
    expect(
      normalizeVoiceToolDateTime("2026-12-18T16:00:00+00:00", "Europe/Madrid")
    ).toBe("2026-12-18T16:00:00+01:00");
  });

  it("interpreta como hora local del negocio una fecha sin offset", () => {
    expect(
      normalizeVoiceToolDateTime("2026-09-18T16:00", "Europe/Madrid")
    ).toBe("2026-09-18T16:00:00+02:00");
  });

  it("respeta un offset explícito distinto de cero, aunque no sea el del negocio", () => {
    expect(
      normalizeVoiceToolDateTime("2026-09-18T16:00:00+02:00", "Europe/Madrid")
    ).toBe("2026-09-18T16:00:00+02:00");
    expect(
      normalizeVoiceToolDateTime("2026-09-18T10:00:00-05:00", "Europe/Madrid")
    ).toBe("2026-09-18T10:00:00-05:00");
  });

  it("no toca un offset cero legítimo (Canarias en invierno está en UTC+0)", () => {
    expect(
      normalizeVoiceToolDateTime("2026-12-18T16:00:00Z", "Atlantic/Canary")
    ).toBe("2026-12-18T16:00:00Z");
  });

  it("sí corrige la Z para Canarias en verano (UTC+1)", () => {
    expect(
      normalizeVoiceToolDateTime("2026-08-18T16:00:00Z", "Atlantic/Canary")
    ).toBe("2026-08-18T16:00:00+01:00");
  });

  it("devuelve intacta una entrada que no encaja en el patrón ISO o una zona desconocida", () => {
    expect(normalizeVoiceToolDateTime("mañana a las cuatro", "Europe/Madrid")).toBe(
      "mañana a las cuatro"
    );
    expect(normalizeVoiceToolDateTime("", "Europe/Madrid")).toBe("");
    expect(
      normalizeVoiceToolDateTime("2026-09-18T16:00:00Z", "Zona/Inexistente")
    ).toBe("2026-09-18T16:00:00Z");
  });
});
