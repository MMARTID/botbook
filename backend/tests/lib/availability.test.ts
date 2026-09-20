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
    professionalAbsence: {
      findMany: vi.fn(),
    },
  },
}));

const europeMadrid = "Europe/Madrid";
const businessId = "biz_123";

const mockedProfessionalFindMany = vi.mocked(prisma.professional.findMany);
const mockedBookingFindMany = vi.mocked(prisma.booking.findMany);

// `serviceIds` crea filas ESPECIALISTA (lo que significaba la casilla antes
// de existir el nivel); `noSugerir` crea filas NO_SUGERIR. Sin fila = lo hace.
function givenProfessionals(
  professionals: Array<{ id: string; name: string; serviceIds: string[]; noSugerir?: string[] }>
) {
  mockedProfessionalFindMany.mockResolvedValue(
    professionals.map((p) => ({
      id: p.id,
      businessId,
      name: p.name,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      serviceLinks: [
        ...p.serviceIds.map((serviceId) => ({
          professionalId: p.id,
          serviceId,
          level: "ESPECIALISTA" as const,
          assignedAt: new Date(),
        })),
        ...(p.noSugerir ?? []).map((serviceId) => ({
          professionalId: p.id,
          serviceId,
          level: "NO_SUGERIR" as const,
          assignedAt: new Date(),
        })),
      ],
    }))
  );
}

function givenBookings(bookings: Array<{
  programedAt: Date;
  isCancelled?: boolean;
  professionalId?: string | null;
  durationMinutes?: number;
  externalEventId?: string | null;
  externalCalendarProvider?: string | null;
  externalCalendarId?: string | null;
}>) {
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
      externalEventId: b.externalEventId ?? null,
      externalCalendarProvider: b.externalCalendarProvider ?? null,
      externalCalendarId: b.externalCalendarId ?? null,
      serviceIds: [],
    }))
  );
}

