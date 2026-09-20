import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { resetDb } from "../helpers/db.js";
import { createTestBusiness, createTestCall } from "../helpers/fixtures.js";
import {
  CLIENTES,
  NEGOCIOS,
  entrantePorId,
  eventoMensajes,
  mensajeDeTexto,
  negocioPorId,
  sembrarRemitentes,
} from "../helpers/whatsapp.js";
import { handleWhatsappMessages } from "../../../src/modules/whatsapp/webhooks.js";
import { enviarTexto } from "../../../src/modules/whatsapp/service.js";
import { processSendWhatsappJob } from "../../../src/jobs/sendWhatsapp.js";
import {
  cambiarMovilDelDueno,
  estadoWhatsappDelDueno,
  iniciarActivacionDelDueno,
  resumenWhatsappDelDueno,
} from "../../../src/modules/whatsapp/altaDueno.js";
import { bajaVigente } from "../../../src/modules/whatsapp/bajas.js";
import * as mensajes from "../../../src/modules/whatsapp/mensajes.js";
import { whatsappAdapter } from "../../../src/adapters/whatsapp/WhatsAppAdapter.js";

vi.mock("../../../src/adapters/whatsapp/WhatsAppAdapter.js", () => ({
  whatsappAdapter: {
    sendText: vi.fn(),
    sendTemplate: vi.fn(),
    listTemplates: vi.fn(),
  },
}));

const MOVIL = "+34692138456";
const OTRO_MOVIL = "+34600111222";

const mockedSendText = vi.mocked(whatsappAdapter.sendText);
const mockedSendTemplate = vi.mocked(whatsappAdapter.sendTemplate);

let salientes = 0;

async function escribe(from: string, body: string, to = NEGOCIOS) {
  const mensaje = mensajeDeTexto(from, body);
  await handleWhatsappMessages(
    eventoMensajes({ to, messages: [mensaje], waId: from.slice(1) })
  );
  return entrantePorId(mensaje.id);
}

async function codigoDe(businessId: string): Promise<string> {
  const b = await negocioPorId(businessId);
  if (!b.ownerAltaCode) throw new Error("sin código");
  return b.ownerAltaCode;
}

