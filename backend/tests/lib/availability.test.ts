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
      serviceId: null,
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
      serviceId: "service_target",
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
      serviceId: "service_target",
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
      serviceId: "service_target",
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
      serviceId: "service_target",
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
      serviceId: "service_target",
    });

    expect(result.available).toBe(false);
    expect(result.code).toBe("CAPACITY_REACHED");
    if (!result.available) {
      expect(result.capacityUsed).toBe(1);
      expect(result.capacityTotal).toBe(1);
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
      serviceId: "service_target",
    });

    expect(result.available).toBe(false);
    expect(result.code).toBe("ALL_PROFESSIONALS_BUSY");
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
      serviceId: "service_target",
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
      serviceId: "service_target",
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
      serviceId: "service_target",
    });

    expect(result.available).toBe(true);
  });
});