describe("checkAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.professionalAbsence.findMany).mockResolvedValue([]);
  });

  it("cuenta una sola vez una reserva propia presente también en el calendario", async () => {
    givenProfessionals([
      { id: "prof_1", name: "Ana", serviceIds: [] },
      { id: "prof_2", name: "Luis", serviceIds: [] },
    ]);
    givenBookings([
      {
        programedAt: new Date("2026-08-10T10:00:00Z"),
        durationMinutes: 60,
        professionalId: "prof_1",
        externalEventId: "event-own-1",
        externalCalendarProvider: "google",
        externalCalendarId: "primary",
      },
    ]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 2,
      startDateTime: "2026-08-10T10:00:00Z",
      durationMinutes: 60,
      externalBusyIntervals: [{
        externalEventId: "event-own-1",
        start: new Date("2026-08-10T10:00:00Z"),
        end: new Date("2026-08-10T11:00:00Z"),
      }],
      calendarAvailabilityKnown: true,
      calendarOrigin: { provider: "google", calendarId: "primary" },
    });

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.capacityUsed).toBe(1);
      expect(result.availableProfessionals).toEqual([{ id: "prof_2", name: "Luis" }]);
    }
  });

  it("libera una reserva local cuyo evento se canceló manualmente", async () => {
    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: [] }]);
    givenBookings([
      {
        programedAt: new Date("2026-08-10T10:00:00Z"),
        durationMinutes: 60,
        professionalId: "prof_1",
        externalEventId: "event-cancelled",
        externalCalendarProvider: "google",
        externalCalendarId: "primary",
      },
    ]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 1,
      startDateTime: "2026-08-10T10:00:00Z",
      durationMinutes: 60,
      externalBusyIntervals: [],
      calendarAvailabilityKnown: true,
      calendarOrigin: { provider: "google", calendarId: "primary" },
    });

    expect(result.available).toBe(true);
  });

  it("conserva una reserva local al consultar un calendario distinto del que creó su evento", async () => {
    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: [] }]);
    givenBookings([
      {
        programedAt: new Date("2026-08-10T10:00:00Z"),
        durationMinutes: 60,
        professionalId: "prof_1",
        externalEventId: "event-google-original",
        externalCalendarProvider: "google",
        externalCalendarId: "calendario-anterior",
      },
    ]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 1,
      startDateTime: "2026-08-10T10:00:00Z",
      durationMinutes: 60,
      externalBusyIntervals: [],
      calendarAvailabilityKnown: true,
      calendarOrigin: { provider: "google", calendarId: "calendario-nuevo" },
    });

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.code).toBe("CAPACITY_REACHED");
    }
  });

  it("rechaza citas fuera del horario comercial", async () => {
    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: [] }]);
    givenBookings([]);

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

  it("cuando está cerrado, sugiere el hueco de apertura del siguiente día hábil", async () => {
    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: [] }]);
    givenBookings([]);

    // Sábado 2026-08-08 (cerrado todo el día, ver DEFAULT_BUSINESS_SCHEDULE) a
    // las 10:00 -> el siguiente hueco libre es el lunes 2026-08-10 a las 09:00,
    // hora de apertura. Offset +02:00 explícito (CEST) por el mismo motivo que
    // el resto de tests de este archivo (Node en UTC en CI).
    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 1,
      startDateTime: "2026-08-08T10:00:00+02:00",
      durationMinutes: 60,
    });

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.code).toBe("OUTSIDE_BUSINESS_HOURS");
      expect(result.suggestedNextSlot).toEqual({
        startDateTime: new Date("2026-08-10T09:00:00+02:00").toISOString(),
        availableProfessionals: [{ id: "prof_1", name: "Ana" }],
      });
    }
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

  it("cuando no queda hueco antes del cierre, sigue buscando y sugiere el siguiente día hábil", async () => {
    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: ["service_target"] }]);
    // Un único profesional, ocupado en bloques de 30 min sin hueco desde las
    // 17:00 hasta el cierre (18:00) — con 60 min de duración no cabe ninguna
    // cita nueva antes de cerrar hoy. Desde 2026-09-15 la búsqueda ya no se
    // limita al mismo día: sigue hasta encontrar el siguiente hueco libre
    // (martes 2026-08-11 a las 09:00, apertura) en vez de rendirse en null.
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
      expect(result.suggestedNextSlot).toEqual({
        startDateTime: new Date("2026-08-11T09:00:00+02:00").toISOString(),
        availableProfessionals: [{ id: "prof_1", name: "Ana" }],
      });
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

  it("un bloqueo del calendario real (no guardado en Postgres) también agota la capacidad (hallazgo #5 de la auditoría)", async () => {
    // Sin ninguna reserva local, pero con capacidad 1 y un bloqueo externo
    // (cita metida a mano en Google/Outlook) que cubre el hueco pedido — la
    // disponibilidad debía negarse igual que si fuera un Booking real.
    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: ["service_target"] }]);
    givenBookings([]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 1,
      startDateTime: "2026-08-10T10:00:00+02:00",
      durationMinutes: 60,
      serviceIds: ["service_target"],
      externalBusyIntervals: [
        {
          start: new Date("2026-08-10T10:00:00+02:00"),
          end: new Date("2026-08-10T11:00:00+02:00"),
        },
      ],
    });

    expect(result.available).toBe(false);
    expect(result.code).toBe("CAPACITY_REACHED");
  });

  it("un bloqueo externo nunca marca a un profesional concreto como ocupado, solo resta capacidad", async () => {
    // Capacidad 2: con el bloqueo externo ocupando una plaza, sigue quedando
    // una libre — y como no sabemos a qué profesional pertenece un evento
    // metido a mano, ningún profesional concreto debe aparecer como ocupado
    // por su culpa.
    givenProfessionals([
      { id: "prof_1", name: "Ana", serviceIds: ["service_target"] },
      { id: "prof_2", name: "Bea", serviceIds: ["service_target"] },
    ]);
    givenBookings([]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 2,
      startDateTime: "2026-08-10T10:00:00+02:00",
      durationMinutes: 60,
      serviceIds: ["service_target"],
      externalBusyIntervals: [
        {
          start: new Date("2026-08-10T10:00:00+02:00"),
          end: new Date("2026-08-10T11:00:00+02:00"),
        },
      ],
    });

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.capacityUsed).toBe(1);
      expect(result.availableProfessionals.map((p) => p.id).sort()).toEqual(["prof_1", "prof_2"]);
    }
  });

  it("ignora un bloqueo externo fuera de la ventana pedida", async () => {
    givenProfessionals([{ id: "prof_1", name: "Ana", serviceIds: ["service_target"] }]);
    givenBookings([]);

    const result = await checkAvailability({
      businessId,
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: europeMadrid,
      bookingCapacity: 1,
      startDateTime: "2026-08-10T10:00:00+02:00",
      durationMinutes: 60,
      serviceIds: ["service_target"],
      externalBusyIntervals: [
        {
          // Un día distinto — no debe afectar en absoluto.
          start: new Date("2026-08-11T10:00:00+02:00"),
          end: new Date("2026-08-11T11:00:00+02:00"),
        },
      ],
    });

    expect(result.available).toBe(true);
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

// Tres niveles por profesional y servicio (17-09-2026): especialista se lleva
// la cita si nadie pide a nadie; "lo hace" es el valor por defecto; "no
// sugerir" nunca se asigna sola, pero si el cliente la pide por su nombre se
// le reserva y antes se recomienda una vez al mejor libre a esa hora.
describe("checkAvailability — niveles por servicio", () => {
  // Con offset explícito: CI corre Node en UTC y una hora "a secas" se
  // interpreta en la zona de la máquina, con lo que las reservas de abajo
  // (en Z) dejaban de solapar y dos tests pasaban en local y fallaban en CI.
  const base = {
    businessId,
    schedule: DEFAULT_BUSINESS_SCHEDULE,
    timezone: europeMadrid,
    bookingCapacity: 5,
    startDateTime: "2026-08-10T10:00:00+02:00",
    durationMinutes: 30,
    serviceIds: ["corte"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.professionalAbsence.findMany).mockResolvedValue([]);
  });

  it("sin profesional pedido, nunca asigna a quien está marcado 'no sugerir' para ese servicio", async () => {
    givenProfessionals([
      { id: "aprendiz", name: "Marta", serviceIds: [], noSugerir: ["corte"] },
      { id: "senior", name: "Laura", serviceIds: [] },
    ]);
    givenBookings([]);

    const result = await checkAvailability(base);

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.availableProfessionals).toEqual([{ id: "senior", name: "Laura" }]);
    }
  });

  it("si solo quedan 'no sugerir' libres y nadie pidió a nadie, la hora no está disponible", async () => {
    givenProfessionals([
      { id: "aprendiz", name: "Marta", serviceIds: [], noSugerir: ["corte"] },
      { id: "senior", name: "Laura", serviceIds: ["corte"] },
    ]);
    givenBookings([{ programedAt: new Date("2026-08-10T08:00:00Z"), professionalId: "senior" }]);

    const result = await checkAvailability(base);

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.code).toBe("ALL_PROFESSIONALS_BUSY");
      // Y el hueco alternativo tampoco cuenta con Marta para el corte.
      expect(result.suggestedNextSlot?.availableProfessionals).toEqual([{ id: "senior", name: "Laura" }]);
    }
  });

  it("si todos los profesionales son 'no sugerir' para el servicio, lo dice en vez de asignar a ciegas", async () => {
    givenProfessionals([{ id: "aprendiz", name: "Marta", serviceIds: [], noSugerir: ["corte"] }]);
    givenBookings([]);

    const result = await checkAvailability(base);

    expect(result.available).toBe(false);
    if (!result.available) expect(result.code).toBe("NO_AVAILABLE_PROFESSIONAL");
  });

  it("'no sugerir' en OTRO servicio no afecta: para el pedido sigue siendo 'lo hace'", async () => {
    givenProfessionals([{ id: "aprendiz", name: "Marta", serviceIds: [], noSugerir: ["color"] }]);
    givenBookings([]);

    const result = await checkAvailability(base);

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.availableProfessionals).toEqual([{ id: "aprendiz", name: "Marta" }]);
    }
  });

  it("si piden por su nombre a un 'no sugerir', se le reserva igual y se recomienda al mejor libre a esa hora", async () => {
    givenProfessionals([
      { id: "aprendiz", name: "Marta", serviceIds: [], noSugerir: ["corte"] },
      { id: "normal", name: "Pedro", serviceIds: [] },
      { id: "senior", name: "Laura", serviceIds: ["corte"] },
    ]);
    givenBookings([]);

    const result = await checkAvailability({ ...base, professionalId: "aprendiz" });

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.availableProfessionals).toEqual([{ id: "aprendiz", name: "Marta" }]);
      expect(result.recommendedProfessional).toEqual({
        professional: { id: "senior", name: "Laura" },
        isSpecialist: true,
      });
    }
  });

  it("la recomendación solo cuenta a quien está libre a esa hora", async () => {
    givenProfessionals([
      { id: "aprendiz", name: "Marta", serviceIds: [], noSugerir: ["corte"] },
      { id: "senior", name: "Laura", serviceIds: ["corte"] },
    ]);
    givenBookings([{ programedAt: new Date("2026-08-10T08:00:00Z"), professionalId: "senior" }]);

    const result = await checkAvailability({ ...base, professionalId: "aprendiz" });

    expect(result.available).toBe(true);
    if (result.available) expect(result.recommendedProfessional).toBeUndefined();
  });

  it("si piden a alguien que simplemente 'lo hace', no hay recomendación: se reserva sin comentarios", async () => {
    givenProfessionals([
      { id: "normal", name: "Pedro", serviceIds: [] },
      { id: "senior", name: "Laura", serviceIds: ["corte"] },
    ]);
    givenBookings([]);

    const result = await checkAvailability({ ...base, professionalId: "normal" });

    expect(result.available).toBe(true);
    if (result.available) expect(result.recommendedProfessional).toBeUndefined();
  });

  it("a igual nivel, la cita va a quien tenga menos citas ese día", async () => {
    givenProfessionals([
      { id: "ana", name: "Ana", serviceIds: [] },
      { id: "bea", name: "Bea", serviceIds: [] },
    ]);
    // Ana ya tiene dos citas esa mañana (en horas que no solapan con la pedida).
    givenBookings([
      { programedAt: new Date("2026-08-10T06:00:00Z"), professionalId: "ana" },
      { programedAt: new Date("2026-08-10T06:30:00Z"), professionalId: "ana" },
    ]);

    const result = await checkAvailability(base);

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.availableProfessionals.map((p) => p.id)).toEqual(["bea", "ana"]);
    }
  });

  it("el nivel manda sobre la carga: el especialista va primero aunque tenga más citas", async () => {
    givenProfessionals([
      { id: "ana", name: "Ana", serviceIds: ["corte"] },
      { id: "bea", name: "Bea", serviceIds: [] },
    ]);
    givenBookings([
      { programedAt: new Date("2026-08-10T06:00:00Z"), professionalId: "ana" },
      { programedAt: new Date("2026-08-10T06:30:00Z"), professionalId: "ana" },
    ]);

    const result = await checkAvailability(base);

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.availableProfessionals.map((p) => p.id)).toEqual(["ana", "bea"]);
      expect(result.specialistIds).toEqual(["ana"]);
    }
  });

  it("las citas de OTRO día no cuentan para el desempate (día local del negocio)", async () => {
    givenProfessionals([
      { id: "ana", name: "Ana", serviceIds: [] },
      { id: "bea", name: "Bea", serviceIds: [] },
    ]);
    // 23:30 del día 9 en Madrid es 21:30Z: sigue siendo el día 9, no el 10.
    givenBookings([{ programedAt: new Date("2026-08-09T21:30:00Z"), professionalId: "ana" }]);

    const result = await checkAvailability(base);

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.availableProfessionals.map((p) => p.id)).toEqual(["ana", "bea"]);
    }
  });

  it("con varios servicios, basta un 'no sugerir' en uno de ellos para salir del reparto automático", async () => {
    givenProfessionals([
      { id: "marta", name: "Marta", serviceIds: ["corte"], noSugerir: ["color"] },
      { id: "laura", name: "Laura", serviceIds: [] },
    ]);
    givenBookings([]);

    const result = await checkAvailability({ ...base, serviceIds: ["corte", "color"] });

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.availableProfessionals).toEqual([{ id: "laura", name: "Laura" }]);
    }
  });

  describe("ausencias y reserva excluida (el Gestor, fase 2)", () => {
    beforeEach(() => {
      vi.mocked(prisma.professionalAbsence.findMany).mockResolvedValue([]);
    });

    function givenAusencias(
      ausencias: Array<{ professionalId: string; startsAt: string; endsAt: string }>
    ) {
      vi.mocked(prisma.professionalAbsence.findMany).mockResolvedValue(
        ausencias.map((a, index) => ({
          id: `ausencia_${index}`,
          businessId,
          professionalId: a.professionalId,
          startsAt: new Date(a.startsAt),
          endsAt: new Date(a.endsAt),
          reason: null,
          createdVia: "owner_chat",
          createdAt: new Date(),
        })) as never
      );
    }

    it("una ausencia ocupa a su profesional pero no resta plazas al negocio", async () => {
      givenProfessionals([
        { id: "laura", name: "Laura", serviceIds: [] },
        { id: "marta", name: "Marta", serviceIds: [] },
      ]);
      givenBookings([]);
      givenAusencias([
        { professionalId: "laura", startsAt: "2026-08-10T00:00:00Z", endsAt: "2026-08-11T00:00:00Z" },
      ]);

      const result = await checkAvailability({
        businessId,
        schedule: DEFAULT_BUSINESS_SCHEDULE,
        timezone: europeMadrid,
        bookingCapacity: 1,
        startDateTime: "2026-08-10T10:00:00Z",
        durationMinutes: 30,
      });

      expect(result.available).toBe(true);
      if (result.available) {
        expect(result.availableProfessionals).toEqual([{ id: "marta", name: "Marta" }]);
        expect(result.capacityUsed).toBe(0);
      }
    });

    it("si piden por su nombre a quien está ausente, no hay hueco y el siguiente hueco cae tras la ausencia", async () => {
      givenProfessionals([{ id: "laura", name: "Laura", serviceIds: [] }]);
      givenBookings([]);
      givenAusencias([
        { professionalId: "laura", startsAt: "2026-08-10T08:00:00Z", endsAt: "2026-08-10T12:00:00Z" },
      ]);

      const result = await checkAvailability({
        businessId,
        schedule: DEFAULT_BUSINESS_SCHEDULE,
        timezone: europeMadrid,
        bookingCapacity: 2,
        startDateTime: "2026-08-10T10:00:00Z",
        durationMinutes: 30,
        professionalId: "laura",
      });

      expect(result.available).toBe(false);
      if (!result.available) {
        expect(result.code).toBe("ALL_PROFESSIONALS_BUSY");
        expect(result.suggestedNextSlot?.startDateTime).toBe("2026-08-10T12:00:00.000Z");
      }
    });

    it("la reserva que se mueve no se bloquea a sí misma ni por su evento externo", async () => {
      givenProfessionals([{ id: "laura", name: "Laura", serviceIds: [] }]);
      givenBookings([
        {
          programedAt: new Date("2026-08-10T10:00:00Z"),
          durationMinutes: 60,
          professionalId: "laura",
          externalEventId: "event-propio",
          externalCalendarProvider: "google",
          externalCalendarId: "primary",
        },
      ]);

      const result = await checkAvailability({
        businessId,
        schedule: DEFAULT_BUSINESS_SCHEDULE,
        timezone: europeMadrid,
        bookingCapacity: 1,
        startDateTime: "2026-08-10T10:30:00Z",
        durationMinutes: 60,
        professionalId: "laura",
        externalBusyIntervals: [{
          externalEventId: "event-propio",
          start: new Date("2026-08-10T10:00:00Z"),
          end: new Date("2026-08-10T11:00:00Z"),
        }],
        calendarAvailabilityKnown: true,
        calendarOrigin: { provider: "google", calendarId: "primary" },
        excluir: { bookingId: "booking_0", externalEventId: "event-propio" },
      });

      expect(mockedBookingFindMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: "booking_0" } }),
        })
      );
      // El mock devuelve la reserva igualmente (no filtra por id): lo que se
      // comprueba aquí es que su evento externo tampoco cuenta.
      expect(result.available).toBe(true);
    });
  });
});
