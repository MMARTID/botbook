import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { bookingSettingsRoutes } from "../../../src/modules/bookings/routes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";
import { syncAgentToRetell } from "../../../src/lib/agentBootstrap.js";

const {
  mockTransactionProfessionalServiceDeleteMany,
  mockTransactionProfessionalUpdate,
  mockTransactionServiceUpdate,
} = vi.hoisted(() => ({
  mockTransactionProfessionalServiceDeleteMany: vi.fn(),
  mockTransactionProfessionalUpdate: vi.fn(),
  mockTransactionServiceUpdate: vi.fn(),
}));

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
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    professional: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    professionalService: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(async (operation) =>
      operation({
        service: { update: mockTransactionServiceUpdate },
        professional: { update: mockTransactionProfessionalUpdate },
        professionalService: {
          deleteMany: mockTransactionProfessionalServiceDeleteMany,
          createMany: vi.fn(),
        },
      })
    ),
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
const mockedServiceFindFirst = vi.mocked(prisma.service.findFirst);
const mockedProfessionalFindFirst = vi.mocked(prisma.professional.findFirst);

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

  it("recupera un servicio solo dentro del negocio autenticado", async () => {
    mockedServiceFindFirst.mockResolvedValue({
      id: "service_1",
      businessId: "biz_1",
      name: "Corte",
      durationMinutes: 30,
      priceCents: 1800,
      active: true,
    } as any);

    const response = await fastify.inject({
      method: "GET",
      url: "/services/service_1",
    });

    expect(response.statusCode).toBe(200);
    expect(mockedServiceFindFirst).toHaveBeenCalledWith({
      where: { id: "service_1", businessId: "biz_1", deletedAt: null },
    });
  });

  it("retira un servicio de forma lógica y borra solo sus enlaces auxiliares", async () => {
    mockedServiceFindFirst.mockResolvedValue({
      id: "service_1",
      businessId: "biz_1",
      name: "Corte",
    } as any);
    mockTransactionServiceUpdate.mockResolvedValue({ id: "service_1" });

    const response = await fastify.inject({
      method: "DELETE",
      url: "/services/service_1",
    });

    expect(response.statusCode).toBe(204);
    expect(mockTransactionProfessionalServiceDeleteMany).toHaveBeenCalledWith({
      where: { serviceId: "service_1" },
    });
    expect(mockTransactionServiceUpdate).toHaveBeenCalledWith({
      where: { id: "service_1" },
      data: { active: false, deletedAt: expect.any(Date) },
    });
    expect(syncAgentToRetell).toHaveBeenCalledWith(
      "biz_1",
      prisma
    );
  });

  it("retira un profesional de forma lógica y no permite tratarlo como otro negocio", async () => {
    mockedProfessionalFindFirst.mockResolvedValue({
      id: "professional_1",
      businessId: "biz_1",
      name: "Ana",
    } as any);
    mockTransactionProfessionalUpdate.mockResolvedValue({ id: "professional_1" });

    const response = await fastify.inject({
      method: "DELETE",
      url: "/professionals/professional_1",
    });

    expect(response.statusCode).toBe(204);
    expect(mockedProfessionalFindFirst).toHaveBeenCalledWith({
      where: {
        id: "professional_1",
        businessId: "biz_1",
        deletedAt: null,
      },
    });
    expect(mockTransactionProfessionalUpdate).toHaveBeenCalledWith({
      where: { id: "professional_1" },
      data: { active: false, deletedAt: expect.any(Date) },
    });
  });
});
