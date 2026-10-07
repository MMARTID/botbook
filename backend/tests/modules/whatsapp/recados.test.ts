import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { enqueueEmailJob } from "../../../src/lib/cloudTasks.js";
import { avisarRecado } from "../../../src/modules/whatsapp/avisosNegocio.js";
import {
  InformeFinalSchema,
  combinarInformes,
  normalizarDudas,
  normalizarTelefonoDeRecado,
  procesarInformeFinal,
} from "../../../src/modules/whatsapp/recados.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    call: { updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    lead: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
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
const mockedLeadFindFirst = vi.mocked(prisma.lead.findFirst);
const mockedLeadUpdate = vi.mocked(prisma.lead.update);
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
  mockedLeadFindFirst.mockResolvedValue(null);
  mockedLeadUpdate.mockResolvedValue({} as never);
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

  it("las dudas sin respuesta llegan limpias: lista o cadena, sin vacías ni repetidas y hasta 5", () => {
    expect(
      InformeFinalSchema.parse({ resultado: "RESOLVED" }).dudas_sin_respuesta
    ).toEqual([]);
    expect(
      InformeFinalSchema.parse({
        resultado: "RESOLVED",
        dudas_sin_respuesta: null,
      }).dudas_sin_respuesta
    ).toEqual([]);
    expect(
      normalizarDudas([" ¿Aceptáis  Bizum? ", "", 7, "¿Aceptáis Bizum?"])
    ).toEqual(["¿Aceptáis Bizum?"]);
    expect(normalizarDudas("¿Hay parking?\n¿Hacéis keratina?")).toEqual([
      "¿Hay parking?",
      "¿Hacéis keratina?",
    ]);
    expect(normalizarDudas(["a", "b", "c", "d", "e", "f"])).toHaveLength(5);
    expect(normalizarDudas(["x".repeat(300)])[0]).toHaveLength(200);
  });
});

