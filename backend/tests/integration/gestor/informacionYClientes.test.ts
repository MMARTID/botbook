import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { resetDb } from "../helpers/db.js";
import { createTestBusiness, createTestCall } from "../helpers/fixtures.js";
import {
  decidirPropuesta,
  registrarPropuesta,
} from "../../../src/modules/gestor/acciones.js";
import { handleGestorToolInvocation } from "../../../src/modules/gestor/tools.js";
import { procesarInformeFinal } from "../../../src/modules/whatsapp/recados.js";

// «Enseñar a la recepcionista» y la ficha del cliente contra Postgres/Redis
// reales: el informe final guarda las dudas y el Gestor las lee; la
// propuesta de actualizar_informacion se confirma con la escritura
// optimista de verdad; buscar_cliente filtra por relación y por sufijo de
// teléfono sin salirse del negocio. Sin agentes creados, la sincronización
// con Telnyx y Retell no llama a nadie.

const DIA = 24 * 60 * 60 * 1000;

async function herramienta(
  businessId: string,
  toolName: string,
  params: Record<string, unknown> = {}
) {
  const r = await handleGestorToolInvocation({
    businessId,
    role: "owner",
    toolName,
    params,
  });
  expect(r.status).toBe(200);
  return r.body as Record<string, unknown>;
}

