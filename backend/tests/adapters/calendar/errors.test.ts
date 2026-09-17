import { describe, it, expect } from "vitest";
import {
  CalendarBusinessError,
  codigoDeReconexion,
  esCalendarBusinessError,
  proveedorDesdeErrorDeReconexion,
} from "../../../src/adapters/calendar/errors.js";

describe("codigoDeReconexion", () => {
  it("compone el código histórico de Google", () => {
    expect(codigoDeReconexion("google")).toBe(
      "GOOGLE_CALENDAR_RECONNECT_REQUIRED"
    );
  });

  it("compone el código histórico de Outlook", () => {
    expect(codigoDeReconexion("outlook")).toBe(
      "OUTLOOK_CALENDAR_RECONNECT_REQUIRED"
    );
  });
});

describe("CalendarBusinessError", () => {
  it("conserva name y code para el duck typing de voiceTools y el job", () => {
    const error = new CalendarBusinessError(
      "BOOK_APPOINTMENT_FAILED",
      "No se pudo crear el evento."
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("CalendarBusinessError");
    expect(error.code).toBe("BOOK_APPOINTMENT_FAILED");
    expect(error.message).toBe("No se pudo crear el evento.");
    expect(error.provider).toBeUndefined();
  });

  it("guarda el proveedor solo cuando se le pasa", () => {
    const error = new CalendarBusinessError(
      "OUTLOOK_CALENDAR_RECONNECT_REQUIRED",
      "La conexión con Outlook ya no es válida.",
      "outlook"
    );
    expect(error.provider).toBe("outlook");
  });
});

describe("esCalendarBusinessError", () => {
  it("acepta una instancia real", () => {
    expect(
      esCalendarBusinessError(
        new CalendarBusinessError("CALENDAR_TIMEOUT", "Tarda demasiado.")
      )
    ).toBe(true);
  });

  it("acepta un objeto plano con name y code (como hacen los tests del job)", () => {
    const plano = Object.assign(new Error("x"), {
      name: "CalendarBusinessError",
      code: "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
    });
    expect(esCalendarBusinessError(plano)).toBe(true);
    expect(
      esCalendarBusinessError({
        name: "CalendarBusinessError",
        code: "CALENDAR_RATE_LIMITED",
      })
    ).toBe(true);
  });

  it("rechaza un Error genérico, un objeto sin code, undefined y null", () => {
    expect(esCalendarBusinessError(new Error("x"))).toBe(false);
    expect(esCalendarBusinessError({ name: "CalendarBusinessError" })).toBe(
      false
    );
    expect(esCalendarBusinessError(undefined)).toBe(false);
    expect(esCalendarBusinessError(null)).toBe(false);
  });
});

describe("proveedorDesdeErrorDeReconexion", () => {
  it("usa el campo provider de una instancia real", () => {
    const error = new CalendarBusinessError(
      "OUTLOOK_CALENDAR_RECONNECT_REQUIRED",
      "revocada",
      "outlook"
    );
    expect(proveedorDesdeErrorDeReconexion(error)).toBe("outlook");
  });

  it("parsea el código de un objeto plano sin provider", () => {
    const plano = Object.assign(new Error("x"), {
      name: "CalendarBusinessError",
      code: "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
    });
    expect(proveedorDesdeErrorDeReconexion(plano)).toBe("google");
    expect(
      proveedorDesdeErrorDeReconexion({
        name: "CalendarBusinessError",
        code: "OUTLOOK_CALENDAR_RECONNECT_REQUIRED",
      })
    ).toBe("outlook");
  });

  it("devuelve null para un error que no es de reconexión", () => {
    expect(
      proveedorDesdeErrorDeReconexion(
        new CalendarBusinessError("CALENDAR_TIMEOUT", "Tarda demasiado.")
      )
    ).toBeNull();
    expect(
      proveedorDesdeErrorDeReconexion({
        name: "CalendarBusinessError",
        code: "BOOK_APPOINTMENT_FAILED",
      })
    ).toBeNull();
  });

  it("devuelve null (no cae a google) para un proveedor desconocido", () => {
    expect(
      proveedorDesdeErrorDeReconexion({
        name: "CalendarBusinessError",
        code: "CALDAV_CALENDAR_RECONNECT_REQUIRED",
      })
    ).toBeNull();
  });

  it("devuelve null para lo que no es un CalendarBusinessError", () => {
    expect(proveedorDesdeErrorDeReconexion(new Error("invalid_grant"))).toBe(
      null
    );
    expect(proveedorDesdeErrorDeReconexion(undefined)).toBeNull();
  });
});
