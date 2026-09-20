import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { DEFAULT_BUSINESS_SCHEDULE } from "../../../src/lib/businessSchedule.js";
import { checkAvailability } from "../../../src/lib/availability.js";
import { calendarService } from "../../../src/modules/calendar/service.js";
import { buscarHueco } from "../../../src/modules/gestor/buscarHueco.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: { business: { findUnique: vi.fn() } },
}));
vi.mock("../../../src/lib/availability.js", async (importActual) => {
  const actual =
    await importActual<typeof import("../../../src/lib/availability.js")>();
  return { ...actual, checkAvailability: vi.fn() };
});
vi.mock("../../../src/modules/calendar/service.js", () => ({
  calendarService: { getBusyIntervals: vi.fn() },
}));
vi.mock("../../../src/modules/calendar/conexion.js", () => ({
  SELECT_CONEXION_DE_CALENDARIO: {
    id: true,
    calendarProvider: true,
    calendarConnections: true,
  },
  resolverConexionDeCalendario: vi.fn(() => ({
    provider: "google",
    calendarId: "primary",
  })),
  conexionOperativa: vi.fn(() => true),
  usaCalendarioExterno: vi.fn(() => true),
  origenDeCalendario: vi.fn(() => ({
    provider: "google",
    calendarId: "primary",
  })),
}));

const mockedCheck = vi.mocked(checkAvailability);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(prisma.business.findUnique).mockResolvedValue({
    id: "biz_1",
    timezone: "Europe/Madrid",
    schedule: DEFAULT_BUSINESS_SCHEDULE,
    bookingCapacity: 2,
    calendarProvider: "google",
    calendarConnections: [],
  } as never);
  vi.mocked(calendarService.getBusyIntervals).mockResolvedValue({
    intervals: [],
    calendarAvailabilityKnown: true,
  });
});

describe("buscar_hueco", () => {
  it("valida la fecha, convierte la hora local y devuelve quién está libre", async () => {
    expect(
      await buscarHueco("biz_1", { fechaHora: "mañana a las 5" })
    ).toMatchObject({
      status: 200,
      body: { error: expect.stringContaining("fechaHora") },
    });
    mockedCheck.mockResolvedValue({
      available: true,
      message: "",
      capacityUsed: 0,
      capacityTotal: 2,
      availableProfessionals: [{ id: "pro_laura", name: "Laura" }],
    });
    const r = await buscarHueco("biz_1", {
      fechaHora: "2026-11-12T17:00",
      duracionMinutos: 45,
      profesionalId: "pro_laura",
      servicioIds: ["svc_corte"],
    });
    expect(r.body).toEqual({
      libre: true,
      cuando: "jueves 12 de noviembre a las 17:00",
      profesionalesLibres: [{ profesionalId: "pro_laura", nombre: "Laura" }],
      calendarioComprobado: true,
    });
    expect(mockedCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        startDateTime: "2026-11-12T16:00:00.000Z",
        durationMinutes: 45,
        professionalId: "pro_laura",
        serviceIds: ["svc_corte"],
        calendarAvailabilityKnown: true,
      })
    );
  });

  it("sin hueco devuelve el más cercano en hora local, lista para añadir_cita; si el calendario falla, lo dice", async () => {
    mockedCheck.mockResolvedValue({
      available: false,
      code: "CAPACITY_REACHED",
      message: "El negocio ya tiene todas sus plazas ocupadas en ese horario.",
      capacityUsed: 2,
      capacityTotal: 2,
      suggestedNextSlot: {
        startDateTime: "2026-11-12T16:30:00.000Z",
        availableProfessionals: [{ id: "pro_marta", name: "Marta" }],
      },
    });
    vi.mocked(calendarService.getBusyIntervals).mockRejectedValueOnce(
      new Error("google caído")
    );
    const r = await buscarHueco("biz_1", { fechaHora: "2026-11-12T17:00" });
    expect(r.body).toEqual({
      libre: false,
      motivo: "El negocio ya tiene todas sus plazas ocupadas en ese horario.",
      huecoMasCercano: {
        fechaHora: "2026-11-12T17:30",
        cuando: "jueves 12 de noviembre a las 17:30",
        profesionalesLibres: [{ profesionalId: "pro_marta", nombre: "Marta" }],
      },
      calendarioComprobado: false,
    });
  });
});
