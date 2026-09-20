import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import {
  ACCION_CADUCA_MS,
  accionConocida,
  decidirPropuesta,
  registrarPropuesta,
} from "../../../src/modules/gestor/acciones.js";

vi.mock("../../../src/lib/bookingLock.js", () => ({
  acquireLock: vi.fn(async () => "token"),
  releaseLock: vi.fn(async () => undefined),
}));
vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    lead: { findFirst: vi.fn(), updateMany: vi.fn() },
    service: { findMany: vi.fn() },
    ownerPendingAction: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const mockedLeadFindFirst = vi.mocked(prisma.lead.findFirst);
const mockedLeadUpdateMany = vi.mocked(prisma.lead.updateMany);
const mockedServiceFindMany = vi.mocked(prisma.service.findMany);
const mockedCreate = vi.mocked(prisma.ownerPendingAction.create);
const mockedFindFirst = vi.mocked(prisma.ownerPendingAction.findFirst);
const mockedUpdateMany = vi.mocked(prisma.ownerPendingAction.updateMany);
const mockedUpdate = vi.mocked(prisma.ownerPendingAction.update);

const CTX = {
  businessId: "biz_1",
  timezone: "Europe/Madrid",
  conversationId: "conv_1",
  inboundMessageId: "in_1",
};

const LEAD = {
  id: "lead_1",
  resolvedAt: null,
  data: {
    clientName: "Elena",
    startDateTime: "2026-09-14T15:00:00.000Z",
    serviceIds: ["svc_1"],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mockedServiceFindMany.mockResolvedValue([
    { id: "svc_1", name: "Corte" },
  ] as never);
  mockedUpdateMany.mockResolvedValue({ count: 0 });
  mockedUpdate.mockResolvedValue({} as never);
});

describe("registrarPropuesta", () => {
  it("solo conoce resolver_pendiente", () => {
    expect(accionConocida("resolver_pendiente")).toBe(true);
    expect(accionConocida("cancelar_cita")).toBe(false);
    expect(accionConocida("constructor")).toBe(false);
  });

  it("rechaza un tipo desconocido, parámetros inválidos y un resumen vacío sin tocar la BD", async () => {
    expect(
      await registrarPropuesta({
        ...CTX,
        tipo: "borrar_todo",
        parametros: {},
        resumen: "x",
      })
    ).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("borrar_todo"),
    });

    expect(
      await registrarPropuesta({
        ...CTX,
        tipo: "resolver_pendiente",
        parametros: { pendienteId: "lead_1", extra: true },
        resumen: "x",
      })
    ).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("Parámetros no válidos"),
    });

    expect(
      await registrarPropuesta({
        ...CTX,
        tipo: "resolver_pendiente",
        parametros: { pendienteId: "lead_1" },
        resumen: "   ",
      })
    ).toMatchObject({ ok: false, motivo: expect.stringContaining("resumen") });

    expect(mockedLeadFindFirst).not.toHaveBeenCalled();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("rechaza una cita pendiente que no es del negocio o que ya está resuelta", async () => {
    mockedLeadFindFirst.mockResolvedValueOnce(null);
    expect(
      await registrarPropuesta({
        ...CTX,
        tipo: "resolver_pendiente",
        parametros: { pendienteId: "lead_ajeno" },
        resumen: "Doy por resuelta la cita",
      })
    ).toEqual({
      ok: false,
      motivo: "No existe esa cita pendiente en este negocio.",
    });
    expect(mockedLeadFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "lead_ajeno",
          type: "pending_booking",
          call: { businessId: "biz_1" },
        },
      })
    );

    mockedLeadFindFirst.mockResolvedValueOnce({
      ...LEAD,
      resolvedAt: new Date(),
    } as never);
    expect(
      await registrarPropuesta({
        ...CTX,
        tipo: "resolver_pendiente",
        parametros: { pendienteId: "lead_1" },
        resumen: "Doy por resuelta la cita",
      })
    ).toEqual({ ok: false, motivo: "Esa cita pendiente ya está resuelta." });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("guarda la propuesta con 24 h de vida y describe el recurso", async () => {
    mockedLeadFindFirst.mockResolvedValueOnce(LEAD as never);
    mockedCreate.mockResolvedValueOnce({ id: "acc_1" } as never);
    const antes = Date.now();

    const r = await registrarPropuesta({
      ...CTX,
      tipo: "resolver_pendiente",
      parametros: { pendienteId: "lead_1" },
      resumen: "Doy por resuelta la cita pendiente de Elena.",
    });

    expect(r).toMatchObject({
      ok: true,
      accionId: "acc_1",
      descripcion: expect.stringContaining(
        "la cita pendiente de Elena del lunes 14 de septiembre a las 17:00 (Corte)"
      ),
    });
    const data = mockedCreate.mock.calls[0]![0].data as {
      expiresAt: Date;
      tipo: string;
      parametros: unknown;
      conversationId: string;
      inboundMessageId: string;
    };
    expect(data.tipo).toBe("resolver_pendiente");
    expect(data.parametros).toEqual({ pendienteId: "lead_1" });
    expect(data.conversationId).toBe("conv_1");
    expect(data.inboundMessageId).toBe("in_1");
    expect(data.expiresAt.getTime() - antes).toBeGreaterThanOrEqual(
      ACCION_CADUCA_MS - 1000
    );
  });

  it("si la BD falla al guardar devuelve un motivo en vez de lanzar", async () => {
    mockedLeadFindFirst.mockResolvedValueOnce(LEAD as never);
    mockedCreate.mockRejectedValueOnce(new Error("bd caída"));
    expect(
      await registrarPropuesta({
        ...CTX,
        tipo: "resolver_pendiente",
        parametros: { pendienteId: "lead_1" },
        resumen: "Doy por resuelta la cita",
      })
    ).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("No he podido registrar"),
    });
  });
});

