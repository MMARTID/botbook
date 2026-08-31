import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { executeVoiceTool } from "../../../src/modules/voiceTools/service.js";
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
      callId: callB.vapiCallId,
      params: {
        clientName: "Cliente de prueba",
        startDateTime: slot.toISOString(),
        durationMinutes: 30,
      },
    });

    expect(result.success).toBe(true);
    expect(result.result.success).toBe(true);

    const bookingForB = await prisma.booking.findUnique({ where: { callId: callB.id } });
    const bookingForA = await prisma.booking.findUnique({ where: { callId: callA.id } });

    expect(bookingForB).not.toBeNull();
    expect(bookingForB?.programedAt.toISOString()).toBe(slot.toISOString());
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
        startDateTime: slot.toISOString(),
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
