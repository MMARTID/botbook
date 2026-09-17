import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { bookingSettingsRoutes } from "../../../src/modules/bookings/routes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";
import { syncAgentToRetell } from "../../../src/lib/agentBootstrap.js";

const {
  mockTransactionProfessionalServiceDeleteMany,
  mockTransactionProfessionalServiceCreateMany,
  mockTransactionProfessionalUpdate,
  mockTransactionServiceUpdate,
  mockTransactionProfessionalCreate,
} = vi.hoisted(() => ({
  mockTransactionProfessionalServiceDeleteMany: vi.fn(),
  mockTransactionProfessionalServiceCreateMany: vi.fn(),
  mockTransactionProfessionalUpdate: vi.fn(),
  mockTransactionServiceUpdate: vi.fn(),
  mockTransactionProfessionalCreate: vi.fn(),
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
      count: vi.fn(),
    },
    professionalService: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    // La comprobación del cupo del plan y la creación/reactivación ocurren
    // dentro de la MISMA transacción serializable, así que el cliente de la
    // transacción tiene que ofrecer también business.findUnique y
    // professional.count/create.
    $transaction: vi.fn(async (operation) =>
      operation({
        business: { findUnique: vi.mocked(prisma.business.findUnique) },
        service: { update: mockTransactionServiceUpdate },
        professional: {
          update: mockTransactionProfessionalUpdate,
          create: mockTransactionProfessionalCreate,
          count: vi.mocked(prisma.professional.count),
        },
        professionalService: {
          deleteMany: mockTransactionProfessionalServiceDeleteMany,
          createMany: mockTransactionProfessionalServiceCreateMany,
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

  it("invalida voice_config:<businessId> al actualizar la configuración de reservas", async () => {
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

describe("POST /professionals — límite de profesionales por plan", () => {
  let fastify: ReturnType<typeof Fastify>;
  const mockedProfessionalCount = vi.mocked(prisma.professional.count);
  const mockedProfessionalCreate = vi.mocked(prisma.professional.create);
  const mockedServiceCount = vi.mocked(prisma.service.count);

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedis.del.mockResolvedValue(1);
    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(bookingSettingsRoutes);
  });

  it("devuelve 403 con PLAN_LIMIT_PROFESSIONALS cuando el plan Inicio ya tiene 3 activos", async () => {
    mockedGetBookingSettingsBusinessFindUnique.mockResolvedValue({
      plan: "basic",
      stripePriceId: null,
    } as any);
    mockedProfessionalCount.mockResolvedValue(3);

    const response = await fastify.inject({
      method: "POST",
      url: "/professionals",
      payload: { name: "Cuarto", active: true, serviceIds: [] },
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.code).toBe("PLAN_LIMIT_PROFESSIONALS");
    expect(body.planId).toBe("inicio");
    expect(body.limit).toBe(3);
    expect(mockedProfessionalCreate).not.toHaveBeenCalled();
  });

  it("permite crear el décimo profesional en Pro pero rechaza el undécimo", async () => {
    mockedGetBookingSettingsBusinessFindUnique.mockResolvedValue({
      plan: "pro",
      stripePriceId: null,
    } as any);
    mockedServiceCount.mockResolvedValue(0);
    mockedProfessionalCount.mockResolvedValue(9);
    mockTransactionProfessionalCreate.mockResolvedValue({
      id: "professional_10",
      name: "Décimo",
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      serviceLinks: [],
    } as any);

    const allowed = await fastify.inject({
      method: "POST",
      url: "/professionals",
      payload: { name: "Décimo", active: true, serviceIds: [] },
    });
    expect(allowed.statusCode).toBe(201);

    mockedProfessionalCount.mockResolvedValue(10);
    const rejected = await fastify.inject({
      method: "POST",
      url: "/professionals",
      payload: { name: "Undécimo", active: true, serviceIds: [] },
    });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json().limit).toBe(10);
  });

  it("no aplica límite al plan Scale", async () => {
    mockedGetBookingSettingsBusinessFindUnique.mockResolvedValue({
      plan: "enterprise",
      stripePriceId: null,
    } as any);
    mockTransactionProfessionalCreate.mockResolvedValue({
      id: "professional_50",
      name: "Sin límite",
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      serviceLinks: [],
    } as any);

    const response = await fastify.inject({
      method: "POST",
      url: "/professionals",
      payload: { name: "Sin límite", active: true, serviceIds: [] },
    });

    expect(response.statusCode).toBe(201);
    expect(mockedProfessionalCount).not.toHaveBeenCalled();
  });

  it("bloquea también la reactivación de un profesional cuando el cupo está lleno", async () => {
    mockedProfessionalFindFirst.mockResolvedValue({
      id: "professional_4",
      businessId: "biz_1",
      name: "Inactivo",
      active: false,
    } as any);
    mockedGetBookingSettingsBusinessFindUnique.mockResolvedValue({
      plan: "basic",
      stripePriceId: null,
    } as any);
    mockedProfessionalCount.mockResolvedValue(3);

    const response = await fastify.inject({
      method: "PATCH",
      url: "/professionals/professional_4",
      payload: { active: true },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("PLAN_LIMIT_PROFESSIONALS");
  });
});

// Tres niveles por profesional y servicio (17-09-2026): el panel manda un
// mapa serviceId → especialista | normal | no_sugerir; solo los dos extremos
// se guardan como fila. `serviceIds` sigue aceptándose como legado.
describe("profesionales — niveles por servicio", () => {
  let fastify: ReturnType<typeof Fastify>;
  const mockedServiceCount = vi.mocked(prisma.service.count);
  const mockedProfessionalCount = vi.mocked(prisma.professional.count);

  function profesionalGuardado(serviceLinks: Array<{ serviceId: string; level: string }>) {
    return {
      id: "prof_1",
      name: "Marta",
      active: true,
      createdAt: new Date("2026-09-17T10:00:00Z"),
      updatedAt: new Date("2026-09-17T10:00:00Z"),
      serviceLinks,
    } as any;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedis.del.mockResolvedValue(1);
    mockedGetBookingSettingsBusinessFindUnique.mockResolvedValue({ plan: "pro", stripePriceId: null } as any);
    mockedProfessionalCount.mockResolvedValue(0);
    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(bookingSettingsRoutes);
  });

  it("al crear, guarda fila solo para especialista y no sugerir, y valida también los ids 'normal'", async () => {
    mockedServiceCount.mockResolvedValue(3);
    mockTransactionProfessionalCreate.mockResolvedValue(
      profesionalGuardado([
        { serviceId: "corte", level: "ESPECIALISTA" },
        { serviceId: "color", level: "NO_SUGERIR" },
      ])
    );

    const response = await fastify.inject({
      method: "POST",
      url: "/professionals",
      payload: { name: "Marta", serviceLevels: { corte: "especialista", color: "no_sugerir", mechas: "normal" } },
    });

    expect(response.statusCode).toBe(201);
    // Los tres ids tienen que ser del negocio, aunque "mechas" no genere fila.
    expect(mockedServiceCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["corte", "color", "mechas"] } }) })
    );
    expect(mockTransactionProfessionalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          serviceLinks: {
            create: [
              { serviceId: "corte", level: "ESPECIALISTA" },
              { serviceId: "color", level: "NO_SUGERIR" },
            ],
          },
        }),
      })
    );
    expect(response.json()).toMatchObject({
      serviceLevels: { corte: "especialista", color: "no_sugerir" },
      // Legado: solo los especialistas.
      serviceIds: ["corte"],
    });
  });

  it("el payload legado con serviceIds sigue funcionando: cada id es especialista", async () => {
    mockedServiceCount.mockResolvedValue(1);
    mockTransactionProfessionalCreate.mockResolvedValue(profesionalGuardado([{ serviceId: "corte", level: "ESPECIALISTA" }]));

    const response = await fastify.inject({
      method: "POST",
      url: "/professionals",
      payload: { name: "Marta", serviceIds: ["corte", "corte"] },
    });

    expect(response.statusCode).toBe(201);
    // Un id repetido ya no hace saltar la clave primaria compuesta.
    expect(mockTransactionProfessionalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ serviceLinks: { create: [{ serviceId: "corte", level: "ESPECIALISTA" }] } }),
      })
    );
  });

  it("al editar, serviceLevels reemplaza todos los vínculos; {} los deja todos en 'lo hace'", async () => {
    mockedProfessionalFindFirst.mockResolvedValue({ id: "prof_1", businessId: "biz_1", active: true } as any);
    mockedServiceCount.mockResolvedValue(0);
    mockTransactionProfessionalUpdate.mockResolvedValue(profesionalGuardado([]));

    const response = await fastify.inject({
      method: "PATCH",
      url: "/professionals/prof_1",
      payload: { serviceLevels: {} },
    });

    expect(response.statusCode).toBe(200);
    expect(mockTransactionProfessionalServiceDeleteMany).toHaveBeenCalledWith({ where: { professionalId: "prof_1" } });
    expect(mockTransactionProfessionalServiceCreateMany).not.toHaveBeenCalled();
    expect(response.json()).toMatchObject({ serviceLevels: {}, serviceIds: [] });
  });

  it("al editar con niveles, crea las filas con su nivel", async () => {
    mockedProfessionalFindFirst.mockResolvedValue({ id: "prof_1", businessId: "biz_1", active: true } as any);
    mockedServiceCount.mockResolvedValue(2);
    mockTransactionProfessionalUpdate.mockResolvedValue(
      profesionalGuardado([{ serviceId: "color", level: "NO_SUGERIR" }, { serviceId: "corte", level: "ESPECIALISTA" }])
    );

    const response = await fastify.inject({
      method: "PATCH",
      url: "/professionals/prof_1",
      payload: { serviceLevels: { corte: "especialista", color: "no_sugerir" } },
    });

    expect(response.statusCode).toBe(200);
    expect(mockTransactionProfessionalServiceCreateMany).toHaveBeenCalledWith({
      data: [
        { professionalId: "prof_1", serviceId: "corte", level: "ESPECIALISTA" },
        { professionalId: "prof_1", serviceId: "color", level: "NO_SUGERIR" },
      ],
    });
  });

  it("rechaza con 400 un nivel que no existe", async () => {
    const response = await fastify.inject({
      method: "POST",
      url: "/professionals",
      payload: { name: "Marta", serviceLevels: { corte: "principiante" } },
    });

    expect(response.statusCode).toBe(400);
    expect(mockTransactionProfessionalCreate).not.toHaveBeenCalled();
  });

  it("una fila antigua sin nivel se lee como especialista (era la casilla 'especialidad')", async () => {
    mockedProfessionalFindFirst.mockResolvedValue(profesionalGuardado([{ serviceId: "corte" } as any]));

    const response = await fastify.inject({ method: "GET", url: "/professionals/prof_1" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ serviceLevels: { corte: "especialista" }, serviceIds: ["corte"] });
  });
});
