import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { callsRoutes } from "../../../src/modules/calls/routes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { getSignedRecordingUrl } from "../../../src/lib/storage.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    call: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
    },
    service: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../../../src/lib/storage.js", () => ({
  getSignedRecordingUrl: vi.fn(),
}));

const mockedCallFindUnique = vi.mocked(prisma.call.findUnique);
const mockedGetSignedRecordingUrl = vi.mocked(getSignedRecordingUrl);

describe("GET /business/me/calls/:id", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(callsRoutes);
  });

  it("firma la storageUrl de R2 en vez de devolver la URL de API sin firmar (hallazgo #15 de la auditoría)", async () => {
    mockedCallFindUnique.mockResolvedValue({
      id: "call_1",
      businessId: "biz_1",
      booking: null,
      recording: {
        id: "rec_1",
        storageKey: "recordings/call_1.mp3",
        storageUrl: "https://r2.example/unsigned-api-url",
      },
    } as any);
    mockedGetSignedRecordingUrl.mockResolvedValue("https://r2.example/signed?sig=abc");

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/calls/call_1",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.recording.storageUrl).toBe("https://r2.example/signed?sig=abc");
    expect(mockedGetSignedRecordingUrl).toHaveBeenCalledWith("recordings/call_1.mp3");
  });

  it("cae a null si falla la firma, sin romper la respuesta", async () => {
    mockedCallFindUnique.mockResolvedValue({
      id: "call_1",
      businessId: "biz_1",
      booking: null,
      recording: { id: "rec_1", storageKey: "recordings/call_1.mp3", storageUrl: "unsigned" },
    } as any);
    mockedGetSignedRecordingUrl.mockRejectedValue(new Error("R2 down"));

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/calls/call_1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().recording.storageUrl).toBeNull();
  });

  it("no toca la grabación si no hay storageKey (todavía solo en Retell)", async () => {
    mockedCallFindUnique.mockResolvedValue({
      id: "call_1",
      businessId: "biz_1",
      booking: null,
      recording: { id: "rec_1", storageKey: null, storageUrl: null },
    } as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/calls/call_1",
    });

    expect(response.statusCode).toBe(200);
    expect(mockedGetSignedRecordingUrl).not.toHaveBeenCalled();
  });

  it("no expone ni firma una grabación retirada lógicamente", async () => {
    mockedCallFindUnique.mockResolvedValue({
      id: "call_1",
      businessId: "biz_1",
      booking: null,
      recording: {
        id: "rec_1",
        storageKey: "recordings/call_1.mp3",
        storageUrl: "https://r2.example/unsigned-api-url",
        deletedAt: new Date("2026-09-11T12:00:00.000Z"),
      },
    } as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/business/me/calls/call_1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().recording).toBeNull();
    expect(mockedGetSignedRecordingUrl).not.toHaveBeenCalled();
  });
});
