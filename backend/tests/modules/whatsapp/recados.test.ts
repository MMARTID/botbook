import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { enqueueEmailJob } from "../../../src/lib/cloudTasks.js";
import { avisarRecado } from "../../../src/modules/whatsapp/avisosNegocio.js";
import {
  InformeFinalSchema,
  normalizarTelefonoDeRecado,
  procesarInformeFinal,
} from "../../../src/modules/whatsapp/recados.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    call: { updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    lead: { create: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}));
vi.mock("../../../src/lib/cloudTasks.js", () => ({
  enqueueEmailJob: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/avisosNegocio.js", () => ({
  avisarRecado: vi.fn(),
}));

const mockedUpdateMany = vi.mocked(prisma.call.updateMany);
const mockedCallFindUnique = vi.mocked(prisma.call.findUnique);
const mockedCallUpdate = vi.mocked(prisma.call.update);
const mockedLeadCreate = vi.mocked(prisma.lead.create);
const mockedUserFindFirst = vi.mocked(prisma.user.findFirst);
const mockedAvisar = vi.mocked(avisarRecado);
const mockedEmail = vi.mocked(enqueueEmailJob);

const NEGOCIO = {
  id: "biz_1",
  name: "Peluquería Ana",
  timezone: "Europe/Madrid",
};
const CALL_SIN_INSIGHTS = {
  id: "call_row",
  outcome: null,
  escalationReason: null,
  toolFailureDetected: null,
  requestedService: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mockedUpdateMany.mockResolvedValue({ count: 1 });
  mockedCallFindUnique.mockResolvedValue(CALL_SIN_INSIGHTS as never);
  mockedCallUpdate.mockResolvedValue({} as never);
  mockedLeadCreate.mockResolvedValue({ id: "lead_1" } as never);
  mockedAvisar.mockResolvedValue({ via: "interactivo" });
  mockedUserFindFirst.mockResolvedValue({
    email: "dueno@example.com",
  } as never);
});

describe("normalización", () => {
  it("normaliza el teléfono del recado a E.164 o lo descarta", () => {
    expect(normalizarTelefonoDeRecado("612 345 678")).toBe("+34612345678");
    expect(normalizarTelefonoDeRecado("+34 612-345-678")).toBe("+34612345678");
    expect(normalizarTelefonoDeRecado("0034612345678")).toBe("+34612345678");
    expect(normalizarTelefonoDeRecado("el de siempre")).toBeNull();
    expect(normalizarTelefonoDeRecado("")).toBeNull();
    expect(normalizarTelefonoDeRecado(null)).toBeNull();
  });

  it("acepta recado nulo, vacío o sin motivo como «sin recado»", () => {
    expect(
      InformeFinalSchema.parse({ resultado: "RESOLVED", recado: null }).recado
    ).toBeNull();
    expect(
      InformeFinalSchema.parse({ resultado: "RESOLVED", recado: {} }).recado
    ).toBeNull();
    expect(
      InformeFinalSchema.parse({ resultado: "RESOLVED" }).recado
    ).toBeNull();
    expect(
      InformeFinalSchema.parse({
        resultado: "LEAD_CAPTURED",
        recado: { motivo: "quiere balayage", nombre: "María" },
      }).recado
    ).toEqual({ motivo: "quiere balayage", nombre: "María" });
  });
});