describe("combinarInformes", () => {
  const VACIO = {
    resultado: null,
    motivo_escalada: null,
    fallo_de_tool: null,
    servicio_pedido: null,
    recado: null,
    dudas_sin_respuesta: [],
  };

  it("el posterior manda en lo que trae y no borra lo que no trae", () => {
    expect(
      combinarInformes(
        { ...VACIO, resultado: "RESOLVED", servicio_pedido: "Corte" },
        { ...VACIO, resultado: "LEAD_CAPTURED" }
      )
    ).toEqual({ ...VACIO, resultado: "LEAD_CAPTURED", servicio_pedido: "Corte" });
  });

  it("un fallo de tool que avisó cualquiera de los dos se queda", () => {
    expect(
      combinarInformes(
        { ...VACIO, fallo_de_tool: true },
        { ...VACIO, fallo_de_tool: false }
      ).fallo_de_tool
    ).toBe(true);
    expect(
      combinarInformes(
        { ...VACIO, fallo_de_tool: false },
        { ...VACIO, fallo_de_tool: true }
      ).fallo_de_tool
    ).toBe(true);
  });

  it("el recado es el primero y las dudas se suman sin repetir, hasta 5", () => {
    const primero = { nombre: "Ana", telefono: null, motivo: "a", quiere_que_le_llamen: true };
    const segundo = { nombre: "Ana", telefono: null, motivo: "b", quiere_que_le_llamen: true };
    const combinado = combinarInformes(
      { ...VACIO, recado: primero, dudas_sin_respuesta: ["¿1?", "¿2?", "¿3?"] },
      { ...VACIO, recado: segundo, dudas_sin_respuesta: ["¿3?", "¿4?", "¿5?", "¿6?"] }
    );
    expect(combinado.recado).toEqual(primero);
    expect(combinado.dudas_sin_respuesta).toEqual(["¿1?", "¿2?", "¿3?", "¿4?", "¿5?"]);
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

  // Llamada que ya tiene informe: el reclamo del primero no escribe nada y
  // se combina con el guardado (escritura condicionada a su postCallReportAt).
  const GUARDADO_A = new Date("2026-10-07T10:00:00Z");
  const llamadaConInforme = (
    postCallReport: Record<string, unknown>,
    camposDeLaLlamada: Partial<typeof CALL_SIN_INSIGHTS> = {}
  ) =>
    ({
      ...CALL_SIN_INSIGHTS,
      businessId: "biz_1",
      postCallReport,
      postCallReportAt: GUARDADO_A,
      ...camposDeLaLlamada,
    }) as never;
  const yaHabiaInforme = () => {
    mockedUpdateMany.mockReset();
    mockedUpdateMany
      .mockResolvedValueOnce({ count: 0 }) // el reclamo del primero
      .mockResolvedValue({ count: 1 }); // la combinación
  };

  it("un informe que no añade nada a lo guardado se ignora", async () => {
    yaHabiaInforme();
    mockedCallFindUnique.mockResolvedValue(
      llamadaConInforme({ resultado: "RESOLVED", recado: null })
    );

    expect(
      await procesarInformeFinal({
        business: NEGOCIO,
        callControlId: "v3:abc",
        params: { resultado: "RESOLVED" },
      })
    ).toEqual({ outcome: "duplicado", leadId: null });
    // Solo el reclamo: no hay combinación que escribir.
    expect(mockedUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockedCallUpdate).not.toHaveBeenCalled();
    expect(mockedLeadCreate).not.toHaveBeenCalled();
  });

  it("el primer recado que llega en un informe posterior se añade y avisa una sola vez", async () => {
    yaHabiaInforme();
    mockedCallFindUnique.mockResolvedValue(
      llamadaConInforme({ resultado: "RESOLVED", recado: null })
    );

    expect(
      await procesarInformeFinal({
        business: NEGOCIO,
        callControlId: "v3:abc",
        params: INFORME,
      })
    ).toEqual({ outcome: "duplicado-con-recado", leadId: "lead_1" });
    expect(mockedUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "call_row", postCallReportAt: GUARDADO_A },
      data: {
        postCallReport: expect.objectContaining({
          resultado: "LEAD_CAPTURED",
          recado: expect.objectContaining({ nombre: "María" }),
        }),
        postCallReportAt: expect.any(Date),
      },
    });
    expect(mockedAvisar).toHaveBeenCalledTimes(1);

    // Con el recado ya guardado, otro informe con recado no vuelve a avisar.
    yaHabiaInforme();
    mockedCallFindUnique.mockResolvedValue(
      llamadaConInforme({
        resultado: "LEAD_CAPTURED",
        recado: { motivo: "Que la llamen" },
      })
    );
    expect(
      await procesarInformeFinal({
        business: NEGOCIO,
        callControlId: "v3:abc",
        params: { ...INFORME, servicio_pedido: "Mechas" },
      })
    ).toEqual({ outcome: "actualizado", leadId: null });
    expect(mockedUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          postCallReport: expect.objectContaining({
            // El primero manda; lo que le faltaba, del posterior.
            recado: {
              nombre: "María",
              telefono: "+34612345678",
              motivo: "Que la llamen",
              quiere_que_le_llamen: true,
            },
            servicio_pedido: "Mechas",
          }),
        }),
      })
    );
    expect(mockedAvisar).toHaveBeenCalledTimes(1);
  });

  // Caso real (dev, 03-10 a 07-10): la recepcionista llama a la tool a mitad
  // de llamada, cuando el cliente aún va a preguntar más, y el informe de la
  // post-conversación (el que ha oído la llamada entera) se perdía.
  it("el informe de la post-conversación completa al de mitad de llamada y corrige lo que este puso en la llamada", async () => {
    yaHabiaInforme();
    mockedCallFindUnique.mockResolvedValue(
      llamadaConInforme(
        {
          resultado: "RESOLVED",
          motivo_escalada: "NO_APLICA",
          fallo_de_tool: false,
          servicio_pedido: null,
          recado: null,
          dudas_sin_respuesta: ["¿Hacéis mechas?"],
        },
        // Lo que escribió el informe de mitad de llamada.
        { outcome: "RESOLVED", escalationReason: "NO_APLICA", toolFailureDetected: false }
      )
    );

    expect(
      await procesarInformeFinal({
        business: NEGOCIO,
        callControlId: "v3:abc",
        params: {
          resultado: "ESCALATED",
          motivo_escalada: "CONSULTA_COMPLEJA",
          fallo_de_tool: false,
          servicio_pedido: "Queratina",
          dudas_sin_respuesta: ["¿Hacéis mechas?", "¿Hacéis queratina?"],
        },
      })
    ).toEqual({ outcome: "actualizado", leadId: null });
    expect(mockedUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "call_row", postCallReportAt: GUARDADO_A },
      data: {
        postCallReport: {
          resultado: "ESCALATED",
          motivo_escalada: "CONSULTA_COMPLEJA",
          fallo_de_tool: false,
          servicio_pedido: "Queratina",
          recado: null,
          dudas_sin_respuesta: ["¿Hacéis mechas?", "¿Hacéis queratina?"],
        },
        postCallReportAt: expect.any(Date),
      },
    });
    expect(mockedCallUpdate).toHaveBeenCalledWith({
      where: { id: "call_row" },
      data: {
        outcome: "ESCALATED",
        escalationReason: "CONSULTA_COMPLEJA",
        requestedService: "Queratina",
      },
    });
  });

  // Llamadas de prueba del 07-10: el recado salía en cuanto había nombre y
  // motivo; el teléfono confirmado llegaba en el informe siguiente y se perdía.
  it("un informe posterior rellena el teléfono que le faltaba al recado y lo pasa al lead, sin volver a avisar", async () => {
    yaHabiaInforme();
    mockedCallFindUnique.mockResolvedValue(
      llamadaConInforme({
        resultado: "LEAD_CAPTURED",
        recado: {
          nombre: "Lucía Martín",
          telefono: null,
          motivo: "Que la llamen por la queratina",
          quiere_que_le_llamen: true,
        },
      })
    );
    mockedLeadFindFirst.mockResolvedValue({
      id: "lead_1",
      data: { clientName: "Lucía Martín", clientPhone: null, callControlId: "v3:abc" },
    } as never);

    expect(
      await procesarInformeFinal({
        business: NEGOCIO,
        callControlId: "v3:abc",
        params: {
          resultado: "LEAD_CAPTURED",
          recado: {
            nombre: "Lucía",
            telefono: "655 210 984",
            motivo: "Otra redacción del motivo",
          },
        },
      })
    ).toEqual({ outcome: "actualizado", leadId: null });
    expect(mockedUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          postCallReport: expect.objectContaining({
            recado: {
              nombre: "Lucía Martín",
              telefono: "+34655210984",
              motivo: "Que la llamen por la queratina",
              quiere_que_le_llamen: true,
            },
          }),
        }),
      })
    );
    expect(mockedLeadUpdate).toHaveBeenCalledWith({
      where: { id: "lead_1" },
      data: {
        data: {
          clientName: "Lucía Martín",
          clientPhone: "+34655210984",
          quiereQueLeLlamen: true,
          callControlId: "v3:abc",
        },
      },
    });
    expect(mockedLeadCreate).not.toHaveBeenCalled();
    expect(mockedAvisar).not.toHaveBeenCalled();
  });

  it("un informe posterior no corrige lo que escribieron los insights", async () => {
    yaHabiaInforme();
    mockedCallFindUnique.mockResolvedValue(
      llamadaConInforme(
        { resultado: "RESOLVED", recado: null },
        // FRUSTRATED no lo puso el informe anterior: viene de los insights.
        { outcome: "FRUSTRATED" }
      )
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await procesarInformeFinal({
      business: NEGOCIO,
      callControlId: "v3:abc",
      params: { resultado: "ESCALATED" },
    });

    expect(mockedCallUpdate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("outcome insights=FRUSTRATED informe=ESCALATED")
    );
  });

  it("si otro informe escribe entre medias, vuelve a leer y combina sobre el suyo", async () => {
    mockedUpdateMany.mockReset();
    mockedUpdateMany
      .mockResolvedValueOnce({ count: 0 }) // reclamo
      .mockResolvedValueOnce({ count: 0 }) // otro informe se adelantó
      .mockResolvedValue({ count: 1 });
    const GUARDADO_B = new Date("2026-10-07T10:00:01Z");
    mockedCallFindUnique
      .mockResolvedValueOnce(
        llamadaConInforme({ resultado: "RESOLVED", recado: null })
      )
      .mockResolvedValueOnce({
        ...(llamadaConInforme({
          resultado: "LEAD_CAPTURED",
          recado: { motivo: "Que la llamen" },
          dudas_sin_respuesta: ["¿A?"],
        }) as object),
        postCallReportAt: GUARDADO_B,
      } as never);

    expect(
      await procesarInformeFinal({
        business: NEGOCIO,
        callControlId: "v3:abc",
        params: { ...INFORME, dudas_sin_respuesta: ["¿B?"] },
      })
    ).toEqual({ outcome: "actualizado", leadId: null });
    // El recado ya lo había traído el otro: ningún lead más.
    expect(mockedLeadCreate).not.toHaveBeenCalled();
    expect(mockedUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "call_row", postCallReportAt: GUARDADO_B },
      data: {
        postCallReport: expect.objectContaining({
          recado: expect.objectContaining({ motivo: "Que la llamen" }),
          dudas_sin_respuesta: ["¿A?", "¿B?"],
        }),
        postCallReportAt: expect.any(Date),
      },
    });
  });

  it("guarda las dudas sin respuesta del informe junto al resto", async () => {
    await procesarInformeFinal({
      business: NEGOCIO,
      callControlId: "v3:abc",
      params: {
        resultado: "ESCALATED",
        motivo_escalada: "CONSULTA_COMPLEJA",
        dudas_sin_respuesta: ["¿Aceptáis Bizum?", "¿Hay parking cerca?"],
      },
    });

    expect(mockedUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          postCallReport: expect.objectContaining({
            dudas_sin_respuesta: ["¿Aceptáis Bizum?", "¿Hay parking cerca?"],
          }),
        }),
      })
    );
    expect(mockedLeadCreate).not.toHaveBeenCalled();
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
