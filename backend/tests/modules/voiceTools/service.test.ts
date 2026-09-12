import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeVoiceTool } from "../../../src/modules/voiceTools/service.js";
import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";
import { checkBusinessHours } from "../../../src/lib/businessSchedule.js";
import { checkAvailability } from "../../../src/lib/availability.js";
import { calendarService } from "../../../src/modules/calendar/service.js";
import { enqueueSmsJob } from "../../../src/lib/cloudTasks.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    call: { findUnique: vi.fn(), findFirst: vi.fn() },
    booking: { upsert: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    professional: { findFirst: vi.fn(), findMany: vi.fn() },
    service: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("../../../src/lib/redis.js", () => ({
  getRedis: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    // "OK" simula que el SET NX del lock de reserva (acquireBookingLock) lo
    // consigue siempre a la primera — el propio lock de concurrencia se
    // prueba aparte en tests/lib/bookingLock.test.ts; aquí solo interesa que
    // no bloquee ni retrase estos tests (cada intento fallido espera 300ms).
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn(),
    eval: vi.fn().mockResolvedValue(1),
  })),
}));

vi.mock("../../../src/lib/businessSchedule.js", () => ({
  checkBusinessHours: vi.fn(),
  checkBookingRestrictions: vi.fn(() => ({ success: true })),
  formatScheduleForPrompt: vi.fn(() => "Lunes a viernes, de 09:00 a 18:00."),
}));

vi.mock("../../../src/lib/availability.js", () => ({
  checkAvailability: vi.fn(),
  computeAvailabilityLookaheadMs: vi.fn((durationMinutes: number) => 4 * 60 * 60_000 + durationMinutes * 60_000),
}));

vi.mock("../../../src/modules/calendar/service.js", () => ({
  calendarService: {
    bookAppointment: vi.fn(),
    getBusyIntervals: vi.fn(),
    cancelAppointment: vi.fn(),
  },
}));

vi.mock("../../../src/lib/cloudTasks.js", () => ({
  enqueueRetryBookingJob: vi.fn(),
  enqueueSmsJob: vi.fn(),
}));

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedCallFindUnique = vi.mocked(prisma.call.findUnique);
const mockedCallFindFirst = vi.mocked(prisma.call.findFirst);
const mockedBookingUpsert = vi.mocked(prisma.booking.upsert);
const mockedBookingFindUnique = vi.mocked(prisma.booking.findUnique);
const mockedBookingFindFirst = vi.mocked(prisma.booking.findFirst);
const mockedBookingUpdate = vi.mocked(prisma.booking.update);
const mockedCancelAppointment = vi.mocked(calendarService.cancelAppointment);
const mockedProfessionalFindFirst = vi.mocked(prisma.professional.findFirst);
const mockedProfessionalFindMany = vi.mocked(prisma.professional.findMany);
const mockedServiceFindMany = vi.mocked(prisma.service.findMany);
const mockedCheckBusinessHours = vi.mocked(checkBusinessHours);
const mockedCheckAvailability = vi.mocked(checkAvailability);
const mockedBookAppointment = vi.mocked(calendarService.bookAppointment);
const mockedGetBusyIntervals = vi.mocked(calendarService.getBusyIntervals);
const mockedEnqueueSmsJob = vi.mocked(enqueueSmsJob);

function buildBusiness(overrides: Record<string, unknown> = {}) {
  return {
    id: "business_123",
    schedule: {},
    timezone: "Europe/Madrid",
    bookingCapacity: 1,
    calendarProvider: "google",
    googleRefreshToken: "refresh_token",
    googleCalendarId: "primary",
    googleCalendarConnected: true,
    outlookRefreshToken: null,
    outlookCalendarId: null,
    outlookCalendarConnected: null,
    phone: "+34600111222",
    telnyxPhoneNumber: "+34911222333",
    ...overrides,
  };
}

function buildBookAppointmentInput(overrides: Record<string, unknown> = {}) {
  return {
    businessId: "business_123",
    toolName: "book_appointment" as const,
    params: {
      clientName: "María",
      startDateTime: "2026-08-25T17:00:00+02:00",
      durationMinutes: 60,
      professionalId: "professional_123",
    },
    ...overrides,
  };
}

