import { describe, it, expect, beforeEach, vi } from "vitest";
import { retryStuckRecordingsJob } from "../../src/jobs/retryStuckRecordings.js";
import { prisma } from "../../src/lib/prisma.js";
import { enqueueRecordingJob } from "../../src/lib/cloudTasks.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    recording: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/cloudTasks.js", () => ({
  enqueueRecordingJob: vi.fn(),
}));

const mockedFindMany = vi.mocked(prisma.recording.findMany);
const mockedEnqueueRecordingJob = vi.mocked(enqueueRecordingJob);

describe("retryStuckRecordingsJob (hallazgo #30 de la auditoría)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEnqueueRecordingJob.mockResolvedValue(undefined);
  });

  it("no hace nada si no hay grabaciones atascadas", async () => {
    mockedFindMany.mockResolvedValue([]);

    await retryStuckRecordingsJob();

    expect(mockedEnqueueRecordingJob).not.toHaveBeenCalled();
  });

  it("busca grabaciones con storageKey null y más de 15 minutos de antigüedad", async () => {
    mockedFindMany.mockResolvedValue([]);

    await retryStuckRecordingsJob();

    const query = mockedFindMany.mock.calls[0][0] as any;
    expect(query.where.storageKey).toBeNull();
    const thresholdMs = Date.now() - query.where.createdAt.lt.getTime();
    expect(thresholdMs).toBeGreaterThanOrEqual(15 * 60 * 1000);
    expect(thresholdMs).toBeLessThan(15 * 60 * 1000 + 5000);
  });

  it("reencola cada grabación atascada con el callId, vapiUrl y businessId correctos", async () => {
    mockedFindMany.mockResolvedValue([
      {
        id: "rec_1",
        callId: "call_db_1",
        vapiUrl: "https://vapi.example/rec1.mp3",
        call: { businessId: "biz_1" },
      },
      {
        id: "rec_2",
        callId: "call_db_2",
        vapiUrl: "https://vapi.example/rec2.mp3",
        call: { businessId: "biz_2" },
      },
    ] as any);

    await retryStuckRecordingsJob();

    expect(mockedEnqueueRecordingJob).toHaveBeenCalledTimes(2);
    // Sin segundo argumento (taskId) a propósito — ver comentario en el
    // fuente: reusar el nombre de la tarea original (process-recording-<id>)
    // haría que Cloud Tasks rechazara el reintento con ALREADY_EXISTS.
    expect(mockedEnqueueRecordingJob).toHaveBeenCalledWith({
      callId: "call_db_1",
      vapiUrl: "https://vapi.example/rec1.mp3",
      businessId: "biz_1",
    });
    expect(mockedEnqueueRecordingJob).toHaveBeenCalledWith({
      callId: "call_db_2",
      vapiUrl: "https://vapi.example/rec2.mp3",
      businessId: "biz_2",
    });
    expect(mockedEnqueueRecordingJob.mock.calls[0].length).toBe(1);
  });

  it("sigue con las demás grabaciones aunque una falle al reencolar", async () => {
    mockedFindMany.mockResolvedValue([
      { id: "rec_1", callId: "call_db_1", vapiUrl: "url_1", call: { businessId: "biz_1" } },
      { id: "rec_2", callId: "call_db_2", vapiUrl: "url_2", call: { businessId: "biz_2" } },
    ] as any);
    mockedEnqueueRecordingJob
      .mockRejectedValueOnce(new Error("Cloud Tasks down"))
      .mockResolvedValueOnce(undefined);

    await expect(retryStuckRecordingsJob()).resolves.toBeUndefined();

    expect(mockedEnqueueRecordingJob).toHaveBeenCalledTimes(2);
  });
});
