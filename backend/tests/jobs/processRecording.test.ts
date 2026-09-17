import { describe, it, expect, beforeEach, vi } from "vitest";
import { processRecordingJob } from "../../src/jobs/processRecording.js";
import { prisma } from "../../src/lib/prisma.js";
import { uploadRecording } from "../../src/lib/storage.js";
import { telnyxAiAdapter } from "../../src/adapters/telnyx/TelnyxAiAdapter.js";
import { PermanentJobError } from "../../src/lib/jobErrors.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    call: { findUnique: vi.fn() },
    recording: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../src/lib/storage.js", () => ({ uploadRecording: vi.fn() }));

vi.mock("../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: { listRecordingsByCallLegId: vi.fn() },
}));

const mockedCallFindUnique = vi.mocked(prisma.call.findUnique);
const mockedRecordingFindFirst = vi.mocked(prisma.recording.findFirst);
const mockedRecordingUpdate = vi.mocked(prisma.recording.update);
const mockedUploadRecording = vi.mocked(uploadRecording);
const mockedListRecordingsByCallLegId = vi.mocked(telnyxAiAdapter.listRecordingsByCallLegId);

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
      select: { id: true, providerLegId: true, processingFailedAt: true },
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

  it("un 5xx del origen se propaga tal cual para que Cloud Tasks reintente", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_1", businessId: "biz_1" } as any);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503, statusText: "Service Unavailable" })));

    await expect(processRecordingJob(payload)).rejects.toThrow(
      "Failed to download recording: Service Unavailable"
    );
    expect(mockedUploadRecording).not.toHaveBeenCalled();
    // No es definitivo: ni se marca la grabación ni se descarta la tarea.
    expect(mockedRecordingUpdate).not.toHaveBeenCalled();
    expect(mockedListRecordingsByCallLegId).not.toHaveBeenCalled();
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

// Caso real (15–17 sep 2026): ~50 grabaciones de Telnyx cuyo primer intento no
// llegó a tiempo se reintentaban cada 15 min contra una URL firmada de 10
// minutos, ya caducada, y el bucle no tenía fin. Telnyx seguía teniendo el
// audio: bastaba pedirle una URL nueva con el call_leg_id.
describe("processRecordingJob — URL caducada", () => {
  const URL_CADUCADA =
    "https://s3.eu-central-1.amazonaws.com/telephony-recorder-prod-fr5/63ef069c/2026-09-14/3b49f1fa-b068-11f1-afd7-02420aef8da1-1789409715516710.wav?X-Amz-Expires=600&X-Amz-Signature=abc";
  const URL_NUEVA = "https://s3.eu-central-1.amazonaws.com/telephony-recorder-prod-fr5/fresh.wav?X-Amz-Signature=def";
  const llamadaTelnyx = { id: "call_1", businessId: "biz_1", voiceProvider: "telnyx" } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockedRecordingUpdate.mockResolvedValue({} as any);
    mockedUploadRecording.mockResolvedValue("https://r2.example/recordings/biz_1/call_1.mp3");
  });

  function fetchQueCaducaYLuegoSirve(statusCaducada = 403) {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: statusCaducada, statusText: "Forbidden" }))
      .mockResolvedValueOnce(new Response("audio-fresco", { headers: { "content-type": "audio/wav" } }));
    vi.stubGlobal("fetch", fetchSpy);
    return fetchSpy;
  }

  it("con 403 en una llamada de Telnyx pide una URL nueva con el leg guardado y sube el audio", async () => {
    mockedCallFindUnique.mockResolvedValue(llamadaTelnyx);
    mockedRecordingFindFirst.mockResolvedValue({ id: "rec_1", providerLegId: "leg_guardado", processingFailedAt: null } as any);
    mockedListRecordingsByCallLegId.mockResolvedValue([{ id: "rec_telnyx", callLegId: "leg_guardado", downloadUrls: { wav: URL_NUEVA } }]);
    const fetchSpy = fetchQueCaducaYLuegoSirve();

    await processRecordingJob({ ...payload, externalUrl: URL_CADUCADA });

    expect(mockedListRecordingsByCallLegId).toHaveBeenCalledWith("leg_guardado");
    expect(String(fetchSpy.mock.calls[1][0])).toBe(URL_NUEVA);
    expect(mockedUploadRecording).toHaveBeenCalledWith("recordings/biz_1/call_1.mp3", expect.anything(), "audio/wav", undefined);
    expect(mockedRecordingUpdate).toHaveBeenLastCalledWith({
      where: { callId: "call_1" },
      data: { storageKey: "recordings/biz_1/call_1.mp3", storageUrl: "https://r2.example/recordings/biz_1/call_1.mp3" },
    });
  });

  it("sin leg guardado (grabación anterior a esta versión) lo rescata de la ruta de la URL y lo persiste", async () => {
    mockedCallFindUnique.mockResolvedValue(llamadaTelnyx);
    mockedRecordingFindFirst.mockResolvedValue({ id: "rec_1", providerLegId: null, processingFailedAt: null } as any);
    mockedListRecordingsByCallLegId.mockResolvedValue([{ id: "rec_telnyx", downloadUrls: { mp3: URL_NUEVA } }]);
    fetchQueCaducaYLuegoSirve();

    await processRecordingJob({ ...payload, externalUrl: URL_CADUCADA });

    expect(mockedListRecordingsByCallLegId).toHaveBeenCalledWith("3b49f1fa-b068-11f1-afd7-02420aef8da1");
    expect(mockedRecordingUpdate).toHaveBeenCalledWith({
      where: { callId: "call_1" },
      data: { providerLegId: "3b49f1fa-b068-11f1-afd7-02420aef8da1", externalUrl: URL_NUEVA },
    });
    expect(mockedUploadRecording).toHaveBeenCalled();
  });

  it("si Telnyx ya no tiene la grabación, la marca irrecuperable y descarta la tarea", async () => {
    mockedCallFindUnique.mockResolvedValue(llamadaTelnyx);
    mockedRecordingFindFirst.mockResolvedValue({ id: "rec_1", providerLegId: "leg_1", processingFailedAt: null } as any);
    mockedListRecordingsByCallLegId.mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403, statusText: "Forbidden" })));

    await expect(processRecordingJob({ ...payload, externalUrl: URL_CADUCADA })).rejects.toBeInstanceOf(PermanentJobError);

    expect(mockedRecordingUpdate).toHaveBeenCalledWith({
      where: { callId: "call_1" },
      data: { processingFailedAt: expect.any(Date), processingError: expect.stringContaining("403") },
    });
    expect(mockedUploadRecording).not.toHaveBeenCalled();
  });

  it("una llamada de Retell con 404 no tiene a quién pedir otra URL: irrecuperable", async () => {
    mockedCallFindUnique.mockResolvedValue({ id: "call_1", businessId: "biz_1", voiceProvider: "retell" } as any);
    mockedRecordingFindFirst.mockResolvedValue({ id: "rec_1", providerLegId: null, processingFailedAt: null } as any);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404, statusText: "Not Found" })));

    await expect(processRecordingJob({ ...payload, externalUrl: "https://retell.example/rec.mp3" })).rejects.toBeInstanceOf(PermanentJobError);

    expect(mockedListRecordingsByCallLegId).not.toHaveBeenCalled();
    expect(mockedRecordingUpdate).toHaveBeenCalledWith({
      where: { callId: "call_1" },
      data: { processingFailedAt: expect.any(Date), processingError: expect.stringContaining("404") },
    });
  });

  it("una grabación de Telnyx cuya URL no lleva el leg y sin leg guardado también es irrecuperable", async () => {
    mockedCallFindUnique.mockResolvedValue(llamadaTelnyx);
    mockedRecordingFindFirst.mockResolvedValue({ id: "rec_1", providerLegId: null, processingFailedAt: null } as any);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403, statusText: "Forbidden" })));

    await expect(processRecordingJob({ ...payload, externalUrl: "https://cdn.telnyx.example/sin-leg.wav" })).rejects.toBeInstanceOf(PermanentJobError);

    expect(mockedListRecordingsByCallLegId).not.toHaveBeenCalled();
  });

  it("no vuelve a preguntar a Telnyx por una grabación ya marcada como irrecuperable", async () => {
    mockedCallFindUnique.mockResolvedValue(llamadaTelnyx);
    mockedRecordingFindFirst.mockResolvedValue({ id: "rec_1", providerLegId: "leg_1", processingFailedAt: new Date() } as any);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(processRecordingJob({ ...payload, externalUrl: URL_CADUCADA })).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockedListRecordingsByCallLegId).not.toHaveBeenCalled();
  });
});
