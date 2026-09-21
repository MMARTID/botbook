import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { enlazarReservaModificada } from "../../../src/modules/bookings/reservaModificada.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: { booking: { findFirst: vi.fn(), update: vi.fn() } },
}));

const findFirst = vi.mocked(prisma.booking.findFirst);
const update = vi.mocked(prisma.booking.update);

const conversacion = {
  id: "call_chat",
  startedAt: new Date("2026-09-21T12:50:00Z"),
  fromNumber: "+34691325557",
};

describe("enlazarReservaModificada", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enlaza la cita que el mismo cliente canceló en esta conversación", async () => {
    findFirst.mockResolvedValue({ id: "booking_vieja" } as any);
    update.mockResolvedValue({} as any);

    const enlazada = await enlazarReservaModificada({
      businessId: "biz_1",
      nuevaReservaId: "booking_nueva",
      conversacion,
    });

    expect(enlazada).toBe("booking_vieja");
    const where = findFirst.mock.calls[0][0]?.where as any;
    expect(where.isCancelled).toBe(true);
    expect(where.cancelledBy).toEqual({ in: ["client_voice", "client_chat"] });
    expect(where.cancelledAt).toEqual({ gte: conversacion.startedAt });
    expect(where.rescheduledToId).toBeNull();
    expect(where.id).toEqual({ not: "booking_nueva" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "booking_vieja" },
      data: { rescheduledToId: "booking_nueva" },
    });
  });

  it("no enlaza nada si no hay cancelación reciente del cliente", async () => {
    findFirst.mockResolvedValue(null);

    const enlazada = await enlazarReservaModificada({
      businessId: "biz_1",
      nuevaReservaId: "booking_nueva",
      conversacion,
    });

    expect(enlazada).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("sin ningún teléfono con el que identificar al cliente no busca siquiera", async () => {
    const enlazada = await enlazarReservaModificada({
      businessId: "biz_1",
      nuevaReservaId: "booking_nueva",
      conversacion: { ...conversacion, fromNumber: null },
    });

    expect(enlazada).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
