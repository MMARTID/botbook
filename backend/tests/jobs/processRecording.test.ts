import { describe, it, expect, beforeEach, vi } from "vitest";
import { processRecordingJob } from "../../src/jobs/processRecording.js";
import { prisma } from "../../src/lib/prisma.js";
import { uploadRecording } from "../../src/lib/storage.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    call: { findUnique: vi.fn() },
    recording: { update: vi.fn() },
  },
}));

vi.mock("../../src/lib/storage.js", () => ({ uploadRecording: vi.fn() }));

const mockedCallFindUnique = vi.mocked(prisma.call.findUnique);
const mockedRecordingUpdate = vi.mocked(prisma.recording.update);
const mockedUploadRecording = vi.mocked(uploadRecording);

const payload = { callId: "call_1", vapiUrl: "https://vapi.example/rec.mp3", businessId: "biz_1" };

describe("processRecordingJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("lanza si la llamada no existe", async () => {
    mockedCallFindUnique.mockResolvedValue(null);

    await expect(processRecordingJob(payload)).rejects.toThrow("Call call_1 not found");
    expect(mockedUploadRecording).not.toHaveBeenCalled();
  });

  it("descarga la grabación, la sube a storage y actualiza la BD", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_1" } as any);
    const audioBuffer = new TextEncoder().encode("audio-fake").buffer;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => audioBuffer })
    );
    mockedUploadRecording.mockResolvedValue("https://r2.example/recordings/biz_1/call_1.mp3");
    mockedRecordingUpdate.mockResolvedValue({} as any);

    await processRecordingJob(payload);

    expect(mockedUploadRecording).toHaveBeenCalledWith(
      "recordings/biz_1/call_1.mp3",
      expect.anything()
    );
    expect(mockedRecordingUpdate).toHaveBeenCalledWith({
      where: { callId: "call_1" },
      data: {
        storageKey: "recordings/biz_1/call_1.mp3",
        storageUrl: "https://r2.example/recordings/biz_1/call_1.mp3",
      },
    });
  });

  it("lanza si la descarga desde Vapi falla", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_1" } as any);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, statusText: "Not Found" }));

    await expect(processRecordingJob(payload)).rejects.toThrow(
      "Failed to download recording: Not Found"
    );
    expect(mockedUploadRecording).not.toHaveBeenCalled();
  });

  it("propaga el error si falla la subida a storage", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_1" } as any);
    const audioBuffer = new TextEncoder().encode("audio-fake").buffer;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => audioBuffer })
    );
    mockedUploadRecording.mockRejectedValue(new Error("R2 caído"));

    await expect(processRecordingJob(payload)).rejects.toThrow("R2 caído");
    expect(mockedRecordingUpdate).not.toHaveBeenCalled();
  });
});
