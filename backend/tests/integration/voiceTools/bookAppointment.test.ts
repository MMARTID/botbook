import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { executeVoiceTool } from "../../../src/modules/voiceTools/service.js";
import { calendarService } from "../../../src/modules/calendar/service.js";
import { resetDb } from "../helpers/db.js";
import {
  createTestBusiness,
  createTestCall,
  createTestProfessional,
  nextOpenSlot,
} from "../helpers/fixtures.js";

// Google/Outlook Calendar es la única frontera externa real de este flujo:
// se stubea aquí (no con MSW) porque lo que queremos probar es que Alhabla
// enlaza la reserva a la llamada correcta contra Postgres/Redis reales, no
// la integración con la API de Google en sí.
vi.mock("../../../src/modules/calendar/service.js", () => ({
  calendarService: {
    bookAppointment: vi.fn().mockResolvedValue({
      htmlLink: "https://calendar.google.com/fake-event",
    }),
    getBusyIntervals: vi.fn().mockResolvedValue({
      intervals: [],
      calendarAvailabilityKnown: true,
    }),
  },
}));

describe("book_appointment (integración: Postgres + Redis reales)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("vincula la reserva a la llamada exacta (callId) y no a la más reciente del negocio", async () => {
    const business = await createTestBusiness();
    await createTestProfessional(business.id);

    const slot = nextOpenSlot();

    // Llamada B: la que realmente está ejecutando book_appointment — deliberadamente
    // la MÁS ANTIGUA de las dos, para que el heurístico de "llamada más reciente"
    // fallaría (elegiría A) si el código dejara de usar el callId explícito.
    const callB = await createTestCall(business.id, {
      startedAt: new Date(Date.now() - 10 * 60_000),
    });
    // Llamada A: más reciente, pero NO es la que está reservando ahora mismo.
    const callA = await createTestCall(business.id, {
      startedAt: new Date(),
    });

    const result = await executeVoiceTool({
      businessId: business.id,
      toolName: "book_appointment",
      callId: callB.callId,
      params: {
        clientName: "Cliente de prueba",
        startDateTime: slot.iso,
        durationMinutes: 30,
      },
    });

    expect(result.success).toBe(true);
    expect(result.result.success).toBe(true);

    const bookingForB = await prisma.booking.findUnique({ where: { callId: callB.id } });
    const bookingForA = await prisma.booking.findUnique({ where: { callId: callA.id } });

    expect(bookingForB).not.toBeNull();
    expect(bookingForB?.programedAt.toISOString()).toBe(
      slot.date.toISOString()
    );
    expect(bookingForA).toBeNull();
  });

  it("si el callId no coincide con ninguna llamada, usa como red de seguridad la más reciente del negocio", async () => {
    const business = await createTestBusiness();
    await createTestProfessional(business.id);

    const slot = nextOpenSlot();

    const olderCall = await createTestCall(business.id, {
      startedAt: new Date(Date.now() - 10 * 60_000),
    });
    const mostRecentCall = await createTestCall(business.id, {
      startedAt: new Date(),
    });

    const result = await executeVoiceTool({
      businessId: business.id,
      toolName: "book_appointment",
      callId: "call_que_no_existe_todavia", // p. ej. carrera con el webhook call_started
      params: {
        clientName: "Cliente de prueba",
        startDateTime: slot.iso,
        durationMinutes: 30,
      },
    });

    expect(result.result.success).toBe(true);

    const bookingForMostRecent = await prisma.booking.findUnique({
      where: { callId: mostRecentCall.id },
    });
    const bookingForOlder = await prisma.booking.findUnique({ where: { callId: olderCall.id } });

    expect(bookingForMostRecent).not.toBeNull();
    expect(bookingForOlder).toBeNull();
  });
});

