import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkAvailability } from "../../src/lib/availability.js";
import { prisma } from "../../src/lib/prisma.js";
import { DEFAULT_BUSINESS_SCHEDULE } from "../../src/lib/businessSchedule.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    professional: {
      findMany: vi.fn(),
    },
    booking: {
      findMany: vi.fn(),
    },
  },
}));

const europeMadrid = "Europe/Madrid";
const businessId = "biz_123";

const mockedProfessionalFindMany = vi.mocked(prisma.professional.findMany);
const mockedBookingFindMany = vi.mocked(prisma.booking.findMany);

function givenProfessionals(professionals: Array<{ id: string; name: string; serviceIds: string[] }>) {
  mockedProfessionalFindMany.mockResolvedValue(
    professionals.map((p) => ({
      id: p.id,
      businessId,
      name: p.name,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      serviceLinks: p.serviceIds.map((serviceId) => ({
        professionalId: p.id,
        serviceId,
        assignedAt: new Date(),
      })),
    }))
  );
}

function givenBookings(bookings: Array<{ programedAt: Date; isCancelled?: boolean; professionalId?: string | null; durationMinutes?: number }>) {
  mockedBookingFindMany.mockResolvedValue(
    bookings.map((b, index) => ({
      id: `booking_${index}`,
      callId: `call_${index}`,
      createdAt: new Date(),
      programedAt: b.programedAt,
      durationMinutes: b.durationMinutes ?? 30,
      numberPeople: 1,
      isCancelled: b.isCancelled ?? false,
      professionalId: b.professionalId ?? null,
      serviceIds: [],
    }))
  );
}

