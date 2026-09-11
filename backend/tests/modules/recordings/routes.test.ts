import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { recordingsRoutes } from "../../../src/modules/recordings/routes.js";
import { prisma } from "../../../src/lib/prisma.js";
import {
  deleteStorageObject,
  getSignedRecordingUrl,
} from "../../../src/lib/storage.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    recording: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../../src/lib/storage.js", () => ({
  getSignedRecordingUrl: vi.fn(),
  deleteStorageObject: vi.fn(),
}));

const mockedFindFirst = vi.mocked(prisma.recording.findFirst);
const mockedGetSignedRecordingUrl = vi.mocked(getSignedRecordingUrl);
const mockedDeleteStorageObject = vi.mocked(deleteStorageObject);
const mockedUpdate = vi.mocked(prisma.recording.update);

const FULL_BUSINESS_ROW = {
  id: "biz_1",
  name: "Peluquería Test",
  googleRefreshToken: "SECRET_GOOGLE_REFRESH_TOKEN",
  outlookRefreshToken: "SECRET_OUTLOOK_REFRESH_TOKEN",
  stripeCustomerId: "cus_secret",
};

/**
 * Simula el comportamiento real de Prisma respetando el `select` que pida la
 * query en `call.include.business` — así el test detecta tanto una query mal
 * escrita (pide `business: true`) como un handler que igualmente reenvía
 * campos fuera de lo pedido.
 */
function projectBusiness(query: any): Record<string, unknown> {
  const businessArg = query?.include?.call?.include?.business;
  if (businessArg === true) {
    return FULL_BUSINESS_ROW;
  }
  const select = businessArg?.select;
  if (!select) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(FULL_BUSINESS_ROW).filter(([key]) => select[key])
  );
}

function mockRecordingRespectingSelect(businessId = "biz_1") {
  mockedFindFirst.mockImplementation(async (query: any) => {
    // La ruta impone el tenant directamente en la consulta. El doble debe
    // comportarse como Prisma: una fila de otro negocio no llega al handler.
    if (query?.where?.call?.businessId !== businessId) {
      return null;
    }
    return {
      id: "rec_1",
      callId: "call_1",
      storageKey: null,
      storageUrl: null,
      call: {
        id: "call_1",
        businessId,
        agent: { id: "agent_1" },
        business: projectBusiness(query),
      },
    } as any;
  });
}

describe("recordingsRoutes", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(recordingsRoutes);
  });

  describe("GET /calls/:callId/recording", () => {
    it("nunca incluye googleRefreshToken/outlookRefreshToken/stripeCustomerId en la respuesta", async () => {
      mockRecordingRespectingSelect();
      mockedGetSignedRecordingUrl.mockResolvedValue("https://signed.example/rec.mp3");

      const response = await fastify.inject({
        method: "GET",
        url: "/calls/call_1/recording",
      });

      expect(response.statusCode).toBe(200);
      const raw = JSON.stringify(response.json());
      expect(raw).not.toContain("SECRET_GOOGLE_REFRESH_TOKEN");
      expect(raw).not.toContain("SECRET_OUTLOOK_REFRESH_TOKEN");
      expect(raw).not.toContain("cus_secret");
      expect(response.json().call.business).toEqual({ id: "biz_1", name: "Peluquería Test" });
    });
  });

  describe("GET /recordings/:id", () => {
    it("nunca incluye googleRefreshToken/outlookRefreshToken/stripeCustomerId en la respuesta", async () => {
      mockRecordingRespectingSelect();
      mockedGetSignedRecordingUrl.mockResolvedValue("https://signed.example/rec.mp3");

      const response = await fastify.inject({
        method: "GET",
        url: "/recordings/rec_1",
      });

      expect(response.statusCode).toBe(200);
      const raw = JSON.stringify(response.json());
      expect(raw).not.toContain("SECRET_GOOGLE_REFRESH_TOKEN");
      expect(raw).not.toContain("SECRET_OUTLOOK_REFRESH_TOKEN");
      expect(raw).not.toContain("cus_secret");
      expect(response.json().call.business).toEqual({ id: "biz_1", name: "Peluquería Test" });
    });

    it("devuelve 404 si la grabación pertenece a otro negocio", async () => {
      mockRecordingRespectingSelect("biz_otro");

      const response = await fastify.inject({
        method: "GET",
        url: "/recordings/rec_1",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /recordings/:id", () => {
    it("hace borrado lógico y no destruye el audio histórico", async () => {
      mockRecordingRespectingSelect();
      mockedUpdate.mockResolvedValue({ id: "rec_1" } as any);

      const response = await fastify.inject({
        method: "DELETE",
        url: "/recordings/rec_1",
      });

      expect(response.statusCode).toBe(204);
      expect(mockedUpdate).toHaveBeenCalledWith({
        where: { id: "rec_1" },
        data: { deletedAt: expect.any(Date) },
      });
      expect(mockedDeleteStorageObject).not.toHaveBeenCalled();
    });
  });
});
