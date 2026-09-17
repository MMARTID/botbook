import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeVoiceTool } from "../../../src/modules/voiceTools/service.js";
import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";
import { checkBusinessHours } from "../../../src/lib/businessSchedule.js";
import { checkAvailability } from "../../../src/lib/availability.js";
import { calendarService } from "../../../src/modules/calendar/service.js";
import { enqueueSmsJob, enqueueWhatsappJob } from "../../../src/lib/cloudTasks.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    call: { findUnique: vi.fn(), findFirst: vi.fn() },
    booking: { upsert: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    professional: { findFirst: vi.fn(), findMany: vi.fn() },
    service: { findFirst: vi.fn(), findMany: vi.fn() },
    lead: { create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
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
  enqueueWhatsappJob: vi.fn(),
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
const mockedEnqueueWhatsappJob = vi.mocked(enqueueWhatsappJob);
const mockedLeadCreate = vi.mocked(prisma.lead.create);
const mockedLeadFindMany = vi.mocked(prisma.lead.findMany);
const mockedLeadUpdate = vi.mocked(prisma.lead.update);

/** Los tests de SMS asumen que WhatsApp NO está configurado — sin esto,
 * dependerían de si el `.env` real de quien ejecuta los tests tiene
 * WHATSAPP_TELNYX_FROM_NUMBER puesto o no (lo tiene en dev desde 2026-09-14). */
function clearWhatsappEnv() {
  delete process.env.WHATSAPP_TELNYX_FROM_NUMBER;
  delete process.env.WHATSAPP_TEMPLATE_CONFIRMATION_NAME;
  delete process.env.WHATSAPP_TEMPLATE_REMINDER_NAME;
}

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
    // El recordatorio de cita es feature de Pro/Scale (planFeatures.ts): el
    // mismo mock de findUnique responde también a la consulta del plan.
    plan: "pro",
    stripePriceId: null,
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
    mockedGetBusyIntervals.mockResolvedValue({ intervals: [], calendarAvailabilityKnown: true } as any);
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
    mockedCallFindUnique.mockResolvedValue({
      id: "call_row_OLD",
      businessId: "business_123",
    } as any);

    const result = await executeVoiceTool(
      buildBookAppointmentInput({ callId: "call_vapi_OLD" })
    );

    expect(result.result.success).toBe(true);
    expect(mockedCallFindUnique).toHaveBeenCalledWith({
      where: { callId: "call_vapi_OLD" },
      // businessId en el select para comprobar que la llamada es de este
      // negocio antes de colgarle la reserva.
      select: { id: true, fromNumber: true, businessId: true },
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
    const heuristico = mockedCallFindFirst.mock.calls[0][0] as any;
    expect(heuristico.where.businessId).toBe("business_123");
    expect(heuristico.where.status).toBe("IN_PROGRESS");
    // Acotado en el tiempo: una llamada zombi de hace una hora no puede
    // hacerse pasar por la llamada en curso y quedarse con su reserva.
    expect(heuristico.where.startedAt.gte).toBeInstanceOf(Date);
    expect(heuristico.orderBy).toEqual({ startedAt: "desc" });
    expect(heuristico.select).toEqual({ id: true });
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
      businessId: "business_123",
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

  it("no confirma a ciegas si el calendario del negocio no se ha podido leer", async () => {
    mockedCallFindUnique.mockResolvedValue({
      id: "call_row_1",
      fromNumber: "+34600999888",
      businessId: "business_123",
    } as any);
    // Google devolvió un 5xx: no sabemos qué hay en la agenda del negocio.
    mockedGetBusyIntervals.mockResolvedValue({
      intervals: [],
      calendarAvailabilityKnown: false,
    } as any);
    mockedLeadCreate.mockResolvedValue({ id: "lead_1" } as any);

    const result = await executeVoiceTool(
      buildBookAppointmentInput({ callId: "call_vapi_1" })
    );

    expect(result.result.success).toBe(false);
    expect(result.result.code).toBe("CALENDAR_UNAVAILABLE");
    // La cita no se inventa en el calendario...
    expect(mockedBookAppointment).not.toHaveBeenCalled();
    // ...pero los datos del cliente no se pierden.
    expect(mockedLeadCreate).toHaveBeenCalled();
    expect(result.result.message).toContain("He tomado nota");
  });

  it("prioriza el clientPhone explícito del cliente sobre Call.fromNumber", async () => {
    mockedCallFindUnique.mockResolvedValue({
      id: "call_row_1",
      fromNumber: "+34600999888",
      businessId: "business_123",
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
    mockedGetBusyIntervals.mockResolvedValue({ intervals: [], calendarAvailabilityKnown: true } as any);
    mockedCheckAvailability.mockResolvedValue({
      available: true,
      message: "Hay disponibilidad.",
      capacityUsed: 0,
      capacityTotal: 1,
      availableProfessionals: [{ id: "professional_123", name: "Ana" }],
    } as any);
  });

  it("crea un token temporal al comprobar una cita disponible", async () => {
    mockedServiceFindMany.mockResolvedValue([{ id: "service_123" }] as any);

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

  it("rechaza con un error explícito un serviceId que no existe en el negocio (el LLM puede corromper IDs al copiarlos)", async () => {
    mockedServiceFindMany.mockResolvedValue([{ id: "service_123" }] as any);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "check_availability",
      callId: "call_123",
      params: {
        startDateTime: "2026-08-25T17:00:00+02:00",
        durationMinutes: 30,
        // Híbrido inventado, como el de la llamada real del 2026-09-14.
        serviceIds: ["service_123", "service_hibrido_inventado"],
      },
    });

    expect(result.result).toMatchObject({
      available: false,
      code: "UNKNOWN_SERVICE_ID",
    });
    expect(mockedCheckAvailability).not.toHaveBeenCalled();
  });

  it("rechaza con un error explícito un professionalId desconocido", async () => {
    mockedProfessionalFindFirst.mockResolvedValue(null);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "check_availability",
      callId: "call_123",
      params: {
        startDateTime: "2026-08-25T17:00:00+02:00",
        durationMinutes: 30,
        professionalId: "prof_inventado",
      },
    });

    expect(result.result).toMatchObject({
      available: false,
      code: "UNKNOWN_PROFESSIONAL_ID",
    });
    expect(mockedCheckAvailability).not.toHaveBeenCalled();
  });

  it("reinterpreta en hora local del negocio un startDateTime marcado como UTC por el LLM", async () => {
    // Caso real (2026-09-14): "el viernes a las cuatro" llegó como
    // 16:00+00:00 y el horario lo rechazaba por caer a las 18:00 locales.
    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "check_availability",
      callId: "call_123",
      params: {
        startDateTime: "2026-08-25T17:00:00+00:00",
        durationMinutes: 30,
      },
    });

    expect(result.result.available).toBe(true);
    expect(mockedCheckAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        startDateTime: "2026-08-25T17:00:00+02:00",
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
    mockedGetBusyIntervals.mockResolvedValue({ intervals: [], calendarAvailabilityKnown: true } as any);
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
    // El nombre del cliente queda también en la reserva de BD — es lo que
    // find_my_appointment devuelve para poder recrear citas al mismo nombre.
    expect(mockedBookingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ clientName: "María" }),
        update: expect.objectContaining({ clientName: "María" }),
      })
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
    clearWhatsappEnv();
    mockedBusinessFindUnique.mockResolvedValue(buildBusiness() as any);
    mockedCheckBusinessHours.mockReturnValue({ success: true, isOpen: true } as any);
    mockedBookAppointment.mockResolvedValue({ htmlLink: "https://calendar.google.com/event/1" } as any);
    mockedGetBusyIntervals.mockResolvedValue({ intervals: [], calendarAvailabilityKnown: true } as any);
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
    mockedCallFindUnique.mockResolvedValue({ id: "call_row_1", fromNumber: "+34600999888", businessId: "business_123" } as any);
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

  it("usa TELNYX_SMS_SENDER_ID como remitente cuando está configurado, en vez del número del negocio", async () => {
    process.env.TELNYX_SMS_SENDER_ID = "ALHABLA";
    try {
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
        expect.objectContaining({ fromNumber: "ALHABLA", toNumber: "+34600999888" }),
        expect.anything()
      );
      // El aviso al propietario también debe usar el Sender ID, no el número.
      expect(mockedEnqueueSmsJob).toHaveBeenCalledWith(
        expect.objectContaining({ fromNumber: "ALHABLA", toNumber: "+34600111222" })
      );
    } finally {
      delete process.env.TELNYX_SMS_SENDER_ID;
    }
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

  it("no programa recordatorio en el plan Inicio — es feature de Pro/Scale — pero sí envía la confirmación", async () => {
    mockedBusinessFindUnique.mockResolvedValue(
      buildBusiness({ plan: "basic" }) as any
    );

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

    // Confirmación inmediata + aviso al propietario sí; recordatorio no.
    expect(mockedEnqueueSmsJob).toHaveBeenCalledTimes(2);
    expect(mockedEnqueueSmsJob).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ taskId: "reminder-sms-booking_1" })
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

describe("executeVoiceTool book_appointment — confirmación al cliente por WhatsApp", () => {
  const farFutureStart = new Date(Date.now() + 48 * 60 * 60_000).toISOString();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WHATSAPP_TELNYX_FROM_NUMBER = "+34900000001";
    process.env.TELNYX_API_KEY = process.env.TELNYX_API_KEY || "test_key";
    process.env.TELNYX_MESSAGING_PROFILE_ID =
      process.env.TELNYX_MESSAGING_PROFILE_ID || "profile_test";
    process.env.WHATSAPP_TEMPLATE_CONFIRMATION_NAME = "confirmacion_cita";
    process.env.WHATSAPP_TEMPLATE_REMINDER_NAME = "recordatorio_cita";
    mockedBusinessFindUnique.mockResolvedValue(buildBusiness() as any);
    mockedCheckBusinessHours.mockReturnValue({ success: true, isOpen: true } as any);
    mockedBookAppointment.mockResolvedValue({ htmlLink: "https://calendar.google.com/event/1" } as any);
    mockedGetBusyIntervals.mockResolvedValue({ intervals: [], calendarAvailabilityKnown: true } as any);
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
    mockedCallFindUnique.mockResolvedValue({ id: "call_row_1", fromNumber: "+34600999888", businessId: "business_123" } as any);
    mockedBookingFindUnique.mockResolvedValue({ id: "booking_1" } as any);
    mockedEnqueueSmsJob.mockResolvedValue(undefined);
    mockedEnqueueWhatsappJob.mockResolvedValue(undefined);
  });

  afterEach(() => {
    clearWhatsappEnv();
  });

  it("confirma por WhatsApp en vez de SMS cuando está configurado, pero el aviso al propietario sigue por SMS", async () => {
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

    expect(mockedEnqueueWhatsappJob).toHaveBeenCalledWith(
      expect.objectContaining({
        toNumber: "+34600999888",
        templateName: "confirmacion_cita",
        languageCode: "es",
      }),
      { taskId: "confirm-sms-booking_1" }
    );
    // El aviso al propietario nunca pasa por WhatsApp, solo la confirmación
    // y el recordatorio al cliente.
    expect(mockedEnqueueSmsJob).toHaveBeenCalledTimes(1);
    expect(mockedEnqueueSmsJob).toHaveBeenCalledWith(
      expect.objectContaining({ toNumber: "+34600111222" })
    );
  });

  it("programa el recordatorio por WhatsApp con el nombre de plantilla correcto", async () => {
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

    expect(mockedEnqueueWhatsappJob).toHaveBeenCalledWith(
      expect.objectContaining({ templateName: "recordatorio_cita" }),
      expect.objectContaining({ taskId: "reminder-sms-booking_1", scheduleTime: expect.any(Date) })
    );
  });

  it("cae a SMS solo para la confirmación si falta el nombre de esa plantilla, sin afectar al recordatorio", async () => {
    delete process.env.WHATSAPP_TEMPLATE_CONFIRMATION_NAME;

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

    expect(mockedEnqueueWhatsappJob).not.toHaveBeenCalledWith(
      expect.anything(),
      { taskId: "confirm-sms-booking_1" }
    );
    expect(mockedEnqueueSmsJob).toHaveBeenCalledWith(
      expect.objectContaining({ toNumber: "+34600999888", text: expect.stringContaining("confirmada") }),
      { taskId: "confirm-sms-booking_1" }
    );
    // El recordatorio sí tiene su plantilla configurada — no debe verse afectado.
    expect(mockedEnqueueWhatsappJob).toHaveBeenCalledWith(
      expect.objectContaining({ templateName: "recordatorio_cita" }),
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
    mockedGetBusyIntervals.mockResolvedValue({ intervals: [], calendarAvailabilityKnown: true } as any);
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
    mockedCallFindUnique.mockResolvedValue({ id: "call_row_1", fromNumber: "+34600999888", businessId: "business_123" } as any);
  });

  it("encuentra la próxima cita con consentimiento asociada al número de quien llama", async () => {
    mockedBookingFindFirst.mockResolvedValue({
      id: "booking_1",
      programedAt: new Date("2026-09-20T10:00:00+02:00"),
      serviceIds: ["svc_1"],
      clientName: "Pilar Broncano",
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
    // Sin el nombre, el LLM llegó a reservar a nombre de "titular anterior"
    // al recrear una cita (llamada real del 2026-09-15).
    expect(result.result.clientName).toBe("Pilar Broncano");
    // Sin smsConsent en el filtro: ese campo autoriza a escribir al cliente,
    // no acredita que la cita sea suya. Exigirlo dejaba sin localizar la cita
    // de quien había dicho que no a los mensajes, y el agente acababa
    // creándole una segunda cita en vez de cambiarle la que ya tenía.
    const filtro = (mockedBookingFindFirst.mock.calls[0][0] as any).where;
    expect(filtro.isCancelled).toBe(false);
    expect(filtro.smsConsent).toBeUndefined();
  });

  it("devuelve clientName null en reservas anteriores a la columna, sin fallar", async () => {
    mockedBookingFindFirst.mockResolvedValue({
      id: "booking_1",
      programedAt: new Date("2026-09-20T10:00:00+02:00"),
      serviceIds: [],
      clientName: null,
      professional: null,
    } as any);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "find_my_appointment",
      params: {},
      callId: "call_vapi_1",
    });

    expect(result.result.success).toBe(true);
    expect(result.result.clientName).toBeNull();
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
    mockedCallFindUnique.mockResolvedValue({ id: "call_row_1", fromNumber: null, businessId: "business_123" } as any);

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
    mockedCallFindUnique.mockResolvedValue({ id: "call_row_1", fromNumber: "+34600999888", businessId: "business_123" } as any);
    mockedBookingUpdate.mockResolvedValue({} as any);
    mockedCancelAppointment.mockResolvedValue(undefined as any);
    // Sin avisos de disponibilidad pendientes por defecto — los tests que
    // los necesitan lo sobrescriben explícitamente.
    mockedLeadFindMany.mockResolvedValue([]);
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
      // La cancelación acota los avisos pendientes al hueco que libera, así
      // que necesita saber cuándo y cuánto duraba la cita.
      programedAt: new Date("2026-09-20T10:00:00+02:00"),
      durationMinutes: 60,
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

  it("cancela aunque la reserva no tenga consentimiento de mensajería, si el número coincide", async () => {
    // El consentimiento de WhatsApp/SMS no es una credencial: quien llama
    // desde el número de la reserva es su titular igualmente.
    mockedBookingFindFirst.mockResolvedValue(buildOwnedBooking({ smsConsent: false }) as any);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "cancel_appointment",
      params: { bookingId: "booking_1" },
      callId: "call_vapi_1",
    });

    expect(result.result.success).toBe(true);
    expect(mockedBookingUpdate).toHaveBeenCalled();
  });

  it("no cancela si el número de quien llama no es el de la reserva", async () => {
    mockedBookingFindFirst.mockResolvedValue(
      buildOwnedBooking({ clientPhone: "+34611111111" }) as any
    );

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

  describe("avisos de disponibilidad pendientes (notify_when_available)", () => {
    beforeEach(() => {
      process.env.WHATSAPP_TELNYX_FROM_NUMBER = "+34900000001";
      process.env.TELNYX_API_KEY = process.env.TELNYX_API_KEY || "test_key";
      process.env.TELNYX_MESSAGING_PROFILE_ID =
        process.env.TELNYX_MESSAGING_PROFILE_ID || "profile_test";
      process.env.WHATSAPP_TEMPLATE_SLOT_AVAILABLE_NAME = "hora_libre";
      // La cita cancelada ocupa exactamente la hora que el otro cliente
      // esperaba: solo los avisos que pisan el hueco liberado se comprueban.
      mockedBookingFindFirst.mockResolvedValue(
        buildOwnedBooking({
          programedAt: new Date(Date.now() + 24 * 60 * 60_000),
          durationMinutes: 30,
        }) as any
      );
      mockedEnqueueWhatsappJob.mockResolvedValue(undefined);
    });

    afterEach(() => {
      clearWhatsappEnv();
      delete process.env.WHATSAPP_TEMPLATE_SLOT_AVAILABLE_NAME;
    });

    it("al liberarse un hueco por cancelación, avisa por WhatsApp al aviso pendiente y lo marca resuelto", async () => {
      const desiredStart = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
      mockedLeadFindMany.mockResolvedValue([
        {
          id: "lead_1",
          data: {
            clientPhone: "+34611222333",
            startDateTime: desiredStart,
            durationMinutes: 30,
            serviceIds: [],
            professionalId: null,
          },
        },
      ] as any);
      mockedCheckAvailability.mockResolvedValue({
        available: true,
        message: "",
        capacityUsed: 0,
        capacityTotal: 1,
        availableProfessionals: [{ id: "professional_123", name: "Ana" }],
      } as any);
      mockedGetBusyIntervals.mockResolvedValue({ intervals: [], calendarAvailabilityKnown: true } as any);
      mockedLeadUpdate.mockResolvedValue({} as any);

      await executeVoiceTool({
        businessId: "business_123",
        toolName: "cancel_appointment",
        params: { bookingId: "booking_1" },
        callId: "call_vapi_1",
      });

      expect(mockedEnqueueWhatsappJob).toHaveBeenCalledWith(
        expect.objectContaining({
          toNumber: "+34611222333",
          templateName: "hora_libre",
        })
      );
      expect(mockedLeadUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "lead_1" } })
      );
    });

    it("no consulta el calendario por avisos de otra hora distinta a la liberada", async () => {
      // Aviso para pasado mañana; la cita cancelada es de mañana.
      const otraHora = new Date(Date.now() + 48 * 60 * 60_000).toISOString();
      mockedLeadFindMany.mockResolvedValue([
        {
          id: "lead_otro",
          data: {
            clientPhone: "+34611222333",
            startDateTime: otraHora,
            durationMinutes: 30,
            serviceIds: [],
            professionalId: null,
          },
        },
      ] as any);

      await executeVoiceTool({
        businessId: "business_123",
        toolName: "cancel_appointment",
        params: { bookingId: "booking_1" },
        callId: "call_vapi_1",
      });

      // Ni una llamada al calendario externo: el cliente está al teléfono
      // esperando a que se le confirme la cancelación.
      expect(mockedGetBusyIntervals).not.toHaveBeenCalled();
      expect(mockedEnqueueWhatsappJob).not.toHaveBeenCalled();
    });

    it("no avisa ni marca resuelto si la hora pedida sigue sin estar disponible", async () => {
      const desiredStart = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
      mockedLeadFindMany.mockResolvedValue([
        {
          id: "lead_1",
          data: {
            clientPhone: "+34611222333",
            startDateTime: desiredStart,
            durationMinutes: 30,
            serviceIds: [],
            professionalId: null,
          },
        },
      ] as any);
      mockedCheckAvailability.mockResolvedValue({
        available: false,
        code: "CAPACITY_REACHED",
        message: "",
      } as any);
      mockedGetBusyIntervals.mockResolvedValue({ intervals: [], calendarAvailabilityKnown: true } as any);

      await executeVoiceTool({
        businessId: "business_123",
        toolName: "cancel_appointment",
        params: { bookingId: "booking_1" },
        callId: "call_vapi_1",
      });

      expect(mockedEnqueueWhatsappJob).not.toHaveBeenCalled();
      expect(mockedLeadUpdate).not.toHaveBeenCalled();
    });
  });
});

describe("executeVoiceTool notify_when_available", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedBusinessFindUnique.mockResolvedValue(buildBusiness() as any);
    mockedCallFindUnique.mockResolvedValue({ id: "call_row_1", fromNumber: "+34600999888", businessId: "business_123" } as any);
    mockedLeadCreate.mockResolvedValue({ id: "lead_new" } as any);
  });

  it("guarda el aviso con el teléfono de quien llama y los datos de la hora pedida", async () => {
    const desiredStart = "2026-09-20T10:00:00+02:00";

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "notify_when_available",
      params: { startDateTime: desiredStart, durationMinutes: 30 },
      callId: "call_vapi_1",
    });

    expect(result.result.success).toBe(true);
    expect(mockedLeadCreate).toHaveBeenCalledWith({
      data: {
        callId: "call_row_1",
        type: "availability_watch",
        isLead: false,
        data: {
          clientPhone: "+34600999888",
          startDateTime: desiredStart,
          durationMinutes: 30,
          serviceIds: [],
          professionalId: null,
        },
      },
    });
  });

  it("rechaza si faltan datos de duración", async () => {
    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "notify_when_available",
      params: { startDateTime: "2026-09-20T10:00:00+02:00" },
      callId: "call_vapi_1",
    });

    expect(result.result.success).toBe(false);
    expect(result.result.code).toBe("INVALID_PARAMS");
    expect(mockedLeadCreate).not.toHaveBeenCalled();
  });

  it("rechaza si no hay un número de quien llama al que avisar", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_row_1", fromNumber: null, businessId: "business_123" } as any);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "notify_when_available",
      params: { startDateTime: "2026-09-20T10:00:00+02:00", durationMinutes: 30 },
      callId: "call_vapi_1",
    });

    expect(result.result.success).toBe(false);
    expect(result.result.code).toBe("NO_PHONE");
    expect(mockedLeadCreate).not.toHaveBeenCalled();
  });
});