// Contratos del plan de corte de Redis (§6.1): tienen que pasar igual antes y
// después de mover el cerrojo de reserva y el token de disponibilidad a
// Postgres. Solo miran lo que se ve desde fuera (filas de Booking y lo que se
// le devuelve al agente), nunca las claves del almacén.
describe("book_appointment — contratos del cerrojo y del token de disponibilidad (integración)", () => {
  const eventoFalso = { htmlLink: "https://calendar.google.com/fake-event" };

  beforeEach(async () => {
    await resetDb();
    // Las llamadas de los tests de arriba no cuentan aquí.
    vi.mocked(calendarService.bookAppointment).mockClear();
  });

  afterEach(() => {
    vi.mocked(calendarService.bookAppointment).mockReset();
    vi.mocked(calendarService.bookAppointment).mockResolvedValue(
      eventoFalso as never
    );
  });

  it("dos book_appointment a la vez del mismo negocio, mismo hueco y capacidad 1 dejan una sola reserva", async () => {
    const business = await createTestBusiness({ bookingCapacity: 1 });
    await createTestProfessional(business.id);
    const slot = nextOpenSlot();
    const llamadaA = await createTestCall(business.id);
    const llamadaB = await createTestCall(business.id);

    // El calendario tarda como uno real: así la sección crítica (comprobar
    // el hueco, crear el evento, guardar la reserva) es lo bastante ancha
    // para que, sin cerrojo, las dos comprobaciones vean el hueco libre.
    vi.mocked(calendarService.bookAppointment).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return eventoFalso as never;
    });

    const reservar = (callId: string, clientName: string) =>
      executeVoiceTool({
        businessId: business.id,
        toolName: "book_appointment",
        callId,
        params: { clientName, startDateTime: slot.iso, durationMinutes: 30 },
      });

    const resultados = await Promise.all([
      reservar(llamadaA.callId, "Cliente A"),
      reservar(llamadaB.callId, "Cliente B"),
    ]);

    const reservas = await prisma.booking.findMany({
      where: { call: { businessId: business.id }, isCancelled: false },
    });
    expect(reservas).toHaveLength(1);
    expect(reservas[0].programedAt.toISOString()).toBe(slot.date.toISOString());

    const ganadoras = resultados.filter((r) => r.result.success === true);
    const perdedoras = resultados.filter((r) => r.result.success === false);
    expect(ganadoras).toHaveLength(1);
    expect(perdedoras).toHaveLength(1);
    // La segunda esperó su turno y vio el hueco ya ocupado (no se rindió
    // por el cerrojo ni reservó a ciegas).
    expect(["CAPACITY_REACHED", "ALL_PROFESSIONALS_BUSY"]).toContain(
      perdedoras[0].result.code
    );
    expect(calendarService.bookAppointment).toHaveBeenCalledTimes(1);
  });

  it("check_availability → book_appointment con el availabilityToken real reserva el hueco comprobado", async () => {
    const business = await createTestBusiness();
    const profesional = await createTestProfessional(business.id);
    const llamada = await createTestCall(business.id);
    const slot = nextOpenSlot();

    const comprobacion = await executeVoiceTool({
      businessId: business.id,
      toolName: "check_availability",
      callId: llamada.callId,
      params: { startDateTime: slot.iso, durationMinutes: 45 },
    });

    expect(comprobacion.result.available).toBe(true);
    const availabilityToken = comprobacion.result.availabilityToken;
    expect(typeof availabilityToken).toBe("string");

    // Solo el nombre y el token: la hora, la duración y el profesional salen
    // de lo que guardó check_availability.
    const reserva = await executeVoiceTool({
      businessId: business.id,
      toolName: "book_appointment",
      callId: llamada.callId,
      params: { clientName: "Cliente con token", availabilityToken },
    });

    expect(reserva.result.success).toBe(true);
    const booking = await prisma.booking.findUnique({
      where: { callId: llamada.id },
    });
    expect(booking).not.toBeNull();
    expect(booking?.programedAt.toISOString()).toBe(slot.date.toISOString());
    expect(booking?.durationMinutes).toBe(45);
    expect(booking?.professionalId).toBe(profesional.id);
    expect(booking?.clientName).toBe("Cliente con token");
  });

  it("el availabilityToken solo vale en su llamada y un token inventado se da por caducado", async () => {
    const business = await createTestBusiness();
    await createTestProfessional(business.id);
    const llamada = await createTestCall(business.id);
    const otraLlamada = await createTestCall(business.id);
    const slot = nextOpenSlot();

    const comprobacion = await executeVoiceTool({
      businessId: business.id,
      toolName: "check_availability",
      callId: llamada.callId,
      params: { startDateTime: slot.iso, durationMinutes: 30 },
    });
    const availabilityToken = comprobacion.result.availabilityToken;
    expect(typeof availabilityToken).toBe("string");

    const desdeOtraLlamada = await executeVoiceTool({
      businessId: business.id,
      toolName: "book_appointment",
      callId: otraLlamada.callId,
      params: { clientName: "Otra persona", availabilityToken },
    });
    const inventado = await executeVoiceTool({
      businessId: business.id,
      toolName: "book_appointment",
      callId: llamada.callId,
      params: {
        clientName: "Cliente",
        availabilityToken: "00000000-0000-4000-8000-000000000000",
      },
    });

    expect(desdeOtraLlamada.result).toMatchObject({
      success: false,
      code: "AVAILABILITY_TOKEN_EXPIRED",
    });
    expect(inventado.result).toMatchObject({
      success: false,
      code: "AVAILABILITY_TOKEN_EXPIRED",
    });
    expect(
      await prisma.booking.count({
        where: { call: { businessId: business.id } },
      })
    ).toBe(0);
    expect(calendarService.bookAppointment).not.toHaveBeenCalled();
  });

  it("el availabilityToken sigue valiendo segundos después de comprobar (caduca en minutos, no en milisegundos)", async () => {
    const business = await createTestBusiness();
    await createTestProfessional(business.id);
    const llamada = await createTestCall(business.id);
    const slot = nextOpenSlot();

    const comprobacion = await executeVoiceTool({
      businessId: business.id,
      toolName: "check_availability",
      callId: llamada.callId,
      params: { startDateTime: slot.iso, durationMinutes: 30 },
    });
    const availabilityToken = comprobacion.result.availabilityToken;
    expect(typeof availabilityToken).toBe("string");

    // Lo que tarda el cliente en dar su nombre. Con la caducidad (5 min)
    // tomada como milisegundos en vez de segundos, el token viviría 300 ms y
    // aquí ya habría caducado (AVAILABILITY_TOKEN_EXPIRED).
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const reserva = await executeVoiceTool({
      businessId: business.id,
      toolName: "book_appointment",
      callId: llamada.callId,
      params: { clientName: "Cliente sin prisa", availabilityToken },
    });

    expect(reserva.result.success).toBe(true);
    const booking = await prisma.booking.findUnique({
      where: { callId: llamada.id },
    });
    expect(booking?.programedAt.toISOString()).toBe(slot.date.toISOString());
  });

  it("un availabilityToken emitido sin llamada no sirve en otro negocio", async () => {
    const negocioA = await createTestBusiness();
    await createTestProfessional(negocioA.id);
    const negocioB = await createTestBusiness();
    await createTestProfessional(negocioB.id);
    // B tiene una llamada en curso: sin la comprobación de negocio del
    // token, la reserva se colgaría de ella (heurístico de la llamada más
    // reciente) con el hueco que comprobó A.
    await createTestCall(negocioB.id);
    const slot = nextOpenSlot();

    // Sin callId: el draft no queda atado a ninguna llamada, así que el
    // negocio es la única barrera.
    const comprobacion = await executeVoiceTool({
      businessId: negocioA.id,
      toolName: "check_availability",
      params: { startDateTime: slot.iso, durationMinutes: 30 },
    });
    const availabilityToken = comprobacion.result.availabilityToken;
    expect(typeof availabilityToken).toBe("string");

    const desdeOtroNegocio = await executeVoiceTool({
      businessId: negocioB.id,
      toolName: "book_appointment",
      params: { clientName: "Otra persona", availabilityToken },
    });

    expect(desdeOtroNegocio.result).toMatchObject({
      success: false,
      code: "AVAILABILITY_TOKEN_EXPIRED",
    });
    expect(await prisma.booking.count()).toBe(0);
    expect(calendarService.bookAppointment).not.toHaveBeenCalled();
  });
});