describe("executeVoiceTool book_appointment — vinculación a la llamada correcta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedBusinessFindUnique.mockResolvedValue(buildBusiness() as any);
    mockedCheckBusinessHours.mockReturnValue({ success: true, isOpen: true } as any);
    mockedBookAppointment.mockResolvedValue({ htmlLink: "https://calendar.google.com/event/1" } as any);
    mockedGetBusyIntervals.mockResolvedValue([]);
    mockedProfessionalFindFirst.mockResolvedValue({ id: "professional_123" } as any);
    mockedProfessionalFindMany.mockResolvedValue([]);
    mockedServiceFindMany.mockResolvedValue([]);
    // checkAvailability ahora se llama SIEMPRE (antes se saltaba si venía un
    // professionalId ya verificado — ver fix del hallazgo #3 de la
    // auditoría), así que todo test que reserve con profesional necesita un
    // resultado por defecto.
    mockedCheckAvailability.mockResolvedValue({
      available: true,
      message: "",
      capacityUsed: 0,
      capacityTotal: 1,
      availableProfessionals: [{ id: "professional_123", name: "Ana" }],
    } as any);
    // Sin reserva previa para esta llamada — la comprobación de idempotencia
    // (hallazgo #6) no debe interferir con el camino feliz de estos tests.
    mockedBookingFindUnique.mockResolvedValue(null);
    // enqueueSmsJob es async en producción (siempre devuelve una Promise) —
    // sin esto, vi.fn() devuelve undefined y el .catch() del código real
    // lanza un TypeError síncrono, capturado por el catch de la reserva.
    mockedEnqueueSmsJob.mockResolvedValue(undefined);
  });

  it("vincula la reserva a la llamada exacta del callId, aunque exista otra más reciente", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_row_OLD" } as any);

    const result = await executeVoiceTool(
      buildBookAppointmentInput({ callId: "call_vapi_OLD" })
    );

    expect(result.result.success).toBe(true);
    expect(mockedCallFindUnique).toHaveBeenCalledWith({
      where: { vapiCallId: "call_vapi_OLD" },
      select: { id: true, fromNumber: true },
    });
    expect(mockedCallFindFirst).not.toHaveBeenCalled();
    expect(mockedBookingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { callId: "call_row_OLD" },
        create: expect.objectContaining({ callId: "call_row_OLD" }),
      })
    );
  });

  it("cae al heurístico de llamada más reciente si el callId no tiene fila Call todavía", async () => {
    mockedCallFindUnique.mockResolvedValue(null);
    mockedCallFindFirst.mockResolvedValue({ id: "call_row_MOST_RECENT" } as any);

    const result = await executeVoiceTool(
      buildBookAppointmentInput({ callId: "call_vapi_NOT_YET_PERSISTED" })
    );

    expect(result.result.success).toBe(true);
    // select sin fromNumber a propósito: el heurístico puede devolver la
    // llamada de OTRO cliente si hay dos simultáneas, así que su teléfono
    // nunca debe usarse como contacto de esta reserva (ver siguiente test).
    // status: IN_PROGRESS a propósito también: descarta llamadas ya
    // finalizadas (que podrían tener su propia reserva ya confirmada) del
    // heurístico — ver hallazgo #14 de la auditoría.
    expect(mockedCallFindFirst).toHaveBeenCalledWith({
      where: { businessId: "business_123", status: "IN_PROGRESS" },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
    expect(mockedBookingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { callId: "call_row_MOST_RECENT" } })
    );
  });

  it("no usa el fromNumber de otra llamada cuando cae al heurístico (evita mezclar teléfonos entre clientes)", async () => {
    mockedCallFindUnique.mockResolvedValue(null);
    // Aunque el mock devolviera fromNumber, resolveCallForBusiness ya no lo
    // selecciona en el path heurístico — este test fija el contrato: el
    // evento de calendario no debe llevar ningún teléfono en este caso.
    mockedCallFindFirst.mockResolvedValue({ id: "call_row_MOST_RECENT" } as any);

    const result = await executeVoiceTool(
      buildBookAppointmentInput({ callId: "call_vapi_NOT_YET_PERSISTED" })
    );

    expect(result.result.success).toBe(true);
    expect(mockedBookAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ clientPhone: undefined })
    );
  });

  it("usa el heurístico directamente cuando no se conoce el callId", async () => {
    mockedCallFindFirst.mockResolvedValue({ id: "call_row_MOST_RECENT" } as any);

    const result = await executeVoiceTool(buildBookAppointmentInput({ callId: undefined }));

    expect(result.result.success).toBe(true);
    expect(mockedCallFindUnique).not.toHaveBeenCalled();
    expect(mockedCallFindFirst).toHaveBeenCalled();
  });

  it("usa Call.fromNumber como teléfono del evento cuando el cliente no pidió uno distinto", async () => {
    mockedCallFindUnique.mockResolvedValue({
      id: "call_row_1",
      fromNumber: "+34600999888",
    } as any);

    const result = await executeVoiceTool(
      buildBookAppointmentInput({ callId: "call_vapi_1" })
    );

    expect(result.result.success).toBe(true);
    expect(mockedBookAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ clientPhone: "+34600999888" })
    );
    // Booking.clientPhone solo se rellena si difiere de Call.fromNumber (ver
    // schema.prisma) — el fallback es solo para el evento de calendario, no
    // para la fila persistida.
    expect(mockedBookingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ clientPhone: undefined }),
      })
    );
  });

  it("prioriza el clientPhone explícito del cliente sobre Call.fromNumber", async () => {
    mockedCallFindUnique.mockResolvedValue({
      id: "call_row_1",
      fromNumber: "+34600999888",
    } as any);

    const result = await executeVoiceTool(
      buildBookAppointmentInput({
        callId: "call_vapi_1",
        params: {
          clientName: "María",
          startDateTime: "2026-08-25T17:00:00+02:00",
          durationMinutes: 60,
          professionalId: "professional_123",
          clientPhone: "+34611222333",
        },
      })
    );

    expect(result.result.success).toBe(true);
    expect(mockedBookAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ clientPhone: "+34611222333" })
    );
  });
});

