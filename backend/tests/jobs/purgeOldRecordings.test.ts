import { beforeEach, describe, expect, it, vi } from "vitest";
import { purgeOldRecordingsJob } from "../../src/jobs/purgeOldRecordings.js";
import { prisma } from "../../src/lib/prisma.js";
import { deleteStorageObject } from "../../src/lib/storage.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { recording: { findMany: vi.fn(), update: vi.fn() } },
}));
vi.mock("../../src/lib/storage.js", () => ({ deleteStorageObject: vi.fn() }));

const mockedFindMany = vi.mocked(prisma.recording.findMany);
const mockedUpdate = vi.mocked(prisma.recording.update);
const mockedDelete = vi.mocked(deleteStorageObject);

describe("purgeOldRecordingsJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUpdate.mockResolvedValue({} as any);
    mockedDelete.mockResolvedValue(undefined);
  });

  it("borra el audio y deja la fila sin rastro de dónde estaba", async () => {
    mockedFindMany.mockResolvedValueOnce([
      { id: "rec_1", callId: "call_1", storageKey: "recordings/biz/call_1.mp3" },
    ] as any);

    const result = await purgeOldRecordingsJob();

    expect(mockedDelete).toHaveBeenCalledWith("recordings/biz/call_1.mp3");
    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { id: "rec_1" },
      data: expect.objectContaining({
        storageKey: null,
        storageUrl: null,
        externalUrl: "",
      }),
    });
    expect(result.purged).toBe(1);
  });

  it("busca tanto las caducadas por antigüedad como las retiradas del panel", async () => {
    mockedFindMany.mockResolvedValueOnce([] as any);

    await purgeOldRecordingsJob();

    const filtro = (mockedFindMany.mock.calls[0][0] as any).where;
    expect(filtro.storageKey).toEqual({ not: null });
    expect(filtro.OR).toHaveLength(2);
    expect(filtro.OR[0].createdAt.lt).toBeInstanceOf(Date);
    expect(filtro.OR[1].deletedAt.lt).toBeInstanceOf(Date);
  });

  it("un fichero que no se puede borrar no impide purgar el resto", async () => {
    mockedFindMany.mockResolvedValueOnce([
      { id: "rec_1", callId: "call_1", storageKey: "a.mp3" },
      { id: "rec_2", callId: "call_2", storageKey: "b.mp3" },
    ] as any);
    mockedDelete.mockRejectedValueOnce(new Error("R2 no disponible"));

    const result = await purgeOldRecordingsJob();

    expect(result).toEqual({ purged: 1, failed: 1 });
  });
});
