import { beforeEach, describe, expect, it, vi } from "vitest";
import { retryUsageReportsJob } from "../../src/jobs/retryUsageReports.js";
import { prisma } from "../../src/lib/prisma.js";
import { enqueueUsageReportJob } from "../../src/lib/cloudTasks.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { business: { findMany: vi.fn() } },
}));
vi.mock("../../src/lib/cloudTasks.js", () => ({ enqueueUsageReportJob: vi.fn() }));

const mockedFindMany = vi.mocked(prisma.business.findMany);
const mockedEnqueueUsageReportJob = vi.mocked(enqueueUsageReportJob);

describe("retryUsageReportsJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("vuelve a calcular el consumo de cada suscripción facturable", async () => {
    mockedFindMany.mockResolvedValue([{ id: "business_1" }, { id: "business_2" }] as any);
    mockedEnqueueUsageReportJob.mockResolvedValue(undefined);

    await expect(retryUsageReportsJob()).resolves.toBeUndefined();

    // Una tarea por negocio, con id estable por tanda: procesarlos en serie
    // aquí acercaba el job al plazo de Cloud Tasks y lo hacía reintentar entero.
    expect(mockedEnqueueUsageReportJob.mock.calls[0][0]).toEqual({ businessId: "business_1" });
    expect(mockedEnqueueUsageReportJob.mock.calls[1][0]).toEqual({ businessId: "business_2" });
    expect(mockedEnqueueUsageReportJob.mock.calls[0][1]).toContain("retry-usage-business_1-");
  });

  it("no tumba la tanda entera si un negocio no se puede encolar", async () => {
    mockedFindMany.mockResolvedValue([{ id: "business_1" }] as any);
    mockedEnqueueUsageReportJob.mockRejectedValue(new Error("Cloud Tasks no disponible"));

    // Lanzar reintentaba el lote completo, incluidos los negocios ya
    // encolados; cada tarea tiene ya sus propios reintentos.
    await expect(retryUsageReportsJob()).resolves.toBeUndefined();
  });

  it("recorre los lotes posteriores al primero", async () => {
    const firstBatch = Array.from({ length: 100 }, (_, index) => ({
      id: `business_${String(index).padStart(3, "0")}`,
    }));
    mockedFindMany
      .mockResolvedValueOnce(firstBatch as any)
      .mockResolvedValueOnce([{ id: "business_100" }] as any);
    mockedEnqueueUsageReportJob.mockResolvedValue(undefined);

    await expect(retryUsageReportsJob()).resolves.toBeUndefined();

    expect(mockedEnqueueUsageReportJob).toHaveBeenCalledTimes(101);
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