describe("executeVoiceTool — catálogo y token de disponibilidad", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedBusinessFindUnique.mockResolvedValue(buildBusiness() as any);
    mockedGetBusyIntervals.mockResolvedValue([]);
    mockedCheckAvailability.mockResolvedValue({
      available: true,
      message: "Hay disponibilidad.",
      capacityUsed: 0,
      capacityTotal: 1,
      availableProfessionals: [{ id: "professional_123", name: "Ana" }],
    } as any);
  });

  it("crea un token temporal al comprobar una cita disponible", async () => {
    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "check_availability",
      callId: "call_123",
      params: {
        startDateTime: "2026-08-25T17:00:00+02:00",
        durationMinutes: 30,
        serviceIds: ["service_123"],
      },
    });

    expect(result.result.available).toBe(true);
    expect(result.result.availabilityToken).toEqual(expect.any(String));
    expect(mockedCheckAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceIds: ["service_123"],
        durationMinutes: 30,
      })
    );
  });

  it("rechaza una duración negativa antes de consultar la agenda", async () => {
    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "check_availability",
      params: {
        startDateTime: "2026-08-25T17:00:00+02:00",
        durationMinutes: -30,
      },
    });

    expect(result.result).toMatchObject({ code: "INVALID_DURATION" });
    expect(mockedCheckAvailability).not.toHaveBeenCalled();
  });

  it("devuelve el catálogo bajo demanda, sin incluirlo en cada llamada", async () => {
    mockedServiceFindMany.mockResolvedValue([
      { id: "service_123", name: "Corte", durationMinutes: 30 },
    ] as any);
    mockedProfessionalFindMany.mockResolvedValue([
      { id: "professional_123", name: "Ana" },
    ] as any);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "get_catalog",
      params: {},
    });

    expect(result.result.services).toContain("[service_123] Corte (30 min)");
    expect(result.result.professionals).toContain("[professional_123] Ana");
  });
});

