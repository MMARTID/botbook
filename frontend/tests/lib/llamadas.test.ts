import { describe, it, expect } from "vitest";
import {
  enlaceTel,
  etiquetaDeLlamada,
  momentoCorto,
  parseTranscriptMessages,
  resultadoDeLlamada,
  telefonoParaDevolver,
} from "@/lib/llamadas";
import { formatPhoneLocal } from "@/lib/format";
import type { CallBooking, CallRecado } from "@/lib/types";

const reserva = (extra: Partial<CallBooking> = {}): CallBooking => ({
  id: "bk_1",
  programedAt: "2026-10-02T15:30:00Z",
  durationMinutes: 90,
  numberPeople: 1,
  isCancelled: false,
  clientPhone: null,
  serviceIds: [],
  ...extra,
});
const recado = (extra: Partial<CallRecado> = {}): CallRecado => ({
  id: "lead_1",
  nombre: "Laura",
  telefono: "645778120",
  motivo: "Keratina",
  atendidoAt: null,
  ...extra,
});

describe("etiquetaDeLlamada", () => {
  it("un recado sin atender va antes que cualquier otra cosa", () => {
    expect(etiquetaDeLlamada({ booking: reserva(), escalationReason: null, recado: recado() })?.texto).toBe("Por devolver");
  });

  it("después, la cita creada o cambiada", () => {
    expect(etiquetaDeLlamada({ booking: reserva(), escalationReason: null, recado: null })?.texto).toBe("Reserva creada");
    expect(
      etiquetaDeLlamada({
        booking: reserva({ isCancelled: true, rescheduledToId: "bk_2" }),
        escalationReason: null,
        recado: null,
      })?.texto
    ).toBe("Reserva modificada");
  });

  it("un recado ya atendido se ve como devuelta", () => {
    expect(
      etiquetaDeLlamada({ booking: null, escalationReason: "CLIENTE_LO_PIDIO", recado: recado({ atendidoAt: "2026-10-02T08:00:00Z" }) })
        ?.texto
    ).toBe("Devuelta");
  });

  it("sin cita ni recado, el motivo; sin nada, ninguna", () => {
    expect(etiquetaDeLlamada({ booking: null, escalationReason: "FUERA_DE_HORARIO" })?.texto).toBe("Fuera de horario");
    expect(etiquetaDeLlamada({ booking: null, escalationReason: "NO_APLICA" })).toBeNull();
  });
});

describe("teléfonos en el móvil", () => {
  it("devuelve la llamada al número del recado si el cliente dio otro", () => {
    expect(telefonoParaDevolver({ fromNumber: "+34600000000", recado: recado() })).toBe("645778120");
    expect(telefonoParaDevolver({ fromNumber: "+34600000000", recado: null })).toBe("+34600000000");
    expect(telefonoParaDevolver({ fromNumber: null })).toBeNull();
  });

  it("marca con prefijo los nueve dígitos españoles", () => {
    expect(enlaceTel("645 77 81 20")).toBe("tel:+34645778120");
    expect(enlaceTel("+34645778120")).toBe("tel:+34645778120");
  });

  it("enseña el número sin el +34", () => {
    expect(formatPhoneLocal("+34655214409")).toBe("655 21 44 09");
    expect(formatPhoneLocal(null)).toBeNull();
  });
});

describe("momentoCorto", () => {
  it("hoy solo la hora, ayer con su palabra y lo demás con la fecha", () => {
    expect(momentoCorto("2026-10-02T07:03:00Z", "Europe/Madrid", "2026-10-02")).toBe("09:03");
    expect(momentoCorto("2026-10-01T18:12:00Z", "Europe/Madrid", "2026-10-02")).toBe("Ayer 20:12");
    expect(momentoCorto("2026-09-29T09:30:00Z", "Europe/Madrid", "2026-10-02")).toBe("29 sept 11:30");
  });
});

describe("resultadoDeLlamada", () => {
  const sin = { booking: null, escalationReason: null, recado: null };

  it("usa la etiqueta del móvil cuando la hay", () => {
    expect(resultadoDeLlamada({ ...sin, booking: reserva(), outcome: "RESOLVED" }).texto).toBe("Reserva creada");
    expect(resultadoDeLlamada({ ...sin, recado: recado(), outcome: "LEAD_CAPTURED" }).texto).toBe("Por devolver");
  });

  it("sin etiqueta, dice cómo acabó; «Consulta» solo si se resolvió sin cita", () => {
    expect(resultadoDeLlamada({ ...sin, outcome: "RESOLVED" })).toEqual({ texto: "Consulta", tono: "neutro" });
    expect(resultadoDeLlamada({ ...sin, outcome: null }).texto).toBe("Consulta");
    expect(resultadoDeLlamada({ ...sin, outcome: "NO_ANSWER" }).texto).toBe("Sin respuesta");
    expect(resultadoDeLlamada({ ...sin, outcome: "FRUSTRATED" })).toEqual({ texto: "Sin resolver", tono: "aviso" });
    expect(resultadoDeLlamada({ ...sin, outcome: "ESCALATED" }).tono).toBe("aviso");
  });
});

describe("parseTranscriptMessages", () => {
  it("se queda con los objetos de una lista y devuelve null si no es una lista", () => {
    expect(parseTranscriptMessages([{ role: "user", content: "Hola" }, "ruido", null])).toEqual([{ role: "user", content: "Hola" }]);
    expect(parseTranscriptMessages("texto")).toBeNull();
  });
});
