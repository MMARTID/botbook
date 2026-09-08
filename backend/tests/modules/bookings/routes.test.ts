import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { bookingSettingsRoutes } from "../../../src/modules/bookings/routes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";
import { syncAgentToRetell } from "../../../src/lib/agentBootstrap.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    agent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    service: {
      create: vi.fn(),
    },
    professional: {
      create: vi.fn(),
    },
  },
}));

vi.mock("../../../src/lib/agentBootstrap.js", () => ({
  syncAgentToRetell: vi.fn(),
}));

const { mockRedis } = vi.hoisted(() => ({
  mockRedis: {
    del: vi.fn().mockResolvedValue(1),
    pipeline: vi.fn(() => ({
      del: vi.fn(),
      exec: vi.fn().mockResolvedValue([]),
    })),
  },
}));

vi.mock("../../../src/lib/redis.js", () => ({
  getRedis: () => mockRedis,
}));

const mockedBusinessUpdate = vi.mocked(prisma.business.update);
const mockedGetBookingSettingsBusinessFindUnique = vi.mocked(prisma.business.findUnique);

describe("PATCH /bookings/ (capacidad) — invalidación de caché (hallazgo #16 de la auditoría)", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedis.del.mockResolvedValue(1);
    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(bookingSettingsRoutes);
  });

  it("invalida voice_config:<businessId> aunque el negocio no tenga ningún agente Vapi (el caso normal, Retell)", async () => {
    mockedBusinessUpdate.mockResolvedValue({ id: "biz_1" } as any);
    mockedGetBookingSettingsBusinessFindUnique.mockResolvedValue({
      bookingCapacity: 3,
      services: [],
      professionals: [],
    } as any);

    const response = await fastify.inject({
      method: "PATCH",
      url: "/",
      payload: { bookingCapacity: 3 },
    });

    expect(response.statusCode).toBe(200);
    // Antes, sin ningún agente con vapiAssistantId (el caso de cualquier
    // negocio Retell hoy), la función salía sin invalidar nada en absoluto.
    expect(mockRedis.del).toHaveBeenCalledWith("voice_config:biz_1");
  });
});