describe("Bajas de WhatsApp (integración)", () => {
  beforeEach(async () => {
    await resetDb();
    await sembrarRemitentes();
    delete process.env.WHATSAPP_WABA_ID;
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mockedSendText.mockImplementation(async () => ({
      messageId: `msg-out-${++salientes}`,
      status: "queued",
    }));
    mockedSendTemplate.mockImplementation(async () => ({
      messageId: `msg-tpl-${++salientes}`,
      status: "queued",
    }));
  });

  it("STOP al número de clientes es global: ningún negocio le escribe hasta que diga ALTA", async () => {
    const a = await createTestBusiness({ name: "A" });
    const b = await createTestBusiness({ name: "B" });
    for (const business of [a, b]) {
      const call = await createTestCall(business.id, { fromNumber: MOVIL });
      await prisma.booking.create({
        data: {
          callId: call.id,
          programedAt: new Date(Date.now() + 86_400_000),
          numberPeople: 1,
        },
      });
    }

    const stop = await escribe(MOVIL, "STOP", CLIENTES);
    expect(stop).toEqual(
      expect.objectContaining({
        role: "client",
        handler: "stop:cliente",
        error: null,
      })
    );
    expect(await bajaVigente("client", MOVIL)).toEqual(
      expect.objectContaining({ keyword: "STOP", optedOutAt: expect.any(Date) })
    );
    expect(mockedSendText).toHaveBeenCalledTimes(1);
    expect(mockedSendText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: CLIENTES,
        to: MOVIL,
        body: mensajes.bajaCliente(),
      })
    );

    await expect(
      enviarTexto({
        audience: "client",
        to: MOVIL,
        body: "¿Confirmas?",
        businessId: a.id,
      })
    ).rejects.toMatchObject({ code: "WHATSAPP_OPT_OUT" });
    expect(mockedSendText).toHaveBeenCalledTimes(1);

    await processSendWhatsappJob({
      toNumber: MOVIL,
      templateName: "confirmacion_cita",
      languageCode: "es",
      bodyParams: {},
      idempotencyKey: "confirm-booking_1",
      businessId: b.id,
      audience: "client",
    });
    expect(mockedSendTemplate).not.toHaveBeenCalled();
    expect(
      await prisma.sentMessage.findUniqueOrThrow({
        where: {
          channel_idempotencyKey: {
            channel: "whatsapp",
            idempotencyKey: "confirm-booking_1",
          },
        },
      })
    ).toEqual(
      expect.objectContaining({
        deliveryStatus: "suppressed",
        errorCode: "OPT_OUT",
      })
    );

    const alta = await escribe(MOVIL, "ALTA", CLIENTES);
    expect(alta.handler).toBe("alta:cliente-reactivado");
    const fila = await prisma.whatsappOptOut.findUniqueOrThrow({
      where: {
        phoneNumber_audience: { phoneNumber: MOVIL, audience: "client" },
      },
    });
    expect(fila.revokedAt).not.toBeNull();
    expect(fila.revokedByMessageId).toBe(alta.id);
    await enviarTexto({
      audience: "client",
      to: MOVIL,
      body: "¿Confirmas?",
      businessId: a.id,
    });
    expect(mockedSendText).toHaveBeenCalledTimes(3);
  });

  it("STOP al número de negocios da de baja a los dos negocios del móvil; ALTA los reactiva y consume los códigos", async () => {
    const a = await createTestBusiness({ name: "A" });
    const b = await createTestBusiness({ name: "B" });
    await cambiarMovilDelDueno(a.id, MOVIL);
    await cambiarMovilDelDueno(b.id, MOVIL);
    await escribe(MOVIL, `ALTA ${await codigoDe(a.id)}`);
    await escribe(MOVIL, `ALTA ${await codigoDe(b.id)}`);
    // Código nuevo para A (como haría el panel al cargar Ajustes).
    await prisma.business.update({
      where: { id: a.id },
      data: {
        ownerAltaCode: "ZZZZZ2",
        ownerAltaCodeExpiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const stop = await escribe(MOVIL, "Stop.");
    expect(stop.handler).toBe("stop:dueno");
    expect((await negocioPorId(a.id)).ownerWhatsappOptOutAt).not.toBeNull();
    expect((await negocioPorId(b.id)).ownerWhatsappOptOutAt).not.toBeNull();
    expect(await bajaVigente("owner", MOVIL)).not.toBeNull();
    expect(mockedSendText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: mensajes.bajaDueno({ negocios: ["A", "B"] }),
      })
    );

    const resumen = await resumenWhatsappDelDueno(a.id);
    expect(resumen?.status).toBe("baja");
    expect(resumen?.optOutAt).not.toBeNull();
    expect(await iniciarActivacionDelDueno(a.id)).toEqual({ outcome: "baja" });

    const alta = await escribe(MOVIL, "ALTA");
    expect(alta.handler).toBe("alta:reactivado");
    for (const id of [a.id, b.id]) {
      const negocio = await negocioPorId(id);
      expect(negocio.ownerWhatsappOptOutAt).toBeNull();
      expect(negocio.ownerWhatsappOptInVia).toBe("alta_palabra");
      expect(negocio.ownerAltaCode).toBeNull();
    }
    expect(await bajaVigente("owner", MOVIL)).toBeNull();
    expect((await resumenWhatsappDelDueno(a.id))?.status).toBe("activo");
  });

  it("STOP de un desconocido y después un negocio guarda ese móvil: baja por la fila global, con fecha", async () => {
    const stop = await escribe(MOVIL, "STOP");
    expect(stop.handler).toBe("stop:desconocido");
    expect(mockedSendText).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: mensajes.bajaDesconocido() })
    );
    const fila = await bajaVigente("owner", MOVIL);
    expect(fila).not.toBeNull();

    const business = await createTestBusiness();
    await cambiarMovilDelDueno(business.id, MOVIL);

    const resumen = await resumenWhatsappDelDueno(business.id);
    expect(resumen?.status).toBe("baja");
    expect(resumen?.optOutAt).toBe(fila!.optedOutAt.toISOString());
    // Lo mismo que calcula el onboarding: baja ⇒ paso resuelto.
    const negocio = await negocioPorId(business.id);
    expect(estadoWhatsappDelDueno(negocio, fila)).toBe("baja");
    expect(await iniciarActivacionDelDueno(business.id)).toEqual({
      outcome: "baja",
    });

    // El primer consentimiento sigue siendo el código, y revoca la fila.
    const alta = await escribe(MOVIL, `ALTA ${await codigoDe(business.id)}`);
    expect(alta.handler).toBe("alta:vinculado");
    expect(await bajaVigente("owner", MOVIL)).toBeNull();
    expect((await resumenWhatsappDelDueno(business.id))?.status).toBe("activo");
  });

  it("fuerza bruta: cinco códigos inválidos, uno de «demasiados intentos» y silencio a partir del séptimo", async () => {
    const handlers: string[] = [];
    for (let i = 0; i < 8; i++) {
      handlers.push((await escribe(OTRO_MOVIL, `ALTA AAAAA${i + 2}`)).handler);
    }

    expect(handlers.slice(0, 5)).toEqual(Array(5).fill("alta:codigo-invalido"));
    expect(handlers[5]).toBe("alta:bloqueado");
    expect(handlers.slice(6)).toEqual([
      "alta:bloqueado:silenciado",
      "alta:bloqueado:silenciado",
    ]);
    expect(mockedSendText).toHaveBeenCalledTimes(6);
    expect(mockedSendText).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: mensajes.demasiadosIntentos() })
    );
  });

  it("techo por hora: 25 AYUDA del dueño reciben 20 respuestas", async () => {
    const business = await createTestBusiness({ name: "Peluquería Ana" });
    await cambiarMovilDelDueno(business.id, MOVIL);
    await escribe(MOVIL, `ALTA ${await codigoDe(business.id)}`);
    mockedSendText.mockClear();

    const handlers: string[] = [];
    for (let i = 0; i < 25; i++) {
      handlers.push((await escribe(MOVIL, "AYUDA")).handler);
    }

    // La bienvenida del alta ya contaba una: 19 ayudas más hasta el techo.
    expect(handlers.filter((h) => h === "ayuda:dueno")).toHaveLength(19);
    expect(handlers.filter((h) => h === "ayuda:dueno:silenciado")).toHaveLength(
      6
    );
    expect(mockedSendText).toHaveBeenCalledTimes(19);
    expect(
      await prisma.inboundMessage.count({ where: { error: { not: null } } })
    ).toBe(0);
  });

  it("«¡STOP!» y «¡Baja!» del dueño activo registran la oposición igual que STOP", async () => {
    const business = await createTestBusiness({ name: "Peluquería Ana" });
    await cambiarMovilDelDueno(business.id, MOVIL);
    await escribe(MOVIL, `ALTA ${await codigoDe(business.id)}`);

    const stop = await escribe(MOVIL, "¡STOP!");
    expect(stop.kind).toBe("keyword");
    expect(stop.handler).toBe("stop:dueno");
    expect(
      (await negocioPorId(business.id)).ownerWhatsappOptOutAt
    ).not.toBeNull();
    expect(await bajaVigente("owner", MOVIL)).toMatchObject({
      keyword: "STOP",
    });

    await escribe(MOVIL, "ALTA");
    expect(await bajaVigente("owner", MOVIL)).toBeNull();
    const baja = await escribe(MOVIL, "¡Baja!");
    expect(baja.handler).toBe("stop:dueno");
    expect(await bajaVigente("owner", MOVIL)).toMatchObject({
      keyword: "BAJA",
    });
  });

  it("AYUDA desde un móvil que solo tecleó otro tenant no nombra ese negocio", async () => {
    const ajeno = await createTestBusiness({ name: "Barbería del Atacante" });
    await cambiarMovilDelDueno(ajeno.id, MOVIL);

    const ayuda = await escribe(MOVIL, "AYUDA");

    expect(ayuda.role).toBe("owner");
    expect(ayuda.handler).toBe("ayuda:sin-consentimiento");
    expect(mockedSendText).toHaveBeenCalledTimes(1);
    const body = mockedSendText.mock.calls[0][0].body;
    expect(body).toBe(mensajes.comoDarseDeAlta());
    expect(body).not.toContain("Atacante");

    // Una vez al día.
    expect((await escribe(MOVIL, "AYUDA")).handler).toBe(
      "ayuda:sin-consentimiento:silenciado"
    );
    expect(mockedSendText).toHaveBeenCalledTimes(1);
  });

  it("si Telnyx falla en la primera respuesta del día, el siguiente entrante vuelve a intentarlo", async () => {
    const business = await createTestBusiness({ name: "Peluquería Ana" });
    await cambiarMovilDelDueno(business.id, MOVIL);
    await escribe(MOVIL, `ALTA ${await codigoDe(business.id)}`);
    mockedSendText.mockClear();
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedSendText.mockRejectedValueOnce(new Error("telnyx caído"));

    const primero = await escribe(MOVIL, "hola");
    expect(primero.handler).toBe("texto:dueno");
    expect(primero.error).toBe("telnyx caído");
    expect(
      await prisma.sentMessage.findUniqueOrThrow({
        where: {
          channel_idempotencyKey: {
            channel: "whatsapp",
            idempotencyKey: `entrante:${primero.id}:dueno-texto`,
          },
        },
      })
    ).toMatchObject({
      deliveryStatus: "failed",
      errorCode: "SEND_ERROR",
      errorDetail: "telnyx caído",
    });

    const segundo = await escribe(MOVIL, "hola otra vez");
    expect(segundo.handler).toBe("texto:dueno");
    expect(segundo.error).toBeNull();
    expect(mockedSendText).toHaveBeenCalledTimes(2);

    expect((await escribe(MOVIL, "y otra")).handler).toBe(
      "texto:dueno:silenciado"
    );
    expect(mockedSendText).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it("un número con STOP que escribe AYUDA: handler con :baja, sin error", async () => {
    await escribe(OTRO_MOVIL, "STOP");
    mockedSendText.mockClear();

    const ayuda = await escribe(OTRO_MOVIL, "AYUDA");

    expect(ayuda.handler).toBe("ayuda:desconocido:baja");
    expect(ayuda.error).toBeNull();
    expect(mockedSendText).not.toHaveBeenCalled();
    expect(
      await prisma.sentMessage.findUniqueOrThrow({
        where: {
          channel_idempotencyKey: {
            channel: "whatsapp",
            idempotencyKey: `entrante:${ayuda.id}:desconocido-negocios`,
          },
        },
      })
    ).toEqual(
      expect.objectContaining({
        deliveryStatus: "suppressed",
        errorCode: "OPT_OUT",
      })
    );
  });
});