describe("executeVoiceTool book_appointment — varios servicios en la misma cita", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedBusinessFindUnique.mockResolvedValue(buildBusiness() as any);
    mockedCheckBusinessHours.mockReturnValue({ success: true, isOpen: true } as any);
    mockedBookAppointment.mockResolvedValue({ htmlLink: "https://calendar.google.com/event/1" } as any);
    mockedGetBusyIntervals.mockResolvedValue([]);
    mockedProfessionalFindFirst.mockResolvedValue({ id: "professional_123" } as any);
    mockedCallFindFirst.mockResolvedValue({ id: "call_row_1" } as any);
    mockedCheckAvailability.mockResolvedValue({
      available: true,
      message: "",
      capacityUsed: 0,
      capacityTotal: 1,
      availableProfessionals: [{ id: "professional_123", name: "Ana" }],
    } as any);
    mockedBookingFindUnique.mockResolvedValue(null);
    mockedEnqueueSmsJob.mockResolvedValue(undefined);
  });

  it("suma la duración de los servicios verificados en vez de fiarse de la del LLM", async () => {
    mockedServiceFindMany.mockResolvedValue([
      { id: "svc_corte", durationMinutes: 30 },
      { id: "svc_mechas", durationMinutes: 120 },
    ] as any);

    const result = await executeVoiceTool(
      buildBookAppointmentInput({
        params: {
          clientName: "María",
          startDateTime: "2026-08-25T17:00:00+02:00",
          durationMinutes: 45, // deliberadamente distinto de la suma real (150)
          professionalId: "professional_123",
          serviceIds: ["svc_corte", "svc_mechas"],
        },
      })
    );

    expect(result.result.success).toBe(true);
    expect(mockedServiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["svc_corte", "svc_mechas"] } }),
      })
    );
    expect(mockedBookingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          durationMinutes: 150,
          serviceIds: ["svc_corte", "svc_mechas"],
        }),
      })
    );
  });

  it("descarta solo los serviceIds que no pertenecen al negocio, sin fallar toda la reserva", async () => {
    mockedServiceFindMany.mockResolvedValue([{ id: "svc_corte", durationMinutes: 30 }] as any);

    const result = await executeVoiceTool(
      buildBookAppointmentInput({
        params: {
          clientName: "María",
          startDateTime: "2026-08-25T17:00:00+02:00",
          durationMinutes: 30,
          professionalId: "professional_123",
          serviceIds: ["svc_corte", "svc_de_otro_negocio"],
        },
      })
    );

    expect(result.result.success).toBe(true);
    expect(mockedBookingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ serviceIds: ["svc_corte"] }),
      })
    );
  });

  it("respeta el orden en que el cliente pidió los servicios en el evento, aunque la BD los devuelva en otro orden", async () => {
    // findMany({ id: { in } }) no garantiza el orden de requestedServiceIds
    // — se simula aquí devolviéndolos al revés a propósito.
    mockedServiceFindMany.mockResolvedValue([
      { id: "svc_tratamiento", name: "Tratamiento capilar", durationMinutes: 45 },
      { id: "svc_corte", name: "Corte", durationMinutes: 30 },
    ] as any);

    const result = await executeVoiceTool(
      buildBookAppointmentInput({
        params: {
          clientName: "María",
          startDateTime: "2026-08-25T17:00:00+02:00",
          durationMinutes: 30,
          professionalId: "professional_123",
          serviceIds: ["svc_corte", "svc_tratamiento"],
        },
      })
    );

    expect(result.result.success).toBe(true);
    expect(mockedBookAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ serviceNames: ["Corte", "Tratamiento capilar"] })
    );
    expect(mockedBookingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ serviceIds: ["svc_corte", "svc_tratamiento"] }),
      })
    );
  });

  it("avisa al propietario por SMS al negocio.phone usando su número Telnyx como remitente", async () => {
    const result = await executeVoiceTool(
      buildBookAppointmentInput({
        params: {
          clientName: "María",
          startDateTime: "2026-08-25T17:00:00+02:00",
          durationMinutes: 30,
          professionalId: "professional_123",
        },
      })
    );

    expect(result.result.success).toBe(true);
    expect(mockedEnqueueSmsJob).toHaveBeenCalledWith(
      expect.objectContaining({
        fromNumber: "+34911222333",
        toNumber: "+34600111222",
        text: expect.stringContaining("María"),
      })
    );
  });

  it("no intenta enviar SMS si el negocio todavía no tiene número Telnyx propio", async () => {
    mockedBusinessFindUnique.mockResolvedValue(buildBusiness({ telnyxPhoneNumber: null }) as any);

    const result = await executeVoiceTool(buildBookAppointmentInput());

    expect(result.result.success).toBe(true);
    expect(mockedEnqueueSmsJob).not.toHaveBeenCalled();
  });

  it("no rompe la reserva si falla el envío del SMS de aviso", async () => {
    mockedEnqueueSmsJob.mockRejectedValueOnce(new Error("Telnyx no responde"));

    const result = await executeVoiceTool(buildBookAppointmentInput());

    expect(result.result.success).toBe(true);
  });
});

