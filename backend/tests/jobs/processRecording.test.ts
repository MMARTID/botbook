import { describe, it, expect, beforeEach, vi } from "vitest";
import { processRecordingJob } from "../../src/jobs/processRecording.js";
import { prisma } from "../../src/lib/prisma.js";
import { uploadRecording } from "../../src/lib/storage.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    call: { findUnique: vi.fn() },
    recording: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../src/lib/storage.js", () => ({ uploadRecording: vi.fn() }));

const mockedCallFindUnique = vi.mocked(prisma.call.findUnique);
const mockedRecordingFindFirst = vi.mocked(prisma.recording.findFirst);
const mockedRecordingUpdate = vi.mocked(prisma.recording.update);
const mockedUploadRecording = vi.mocked(uploadRecording);

const payload = { callId: "call_1", externalUrl: "https://vapi.example/rec.mp3", businessId: "biz_1" };

describe("processRecordingJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockedRecordingFindFirst.mockResolvedValue({ id: "rec_1" } as any);
  });

  it("lanza si la llamada no existe", async () => {
    mockedCallFindUnique.mockResolvedValue(null);

    await expect(processRecordingJob(payload)).rejects.toThrow("Call call_1 not found");
    expect(mockedUploadRecording).not.toHaveBeenCalled();
  });

  it("no descarga ni sube una grabación retirada antes de ejecutar el job", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_1", businessId: "biz_1" } as any);
    mockedRecordingFindFirst.mockResolvedValue(null);

    await expect(processRecordingJob(payload)).resolves.toBeUndefined();

    expect(mockedRecordingFindFirst).toHaveBeenCalledWith({
      where: { callId: "call_1", deletedAt: null, storageKey: null },
      select: { id: true },
    });
    expect(mockedUploadRecording).not.toHaveBeenCalled();
    expect(mockedRecordingUpdate).not.toHaveBeenCalled();
  });

  it("descarga la grabación, la sube a storage y actualiza la BD", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_1", businessId: "biz_1" } as any);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("audio-fake", {
        headers: { "content-type": "audio/mpeg" },
      }))
    );
    mockedUploadRecording.mockResolvedValue("https://r2.example/recordings/biz_1/call_1.mp3");
    mockedRecordingUpdate.mockResolvedValue({} as any);

    await processRecordingJob(payload);

    expect(mockedUploadRecording).toHaveBeenCalledWith(
      "recordings/biz_1/call_1.mp3",
      expect.anything(),
      "audio/mpeg",
      undefined,
    );
    expect(mockedRecordingUpdate).toHaveBeenCalledWith({
      where: { callId: "call_1" },
      data: {
        storageKey: "recordings/biz_1/call_1.mp3",
        storageUrl: "https://r2.example/recordings/biz_1/call_1.mp3",
      },
    });
  });

  it("pasa el content-length declarado por el origen a uploadRecording — sin esto, la subida en streaming a R2 falla (hallazgo real 2026-09-11)", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_1", businessId: "biz_1" } as any);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("audio-fake", {
        headers: { "content-type": "audio/mpeg", "content-length": "9" },
      }))
    );
    mockedUploadRecording.mockResolvedValue("https://r2.example/recordings/biz_1/call_1.mp3");
    mockedRecordingUpdate.mockResolvedValue({} as any);

    await processRecordingJob(payload);

    expect(mockedUploadRecording).toHaveBeenCalledWith(
      "recordings/biz_1/call_1.mp3",
      expect.anything(),
      "audio/mpeg",
      9,
    );
  });

  it("no vuelve a descargar una grabación que ya está subida (Cloud Tasks entrega al menos una vez)", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_1", businessId: "biz_1" } as any);
    // findFirst filtra por storageKey: null, así que una segunda entrega no
    // encuentra nada pendiente.
    mockedRecordingFindFirst.mockResolvedValue(null);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await processRecordingJob(payload);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockedUploadRecording).not.toHaveBeenCalled();
  });

  it("guarda bajo el negocio de la llamada, no el del payload", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_1", businessId: "biz_real" } as any);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("audio-fake", {
        headers: { "content-type": "audio/mpeg" },
      }))
    );
    mockedUploadRecording.mockResolvedValue("https://r2.example/x.mp3");
    mockedRecordingUpdate.mockResolvedValue({} as any);

    await processRecordingJob({ ...payload, businessId: "biz_falso" });

    expect(mockedUploadRecording).toHaveBeenCalledWith(
      "recordings/biz_real/call_1.mp3",
      expect.anything(),
      "audio/mpeg",
      undefined,
    );
  });

  it("rechaza descargar de un destino interno (defensa contra SSRF)", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_1", businessId: "biz_1" } as any);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      processRecordingJob({ ...payload, externalUrl: "https://169.254.169.254/latest/meta-data" })
    ).rejects.toThrow(/Destino no permitido/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rechaza descargar por http sin cifrar", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_1", businessId: "biz_1" } as any);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      processRecordingJob({ ...payload, externalUrl: "http://retell.example/rec.mp3" })
    ).rejects.toThrow(/Esquema no permitido/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lanza si la descarga de la grabación falla", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_1", businessId: "biz_1" } as any);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404, statusText: "Not Found" })));

    await expect(processRecordingJob(payload)).rejects.toThrow(
      "Failed to download recording: Not Found"
    );
    expect(mockedUploadRecording).not.toHaveBeenCalled();
  });

  it("propaga el error si falla la subida a storage", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_1", businessId: "biz_1" } as any);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("audio-fake"))
    );
    mockedUploadRecording.mockRejectedValue(new Error("R2 caído"));

    await expect(processRecordingJob(payload)).rejects.toThrow("R2 caído");
    expect(mockedRecordingUpdate).not.toHaveBeenCalled();
  });

  it("rechaza antes de descargar en memoria una grabación declarada demasiado grande", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_1", businessId: "biz_1" } as any);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("audio-fake", {
        headers: { "content-length": String(201 * 1024 * 1024) },
      }))
    );

    await expect(processRecordingJob(payload)).rejects.toThrow("maximum accepted size");
    expect(mockedUploadRecording).not.toHaveBeenCalled();
  });
});
