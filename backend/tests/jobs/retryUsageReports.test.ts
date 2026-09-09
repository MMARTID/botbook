import { beforeEach, describe, expect, it, vi } from "vitest";
import { retryUsageReportsJob } from "../../src/jobs/retryUsageReports.js";
import { prisma } from "../../src/lib/prisma.js";
import { processUsageReportJob } from "../../src/jobs/processUsageReport.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { business: { findMany: vi.fn() } },
}));
vi.mock("../../src/jobs/processUsageReport.js", () => ({ processUsageReportJob: vi.fn() }));

const mockedFindMany = vi.mocked(prisma.business.findMany);
const mockedProcessUsageReportJob = vi.mocked(processUsageReportJob);

describe("retryUsageReportsJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("vuelve a calcular el consumo de cada suscripción facturable", async () => {
    mockedFindMany.mockResolvedValue([{ id: "business_1" }, { id: "business_2" }] as any);
    mockedProcessUsageReportJob.mockResolvedValue(undefined);

    await expect(retryUsageReportsJob()).resolves.toBeUndefined();

    expect(mockedProcessUsageReportJob).toHaveBeenNthCalledWith(1, { businessId: "business_1" });
    expect(mockedProcessUsageReportJob).toHaveBeenNthCalledWith(2, { businessId: "business_2" });
  });

  it("falla para que Cloud Scheduler lo reintente si queda algún negocio pendiente", async () => {
    mockedFindMany.mockResolvedValue([{ id: "business_1" }] as any);
    mockedProcessUsageReportJob.mockRejectedValue(new Error("Stripe no disponible"));

    await expect(retryUsageReportsJob()).rejects.toThrow("1 negocio");
  });

  it("recorre los lotes posteriores al primero", async () => {
    const firstBatch = Array.from({ length: 100 }, (_, index) => ({
      id: `business_${String(index).padStart(3, "0")}`,
    }));
    mockedFindMany
      .mockResolvedValueOnce(firstBatch as any)
      .mockResolvedValueOnce([{ id: "business_100" }] as any);
    mockedProcessUsageReportJob.mockResolvedValue(undefined);

    await expect(retryUsageReportsJob()).resolves.toBeUndefined();

    expect(mockedProcessUsageReportJob).toHaveBeenCalledTimes(101);
    expect(mockedFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursor: { id: "business_099" },
        skip: 1,
        orderBy: { id: "asc" },
      })
    );
  });
});