describe("executeVoiceTool book_appointment — consentimiento SMS al cliente", () => {
  const farFutureStart = new Date(Date.now() + 48 * 60 * 60_000).toISOString();
  const nearFutureStart = new Date(Date.now() + 60 * 60_000).toISOString();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedBusinessFindUnique.mockResolvedValue(buildBusiness() as any);
    mockedCheckBusinessHours.mockReturnValue({ success: true, isOpen: true } as any);
    mockedBookAppointment.mockResolvedValue({ htmlLink: "https://calendar.google.com/event/1" } as any);
    mockedGetBusyIntervals.mockResolvedValue([]);
    mockedProfessionalFindFirst.mockResolvedValue({ id: "professional_123" } as any);
    mockedProfessionalFindMany.mockResolvedValue([]);
    mockedServiceFindMany.mockResolvedValue([]);
    mockedCheckAvailability.mockResolvedValue({
      available: true,
      message: "",
      capacityUsed: 0,
      capacityTotal: 1,
      availableProfessionals: [{ id: "professional_123", name: "Ana" }],
    } as any);
    mockedCallFindUnique.mockResolvedValue({ id: "call_row_1", fromNumber: "+34600999888" } as any);
    // Se reutiliza para la comprobación de idempotencia (sin externalEventId,
    // así que no la dispara) y para resolver el id de Booking recién creado.
    mockedBookingFindUnique.mockResolvedValue({ id: "booking_1" } as any);
    mockedEnqueueSmsJob.mockResolvedValue(undefined);
  });

  it("encola la confirmación al cliente por SMS si dio consentimiento explícito", async () => {
    const result = await executeVoiceTool(
      buildBookAppointmentInput({
        callId: "call_vapi_1",
        params: {
          clientName: "María",
          startDateTime: farFutureStart,
          durationMinutes: 30,
          professionalId: "professional_123",
          smsConsent: true,
        },
      })
    );

    expect(result.result.success).toBe(true);
    expect(mockedBookingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ smsConsent: true }) })
    );
    expect(mockedEnqueueSmsJob).toHaveBeenCalledWith(
      expect.objectContaining({
        fromNumber: "+34911222333",
        toNumber: "+34600999888",
        text: expect.stringContaining("confirmada"),
      }),
      { taskId: "confirm-sms-booking_1" }
    );
  });

  it("no encola ningún SMS al cliente si no dio consentimiento", async () => {
    const result = await executeVoiceTool(
      buildBookAppointmentInput({
        callId: "call_vapi_1",
        params: {
          clientName: "María",
          startDateTime: farFutureStart,
          durationMinutes: 30,
          professionalId: "professional_123",
          smsConsent: false,
        },
      })
    );

    expect(result.result.success).toBe(true);
    expect(mockedBookingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ smsConsent: false }) })
    );
    // El único SMS que se encola es el aviso al propietario (a business.phone).
    expect(mockedEnqueueSmsJob).toHaveBeenCalledTimes(1);
    expect(mockedEnqueueSmsJob).toHaveBeenCalledWith(
      expect.objectContaining({ toNumber: "+34600111222" })
    );
  });

  it("programa un recordatorio SMS cuando la cita queda más lejos que el margen mínimo", async () => {
    await executeVoiceTool(
      buildBookAppointmentInput({
        callId: "call_vapi_1",
        params: {
          clientName: "María",
          startDateTime: farFutureStart,
          durationMinutes: 30,
          professionalId: "professional_123",
          smsConsent: true,
        },
      })
    );

    expect(mockedEnqueueSmsJob).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("Recordatorio") }),
      expect.objectContaining({
        taskId: "reminder-sms-booking_1",
        scheduleTime: expect.any(Date),
      })
    );
  });

  it("no programa recordatorio si la cita está más cerca que el margen mínimo", async () => {
    await executeVoiceTool(
      buildBookAppointmentInput({
        callId: "call_vapi_1",
        params: {
          clientName: "María",
          startDateTime: nearFutureStart,
          durationMinutes: 30,
          professionalId: "professional_123",
          smsConsent: true,
        },
      })
    );

    // Solo la confirmación inmediata al cliente + el aviso al propietario.
    expect(mockedEnqueueSmsJob).toHaveBeenCalledTimes(2);
    expect(mockedEnqueueSmsJob).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ taskId: "reminder-sms-booking_1" })
    );
  });
});