// Tres niveles por profesional y servicio (17-09-2026). Cuando el cliente
// pide por su nombre a alguien marcado "no sugerir", check_availability
// devuelve una recomendación con su propio token y book_appointment frena
// UNA vez hasta que el cliente acepte a la persona propuesta o insista.
describe("executeVoiceTool — recomendación de profesional", () => {
  const redisStore = new Map<string, string>();
  const redisMock = {
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => {
      redisStore.delete(key);
      return 1;
    }),
    eval: vi.fn().mockResolvedValue(1),
  };
  const fabricaOriginal = vi.mocked(getRedis).getMockImplementation();

  function draftsGuardados() {
    return [...redisStore.entries()]
      .filter(([key]) => key.startsWith("availability_draft:"))
      .map(([key, value]) => ({ token: key.replace("availability_draft:", ""), ...JSON.parse(value) }));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    redisStore.clear();
    vi.mocked(getRedis).mockImplementation(() => redisMock as any);
    mockedBusinessFindUnique.mockResolvedValue(buildBusiness() as any);
    mockedGetBusyIntervals.mockResolvedValue({ intervals: [], calendarAvailabilityKnown: true } as any);
    // book_appointment suma la duración real de los servicios verificados.
    mockedServiceFindMany.mockResolvedValue([{ id: "corte", name: "Corte", durationMinutes: 30 }] as any);
    // Devuelve al profesional que se pide, como haría la BD.
    mockedProfessionalFindFirst.mockImplementation((async (args: any) => {
      const id = args?.where?.id;
      return id === "senior" ? { id, name: "Laura" } : { id, name: "Marta" };
    }) as any);
    mockedCheckBusinessHours.mockReturnValue({ success: true, isOpen: true } as any);
    mockedCallFindUnique.mockResolvedValue({ id: "call_123", businessId: "business_123" } as any);
    mockedBookingFindUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    if (fabricaOriginal) vi.mocked(getRedis).mockImplementation(fabricaOriginal);
  });

  const disponibleConRecomendacion = {
    available: true,
    message: "Hay 1 profesional libre y quedan 2 plazas disponibles.",
    capacityUsed: 0,
    capacityTotal: 2,
    availableProfessionals: [{ id: "aprendiz", name: "Marta" }],
    recommendedProfessional: { professional: { id: "senior", name: "Laura" }, isSpecialist: true },
  };

  it("traduce la recomendación a algo que el agente pueda decir, con su token, y guarda la marca en el draft del pedido", async () => {
    mockedCheckAvailability.mockResolvedValue(disponibleConRecomendacion as any);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "check_availability",
      callId: "call_123",
      params: { startDateTime: "2026-08-25T17:00:00+02:00", durationMinutes: 30, serviceIds: ["corte"], professionalId: "aprendiz" },
    });

    expect(result.result.available).toBe(true);
    expect(result.result.recommendation).toEqual({
      professional: { id: "senior", name: "Laura" },
      isSpecialist: true,
      availabilityToken: expect.any(String),
      instructions: expect.stringContaining("Propón UNA sola vez"),
    });
    expect(result.result.recommendation.instructions).toContain("Marta");
    expect(result.result.recommendation.instructions).toContain("Laura es quien más hace este servicio");
    // Los campos internos del ranking no llegan al LLM.
    expect(result.result).not.toHaveProperty("recommendedProfessional");
    expect(result.result).not.toHaveProperty("specialistIds");

    const drafts = draftsGuardados();
    const delPedido = drafts.find((draft) => draft.token === result.result.availabilityToken);
    const delRecomendado = drafts.find((draft) => draft.token === result.result.recommendation.availabilityToken);
    expect(delPedido).toMatchObject({
      professionalId: "aprendiz",
      professionalRequested: true,
      recommendationOffered: { professionalId: "senior", professionalName: "Laura", availabilityToken: delRecomendado?.token },
    });
    // Quien acepta a Laura la quiere a ella: su token es filtro duro.
    expect(delRecomendado).toMatchObject({ professionalId: "senior", professionalRequested: true });
    expect(delRecomendado).not.toHaveProperty("recommendationOffered");
  });

  it("si el cliente ya insistió (professionalConfirmed), no vuelve a proponer a nadie", async () => {
    mockedCheckAvailability.mockResolvedValue(disponibleConRecomendacion as any);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "check_availability",
      callId: "call_123",
      params: { startDateTime: "2026-08-25T17:00:00+02:00", durationMinutes: 30, serviceIds: ["corte"], professionalId: "aprendiz", professionalConfirmed: true },
    });

    expect(result.result.available).toBe(true);
    expect(result.result).not.toHaveProperty("recommendation");
    expect(draftsGuardados()).toHaveLength(1);
    expect(draftsGuardados()[0]).not.toHaveProperty("recommendationOffered");
  });

  it("también recomienda cuando la persona pedida está ocupada a esa hora", async () => {
    mockedCheckAvailability.mockResolvedValue({
      available: false,
      code: "ALL_PROFESSIONALS_BUSY",
      message: "Todos los profesionales que pueden hacer este servicio están ocupados en ese horario.",
      suggestedNextSlot: null,
      recommendedProfessional: { professional: { id: "senior", name: "Laura" }, isSpecialist: false },
    } as any);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "check_availability",
      callId: "call_123",
      params: { startDateTime: "2026-08-25T17:00:00+02:00", durationMinutes: 30, serviceIds: ["corte"], professionalId: "aprendiz" },
    });

    expect(result.result.available).toBe(false);
    expect(result.result.recommendation.professional).toEqual({ id: "senior", name: "Laura" });
    expect(result.result.recommendation.instructions).toContain("Laura es la persona más indicada");
  });

  it("sin profesional pedido, dice con quién queda la cita y si es especialista", async () => {
    mockedCheckAvailability.mockResolvedValue({
      available: true,
      message: "Hay 2 profesionales libres y quedan 2 plazas disponibles.",
      capacityUsed: 0,
      capacityTotal: 2,
      availableProfessionals: [{ id: "senior", name: "Laura" }, { id: "normal", name: "Pedro" }],
      specialistIds: ["senior"],
    } as any);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "check_availability",
      callId: "call_123",
      params: { startDateTime: "2026-08-25T17:00:00+02:00", durationMinutes: 30, serviceIds: ["corte"] },
    });

    expect(result.result.assignedProfessional).toEqual({ id: "senior", name: "Laura", isSpecialist: true });
    expect(result.result).not.toHaveProperty("recommendation");
    expect(result.result).not.toHaveProperty("specialistIds");
    expect(draftsGuardados()[0]).toMatchObject({ professionalId: "senior", professionalRequested: false });
  });

  it("book_appointment frena una vez si hubo recomendación y el cliente no ha insistido", async () => {
    redisStore.set(
      "availability_draft:token-marta",
      JSON.stringify({
        businessId: "business_123",
        callId: "call_123",
        startDateTime: "2026-08-25T17:00:00+02:00",
        durationMinutes: 30,
        serviceIds: ["corte"],
        professionalId: "aprendiz",
        professionalRequested: true,
        recommendationOffered: { professionalId: "senior", professionalName: "Laura", availabilityToken: "token-laura" },
      })
    );

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "book_appointment",
      callId: "call_123",
      params: { clientName: "María", availabilityToken: "token-marta" },
    });

    expect(result.result).toMatchObject({
      success: false,
      code: "PROFESSIONAL_CONFIRMATION_REQUIRED",
      recommendation: { professional: { id: "senior", name: "Laura" }, availabilityToken: "token-laura" },
    });
    expect(result.result.message).toContain("professionalConfirmed: true");
    expect(mockedCheckAvailability).not.toHaveBeenCalled();
  });

  it("con professionalConfirmed reserva con la persona pedida como filtro duro", async () => {
    redisStore.set(
      "availability_draft:token-marta",
      JSON.stringify({
        businessId: "business_123",
        callId: "call_123",
        startDateTime: "2026-08-25T17:00:00+02:00",
        durationMinutes: 30,
        serviceIds: ["corte"],
        professionalId: "aprendiz",
        professionalRequested: true,
        recommendationOffered: { professionalId: "senior", professionalName: "Laura", availabilityToken: "token-laura" },
      })
    );
    mockedCheckAvailability.mockResolvedValue({
      available: false,
      code: "ALL_PROFESSIONALS_BUSY",
      message: "ocupado",
    } as any);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "book_appointment",
      callId: "call_123",
      params: { clientName: "María", availabilityToken: "token-marta", professionalConfirmed: true },
    });

    // Ha pasado la puerta: la reserva sigue su curso normal (aquí se frena por
    // el mock de disponibilidad, no por la recomendación).
    expect(result.result.code).not.toBe("PROFESSIONAL_CONFIRMATION_REQUIRED");
    expect(mockedCheckAvailability).toHaveBeenCalledWith(expect.objectContaining({ professionalId: "aprendiz" }));
  });

  it("el token de la persona recomendada reserva sin frenar: el cliente la aceptó", async () => {
    redisStore.set(
      "availability_draft:token-laura",
      JSON.stringify({
        businessId: "business_123",
        callId: "call_123",
        startDateTime: "2026-08-25T17:00:00+02:00",
        durationMinutes: 30,
        serviceIds: ["corte"],
        professionalId: "senior",
        professionalRequested: true,
      })
    );
    mockedCheckAvailability.mockResolvedValue({ available: false, code: "ALL_PROFESSIONALS_BUSY", message: "ocupado" } as any);

    const result = await executeVoiceTool({
      businessId: "business_123",
      toolName: "book_appointment",
      callId: "call_123",
      params: { clientName: "María", availabilityToken: "token-laura" },
    });

    expect(result.result.code).not.toBe("PROFESSIONAL_CONFIRMATION_REQUIRED");
    expect(mockedCheckAvailability).toHaveBeenCalledWith(expect.objectContaining({ professionalId: "senior" }));
  });
});
