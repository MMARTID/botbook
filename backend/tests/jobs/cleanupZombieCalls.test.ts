import { describe, it, expect, beforeEach, vi } from "vitest";
import { cleanupZombieCallsJob } from "../../src/jobs/cleanupZombieCalls.js";
import { prisma } from "../../src/lib/prisma.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    call: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

const mockedFindMany = vi.mocked(prisma.call.findMany);
const mockedUpdateMany = vi.mocked(prisma.call.updateMany);

describe("cleanupZombieCallsJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no actualiza nada si no hay llamadas zombie", async () => {
    mockedFindMany.mockResolvedValue([]);

    await cleanupZombieCallsJob();

    expect(mockedUpdateMany).not.toHaveBeenCalled();
  });

  it("busca llamadas IN_PROGRESS con más de 60 minutos sin actualizar", async () => {
    mockedFindMany.mockResolvedValue([]);

    await cleanupZombieCallsJob();

    const query = mockedFindMany.mock.calls[0][0] as any;
    expect(query.where.status).toBe("IN_PROGRESS");
    const thresholdMs = Date.now() - query.where.updatedAt.lt.getTime();
    // Debe rondar los 60 minutos (con margen por el tiempo de ejecución del test).
    expect(thresholdMs).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(thresholdMs).toBeLessThan(60 * 60 * 1000 + 5000);
  });

  it("marca como TIMED_OUT las llamadas zombie encontradas", async () => {
    mockedFindMany.mockResolvedValue([{ id: "call_1" }, { id: "call_2" }] as any);
    mockedUpdateMany.mockResolvedValue({ count: 2 } as any);

    await cleanupZombieCallsJob();

    const update = mockedUpdateMany.mock.calls[0][0] as any;
    expect(update.where.id).toEqual({ in: ["call_1", "call_2"] });
    expect(update.data).toEqual({ status: "TIMED_OUT" });
    // El predicado se repite en el update: si entre la búsqueda y la
    // escritura llega el webhook call_ended, la llamada ya está COMPLETED y
    // no debe degradarse a TIMED_OUT.
    expect(update.where.status).toBe("IN_PROGRESS");
    expect(update.where.updatedAt.lt).toBeInstanceOf(Date);
  });
});
