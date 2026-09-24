import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";
import {
  guardarEleccion,
  negociosDelCliente,
  resolverNegocioDelCliente,
} from "../../../src/modules/whatsapp/tenantDelCliente.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    booking: { findMany: vi.fn() },
    sentMessage: { findUnique: vi.fn() },
    inboundMessage: { findFirst: vi.fn() },
  },
}));

vi.mock("../../../src/lib/redis.js", () => ({
  getRedis: vi.fn(),
}));

const mockedBookingFindMany = vi.mocked(prisma.booking.findMany);
const mockedSentMessage = vi.mocked(prisma.sentMessage.findUnique);
const mockedInbound = vi.mocked(prisma.inboundMessage.findFirst);
const redis = { get: vi.fn(), set: vi.fn() };

const TELEFONO = "+34600111222";
const PELUQUERIA = { id: "biz_pelu", name: "Peluquería Alhambra" };
const BARBERIA = { id: "biz_barb", name: "Barbería El Corte Clásico" };

function conReservasEn(...negocios: Array<{ id: string; name: string }>) {
  mockedBookingFindMany.mockResolvedValue(
    negocios.map((business) => ({ call: { business } })) as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRedis).mockReturnValue(redis as never);
  redis.get.mockResolvedValue(null);
  redis.set.mockResolvedValue("OK");
  mockedSentMessage.mockResolvedValue(null);
  mockedInbound.mockResolvedValue(null);
});

describe("negociosDelCliente", () => {
  it("devuelve cada negocio una sola vez aunque tenga varias citas", async () => {
    conReservasEn(PELUQUERIA, BARBERIA, PELUQUERIA);

    expect(await negociosDelCliente(TELEFONO)).toEqual([PELUQUERIA, BARBERIA]);
  });
});

describe("resolverNegocioDelCliente", () => {
  it("con un solo negocio no pregunta nada", async () => {
    conReservasEn(PELUQUERIA);

    expect(await resolverNegocioDelCliente(TELEFONO, null)).toEqual({
      tipo: "unico",
      businessId: PELUQUERIA.id,
      via: "reservas",
    });
  });

  // El fallo que motivó el cambio: antes se cogía la reserva más reciente y
  // el mensaje podía acabar en la recepcionista del negocio equivocado.
  it("con citas en dos negocios y ninguna pista, es ambiguo", async () => {
    conReservasEn(PELUQUERIA, BARBERIA);

    expect(await resolverNegocioDelCliente(TELEFONO, null)).toEqual({
      tipo: "ambiguo",
      candidatos: [PELUQUERIA, BARBERIA],
    });
  });

  it("el mensaje al que responde manda sobre todo lo demás", async () => {
    mockedSentMessage.mockResolvedValue({
      businessId: BARBERIA.id,
      toNumber: TELEFONO,
    } as never);

    expect(await resolverNegocioDelCliente(TELEFONO, "wamid_1")).toEqual({
      tipo: "unico",
      businessId: BARBERIA.id,
      via: "contexto",
    });
    expect(mockedBookingFindMany).not.toHaveBeenCalled();
  });

  it("ignora un contexto cuyo envío fue a OTRO móvil", async () => {
    mockedSentMessage.mockResolvedValue({
      businessId: BARBERIA.id,
      toNumber: "+34699999999",
    } as never);
    conReservasEn(PELUQUERIA, BARBERIA);

    expect(await resolverNegocioDelCliente(TELEFONO, "wamid_1")).toMatchObject({
      tipo: "ambiguo",
    });
  });

  it("respeta lo que el cliente eligió cuando se le preguntó", async () => {
    conReservasEn(PELUQUERIA, BARBERIA);
    redis.get.mockResolvedValue(BARBERIA.id);

    expect(await resolverNegocioDelCliente(TELEFONO, null)).toEqual({
      tipo: "unico",
      businessId: BARBERIA.id,
      via: "eleccion",
    });
  });

  // Defensa: una clave vieja no puede colar un negocio que ya no es suyo.
  it("descarta una elección guardada de un negocio en el que ya no tiene citas", async () => {
    conReservasEn(PELUQUERIA, BARBERIA);
    redis.get.mockResolvedValue("biz_de_otro");

    expect(await resolverNegocioDelCliente(TELEFONO, null)).toMatchObject({
      tipo: "ambiguo",
    });
  });

  it("mantiene el negocio de la conversación en curso", async () => {
    conReservasEn(PELUQUERIA, BARBERIA);
    mockedInbound.mockResolvedValue({ businessId: BARBERIA.id } as never);

    expect(await resolverNegocioDelCliente(TELEFONO, null)).toEqual({
      tipo: "unico",
      businessId: BARBERIA.id,
      via: "conversacion",
    });
  });

  it("sin reservas no hay negocio", async () => {
    conReservasEn();

    expect(await resolverNegocioDelCliente(TELEFONO, null)).toEqual({
      tipo: "ninguno",
    });
  });

  it("si Redis no responde se sigue sin romper", async () => {
    conReservasEn(PELUQUERIA);
    redis.get.mockRejectedValue(new Error("Redis caído"));

    expect(await resolverNegocioDelCliente(TELEFONO, null)).toMatchObject({
      tipo: "unico",
      businessId: PELUQUERIA.id,
    });
    await expect(guardarEleccion(TELEFONO, PELUQUERIA.id)).resolves.toBeUndefined();
  });
});
