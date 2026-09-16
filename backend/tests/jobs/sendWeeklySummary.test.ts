import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendWeeklySummaryJob } from "../../src/jobs/sendWeeklySummary.js";
import { prisma } from "../../src/lib/prisma.js";
import { enqueueEmailJob } from "../../src/lib/cloudTasks.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findMany: vi.fn() },
    call: { aggregate: vi.fn() },
    booking: { count: vi.fn() },
    lead: { count: vi.fn() },
  },
}));
vi.mock("../../src/lib/cloudTasks.js", () => ({
  enqueueEmailJob: vi.fn(),
}));

const mockedFindMany = vi.mocked(prisma.business.findMany);
const mockedCallAggregate = vi.mocked(prisma.call.aggregate);
const mockedBookingCount = vi.mocked(prisma.booking.count);
const mockedLeadCount = vi.mocked(prisma.lead.count);
const mockedEnqueueEmail = vi.mocked(enqueueEmailJob);

function buildBusiness(overrides: Record<string, unknown> = {}) {
  return {
    id: "biz_1",
    name: "Peluquería Sol",
    plan: "pro",
    stripePriceId: null,
    users: [{ email: "dueña@example.com" }],
    ...overrides,
  };
}

describe("sendWeeklySummaryJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCallAggregate.mockResolvedValue({
      _count: { _all: 12 },
      _sum: { durationSecs: 1500 },
    } as any);
    mockedBookingCount.mockResolvedValue(5);
    mockedLeadCount.mockResolvedValue(2);
  });

  it("envía el resumen a un negocio Pro con actividad", async () => {
    mockedFindMany.mockResolvedValue([buildBusiness()] as any);

    const result = await sendWeeklySummaryJob();

    expect(result).toEqual({ sent: 1, skipped: 0 });
    expect(mockedEnqueueEmail).toHaveBeenCalledTimes(1);
    const payload = mockedEnqueueEmail.mock.calls[0][0];
    expect(payload.toAddress).toBe("dueña@example.com");
    expect(payload.subject).toContain("Peluquería Sol");
    expect(payload.html).toContain("12");
    // 1500s → ceil(1500/60) = 25 minutos
    expect(payload.html).toContain("25");
  });

  it("omite negocios del plan Inicio — el resumen semanal es de Pro/Scale", async () => {
    mockedFindMany.mockResolvedValue([
      buildBusiness({ plan: "basic" }),
    ] as any);

    const result = await sendWeeklySummaryJob();

    expect(result).toEqual({ sent: 0, skipped: 1 });
    expect(mockedEnqueueEmail).not.toHaveBeenCalled();
  });

  it("omite negocios sin actividad en la semana", async () => {
    mockedFindMany.mockResolvedValue([buildBusiness()] as any);
    mockedCallAggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { durationSecs: null },
    } as any);
    mockedBookingCount.mockResolvedValue(0);

    const result = await sendWeeklySummaryJob();

    expect(result).toEqual({ sent: 0, skipped: 1 });
    expect(mockedEnqueueEmail).not.toHaveBeenCalled();
  });

  it("un negocio que falla no impide el envío al resto", async () => {
    mockedFindMany.mockResolvedValue([
      buildBusiness({ id: "biz_roto" }),
      buildBusiness({ id: "biz_2", name: "Barbería Norte" }),
    ] as any);
    mockedCallAggregate
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        _count: { _all: 3 },
        _sum: { durationSecs: 300 },
      } as any);

    const result = await sendWeeklySummaryJob();

    expect(result).toEqual({ sent: 1, skipped: 1 });
    expect(mockedEnqueueEmail).toHaveBeenCalledTimes(1);
    expect(mockedEnqueueEmail.mock.calls[0][0].subject).toContain(
      "Barbería Norte"
    );
  });
});