describe("decidirPropuesta", () => {
  const FILA = {
    id: "acc_1",
    businessId: "biz_1",
    tipo: "resolver_pendiente",
    parametros: { pendienteId: "lead_1" },
    resumen: "Doy por resuelta la cita pendiente de Elena.",
    expiresAt: new Date(Date.now() + 60_000),
    confirmedAt: null,
    rejectedAt: null,
  };
  const DECISION = {
    accionId: "acc_1",
    businessId: "biz_1",
    timezone: "Europe/Madrid",
    inboundMessageId: "in_2",
  };

  it("no encontrada, ya decidida y caducada no reclaman ni ejecutan", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);
    expect(
      await decidirPropuesta({ ...DECISION, decision: "confirmar" })
    ).toEqual({
      estado: "no_encontrada",
    });

    mockedFindFirst.mockResolvedValueOnce({
      ...FILA,
      confirmedAt: new Date(),
    } as never);
    expect(
      await decidirPropuesta({ ...DECISION, decision: "confirmar" })
    ).toEqual({
      estado: "ya_decidida",
    });

    mockedFindFirst.mockResolvedValueOnce({
      ...FILA,
      expiresAt: new Date(Date.now() - 1000),
    } as never);
    expect(
      await decidirPropuesta({ ...DECISION, decision: "confirmar" })
    ).toEqual({
      estado: "caducada",
    });
    expect(mockedUpdateMany).not.toHaveBeenCalled();
    expect(mockedLeadUpdateMany).not.toHaveBeenCalled();
  });

  it("la propuesta se busca siempre con el negocio del móvil que pulsa", async () => {
    mockedFindFirst.mockResolvedValueOnce(null);
    await decidirPropuesta({ ...DECISION, decision: "confirmar" });
    expect(mockedFindFirst).toHaveBeenCalledWith({
      where: { id: "acc_1", businessId: "biz_1" },
    });
  });

  it("«Cancelar» reclama con rejectedAt y no ejecuta", async () => {
    mockedFindFirst.mockResolvedValueOnce(FILA as never);
    mockedUpdateMany.mockResolvedValueOnce({ count: 1 });
    expect(
      await decidirPropuesta({ ...DECISION, decision: "cancelar" })
    ).toEqual({
      estado: "rechazada",
    });
    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: { id: "acc_1", confirmedAt: null, rejectedAt: null },
      data: { rejectedAt: expect.any(Date) },
    });
    expect(mockedLeadUpdateMany).not.toHaveBeenCalled();
  });

  it("«Confirmar» reclama, ejecuta resolver_pendiente y guarda el resultado", async () => {
    mockedFindFirst.mockResolvedValueOnce(FILA as never);
    mockedUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockedLeadFindFirst.mockResolvedValueOnce(LEAD as never);
    mockedLeadUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockedUpdate.mockResolvedValueOnce({} as never);

    expect(
      await decidirPropuesta({ ...DECISION, decision: "confirmar" })
    ).toEqual({
      estado: "ejecutada",
      mensaje:
        "Hecho: doy por resuelta la cita pendiente de Elena del lunes 14 de septiembre a las 17:00 (Corte).",
    });
    expect(mockedLeadUpdateMany).toHaveBeenCalledWith({
      where: { id: "lead_1", resolvedAt: null },
      data: expect.objectContaining({
        resolvedAt: expect.any(Date),
        data: expect.objectContaining({
          clientName: "Elena",
          resolvedBy: "owner_chat",
          resolvedFromInboundMessageId: "in_2",
          resolvedFromActionId: "acc_1",
        }),
      }),
    });
    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { id: "acc_1" },
      data: expect.objectContaining({
        executedAt: expect.any(Date),
        error: null,
      }),
    });
  });

  it("si no consigue el lock del negocio no ejecuta y pide esperar", async () => {
    mockedFindFirst.mockResolvedValueOnce(FILA as never);
    mockedUpdateMany.mockResolvedValueOnce({ count: 1 });
    const { acquireLock } = await import("../../../src/lib/bookingLock.js");
    vi.mocked(acquireLock).mockResolvedValueOnce(null);
    const r = await decidirPropuesta({ ...DECISION, decision: "confirmar" });
    expect(r).toMatchObject({
      estado: "fallida",
      mensaje: expect.stringContaining("otra acción"),
    });
    expect(mockedLeadUpdateMany).not.toHaveBeenCalled();
  });

  it("si la acción se ejecuta pero no se puede anotar el resultado, sigue siendo «ejecutada»", async () => {
    mockedFindFirst.mockResolvedValueOnce(FILA as never);
    mockedUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockedLeadFindFirst.mockResolvedValueOnce(LEAD as never);
    mockedLeadUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockedUpdate.mockRejectedValueOnce(new Error("bd"));
    const r = await decidirPropuesta({ ...DECISION, decision: "confirmar" });
    expect(r.estado).toBe("ejecutada");
  });

  it("dos toques a la vez: el segundo pierde el reclamo y no ejecuta", async () => {
    mockedFindFirst.mockResolvedValueOnce(FILA as never);
    mockedUpdateMany.mockResolvedValueOnce({ count: 0 });
    expect(
      await decidirPropuesta({ ...DECISION, decision: "confirmar" })
    ).toEqual({
      estado: "ya_decidida",
    });
    expect(mockedLeadUpdateMany).not.toHaveBeenCalled();
  });

  it("si la cita ya se resolvió por otra vía entre proponer y confirmar, la acción falla con su mensaje", async () => {
    mockedFindFirst.mockResolvedValueOnce(FILA as never);
    mockedUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockedLeadFindFirst.mockResolvedValueOnce({
      ...LEAD,
      resolvedAt: new Date(),
    } as never);
    mockedUpdate.mockResolvedValueOnce({} as never);

    expect(
      await decidirPropuesta({ ...DECISION, decision: "confirmar" })
    ).toEqual({
      estado: "fallida",
      mensaje: "Esa cita pendiente ya estaba resuelta.",
    });
    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { id: "acc_1" },
      data: expect.objectContaining({
        error: "Esa cita pendiente ya estaba resuelta.",
      }),
    });
  });

  it("un error al ejecutar queda en la fila y responde un texto genérico", async () => {
    mockedFindFirst.mockResolvedValueOnce(FILA as never);
    mockedUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockedLeadFindFirst.mockRejectedValueOnce(new Error("bd caída"));
    mockedUpdate.mockResolvedValueOnce({} as never);

    const r = await decidirPropuesta({ ...DECISION, decision: "confirmar" });
    expect(r.estado).toBe("fallida");
    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { id: "acc_1" },
      data: { error: "bd caída" },
    });
  });
});
