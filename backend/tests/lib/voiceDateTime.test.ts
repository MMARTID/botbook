import { describe, it, expect } from "vitest";
import {
  inicioDelDiaEnZona,
  instanteEnHoraLocal,
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

describe("inicioDelDiaEnZona", () => {
  it("da la medianoche del negocio, no la de UTC", () => {
    // 23:30 UTC del 1 de octubre ya es día 2 en Madrid (UTC+2).
    expect(
      inicioDelDiaEnZona("Europe/Madrid", new Date("2026-10-01T23:30:00Z")).toISOString()
    ).toBe("2026-10-01T22:00:00.000Z");
    expect(
      inicioDelDiaEnZona("Atlantic/Canary", new Date("2026-12-15T10:00:00Z")).toISOString()
    ).toBe("2026-12-15T00:00:00.000Z");
  });

  it("acierta el día del cambio de hora", () => {
    // 25 de octubre de 2026: a medianoche Madrid aún está en UTC+2.
    expect(
      inicioDelDiaEnZona("Europe/Madrid", new Date("2026-10-25T12:00:00Z")).toISOString()
    ).toBe("2026-10-24T22:00:00.000Z");
  });
});

describe("instanteEnHoraLocal", () => {
  it.each([
    ["Madrid en verano", "2026-10-15T07:00:00.000Z", "Europe/Madrid", "2026-10-15T09:00:00+02:00"],
    ["Madrid en invierno", "2026-12-03T08:30:00.000Z", "Europe/Madrid", "2026-12-03T09:30:00+01:00"],
    ["Canarias en invierno (UTC+0)", "2026-12-03T09:30:00.000Z", "Atlantic/Canary", "2026-12-03T09:30:00+00:00"],
    ["Canarias en verano", "2026-08-28T08:00:00.000Z", "Atlantic/Canary", "2026-08-28T09:00:00+01:00"],
    ["después del cambio de hora de octubre", "2026-10-25T08:00:00.000Z", "Europe/Madrid", "2026-10-25T09:00:00+01:00"],
    ["una hora que ya venía con offset local", "2026-08-28T10:00:00+02:00", "Europe/Madrid", "2026-08-28T10:00:00+02:00"],
  ])("escribe el instante en hora local: %s", (_caso, instante, zona, esperado) => {
    const local = instanteEnHoraLocal(instante, zona);

    expect(local).toBe(esperado);
    expect(new Date(local).getTime()).toBe(new Date(instante).getTime());
  });

  it("da un valor que normalizeVoiceToolDateTime deja intacto (el LLM puede copiarlo)", () => {
    // Llamada de producción del 2026-10-09: «…T07:00:00.000Z» copiado tal
    // cual se normalizaba a las 07:00 de Madrid en vez de las 09:00.
    for (const [instante, zona] of [
      ["2026-10-15T07:00:00.000Z", "Europe/Madrid"],
      ["2026-12-03T08:30:00.000Z", "Europe/Madrid"],
      ["2026-12-03T09:30:00.000Z", "Atlantic/Canary"],
      ["2026-08-28T08:00:00.000Z", "Atlantic/Canary"],
    ]) {
      const local = instanteEnHoraLocal(instante, zona);
      expect(normalizeVoiceToolDateTime(local, zona)).toBe(local);
    }
  });

  it("devuelve intacta una fecha inválida o una zona desconocida", () => {
    expect(instanteEnHoraLocal("el martes por la tarde", "Europe/Madrid")).toBe(
      "el martes por la tarde"
    );
    expect(instanteEnHoraLocal("2026-10-15T07:00:00.000Z", "Zona/Inventada")).toBe(
      "2026-10-15T07:00:00.000Z"
    );
  });
});
