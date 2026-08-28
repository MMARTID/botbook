import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeVoiceTool } from "../../../src/modules/voiceTools/service.js";
import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";
import { checkBusinessHours } from "../../../src/lib/businessSchedule.js";
import { calendarService } from "../../../src/modules/calendar/service.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    call: { findUnique: vi.fn(), findFirst: vi.fn() },
    booking: { upsert: vi.fn() },
  },
}));

vi.mock("../../../src/lib/redis.js", () => ({
  getRedis: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    del: vi.fn(),
  })),
}));

vi.mock("../../../src/lib/businessSchedule.js", () => ({
  checkBusinessHours: vi.fn(),
}));

vi.mock("../../../src/lib/availability.js", () => ({
  checkAvailability: vi.fn(),
}));

vi.mock("../../../src/modules/calendar/service.js", () => ({
  calendarService: {
    bookAppointment: vi.fn(),
  },
}));

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedCallFindUnique = vi.mocked(prisma.call.findUnique);
const mockedCallFindFirst = vi.mocked(prisma.call.findFirst);
const mockedBookingUpsert = vi.mocked(prisma.booking.upsert);
const mockedCheckBusinessHours = vi.mocked(checkBusinessHours);
const mockedBookAppointment = vi.mocked(calendarService.bookAppointment);

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
  });

  it("vincula la reserva a la llamada exacta del callId, aunque exista otra más reciente", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_row_OLD" } as any);

    const result = await executeVoiceTool(
      buildBookAppointmentInput({ callId: "call_vapi_OLD" })
    );

    expect(result.result.success).toBe(true);
    expect(mockedCallFindUnique).toHaveBeenCalledWith({
      where: { vapiCallId: "call_vapi_OLD" },
      select: { id: true },
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
    expect(mockedCallFindFirst).toHaveBeenCalledWith({
      where: { businessId: "business_123" },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
    expect(mockedBookingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { callId: "call_row_MOST_RECENT" } })
    );
  });

  it("usa el heurístico directamente cuando no se conoce el callId", async () => {
    mockedCallFindFirst.mockResolvedValue({ id: "call_row_MOST_RECENT" } as any);

    const result = await executeVoiceTool(buildBookAppointmentInput({ callId: undefined }));

    expect(result.result.success).toBe(true);
    expect(mockedCallFindUnique).not.toHaveBeenCalled();
    expect(mockedCallFindFirst).toHaveBeenCalled();
  });
});
