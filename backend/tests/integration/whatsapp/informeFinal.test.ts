import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { resetDb } from "../helpers/db.js";
import { createTestBusiness, createTestCall } from "../helpers/fixtures.js";
import { avisarRecado } from "../../../src/modules/whatsapp/avisosNegocio.js";
import { procesarInformeFinal } from "../../../src/modules/whatsapp/recados.js";

// Contra Postgres real: varios informes de `informar_al_negocio` por llamada
// (uno a mitad de llamada y los dos de la post-conversación casi a la vez).
// La escritura condicionada a `postCallReportAt` tiene que serializarlos sin
// perder dudas ni crear dos leads. El aviso al dueño se sustituye.
vi.mock("../../../src/modules/whatsapp/avisosNegocio.js", () => ({
  avisarRecado: vi.fn().mockResolvedValue({ via: "interactivo" }),
}));

const mockedAvisar = vi.mocked(avisarRecado);

describe("informe final de la llamada (integración)", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("el de la post-conversación completa al de mitad de llamada", async () => {
    const negocio = await createTestBusiness();
    const llamada = await createTestCall(negocio.id);
    const business = {
      id: negocio.id,
      name: negocio.name,
      timezone: negocio.timezone,
    };

    // A mitad de llamada: el cliente aún va a preguntar por la queratina.
    expect(
      await procesarInformeFinal({
        business,
        callControlId: llamada.callId,
        params: {
          resultado: "RESOLVED",
          dudas_sin_respuesta: ["¿Hacéis mechas?"],
        },
      })
    ).toEqual({ outcome: "guardado", leadId: null });

    // La post-conversación: ha oído la llamada entera.
    expect(
      await procesarInformeFinal({
        business,
        callControlId: llamada.callId,
        params: {
          resultado: "LEAD_CAPTURED",
          servicio_pedido: "Queratina",
          dudas_sin_respuesta: ["¿Hacéis queratina?"],
          recado: { nombre: "Lucía", motivo: "Que la llamen por la queratina" },
        },
      })
    ).toEqual({ outcome: "duplicado-con-recado", leadId: expect.any(String) });

    const guardada = await prisma.call.findUniqueOrThrow({
      where: { id: llamada.id },
    });
    expect(guardada.postCallReport).toMatchObject({
      resultado: "LEAD_CAPTURED",
      servicio_pedido: "Queratina",
      dudas_sin_respuesta: ["¿Hacéis mechas?", "¿Hacéis queratina?"],
      recado: { nombre: "Lucía", motivo: "Que la llamen por la queratina" },
    });
    // La doble escritura corrige lo que puso el primero.
    expect(guardada.outcome).toBe("LEAD_CAPTURED");
    expect(guardada.requestedService).toBe("Queratina");
    expect(await prisma.lead.count({ where: { callId: llamada.id } })).toBe(1);
  });

  it("el recado que se mandó antes de confirmar el teléfono lo recibe del informe siguiente, también en el lead", async () => {
    const negocio = await createTestBusiness();
    const llamada = await createTestCall(negocio.id);
    const business = {
      id: negocio.id,
      name: negocio.name,
      timezone: negocio.timezone,
    };
    const motivo = "Quiere que la llamen por la queratina";
    await procesarInformeFinal({
      business,
      callControlId: llamada.callId,
      params: { resultado: "LEAD_CAPTURED", recado: { nombre: "Lucía Martín", motivo } },
    });
    await procesarInformeFinal({
      business,
      callControlId: llamada.callId,
      params: {
        resultado: "LEAD_CAPTURED",
        recado: { nombre: "Lucía Martín", telefono: "655210984", motivo, quiere_que_le_llamen: true },
      },
    });

    const guardada = await prisma.call.findUniqueOrThrow({ where: { id: llamada.id } });
    expect((guardada.postCallReport as { recado: unknown }).recado).toMatchObject({
      telefono: "+34655210984",
      quiere_que_le_llamen: true,
    });
    const leads = await prisma.lead.findMany({ where: { callId: llamada.id } });
    expect(leads).toHaveLength(1);
    expect(leads[0].data).toMatchObject({ clientPhone: "+34655210984", quiereQueLeLlamen: true });
    expect(mockedAvisar).toHaveBeenCalledTimes(1);
  });

  it("los dos informes de la post-conversación a la vez: se combinan los dos y el recado avisa una vez", async () => {
    const negocio = await createTestBusiness();
    const llamada = await createTestCall(negocio.id);
    const business = {
      id: negocio.id,
      name: negocio.name,
      timezone: negocio.timezone,
    };
    await procesarInformeFinal({
      business,
      callControlId: llamada.callId,
      params: { resultado: "RESOLVED", dudas_sin_respuesta: ["¿A?"] },
    });

    const recado = { nombre: "Pere", motivo: "Que le llamen" };
    const resultados = await Promise.all([
      procesarInformeFinal({
        business,
        callControlId: llamada.callId,
        params: { resultado: "LEAD_CAPTURED", recado, dudas_sin_respuesta: ["¿B?"] },
      }),
      procesarInformeFinal({
        business,
        callControlId: llamada.callId,
        params: { resultado: "LEAD_CAPTURED", recado, dudas_sin_respuesta: ["¿C?"] },
      }),
    ]);

    const guardada = await prisma.call.findUniqueOrThrow({
      where: { id: llamada.id },
    });
    const dudas = (guardada.postCallReport as { dudas_sin_respuesta: string[] })
      .dudas_sin_respuesta;
    expect([...dudas].sort()).toEqual(["¿A?", "¿B?", "¿C?"]);
    expect(await prisma.lead.count({ where: { callId: llamada.id } })).toBe(1);
    expect(mockedAvisar).toHaveBeenCalledTimes(1);
    expect(resultados.map((r) => r.outcome).sort()).toEqual([
      "actualizado",
      "duplicado-con-recado",
    ]);
  });
});