beforeEach(async () => {
  await resetDb();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("enseñar a la recepcionista", () => {
  it("las dudas del informe final llegan a dudas_sin_respuesta, solo las del negocio y del periodo", async () => {
    const negocio = await createTestBusiness();
    const otro = await createTestBusiness();
    const llamada = await createTestCall(negocio.id, {
      startedAt: new Date(Date.now() - DIA),
    });
    const antigua = await createTestCall(negocio.id, {
      startedAt: new Date(Date.now() - 40 * DIA),
      outcome: "FRUSTRATED",
    });
    const ajena = await createTestCall(otro.id);

    await procesarInformeFinal({
      business: negocio,
      callControlId: llamada.callId,
      params: {
        resultado: "ESCALATED",
        motivo_escalada: "CONSULTA_COMPLEJA",
        dudas_sin_respuesta: ["¿Aceptáis Bizum?"],
      },
    });
    await procesarInformeFinal({
      business: negocio,
      callControlId: antigua.callId,
      params: { resultado: "RESOLVED", dudas_sin_respuesta: ["¿Viejo?"] },
    });
    await procesarInformeFinal({
      business: otro,
      callControlId: ajena.callId,
      params: { resultado: "RESOLVED", dudas_sin_respuesta: ["¿Ajena?"] },
    });

    const body = await herramienta(negocio.id, "dudas_sin_respuesta");
    expect(body.dudas).toEqual([
      expect.objectContaining({ pregunta: "¿Aceptáis Bizum?", veces: 1 }),
    ]);
    expect(body.llamadasSinResolver).toMatchObject({
      total: 1,
      ultimas: [
        expect.objectContaining({
          resultado: "derivada al negocio",
          motivo: "una consulta que la recepcionista no supo resolver",
          dudas: ["¿Aceptáis Bizum?"],
        }),
      ],
    });
  });

  it("proponer y confirmar actualizar_informacion la guarda y el Gestor la ve en contexto_negocio", async () => {
    const negocio = await createTestBusiness({
      businessDetails: "Estamos en la calle Mayor 1.",
    });

    const propuesta = await registrarPropuesta({
      businessId: negocio.id,
      timezone: negocio.timezone,
      conversationId: null,
      inboundMessageId: null,
      tipo: "actualizar_informacion",
      parametros: { nuevo: "Se puede pagar con Bizum." },
      resumen: "Le cuento a la recepcionista que aceptáis Bizum.",
    });
    expect(propuesta.ok).toBe(true);
    const accionId = (propuesta as { accionId: string }).accionId;

    const resultado = await decidirPropuesta({
      accionId,
      businessId: negocio.id,
      timezone: negocio.timezone,
      decision: "confirmar",
      inboundMessageId: "in_boton",
    });
    expect(resultado).toMatchObject({
      estado: "ejecutada",
      mensaje: expect.stringContaining("Hecho"),
    });

    const guardado = await prisma.business.findUniqueOrThrow({
      where: { id: negocio.id },
      select: { businessDetails: true },
    });
    expect(guardado.businessDetails).toBe(
      "Estamos en la calle Mayor 1.\nSe puede pagar con Bizum."
    );
    const contexto = await herramienta(negocio.id, "contexto_negocio");
    expect(contexto.informacion).toBe(
      "Estamos en la calle Mayor 1.\nSe puede pagar con Bizum."
    );
  });

  it("si el dueño cambió la información en el panel entre la propuesta y el botón, no pisa nada", async () => {
    const negocio = await createTestBusiness({
      businessDetails: "No hacemos keratina.",
    });
    const propuesta = await registrarPropuesta({
      businessId: negocio.id,
      timezone: negocio.timezone,
      conversationId: null,
      inboundMessageId: null,
      tipo: "actualizar_informacion",
      parametros: {
        anterior: "No hacemos keratina.",
        nuevo: "Hacemos keratina los sábados.",
      },
      resumen: "Le cuento que ya hacéis keratina los sábados.",
    });
    expect(propuesta.ok).toBe(true);

    await prisma.business.update({
      where: { id: negocio.id },
      data: { businessDetails: "Aparcamiento en la calle de atrás." },
    });
    const resultado = await decidirPropuesta({
      accionId: (propuesta as { accionId: string }).accionId,
      businessId: negocio.id,
      timezone: negocio.timezone,
      decision: "confirmar",
      inboundMessageId: "in_boton",
    });

    expect(resultado).toMatchObject({
      estado: "fallida",
      mensaje: expect.stringContaining("ha cambiado desde que te lo propuse"),
    });
    const guardado = await prisma.business.findUniqueOrThrow({
      where: { id: negocio.id },
      select: { businessDetails: true },
    });
    expect(guardado.businessDetails).toBe("Aparcamiento en la calle de atrás.");
  });
});

describe("buscar_cliente", () => {
  it("encuentra al cliente por nombre y por móvil, con sus citas y recados, sin mezclar negocios", async () => {
    const negocio = await createTestBusiness();
    const otro = await createTestBusiness();
    const corte = await prisma.service.create({
      data: { businessId: negocio.id, name: "Corte", durationMinutes: 30 },
    });

    const conMovil = await createTestCall(negocio.id);
    await prisma.booking.create({
      data: {
        callId: conMovil.id,
        clientName: "Marta López",
        clientPhone: "+34612345678",
        serviceIds: [corte.id],
        programedAt: new Date(Date.now() + 3 * DIA),
        numberPeople: 1,
      },
    });
    // Sin móvil en la cita: la llamada desde la que reservó lo pone.
    const desdeSuMovil = await createTestCall(negocio.id, {
      fromNumber: "+34612345678",
    });
    await prisma.booking.create({
      data: {
        callId: desdeSuMovil.id,
        clientName: "Marta López",
        programedAt: new Date(Date.now() - 20 * DIA),
        numberPeople: 1,
      },
    });
    await prisma.lead.create({
      data: {
        callId: desdeSuMovil.id,
        type: "message",
        isLead: true,
        data: {
          clientName: "Marta López",
          clientPhone: "+34612345678",
          motivo: "Quiere cambiar la cita",
        },
      },
    });
    // Una cita que apuntó el dueño desde el Gestor lleva su móvil, pero no
    // es un contacto del cliente: no cuenta como último contacto.
    await createTestCall(negocio.id, {
      callId: "whatsapp:gestor:acc_1",
      voiceProvider: "whatsapp",
      fromNumber: "+34612345678",
      startedAt: new Date(Date.now() + 60_000),
    });
    const ajena = await createTestCall(otro.id);
    await prisma.booking.create({
      data: {
        callId: ajena.id,
        clientName: "Marta Ajena",
        clientPhone: "+34612345678",
        programedAt: new Date(Date.now() + DIA),
        numberPeople: 1,
      },
    });

    for (const cliente of ["marta", "612 34 56 78"]) {
      const body = await herramienta(negocio.id, "buscar_cliente", {
        cliente,
      });
      const clientes = body.clientes as Array<Record<string, unknown>>;
      expect(clientes).toHaveLength(1);
      expect(clientes[0]).toMatchObject({
        nombre: "Marta López",
        telefono: "+34612345678",
        proximasCitas: [expect.objectContaining({ servicios: ["Corte"] })],
        ultimasCitas: [expect.objectContaining({ servicios: [] })],
        citasEnTotal: 2,
        canceladas: 0,
        recadosSinAtender: [
          expect.objectContaining({ motivo: "Quiere cambiar la cita" }),
        ],
        ultimoContacto: expect.objectContaining({ canal: "llamada" }),
      });
    }
  });
});
