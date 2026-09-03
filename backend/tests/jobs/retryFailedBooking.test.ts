import { describe, it, expect, beforeEach, vi } from "vitest";
import { processRetryFailedBookingJob } from "../../src/jobs/retryFailedBooking.js";
import { prisma } from "../../src/lib/prisma.js";
import { calendarService } from "../../src/modules/calendar/service.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    lead: { findUnique: vi.fn(), update: vi.fn() },
    call: { findUnique: vi.fn() },
    business: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../src/modules/calendar/service.js", () => ({
  calendarService: { bookAppointment: vi.fn() },
}));

const mockedLeadFindUnique = vi.mocked(prisma.lead.findUnique);
const mockedCallFindUnique = vi.mocked(prisma.call.findUnique);
const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedTransaction = vi.mocked(prisma.$transaction);
const mockedBookAppointment = vi.mocked(calendarService.bookAppointment);

const leadId = "lead_1";
const pendingBookingData = {
  clientName: "Ana García",
  clientEmail: "ana@example.com",
  startDateTime: "2026-09-10T10:00:00Z",
  durationMinutes: 30,
  serviceId: "service_1",
  professionalId: "pro_1",
};

function buildLead(overrides: Record<string, unknown> = {}) {
  return {
    id: leadId,
    callId: "call_1",
    resolvedAt: null,
    data: pendingBookingData,
    ...overrides,
  };
}

function buildBusiness(overrides: Record<string, unknown> = {}) {
  return {
    calendarProvider: "google",
    googleRefreshToken: "google_refresh_token",
    googleCalendarId: "primary",
    googleCalendarConnected: true,
    outlookRefreshToken: null,
    outlookCalendarId: null,
    outlookCalendarConnected: false,
    ...overrides,
  };
}

describe("processRetryFailedBookingJob", () => {
  let mockUpsert: ReturnType<typeof vi.fn>;
  let mockLeadUpdate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert = vi.fn().mockResolvedValue({});
    mockLeadUpdate = vi.fn().mockResolvedValue({});
    mockedTransaction.mockImplementation(async (callback: any) =>
      callback({ booking: { upsert: mockUpsert }, lead: { update: mockLeadUpdate } })
    );
    mockedBookAppointment.mockResolvedValue({ htmlLink: "https://calendar.google.com/event/1" } as any);
  });

  it("no hace nada si el lead ya no existe", async () => {
    mockedLeadFindUnique.mockResolvedValue(null);

    await processRetryFailedBookingJob({ leadId });

    expect(mockedCallFindUnique).not.toHaveBeenCalled();
    expect(mockedBookAppointment).not.toHaveBeenCalled();
  });

  it("no hace nada si el lead ya está resuelto", async () => {
    mockedLeadFindUnique.mockResolvedValue(buildLead({ resolvedAt: new Date() }) as any);

    await processRetryFailedBookingJob({ leadId });

    expect(mockedBookAppointment).not.toHaveBeenCalled();
  });

  it("lanza si la llamada asociada al lead no existe", async () => {
    mockedLeadFindUnique.mockResolvedValue(buildLead() as any);
    mockedCallFindUnique.mockResolvedValue(null);

    await expect(processRetryFailedBookingJob({ leadId })).rejects.toThrow(
      "Call call_1 no existe"
    );
  });

  it("lanza si el negocio de la llamada no existe", async () => {
    mockedLeadFindUnique.mockResolvedValue(buildLead() as any);
    mockedCallFindUnique.mockResolvedValue({ businessId: "biz_1" } as any);
    mockedBusinessFindUnique.mockResolvedValue(null);

    await expect(processRetryFailedBookingJob({ leadId })).rejects.toThrow(
      "Business biz_1 no existe"
    );
  });

  it("lanza (para que se reintente más tarde) si Google sigue sin reconectar", async () => {
    mockedLeadFindUnique.mockResolvedValue(buildLead() as any);
    mockedCallFindUnique.mockResolvedValue({ businessId: "biz_1" } as any);
    mockedBusinessFindUnique.mockResolvedValue(
      buildBusiness({ googleRefreshToken: null }) as any
    );

    await expect(processRetryFailedBookingJob({ leadId })).rejects.toThrow(
      "Calendario todavía desconectado"
    );
    expect(mockedBookAppointment).not.toHaveBeenCalled();
  });

  it("lanza si Outlook es el proveedor pero sigue sin reconectar", async () => {
    mockedLeadFindUnique.mockResolvedValue(buildLead() as any);
    mockedCallFindUnique.mockResolvedValue({ businessId: "biz_1" } as any);
    mockedBusinessFindUnique.mockResolvedValue(
      buildBusiness({ calendarProvider: "outlook", outlookRefreshToken: null }) as any
    );

    await expect(processRetryFailedBookingJob({ leadId })).rejects.toThrow(
      "Calendario todavía desconectado"
    );
  });

  it("reserva con Google, guarda la reserva y marca el lead como resuelto", async () => {
    mockedLeadFindUnique.mockResolvedValue(buildLead() as any);
    mockedCallFindUnique.mockResolvedValue({ businessId: "biz_1" } as any);
    mockedBusinessFindUnique.mockResolvedValue(buildBusiness() as any);

    await processRetryFailedBookingJob({ leadId });

    expect(mockedBookAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        clientName: "Ana García",
        clientEmail: "ana@example.com",
        provider: "google",
        googleRefreshToken: "google_refresh_token",
      })
    );
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { callId: "call_1" },
        create: expect.objectContaining({
          callId: "call_1",
          durationMinutes: 30,
          professionalId: "pro_1",
          serviceId: "service_1",
        }),
      })
    );
    expect(mockLeadUpdate).toHaveBeenCalledWith({
      where: { id: leadId },
      data: { resolvedAt: expect.any(Date) },
    });
  });

  it("reserva con Outlook cuando el negocio usa ese proveedor", async () => {
    mockedLeadFindUnique.mockResolvedValue(buildLead() as any);
    mockedCallFindUnique.mockResolvedValue({ businessId: "biz_1" } as any);
    mockedBusinessFindUnique.mockResolvedValue(
      buildBusiness({
        calendarProvider: "outlook",
        outlookRefreshToken: "outlook_refresh_token",
        outlookCalendarId: "calendar_1",
        outlookCalendarConnected: true,
      }) as any
    );

    await processRetryFailedBookingJob({ leadId });

    expect(mockedBookAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "outlook", outlookRefreshToken: "outlook_refresh_token" })
    );
  });

  it("propaga el error de bookAppointment sin marcar el lead como resuelto", async () => {
    mockedLeadFindUnique.mockResolvedValue(buildLead() as any);
    mockedCallFindUnique.mockResolvedValue({ businessId: "biz_1" } as any);
    mockedBusinessFindUnique.mockResolvedValue(buildBusiness() as any);
    mockedBookAppointment.mockRejectedValue(new Error("Calendario de Google no responde"));

    await expect(processRetryFailedBookingJob({ leadId })).rejects.toThrow(
      "Calendario de Google no responde"
    );
    expect(mockLeadUpdate).not.toHaveBeenCalled();
  });
});