describe("checkAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza citas fuera del horario comercial", async () => {
    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 1,
      startDateTime: "2026-08-10T20:00:00",
      durationMinutes: 60,
    });

    expect(result.available).toBe(false);
    expect(result.code).toBe("OUTSIDE_BUSINESS_HOURS");
  });

  it("rechaza cuando no hay profesionales activos", async () => {
    givenProfessionals([]);
    givenBookings([]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 1,
      startDateTime: "2026-08-10T10:00:00",
      durationMinutes: 60,
    });

    expect(result.available).toBe(false);
    expect(result.code).toBe("NO_AVAILABLE_PROFESSIONAL");
  });

  it("los servicios marcados son una preferencia, no un filtro: un profesional con otro servicio marcado sigue disponible", async () => {
    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: ["service_other"] }]);
    givenBookings([]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 1,
      startDateTime: "2026-08-10T10:00:00",
      durationMinutes: 60,
      serviceIds: ["service_target"],
    });

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.availableProfessionals).toEqual([{ id: "prof_1", name: "Ana" }]);
    }
  });

  it("un profesional sin ningún servicio marcado puede hacerlos todos", async () => {
    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: [] }]);
    givenBookings([]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 1,
      startDateTime: "2026-08-10T10:00:00",
      durationMinutes: 60,
      serviceIds: ["service_target"],
    });

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.availableProfessionals).toEqual([{ id: "prof_1", name: "Ana" }]);
    }
  });

  it("prioriza al especialista del servicio sobre un profesional sin esa marca (usado para asignar sin professionalId explícito)", async () => {
    givenProfessionals([
      { id: "prof_generalista", name: "Luis", serviceIds: [] },
      { id: "prof_especialista", name: "Ana", serviceIds: ["service_target"] },
    ]);
    givenBookings([]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 2,
      startDateTime: "2026-08-10T10:00:00",
      durationMinutes: 60,
      serviceIds: ["service_target"],
    });

    expect(result.available).toBe(true);
    if (result.available) {
      // El especialista va primero aunque en la BD viniera segundo — book_appointment
      // usa availableProfessionals[0] cuando no se pide un profesional concreto.
      expect(result.availableProfessionals[0]).toEqual({ id: "prof_especialista", name: "Ana" });
      expect(result.availableProfessionals).toHaveLength(2);
    }
  });

  it("acepta cuando hay capacidad y profesionales libres", async () => {
    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: ["service_target"] }]);
    givenBookings([]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 1,
      startDateTime: "2026-08-10T10:00:00",
      durationMinutes: 60,
      serviceIds: ["service_target"],
    });

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.capacityUsed).toBe(0);
      expect(result.capacityTotal).toBe(1);
      expect(result.availableProfessionals).toEqual([{ id: "prof_1", name: "Ana" }]);
    }
  });

  it("rechaza cuando se alcanza la capacidad máxima", async () => {
    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: ["service_target"] }]);
    givenBookings([{ programedAt: new Date("2026-08-10T10:00:00") }]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 1,
      startDateTime: "2026-08-10T10:00:00",
      durationMinutes: 60,
      serviceIds: ["service_target"],
    });

    expect(result.available).toBe(false);
    expect(result.code).toBe("CAPACITY_REACHED");
    if (!result.available) {
      expect(result.capacityUsed).toBe(1);
      expect(result.capacityTotal).toBe(1);
    }
  });

  it("no cuenta como simultáneas dos citas consecutivas que no se solapan entre sí (hallazgo #17 de la auditoría)", async () => {
    // Capacidad 2, dos citas de 30 min consecutivas (09:00–09:30 y
    // 09:30–10:00) con profesionales distintos — en ningún instante hay más
    // de 1 cita a la vez, así que un tercer profesional libre SÍ debería
    // poder atender la ventana completa 09:00–10:00. El bug contaba
    // "cuántas reservas tocan la ventana pedida" (2, ambas la tocan) en vez
    // de "cuántas coinciden en el mismo instante" (nunca más de 1), y
    // rechazaba la reserva con la capacidad de sobra.
    givenProfessionals([
      { id: "prof_1", name: "Ana", serviceIds: [] },
      { id: "prof_2", name: "Bea", serviceIds: [] },
      { id: "prof_3", name: "Carla", serviceIds: [] },
    ]);
    givenBookings([
      { programedAt: new Date("2026-08-10T09:00:00+02:00"), durationMinutes: 30, professionalId: "prof_1" },
      { programedAt: new Date("2026-08-10T09:30:00+02:00"), durationMinutes: 30, professionalId: "prof_2" },
    ]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 2,
      startDateTime: "2026-08-10T09:00:00+02:00",
      durationMinutes: 60,
    });

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.capacityUsed).toBe(1);
      expect(result.availableProfessionals.map((p) => p.id)).toEqual(["prof_3"]);
    }
  });

  it("cuando se alcanza la capacidad máxima, sugiere el siguiente hueco libre ese mismo día", async () => {
    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: ["service_target"] }]);
    // Único booking fijo (30 min por defecto): 10:00–10:30. Un candidato a
    // las 10:15 con 60 min (10:15–11:15) sigue solapando; el de las 10:30
    // (10:30–11:30) ya no solapa con un booking que termina a las 10:30.
    // Offset +02:00 explícito (CEST) en vez de una fecha naive: sin él, el
    // test pasa en local (donde Node interpreta la hora como Europe/Madrid)
    // pero falla en CI, que corre en UTC — mismo bug de timezone ya conocido
    // en este proyecto (ver memoria ci-cd-pipeline-setup).
    givenBookings([{ programedAt: new Date("2026-08-10T10:00:00+02:00") }]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 1,
      startDateTime: "2026-08-10T10:00:00+02:00",
      durationMinutes: 60,
      serviceIds: ["service_target"],
    });

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestedNextSlot).toEqual({
        startDateTime: new Date("2026-08-10T10:30:00+02:00").toISOString(),
        availableProfessionals: [{ id: "prof_1", name: "Ana" }],
      });
    }
  });

  it("rechaza cuando todos los profesionales posibles están ocupados", async () => {
    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: ["service_target"] }]);
    givenBookings([{ programedAt: new Date("2026-08-10T10:00:00"), professionalId: "prof_1" }]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 2,
      startDateTime: "2026-08-10T10:00:00",
      durationMinutes: 60,
      serviceIds: ["service_target"],
    });

    expect(result.available).toBe(false);
    expect(result.code).toBe("ALL_PROFESSIONALS_BUSY");
  });

  it("cuando todos los profesionales están ocupados, sugiere el siguiente hueco donde alguno esté libre", async () => {
    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: ["service_target"] }]);
    givenBookings([{ programedAt: new Date("2026-08-10T10:00:00+02:00"), professionalId: "prof_1" }]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 2,
      startDateTime: "2026-08-10T10:00:00+02:00",
      durationMinutes: 60,
      serviceIds: ["service_target"],
    });

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestedNextSlot).toEqual({
        startDateTime: new Date("2026-08-10T10:30:00+02:00").toISOString(),
        availableProfessionals: [{ id: "prof_1", name: "Ana" }],
      });
    }
  });

  it("no sugiere ningún hueco si la búsqueda llega al cierre del horario sin encontrar uno libre", async () => {
    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: ["service_target"] }]);
    // Un único profesional, ocupado en bloques de 30 min sin hueco desde las
    // 17:00 hasta el cierre (18:00) — con 60 min de duración no cabe ninguna
    // cita nueva antes de cerrar.
    givenBookings([
      { programedAt: new Date("2026-08-10T17:00:00+02:00"), professionalId: "prof_1" },
      { programedAt: new Date("2026-08-10T17:30:00+02:00"), professionalId: "prof_1" },
    ]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 1,
      startDateTime: "2026-08-10T17:00:00+02:00",
      durationMinutes: 60,
      serviceIds: ["service_target"],
    });

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestedNextSlot).toBeNull();
    }
  });

  it("salta el descanso de un horario partido en vez de rendirse ahí (hallazgo #18 de la auditoría)", async () => {
    // Horario partido: mañana 09:00–13:00, tarde 16:00–20:00. Pedido a las
    // 12:00 (60 min, cabe justo antes de cerrar la mañana) con capacidad 1 y
    // un único profesional ya ocupado esa hora exacta — antes, el primer
    // candidato que no encajaba en la mañana (12:15, termina 13:15, ya fuera
    // del tramo) hacía que la búsqueda se rindiera del todo con `break`,
    // devolviendo null aunque la tarde estuviera completamente libre.
    const splitSchedule = {
      version: 1 as const,
      week: {
        ...DEFAULT_BUSINESS_SCHEDULE.week,
        monday: {
          enabled: true,
          intervals: [
            { start: "09:00", end: "13:00" },
            { start: "16:00", end: "20:00" },
          ],
        },
      },
    };

    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: ["service_target"] }]);
    givenBookings([{ programedAt: new Date("2026-08-10T12:00:00+02:00"), durationMinutes: 60, professionalId: "prof_1" }]);

    const result = await checkAvailability({
      businessId,
      schedule: splitSchedule,
      timezone: europeMadrid,
      bookingCapacity: 1,
      startDateTime: "2026-08-10T12:00:00+02:00",
      durationMinutes: 60,
      serviceIds: ["service_target"],
    });

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.suggestedNextSlot).toEqual({
        startDateTime: new Date("2026-08-10T16:00:00+02:00").toISOString(),
        availableProfessionals: [{ id: "prof_1", name: "Ana" }],
      });
    }
  });

  it("devuelve profesionales no ocupados cuando hay varios", async () => {
    givenProfessionals([
      { id: "prof_1", name: "Ana", serviceIds: ["service_target"] },
      { id: "prof_2", name: "Luis", serviceIds: ["service_target"] },
    ]);
    givenBookings([{ programedAt: new Date("2026-08-10T10:00:00"), professionalId: "prof_1" }]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 2,
      startDateTime: "2026-08-10T10:00:00",
      durationMinutes: 60,
      serviceIds: ["service_target"],
    });

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.availableProfessionals).toEqual([{ id: "prof_2", name: "Luis" }]);
    }
  });

  it("filtra citas canceladas en la consulta a Prisma", async () => {
    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: ["service_target"] }]);
    givenBookings([]);

    await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 1,
      startDateTime: "2026-08-10T10:00:00",
      durationMinutes: 60,
      serviceIds: ["service_target"],
    });

    expect(mockedBookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isCancelled: false }),
      })
    );
  });

  it("ignora citas que no se solapan con el slot", async () => {
    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: ["service_target"] }]);
    givenBookings([{ programedAt: new Date("2026-08-10T12:00:00") }]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 1,
      startDateTime: "2026-08-10T10:00:00",
      durationMinutes: 60,
      serviceIds: ["service_target"],
    });

    expect(result.available).toBe(true);
  });
});
