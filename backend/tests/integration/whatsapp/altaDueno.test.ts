import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import { prisma } from "../../../src/lib/prisma.js";
import { resetDb } from "../helpers/db.js";
import { createTestBusiness } from "../helpers/fixtures.js";
import {
  CLIENTES,
  NEGOCIOS,
  entrantePorId,
  eventoMensajes,
  mensajeDeBoton,
  mensajeDeTexto,
  negocioPorId,
  sembrarPlantillaBienvenida,
  sembrarRemitentes,
} from "../helpers/whatsapp.js";
import {
  handleMessageStatusEvent,
  handleWhatsappMessages,
} from "../../../src/modules/whatsapp/webhooks.js";
import {
  cambiarMovilDelDueno,
  iniciarActivacionDelDueno,
  resumenWhatsappDelDueno,
} from "../../../src/modules/whatsapp/altaDueno.js";
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
const TERCERO = "+34600333444";

const mockedSendText = vi.mocked(whatsappAdapter.sendText);
const mockedSendTemplate = vi.mocked(whatsappAdapter.sendTemplate);

let salientes = 0;

async function codigoDe(businessId: string): Promise<string> {
  const b = await negocioPorId(businessId);
  if (!b.ownerAltaCode)
    throw new Error(`El negocio ${businessId} no tiene código`);
  return b.ownerAltaCode;
}

async function escribe(from: string, body: string, to = NEGOCIOS, id?: string) {
  const mensaje = mensajeDeTexto(from, body, id);
  await handleWhatsappMessages(
    eventoMensajes({ to, messages: [mensaje], waId: from.slice(1) })
  );
  return entrantePorId(mensaje.id);
}