describe("executeVoiceTool book_appointment — estado de la suscripción (hallazgo #9 de la auditoría)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCheckBusinessHours.mockReturnValue({ success: true, isOpen: true } as any);
    mockedProfessionalFindFirst.mockResolvedValue({ id: "professional_123" } as any);
    mockedServiceFindMany.mockResolvedValue([]);
    mockedCheckAvailability.mockResolvedValue({
      available: true,
      message: "",
      capacityUsed: 0,
      capacityTotal: 1,
      availableProfessionals: [{ id: "professional_123", name: "Ana" }],
    } as any);
    mockedBookingFindUnique.mockResolvedValue(null);
    mockedGetBusyIntervals.mockResolvedValue([]);
    mockedEnqueueSmsJob.mockResolvedValue(undefined);
  });

  it.each(["CANCELED", "UNPAID", "PAST_DUE", "INCOMPLETE_EXPIRED"])(
    "rechaza la reserva si la suscripción está en %s",
    async (subscriptionStatus) => {
      mockedBusinessFindUnique.mockResolvedValue(
        buildBusiness({ subscriptionStatus }) as any
      );

      const result = await executeVoiceTool(buildBookAppointmentInput());

      expect(result.result.success).toBe(false);
      expect(result.result.code).toBe("SUBSCRIPTION_INACTIVE");
      expect(mockedBookAppointment).not.toHaveBeenCalled();
    }
  );

  it.each(["ACTIVE", "TRIALING", null])(
    "permite la reserva si la suscripción está en %s",
    async (subscriptionStatus) => {
      mockedBusinessFindUnique.mockResolvedValue(
        buildBusiness({ subscriptionStatus }) as any
      );

      const result = await executeVoiceTool(buildBookAppointmentInput());

      expect(result.result.success).toBe(true);
      expect(mockedBookAppointment).toHaveBeenCalled();
    }
  );
});

describe("executeVoiceTool find_my_appointment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedBusinessFindUnique.mockResolvedValue(buildBusiness() as any);
    mockedCallFindUnique.mockResolvedValue({ id: "call_row_1", fromNumber: "+34600999888" } as any);
  });

  it("encuentra la próxima cita con consentimiento asociada al número de quien llama", async () => {
    mockedBookingFindFirst.mockResolvedValue({
      id: "booking_1",
      programedAt: new Date("2026-09-20T10:00:00+02:00"),
      serviceIds: ["svc_1"],
      professional: { name: "Ana" },
    } as any);
    mockedServiceFindMany.mockResolvedValue([{ name: "Corte" }] as any);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "find_my_appointment",
      params: {},
      callId: "call_vapi_1",
    });

    expect(result.result.success).toBe(true);
    expect(result.result.bookingId).toBe("booking_1");
    expect(result.result.serviceNames).toEqual(["Corte"]);
    expect(mockedBookingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ smsConsent: true, isCancelled: false }),
      })
    );
  });

  it("no encuentra nada si no hay ninguna reserva con consentimiento para ese número", async () => {
    mockedBookingFindFirst.mockResolvedValue(null);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "find_my_appointment",
      params: {},
      callId: "call_vapi_1",
    });

    expect(result.result.success).toBe(false);
    expect(result.result.code).toBe("APPOINTMENT_NOT_FOUND");
  });

  it("no busca nada si no se puede identificar el número de quien llama", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_row_1", fromNumber: null } as any);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "find_my_appointment",
      params: {},
      callId: "call_vapi_1",
    });

    expect(result.result.success).toBe(false);
    expect(mockedBookingFindFirst).not.toHaveBeenCalled();
  });
});