describe("procesarInformeFinal", () => {
  const INFORME = {
    resultado: "LEAD_CAPTURED",
    motivo_escalada: "NO_APLICA",
    fallo_de_tool: false,
    servicio_pedido: "Balayage",
    recado: {
      nombre: " María ",
      telefono: "612 345 678",
      motivo: "Quiere saber si hacéis balayage y que la llames.",
      quiere_que_le_llamen: true,
    },
  };

  it("el primer informe se guarda, rellena los huecos de la llamada, crea el lead y avisa", async () => {
    const resultado = await procesarInformeFinal({
      business: NEGOCIO,
      callControlId: "v3:abc",
      params: INFORME,
    });

    expect(resultado).toEqual({ outcome: "guardado", leadId: "lead_1" });
    expect(mockedUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          callId: "v3:abc",
          businessId: "biz_1",
        }),
        data: expect.objectContaining({
          postCallReport: expect.objectContaining({
            resultado: "LEAD_CAPTURED",
            servicio_pedido: "Balayage",
            recado: {
              nombre: "María",
              telefono: "+34612345678",
              motivo: "Quiere saber si hacéis balayage y que la llames.",
              quiere_que_le_llamen: true,
            },
          }),
        }),
      })
    );
    // Doble escritura: los cuatro campos estaban a null.
    expect(mockedCallUpdate).toHaveBeenCalledWith({
      where: { id: "call_row" },
      data: {
        outcome: "LEAD_CAPTURED",
        escalationReason: "NO_APLICA",
        toolFailureDetected: false,
        requestedService: "Balayage",
      },
    });
    expect(mockedLeadCreate).toHaveBeenCalledWith({
      data: {
        callId: "call_row",
        type: "message",
        isLead: true,
        data: {
          clientName: "María",
          clientPhone: "+34612345678",
          motivo: "Quiere saber si hacéis balayage y que la llames.",
          quiereQueLeLlamen: true,
          callControlId: "v3:abc",
        },
      },
      select: { id: true },
    });
    expect(mockedAvisar).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        leadId: "lead_1",
        clientName: "María",
        clientPhone: "+34612345678",
        quiereQueLeLlamen: true,
        email: expect.any(Function),
      })
    );
  });

  it("no pisa lo que ya escribieron los insights y deja la discrepancia en el log", async () => {
    mockedCallFindUnique.mockResolvedValue({
      ...CALL_SIN_INSIGHTS,
      outcome: "RESOLVED",
      toolFailureDetected: false,
    } as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await procesarInformeFinal({
      business: NEGOCIO,
      callControlId: "v3:abc",
      params: {
        resultado: "FRUSTRATED",
        fallo_de_tool: false,
        motivo_escalada: "CLIENTE_LO_PIDIO",
      },
    });

    expect(mockedCallUpdate).toHaveBeenCalledWith({
      where: { id: "call_row" },
      data: { escalationReason: "CLIENTE_LO_PIDIO" },
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("outcome insights=RESOLVED informe=FRUSTRATED")
    );
    expect(mockedLeadCreate).not.toHaveBeenCalled();
  });

  it("el segundo informe (Telnyx lo manda dos veces) se ignora salvo que traiga un recado nuevo", async () => {
    mockedUpdateMany.mockResolvedValue({ count: 0 });
    mockedCallFindUnique.mockResolvedValue({
      id: "call_row",
      businessId: "biz_1",
      postCallReport: { resultado: "RESOLVED", recado: null },
    } as never);

    expect(
      await procesarInformeFinal({
        business: NEGOCIO,
        callControlId: "v3:abc",
        params: { resultado: "RESOLVED" },
      })
    ).toEqual({ outcome: "duplicado", leadId: null });
    expect(mockedLeadCreate).not.toHaveBeenCalled();

    expect(
      await procesarInformeFinal({
        business: NEGOCIO,
        callControlId: "v3:abc",
        params: INFORME,
      })
    ).toEqual({ outcome: "duplicado-con-recado", leadId: "lead_1" });
    expect(mockedCallUpdate).toHaveBeenCalledWith({
      where: { id: "call_row" },
      data: {
        postCallReport: expect.objectContaining({
          resultado: "RESOLVED",
          recado: expect.objectContaining({ nombre: "María" }),
        }),
      },
    });
    expect(mockedAvisar).toHaveBeenCalledTimes(1);

    // Con el recado ya guardado, un tercero con recado no añade nada.
    mockedCallFindUnique.mockResolvedValue({
      id: "call_row",
      businessId: "biz_1",
      postCallReport: { resultado: "RESOLVED", recado: { motivo: "x" } },
    } as never);
    expect(
      await procesarInformeFinal({
        business: NEGOCIO,
        callControlId: "v3:abc",
        params: INFORME,
      })
    ).toEqual({ outcome: "duplicado", leadId: null });
    expect(mockedAvisar).toHaveBeenCalledTimes(1);
  });

  it("un informe de una llamada de otro negocio no toca nada", async () => {
    mockedUpdateMany.mockResolvedValue({ count: 0 });
    mockedCallFindUnique.mockResolvedValue({
      id: "call_row",
      businessId: "otro",
      postCallReport: null,
    } as never);

    expect(
      await procesarInformeFinal({
        business: NEGOCIO,
        callControlId: "v3:abc",
        params: INFORME,
      })
    ).toEqual({ outcome: "duplicado", leadId: null });
    expect(mockedLeadCreate).not.toHaveBeenCalled();
  });

  it("un informe con forma inesperada o un fallo de la base de datos no lanzan", async () => {
    expect(
      await procesarInformeFinal({
        business: NEGOCIO,
        callControlId: "v3:abc",
        params: { resultado: "LO_QUE_SEA" },
      })
    ).toEqual({ outcome: "duplicado", leadId: null });

    mockedUpdateMany.mockRejectedValue(new Error("BD caída"));
    expect(
      await procesarInformeFinal({
        business: NEGOCIO,
        callControlId: "v3:abc",
        params: INFORME,
      })
    ).toEqual({ outcome: "duplicado", leadId: null });
  });

  it("el respaldo por email va al correo del negocio con clave por lead", async () => {
    await procesarInformeFinal({
      business: NEGOCIO,
      callControlId: "v3:abc",
      params: INFORME,
    });
    const email = mockedAvisar.mock.calls[0][0].email!;

    await email();

    expect(mockedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        fromAlias: "support",
        toAddress: "dueno@example.com",
        subject: "Tienes un recado — Peluquería Ana",
      }),
      "recado-lead_1"
    );
    expect(mockedEmail.mock.calls[0][0].html).toContain("María");
    expect(mockedEmail.mock.calls[0][0].html).toContain("Pide que le llames.");
  });
});