describe("Alta del dueño por WhatsApp (integración)", () => {
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

  it("guarda el primer móvil (columna a NULL) y «ALTA <código>» desde otro móvil vincula al remitente real", async () => {
    const business = await createTestBusiness({ name: "Peluquería Ana" });
    expect(business.ownerWhatsappNumber).toBeNull();

    expect(await cambiarMovilDelDueno(business.id, OTRO_MOVIL)).toEqual({
      count: 1,
    });
    const conCodigo = await negocioPorId(business.id);
    expect(conCodigo.ownerWhatsappNumber).toBe(OTRO_MOVIL);
    expect(conCodigo.ownerAltaCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    // Reguardar el mismo número no reinicia nada.
    expect(await cambiarMovilDelDueno(business.id, OTRO_MOVIL)).toEqual({
      count: 0,
    });

    const entrante = await escribe(
      MOVIL,
      `alta ${conCodigo.ownerAltaCode!.toLowerCase()}`
    );

    expect(entrante).toEqual(
      expect.objectContaining({
        role: "owner",
        businessId: business.id,
        kind: "keyword",
        handler: "alta:vinculado",
        error: null,
      })
    );
    const vinculado = await negocioPorId(business.id);
    expect(vinculado).toEqual(
      expect.objectContaining({
        ownerWhatsappNumber: MOVIL,
        ownerWhatsappOptInVia: "alta_codigo",
        ownerWhatsappOptInMessageId: entrante.id,
        ownerAltaCode: null,
        ownerAltaCodeExpiresAt: null,
      })
    );
    expect(vinculado.ownerWhatsappOptInAt).not.toBeNull();
    expect(vinculado.ownerWindowOpenUntil).not.toBeNull();

    const respuesta = await prisma.sentMessage.findUniqueOrThrow({
      where: {
        channel_idempotencyKey: {
          channel: "whatsapp",
          idempotencyKey: `entrante:${entrante.id}:bienvenida`,
        },
      },
    });
    expect(respuesta).toEqual(
      expect.objectContaining({
        businessId: business.id,
        audience: "owner",
        toNumber: MOVIL,
        fromNumber: NEGOCIOS,
        callbackData: "aviso:bienvenida",
        kind: "text",
        providerMessageId: "msg-out-1",
      })
    );
    expect(mockedSendText).toHaveBeenCalledWith(
      expect.objectContaining({
        from: NEGOCIOS,
        to: MOVIL,
        body: mensajes.bienvenidaTrasAlta({
          negocios: ["Peluquería Ana"],
          movilApuntado: true,
        }),
      })
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("distinto del móvil tecleado")
    );
  });

  it("un segundo evento con el mismo messages[].id no reenruta ni responde dos veces", async () => {
    const business = await createTestBusiness();
    await cambiarMovilDelDueno(business.id, MOVIL);
    const mensaje = mensajeDeTexto(
      MOVIL,
      `ALTA ${await codigoDe(business.id)}`
    );

    await handleWhatsappMessages(
      eventoMensajes({ to: NEGOCIOS, messages: [mensaje] })
    );
    await handleWhatsappMessages(
      eventoMensajes({ to: NEGOCIOS, messages: [mensaje] })
    );

    expect(await prisma.inboundMessage.count()).toBe(1);
    expect(mockedSendText).toHaveBeenCalledTimes(1);
    expect((await entrantePorId(mensaje.id)).handler).toBe("alta:vinculado");
  });

  it("reenviar el código ya consumido desde el móvil activo no cuenta como fallo; desde otro móvil sí", async () => {
    const business = await createTestBusiness();
    await cambiarMovilDelDueno(business.id, MOVIL);
    const codigo = await codigoDe(business.id);

    await escribe(MOVIL, `ALTA ${codigo}`);
    const repetido = await escribe(MOVIL, `ALTA ${codigo}`);
    expect(repetido.handler).toBe("alta:ya-activo:codigo");
    expect(mockedSendText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: mensajes.yaActivo({ negocios: ["Peluquería de prueba"] }),
      })
    );

    const ajeno = await escribe(OTRO_MOVIL, `ALTA ${codigo}`);
    expect(ajeno.handler).toBe("alta:codigo-invalido");
    expect(ajeno.role).toBe("unknown");
    expect(
      await prisma.inboundMessage.count({
        where: { handler: "alta:codigo-invalido" },
      })
    ).toBe(1);

    // Código caducado.
    const otro = await createTestBusiness();
    await cambiarMovilDelDueno(otro.id, TERCERO);
    await prisma.business.update({
      where: { id: otro.id },
      data: { ownerAltaCodeExpiresAt: new Date(Date.now() - 1000) },
    });
    const caducado = await escribe(TERCERO, `ALTA ${await codigoDe(otro.id)}`);
    expect(caducado.handler).toBe("alta:codigo-caducado");
    expect((await negocioPorId(otro.id)).ownerWhatsappOptInAt).toBeNull();
  });

  it("un móvil ya activo que prueba códigos inventados se bloquea al sexto igual que un desconocido", async () => {
    const business = await createTestBusiness();
    await cambiarMovilDelDueno(business.id, MOVIL);
    await escribe(MOVIL, `ALTA ${await codigoDe(business.id)}`);
    const victima = await createTestBusiness({ name: "Víctima" });
    await cambiarMovilDelDueno(victima.id, TERCERO);
    mockedSendText.mockClear();

    const handlers: string[] = [];
    for (let i = 0; i < 7; i++) {
      handlers.push((await escribe(MOVIL, `ALTA AAAAA${i + 2}`)).handler);
    }

    expect(handlers.slice(0, 5)).toEqual(
      Array(5).fill("alta:ya-activo:codigo")
    );
    expect(handlers[5]).toBe("alta:bloqueado");
    expect(handlers[6]).toBe("alta:bloqueado:silenciado");
    expect(mockedSendText).toHaveBeenCalledTimes(6);
    expect(mockedSendText).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: mensajes.demasiadosIntentos() })
    );
    // Bloqueado, ni siquiera un código válido de otro negocio se consulta.
    const bloqueado = await escribe(
      MOVIL,
      `ALTA ${await codigoDe(victima.id)}`
    );
    expect(bloqueado.handler).toBe("alta:bloqueado:silenciado");
    expect((await negocioPorId(victima.id)).ownerWhatsappNumber).toBe(TERCERO);
  });

  it("el código de A usado por el móvil dueño de B vincula solo A", async () => {
    const a = await createTestBusiness({ name: "A" });
    const b = await createTestBusiness({ name: "B" });
    await cambiarMovilDelDueno(a.id, OTRO_MOVIL);
    await cambiarMovilDelDueno(b.id, MOVIL);
    await escribe(MOVIL, `ALTA ${await codigoDe(b.id)}`);
    const bAntes = await negocioPorId(b.id);

    const entrante = await escribe(MOVIL, `ALTA ${await codigoDe(a.id)}`);

    expect(entrante.handler).toBe("alta:vinculado");
    expect((await negocioPorId(a.id)).ownerWhatsappNumber).toBe(MOVIL);
    const bDespues = await negocioPorId(b.id);
    expect(bDespues.ownerWhatsappOptInAt).toEqual(bAntes.ownerWhatsappOptInAt);
    expect(bDespues.ownerWhatsappOptInMessageId).toBe(
      bAntes.ownerWhatsappOptInMessageId
    );
    expect(mockedSendText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: mensajes.bienvenidaTrasAlta({
          negocios: ["A"],
          movilApuntado: true,
        }),
      })
    );
  });

  it("otro tenant teclea mi móvil: ALTA a secas no lo activa, STOP nos da de baja a los dos, ALTA reactiva solo el mío", async () => {
    const mio = await createTestBusiness({ name: "Mi negocio" });
    await cambiarMovilDelDueno(mio.id, MOVIL);
    await escribe(MOVIL, `ALTA ${await codigoDe(mio.id)}`);
    const ajeno = await createTestBusiness({ name: "Negocio ajeno" });
    await cambiarMovilDelDueno(ajeno.id, MOVIL);
    const codigoAjeno = await codigoDe(ajeno.id);

    const alta = await escribe(MOVIL, "ALTA");
    expect(alta.handler).toBe("alta:ya-activo");
    expect((await negocioPorId(ajeno.id)).ownerWhatsappOptInAt).toBeNull();
    expect(mockedSendText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: mensajes.yaActivo({ negocios: ["Mi negocio"] }),
      })
    );

    const stop = await escribe(MOVIL, "STOP");
    expect(stop.handler).toBe("stop:dueno");
    expect((await negocioPorId(mio.id)).ownerWhatsappOptOutAt).not.toBeNull();
    expect((await negocioPorId(ajeno.id)).ownerWhatsappOptOutAt).not.toBeNull();
    expect(
      await prisma.whatsappOptOut.findUnique({
        where: {
          phoneNumber_audience: { phoneNumber: MOVIL, audience: "owner" },
        },
      })
    ).toEqual(
      expect.objectContaining({
        keyword: "STOP",
        inboundMessageId: stop.id,
        revokedAt: null,
      })
    );
    expect(mockedSendText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: mensajes.bajaDueno({ negocios: ["Mi negocio"] }),
      })
    );

    const reactivacion = await escribe(MOVIL, "alta");
    expect(reactivacion.handler).toBe("alta:reactivado");
    const mioDespues = await negocioPorId(mio.id);
    expect(mioDespues.ownerWhatsappOptOutAt).toBeNull();
    expect(mioDespues.ownerWhatsappOptInVia).toBe("alta_palabra");
    expect(mioDespues.ownerWhatsappOptInMessageId).toBe(reactivacion.id);
    const ajenoDespues = await negocioPorId(ajeno.id);
    expect(ajenoDespues.ownerWhatsappOptInAt).toBeNull();
    expect(ajenoDespues.ownerWhatsappOptOutAt).not.toBeNull();
    expect(ajenoDespues.ownerAltaCode).toBe(codigoAjeno);
    expect(
      (
        await prisma.whatsappOptOut.findFirstOrThrow({
          where: { phoneNumber: MOVIL },
        })
      ).revokedAt
    ).not.toBeNull();
    expect(mockedSendText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: mensajes.avisosReactivados({ negocios: ["Mi negocio"] }),
      })
    );
  });

  it("plantilla aprobada + plan en prueba: la activación deja su fila desde reclamarEnvio y el botón activa una vez", async () => {
    await sembrarPlantillaBienvenida();
    const business = await createTestBusiness({
      name: "Peluquería Ana",
      subscriptionStatus: "TRIALING",
    });
    await cambiarMovilDelDueno(business.id, MOVIL);

    expect(await iniciarActivacionDelDueno(business.id)).toEqual({
      outcome: "enviada",
      sent: "template",
    });
    expect(mockedSendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        from: NEGOCIOS,
        to: MOVIL,
        templateId: "tpl-bienvenida",
        bodyParams: { negocio_nombre: "Peluquería Ana" },
        callbackData: `alta:${business.id}`,
      })
    );
    const activacion = await prisma.sentMessage.findFirstOrThrow({
      where: { callbackData: `alta:${business.id}` },
    });
    expect(activacion).toEqual(
      expect.objectContaining({
        businessId: business.id,
        audience: "owner",
        toNumber: MOVIL,
        kind: "template",
        providerMessageId: expect.stringMatching(/^msg-tpl-/),
      })
    );
    expect(activacion.idempotencyKey).toMatch(
      new RegExp(`^alta:${business.id}:\\d+$`)
    );
    expect(
      (await negocioPorId(business.id)).ownerWhatsappActivationSentAt
    ).not.toBeNull();

    // Botón desde otro móvil: rechazado.
    const ajeno = mensajeDeBoton(OTRO_MOVIL, {
      contextId: activacion.providerMessageId!,
    });
    await handleWhatsappMessages(
      eventoMensajes({ to: NEGOCIOS, messages: [ajeno] })
    );
    expect((await entrantePorId(ajeno.id)).handler).toBe(
      "boton:activacion:remitente-distinto"
    );
    expect((await negocioPorId(business.id)).ownerWhatsappOptInAt).toBeNull();

    // Botón desde el móvil destinatario: activa.
    const boton = mensajeDeBoton(MOVIL, {
      contextId: activacion.providerMessageId!,
    });
    await handleWhatsappMessages(
      eventoMensajes({ to: NEGOCIOS, messages: [boton] })
    );
    const entrante = await entrantePorId(boton.id);
    expect(entrante).toEqual(
      expect.objectContaining({
        kind: "button",
        handler: "boton:activacion:ok",
        role: "owner",
        businessId: business.id,
      })
    );
    const activado = await negocioPorId(business.id);
    expect(activado.ownerWhatsappOptInVia).toBe("boton_plantilla");
    expect(activado.ownerWhatsappOptInMessageId).toBe(entrante.id);
    expect(activado.ownerAltaCode).toBeNull();
    expect(mockedSendText).toHaveBeenCalledTimes(1);
    expect(mockedSendText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: mensajes.bienvenidaTrasAlta({
          negocios: ["Peluquería Ana"],
          movilApuntado: false,
        }),
      })
    );

    // Segundo toque (otro id, mismo context.id): el consentimiento no se reescribe.
    const segundo = mensajeDeBoton(MOVIL, {
      contextId: activacion.providerMessageId!,
    });
    await handleWhatsappMessages(
      eventoMensajes({ to: NEGOCIOS, messages: [segundo] })
    );
    expect((await entrantePorId(segundo.id)).handler).toBe(
      "boton:activacion:ya-activo"
    );
    expect((await negocioPorId(business.id)).ownerWhatsappOptInAt).toEqual(
      activado.ownerWhatsappOptInAt
    );
    expect((await negocioPorId(business.id)).ownerWhatsappOptInMessageId).toBe(
      entrante.id
    );
  });

  it("sin plan no sale plantilla aunque esté aprobada; el botón sin context.id vale solo con una activación reciente", async () => {
    await sembrarPlantillaBienvenida();
    const sinPlan = await createTestBusiness({ subscriptionStatus: null });
    await cambiarMovilDelDueno(sinPlan.id, MOVIL);
    expect(await iniciarActivacionDelDueno(sinPlan.id)).toEqual({
      outcome: "sin_plan",
      sent: "link",
    });
    expect(mockedSendTemplate).not.toHaveBeenCalled();
    expect(await prisma.sentMessage.count()).toBe(0);

    // Sin activación reciente, el botón sin context.id queda pendiente.
    const huerfano = mensajeDeBoton(MOVIL, {});
    await handleWhatsappMessages(
      eventoMensajes({ to: NEGOCIOS, messages: [huerfano] })
    );
    expect((await entrantePorId(huerfano.id)).handler).toBe(
      "pendiente:boton:sin-contexto"
    );
    expect((await negocioPorId(sinPlan.id)).ownerWhatsappOptInAt).toBeNull();

    // Con una activación reciente a ese móvil, activa solo ese negocio.
    const conPlan = await createTestBusiness({ subscriptionStatus: "ACTIVE" });
    await cambiarMovilDelDueno(conPlan.id, MOVIL);
    expect(await iniciarActivacionDelDueno(conPlan.id)).toEqual({
      outcome: "enviada",
      sent: "template",
    });
    const boton = mensajeDeBoton(MOVIL, {});
    await handleWhatsappMessages(
      eventoMensajes({ to: NEGOCIOS, messages: [boton] })
    );
    expect((await entrantePorId(boton.id)).handler).toBe(
      "boton:activacion:por-envio"
    );
    expect((await negocioPorId(conPlan.id)).ownerWhatsappOptInVia).toBe(
      "boton_plantilla"
    );
    expect((await negocioPorId(sinPlan.id)).ownerWhatsappOptInAt).toBeNull();
  });

  it("131026 en diferido marca «sin WhatsApp»; un delivered lo limpia; tras cambiar de número no marca", async () => {
    await sembrarPlantillaBienvenida();
    const business = await createTestBusiness({ subscriptionStatus: "ACTIVE" });
    await cambiarMovilDelDueno(business.id, MOVIL);
    await iniciarActivacionDelDueno(business.id);
    const activacion = await prisma.sentMessage.findFirstOrThrow({
      where: { callbackData: `alta:${business.id}` },
    });

    await handleWhatsappMessages(
      eventoMensajes({
        to: NEGOCIOS,
        statuses: [
          {
            id: activacion.providerMessageId,
            status: "failed",
            timestamp: String(Math.floor(Date.now() / 1000)),
            recipient_id: MOVIL.slice(1),
            biz_opaque_callback_data: `alta:${business.id}`,
            errors: [{ code: 131026, title: "Message undeliverable" }],
          },
        ],
      })
    );
    expect(
      (await negocioPorId(business.id)).ownerWhatsappUnreachableAt
    ).not.toBeNull();
    expect((await resumenWhatsappDelDueno(business.id))?.status).toBe(
      "sin_whatsapp"
    );

    await handleMessageStatusEvent({
      data: {
        event_type: "message.finalized",
        id: "evt-fin-ok",
        occurred_at: new Date().toISOString(),
        payload: {
          id: activacion.providerMessageId,
          direction: "outbound",
          to: [{ phone_number: MOVIL, status: "delivered" }],
        },
      },
    });
    expect(
      (await negocioPorId(business.id)).ownerWhatsappUnreachableAt
    ).toBeNull();

    // message.finalized con delivery_failed 131026, tal como lo manda Telnyx.
    await handleMessageStatusEvent({
      data: {
        event_type: "message.finalized",
        id: "evt-fin-ko",
        occurred_at: new Date().toISOString(),
        payload: {
          id: activacion.providerMessageId,
          direction: "outbound",
          to: [{ phone_number: MOVIL, status: "delivery_failed" }],
          errors: [
            {
              code: "131026",
              title: "Undeliverable",
              detail: "Message Undeliverable",
            },
          ],
        },
      },
    });
    expect(
      (await negocioPorId(business.id)).ownerWhatsappUnreachableAt
    ).not.toBeNull();

    // Cambia de número: el 131026 del envío antiguo ya no aplica.
    await cambiarMovilDelDueno(business.id, OTRO_MOVIL);
    expect(
      (await negocioPorId(business.id)).ownerWhatsappUnreachableAt
    ).toBeNull();
    await handleMessageStatusEvent({
      data: {
        event_type: "message.finalized",
        id: "evt-fin-viejo",
        occurred_at: new Date().toISOString(),
        payload: {
          id: activacion.providerMessageId,
          direction: "outbound",
          to: [{ phone_number: MOVIL, status: "delivery_failed" }],
          errors: [{ code: "131026", title: "Undeliverable" }],
        },
      },
    });
    expect(
      (await negocioPorId(business.id)).ownerWhatsappUnreachableAt
    ).toBeNull();

    // El móvil nuevo recibe su propio 131026 y después llega un `read`
    // tardío del envío al móvil antiguo: la marca del nuevo se conserva.
    await iniciarActivacionDelDueno(business.id);
    const activacionNueva = await prisma.sentMessage.findFirstOrThrow({
      where: { callbackData: `alta:${business.id}`, toNumber: OTRO_MOVIL },
    });
    await handleWhatsappMessages(
      eventoMensajes({
        to: NEGOCIOS,
        statuses: [
          {
            id: activacionNueva.providerMessageId,
            status: "failed",
            timestamp: String(Math.floor(Date.now() / 1000)),
            recipient_id: OTRO_MOVIL.slice(1),
            biz_opaque_callback_data: `alta:${business.id}`,
            errors: [{ code: 131026, title: "Message undeliverable" }],
          },
        ],
      })
    );
    expect(
      (await negocioPorId(business.id)).ownerWhatsappUnreachableAt
    ).not.toBeNull();
    await handleWhatsappMessages(
      eventoMensajes({
        to: NEGOCIOS,
        statuses: [
          {
            id: activacion.providerMessageId,
            status: "read",
            timestamp: String(Math.floor(Date.now() / 1000)),
            recipient_id: MOVIL.slice(1),
            biz_opaque_callback_data: `alta:${business.id}`,
          },
        ],
      })
    );
    expect(
      (await negocioPorId(business.id)).ownerWhatsappUnreachableAt
    ).not.toBeNull();
    expect((await resumenWhatsappDelDueno(business.id))?.status).toBe(
      "sin_whatsapp"
    );
  });

  it("si el statuses[] llega antes que el registro del envío, la fila adhoc se fusiona con el negocio y el callback", async () => {
    await sembrarPlantillaBienvenida();
    const business = await createTestBusiness({ subscriptionStatus: "ACTIVE" });
    await cambiarMovilDelDueno(business.id, MOVIL);
    mockedSendTemplate.mockImplementationOnce(async (input) => {
      // El webhook de estado se adelanta al upsert de registrarEnvio.
      await handleWhatsappMessages(
        eventoMensajes({
          to: NEGOCIOS,
          statuses: [
            {
              id: "msg-adelantado",
              status: "sent",
              timestamp: String(Math.floor(Date.now() / 1000)),
              recipient_id: input.to.slice(1),
              biz_opaque_callback_data: input.callbackData,
            },
          ],
        })
      );
      return { messageId: "msg-adelantado", status: "queued" };
    });

    expect(await iniciarActivacionDelDueno(business.id)).toEqual({
      outcome: "enviada",
      sent: "template",
    });

    const fila = await prisma.sentMessage.findUniqueOrThrow({
      where: { providerMessageId: "msg-adelantado" },
    });
    expect(fila).toEqual(
      expect.objectContaining({
        idempotencyKey: "adhoc:msg-adelantado",
        businessId: business.id,
        audience: "owner",
        toNumber: MOVIL,
        callbackData: `alta:${business.id}`,
        kind: "template",
        deliveryStatus: "sent",
      })
    );
  });

  it("una colisión del código se reintenta y los dos negocios acaban con códigos distintos", async () => {
    const a = await createTestBusiness();
    await cambiarMovilDelDueno(a.id, MOVIL);
    const codigoA = await codigoDe(a.id);
    // Los bytes que reproducen exactamente el código de A, solo la primera vez.
    const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = Buffer.from([...codigoA].map((c) => alfabeto.indexOf(c)));
    const spy = vi
      .spyOn(crypto, "randomBytes")
      .mockReturnValueOnce(bytes as never);

    const b = await createTestBusiness();
    expect(await cambiarMovilDelDueno(b.id, OTRO_MOVIL)).toEqual({ count: 1 });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(await codigoDe(b.id)).not.toBe(codigoA);
    spy.mockRestore();
  });

  it("dos «ALTA <código>» concurrentes con el mismo código desde dos móviles: solo uno vincula", async () => {
    const business = await createTestBusiness();
    await cambiarMovilDelDueno(business.id, TERCERO);
    const codigo = await codigoDe(business.id);
    const m1 = mensajeDeTexto(MOVIL, `ALTA ${codigo}`);
    const m2 = mensajeDeTexto(OTRO_MOVIL, `ALTA ${codigo}`);

    await Promise.all([
      handleWhatsappMessages(eventoMensajes({ to: NEGOCIOS, messages: [m1] })),
      handleWhatsappMessages(eventoMensajes({ to: NEGOCIOS, messages: [m2] })),
    ]);

    const handlers = [
      (await entrantePorId(m1.id)).handler,
      (await entrantePorId(m2.id)).handler,
    ].sort();
    expect(handlers.filter((h) => h === "alta:vinculado")).toHaveLength(1);
    expect(handlers).toContain("alta:codigo-invalido");
    expect([MOVIL, OTRO_MOVIL]).toContain(
      (await negocioPorId(business.id)).ownerWhatsappNumber
    );
  });

  it("dos activaciones concurrentes: una plantilla y un «demasiado pronto»; tres negocios al mismo móvil: la tercera topa", async () => {
    await sembrarPlantillaBienvenida();
    const business = await createTestBusiness({ subscriptionStatus: "ACTIVE" });
    await cambiarMovilDelDueno(business.id, MOVIL);

    const resultados = await Promise.all([
      iniciarActivacionDelDueno(business.id),
      iniciarActivacionDelDueno(business.id),
    ]);
    expect(resultados.map((r) => r.outcome).sort()).toEqual([
      "demasiado_pronto",
      "enviada",
    ]);
    expect(mockedSendTemplate).toHaveBeenCalledTimes(1);

    const segundo = await createTestBusiness({ subscriptionStatus: "ACTIVE" });
    await cambiarMovilDelDueno(segundo.id, MOVIL);
    expect((await iniciarActivacionDelDueno(segundo.id)).outcome).toBe(
      "enviada"
    );
    const tercero = await createTestBusiness({ subscriptionStatus: "ACTIVE" });
    await cambiarMovilDelDueno(tercero.id, MOVIL);
    expect((await iniciarActivacionDelDueno(tercero.id)).outcome).toBe(
      "limite_destino"
    );
    expect(mockedSendTemplate).toHaveBeenCalledTimes(2);
  });

  it("dos fallos de Telnyx al enviar la plantilla no agotan el tope por destino", async () => {
    await sembrarPlantillaBienvenida();
    const business = await createTestBusiness({ subscriptionStatus: "ACTIVE" });
    await cambiarMovilDelDueno(business.id, MOVIL);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedSendTemplate
      .mockRejectedValueOnce(new Error("Telnyx 503"))
      .mockRejectedValueOnce(new Error("Telnyx 503"));

    expect(await iniciarActivacionDelDueno(business.id)).toEqual({
      outcome: "envio_fallido",
      sent: "link",
    });
    expect(await iniciarActivacionDelDueno(business.id)).toEqual({
      outcome: "envio_fallido",
      sent: "link",
    });
    expect(
      await prisma.sentMessage.findMany({
        where: { toNumber: MOVIL },
        select: { deliveryStatus: true, errorCode: true, errorDetail: true },
      })
    ).toEqual([
      {
        deliveryStatus: "failed",
        errorCode: "SEND_ERROR",
        errorDetail: "Telnyx 503",
      },
      {
        deliveryStatus: "failed",
        errorCode: "SEND_ERROR",
        errorDetail: "Telnyx 503",
      },
    ]);

    expect(await iniciarActivacionDelDueno(business.id)).toEqual({
      outcome: "enviada",
      sent: "template",
    });
    expect(mockedSendTemplate).toHaveBeenCalledTimes(3);
    errorSpy.mockRestore();
  });

  it("botón sin context.id con activaciones de dos negocios al mismo móvil: no se activa ninguno", async () => {
    await sembrarPlantillaBienvenida();
    const a = await createTestBusiness({
      name: "A",
      subscriptionStatus: "ACTIVE",
    });
    const b = await createTestBusiness({
      name: "B",
      subscriptionStatus: "ACTIVE",
    });
    await cambiarMovilDelDueno(a.id, MOVIL);
    await cambiarMovilDelDueno(b.id, MOVIL);
    expect((await iniciarActivacionDelDueno(a.id)).outcome).toBe("enviada");
    expect((await iniciarActivacionDelDueno(b.id)).outcome).toBe("enviada");

    const boton = mensajeDeBoton(MOVIL, {});
    await handleWhatsappMessages(
      eventoMensajes({ to: NEGOCIOS, messages: [boton] })
    );

    expect((await entrantePorId(boton.id)).handler).toBe(
      "pendiente:boton:ambiguo"
    );
    expect((await negocioPorId(a.id)).ownerWhatsappOptInAt).toBeNull();
    expect((await negocioPorId(b.id)).ownerWhatsappOptInAt).toBeNull();
    expect(mockedSendText).not.toHaveBeenCalled();

    // Con context.id que apunta a un envío sin fila tampoco se adivina.
    const perdido = mensajeDeBoton(MOVIL, { contextId: "msg-que-no-existe" });
    await handleWhatsappMessages(
      eventoMensajes({ to: NEGOCIOS, messages: [perdido] })
    );
    expect((await entrantePorId(perdido.id)).handler).toBe(
      "pendiente:boton:sin-fila"
    );
    expect((await negocioPorId(a.id)).ownerWhatsappOptInAt).toBeNull();
  });

  it("una fila sin enrutar de hace cinco minutos la recoge el siguiente evento y su respuesta sale una vez", async () => {
    const business = await createTestBusiness({ name: "Peluquería Ana" });
    await cambiarMovilDelDueno(business.id, MOVIL);
    const hace5min = new Date(Date.now() - 5 * 60 * 1000);
    const huerfana = await prisma.inboundMessage.create({
      data: {
        providerMessageId: "in-huerfano",
        eventId: "evt-muerto",
        fromNumber: MOVIL,
        toNumber: NEGOCIOS,
        audience: "owner",
        role: "owner",
        businessId: business.id,
        kind: "keyword",
        text: `ALTA ${await codigoDe(business.id)}`,
        payload: { type: "text" },
        receivedAt: hace5min,
        createdAt: hace5min,
      },
    });

    // Cualquier evento posterior (aquí uno del número de clientes) barre.
    await handleWhatsappMessages(
      eventoMensajes({
        to: CLIENTES,
        messages: [mensajeDeTexto(TERCERO, "hola")],
      })
    );

    const recogida = await entrantePorId("in-huerfano");
    expect(recogida.handler).toBe("alta:vinculado");
    expect(recogida.handledAt).not.toBeNull();
    expect((await negocioPorId(business.id)).ownerWhatsappOptInMessageId).toBe(
      huerfana.id
    );
    expect(
      await prisma.sentMessage.count({
        where: { idempotencyKey: `entrante:${huerfana.id}:bienvenida` },
      })
    ).toBe(1);

    // Un segundo barrido no la vuelve a tocar.
    await handleWhatsappMessages(
      eventoMensajes({
        to: CLIENTES,
        messages: [mensajeDeTexto(TERCERO, "hola otra vez")],
      })
    );
    expect(await prisma.sentMessage.count({ where: { toNumber: MOVIL } })).toBe(
      1
    );
  });

  it("el barrido de una fila vieja no retrocede la ventana de 24 h abierta por un mensaje más reciente", async () => {
    const business = await createTestBusiness({ name: "Peluquería Ana" });
    await cambiarMovilDelDueno(business.id, MOVIL);
    await escribe(MOVIL, `ALTA ${await codigoDe(business.id)}`);
    const reciente = await escribe(MOVIL, "hola");
    const ventanaVigente = (await negocioPorId(business.id))
      .ownerWindowOpenUntil;
    expect(ventanaVigente!.getTime()).toBeGreaterThanOrEqual(
      reciente.receivedAt.getTime() + 24 * 60 * 60 * 1000 - 1000
    );

    const hace10min = new Date(Date.now() - 10 * 60 * 1000);
    await prisma.inboundMessage.create({
      data: {
        providerMessageId: "in-vieja",
        eventId: "evt-muerto-2",
        fromNumber: MOVIL,
        toNumber: NEGOCIOS,
        audience: "owner",
        role: "owner",
        businessId: business.id,
        kind: "text",
        text: "hola de antes",
        payload: { type: "text" },
        receivedAt: hace10min,
        createdAt: hace10min,
      },
    });
    await handleWhatsappMessages(
      eventoMensajes({
        to: CLIENTES,
        messages: [mensajeDeTexto(TERCERO, "hola")],
      })
    );

    expect((await entrantePorId("in-vieja")).handledAt).not.toBeNull();
    expect((await negocioPorId(business.id)).ownerWindowOpenUntil).toEqual(
      ventanaVigente
    );
  });
});