describe("executeVoiceTool cancel_appointment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedBusinessFindUnique.mockResolvedValue(buildBusiness() as any);
    mockedCallFindUnique.mockResolvedValue({ id: "call_row_1", fromNumber: "+34600999888" } as any);
    mockedBookingUpdate.mockResolvedValue({} as any);
    mockedCancelAppointment.mockResolvedValue(undefined as any);
  });

  function buildOwnedBooking(overrides: Record<string, unknown> = {}) {
    return {
      id: "booking_1",
      isCancelled: false,
      smsConsent: true,
      clientPhone: null,
      externalEventId: "evt_1",
      externalCalendarProvider: "google",
      externalCalendarId: "primary",
      call: { fromNumber: "+34600999888" },
      ...overrides,
    };
  }

  it("cancela la cita si el número de quien llama coincide y dio consentimiento", async () => {
    mockedBookingFindFirst.mockResolvedValue(buildOwnedBooking() as any);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "cancel_appointment",
      params: { bookingId: "booking_1" },
      callId: "call_vapi_1",
    });

    expect(result.result.success).toBe(true);
    expect(mockedBookingUpdate).toHaveBeenCalledWith({
      where: { id: "booking_1" },
      data: { isCancelled: true },
    });
    expect(mockedCancelAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google", eventId: "evt_1" })
    );
  });

  it("no cancela ni revela la cita si el número de quien llama no coincide", async () => {
    mockedBookingFindFirst.mockResolvedValue(
      buildOwnedBooking({ call: { fromNumber: "+34611000000" } }) as any
    );

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "cancel_appointment",
      params: { bookingId: "booking_1" },
      callId: "call_vapi_1",
    });

    expect(result.result.success).toBe(false);
    expect(result.result.code).toBe("APPOINTMENT_NOT_FOUND");
    expect(mockedBookingUpdate).not.toHaveBeenCalled();
  });

  it("no cancela si la reserva no tiene consentimiento aunque el número coincida", async () => {
    mockedBookingFindFirst.mockResolvedValue(buildOwnedBooking({ smsConsent: false }) as any);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "cancel_appointment",
      params: { bookingId: "booking_1" },
      callId: "call_vapi_1",
    });

    expect(result.result.success).toBe(false);
    expect(mockedBookingUpdate).not.toHaveBeenCalled();
  });

  it("responde con éxito idempotente si la cita ya estaba cancelada", async () => {
    mockedBookingFindFirst.mockResolvedValue(buildOwnedBooking({ isCancelled: true }) as any);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "cancel_appointment",
      params: { bookingId: "booking_1" },
      callId: "call_vapi_1",
    });

    expect(result.result.success).toBe(true);
    expect(mockedBookingUpdate).not.toHaveBeenCalled();
  });

  it("cancela en BD aunque falle el borrado del evento externo", async () => {
    mockedBookingFindFirst.mockResolvedValue(buildOwnedBooking() as any);
    mockedCancelAppointment.mockRejectedValueOnce(new Error("Google no responde"));

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "cancel_appointment",
      params: { bookingId: "booking_1" },
      callId: "call_vapi_1",
    });

    expect(result.result.success).toBe(true);
    expect(mockedBookingUpdate).toHaveBeenCalled();
  });
});
