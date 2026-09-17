import { describe, it, expect, beforeEach, vi } from "vitest";
import { retryStuckRecordingsJob } from "../../src/jobs/retryStuckRecordings.js";
import { prisma } from "../../src/lib/prisma.js";
import { enqueueRecordingJob } from "../../src/lib/cloudTasks.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    recording: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../../src/lib/cloudTasks.js", () => ({
  enqueueRecordingJob: vi.fn(),
}));

const mockedFindMany = vi.mocked(prisma.recording.findMany);
const mockedUpdateMany = vi.mocked(prisma.recording.updateMany);
const mockedEnqueueRecordingJob = vi.mocked(enqueueRecordingJob);

describe("retryStuckRecordingsJob (hallazgo #30 de la auditoría)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEnqueueRecordingJob.mockResolvedValue(undefined);
    mockedUpdateMany.mockResolvedValue({ count: 0 });
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
    expect(query.where.deletedAt).toBeNull();
    // Las marcadas como irrecuperables no vuelven a la cola: ya se intentó
    // pedir una URL nueva al proveedor y no la había.
    expect(query.where.processingFailedAt).toBeNull();
    const thresholdMs = Date.now() - query.where.createdAt.lt.getTime();
    expect(thresholdMs).toBeGreaterThanOrEqual(15 * 60 * 1000);
    expect(thresholdMs).toBeLessThan(15 * 60 * 1000 + 5000);
  });

  it("reencola cada grabación atascada con el callId, externalUrl y businessId correctos", async () => {
    mockedFindMany.mockResolvedValue([
      {
        id: "rec_1",
        callId: "call_db_1",
        externalUrl: "https://vapi.example/rec1.mp3",
        call: { businessId: "biz_1" },
      },
      {
        id: "rec_2",
        callId: "call_db_2",
        externalUrl: "https://vapi.example/rec2.mp3",
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
      externalUrl: "https://vapi.example/rec1.mp3",
      businessId: "biz_1",
    });
    expect(mockedEnqueueRecordingJob).toHaveBeenCalledWith({
      callId: "call_db_2",
      externalUrl: "https://vapi.example/rec2.mp3",
      businessId: "biz_2",
    });
    expect(mockedEnqueueRecordingJob.mock.calls[0].length).toBe(1);
  });

  it("sigue con las demás grabaciones aunque una falle al reencolar", async () => {
    mockedFindMany.mockResolvedValue([
      { id: "rec_1", callId: "call_db_1", externalUrl: "url_1", call: { businessId: "biz_1" } },
      { id: "rec_2", callId: "call_db_2", externalUrl: "url_2", call: { businessId: "biz_2" } },
    ] as any);
    mockedEnqueueRecordingJob
      .mockRejectedValueOnce(new Error("Cloud Tasks down"))
      .mockResolvedValueOnce(undefined);

    await expect(retryStuckRecordingsJob()).resolves.toBeUndefined();

    expect(mockedEnqueueRecordingJob).toHaveBeenCalledTimes(2);
  });
});

describe("retryStuckRecordingsJob — grabaciones que ya no se pueden recuperar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEnqueueRecordingJob.mockResolvedValue(undefined);
    mockedFindMany.mockResolvedValue([]);
  });

  // 50 grabaciones de la batería de simulación (14–16 sep) llevaban dos días
  // reencolándose cada 15 minutos contra una URL de Telnyx caducada: ~8.000
  // peticiones al día a un 403. Lo que supera la retención del proveedor se
  // marca y sale del barrido para siempre.
  it("marca como irrecuperables las que superan la retención antes de buscar atascadas", async () => {
    mockedUpdateMany.mockResolvedValue({ count: 3 });

    await retryStuckRecordingsJob();

    const marcado = mockedUpdateMany.mock.calls[0][0] as any;
    expect(marcado.where).toMatchObject({
      storageKey: null,
      deletedAt: null,
      processingFailedAt: null,
    });
    const diasDeRetencion = (Date.now() - marcado.where.createdAt.lt.getTime()) / 86_400_000;
    expect(diasDeRetencion).toBeGreaterThanOrEqual(30);
    expect(diasDeRetencion).toBeLessThan(30.01);
    expect(marcado.data.processingFailedAt).toBeInstanceOf(Date);
    expect(marcado.data.processingError).toMatch(/30 días/);
    // El marcado va antes que la búsqueda: lo recién marcado no se reencola.
    expect(mockedUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockedFindMany.mock.invocationCallOrder[0]
    );
  });

  it("no toca nada si ninguna supera la retención", async () => {
    mockedUpdateMany.mockResolvedValue({ count: 0 });

    await retryStuckRecordingsJob();

    expect(mockedEnqueueRecordingJob).not.toHaveBeenCalled();
  });
});
