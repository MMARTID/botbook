import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { suspendOverdueCallsJob } from "../../src/jobs/suspendOverdueCalls.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { business: { updateMany: vi.fn() } },
}));

const mockedUpdateMany = vi.mocked(prisma.business.updateMany);

describe("suspendOverdueCallsJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marca únicamente los negocios cuyo plazo de impago venció", async () => {
    mockedUpdateMany.mockResolvedValue({ count: 2 } as any);
    const now = new Date("2026-09-15T10:00:00.000Z");

    await expect(suspendOverdueCallsJob(now)).resolves.toBe(2);

    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: {
        paymentFailureSuspensionAt: { lte: now },
        callsSuspendedAt: null,
      },
      data: { callsSuspendedAt: now },
    });
  });
});
