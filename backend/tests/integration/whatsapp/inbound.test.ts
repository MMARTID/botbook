import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { resetDb } from "../helpers/db.js";
import { createTestBusiness, createTestCall } from "../helpers/fixtures.js";
import {
  handleMessageStatusEvent,
  handleWhatsappMessages,
} from "../../../src/modules/whatsapp/webhooks.js";
import {
  enviarTexto,
  invalidarCacheRemitentes,
} from "../../../src/modules/whatsapp/service.js";
import { whatsappAdapter } from "../../../src/adapters/whatsapp/WhatsAppAdapter.js";

// Contra Postgres real: lo que se prueba es la persistencia (unicidad de
// providerMessageId, correlación SentMessage ↔ statuses, identificación por
// la BD). La API de Telnyx se sustituye.
vi.mock("../../../src/adapters/whatsapp/WhatsAppAdapter.js", () => ({
  whatsappAdapter: { sendText: vi.fn() },
}));

const CLIENTES = "+34930454394";
const NEGOCIOS = "+34930453218";
const MOVIL = "+34692138456";

function eventoMensajes(
  id: string,
  messages: unknown[],
  statuses: unknown[] = [],
  to = CLIENTES
) {
  return {
    data: {
      event_type: "whatsapp.messages",
      id,
      occurred_at: "2026-09-19T19:13:59Z",
      payload: {
        contacts: [{ profile: { name: "Miki" }, wa_id: MOVIL.slice(1) }],
        messages,
        statuses,
        metadata: {
          display_phone_number: to.slice(1),
          phone_number_id: "1305416552659363",
        },
      },
    },
  };
}

describe("WhatsApp entrante (integración)", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    invalidarCacheRemitentes();
    await prisma.whatsappSender.createMany({
      data: [
        { audience: "client", phoneNumber: CLIENTES, status: "CONNECTED" },
        { audience: "owner", phoneNumber: NEGOCIOS, status: "CONNECTED" },
      ],
    });
    vi.mocked(whatsappAdapter.sendText).mockResolvedValue({
      messageId: "msg-out-1",
      status: "queued",
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("identifica al cliente por sus reservas, guarda el mensaje una sola vez y deja el handler pendiente", async () => {
    const business = await createTestBusiness();
    const call = await createTestCall(business.id, { fromNumber: MOVIL });
    await prisma.booking.create({
      data: {
        callId: call.id,
        programedAt: new Date(Date.now() + 86_400_000),
        numberPeople: 1,
      },
    });
    const mensaje = {
      id: "in-1",
      from: MOVIL,
      timestamp: "1789845237",
      type: "text",
      text: { body: "Hola" },
    };

    expect(
      await handleWhatsappMessages(eventoMensajes("evt-1", [mensaje]))
    ).toEqual({ success: true });
    // Reintento del proveedor con el mismo mensaje en otro evento.
    expect(
      await handleWhatsappMessages(eventoMensajes("evt-2", [mensaje]))
    ).toEqual({ success: true });

    const guardados = await prisma.inboundMessage.findMany();
    expect(guardados).toHaveLength(1);
    expect(guardados[0]).toEqual(
      expect.objectContaining({
        providerMessageId: "in-1",
        fromNumber: MOVIL,
        toNumber: CLIENTES,
        audience: "client",
        role: "client",
        businessId: business.id,
        kind: "text",
        text: "Hola",
        contactName: "Miki",
        handler: "pendiente:texto:client",
      })
    );
    expect(guardados[0].handledAt).not.toBeNull();
  });

  it("identifica al dueño por ownerWhatsappNumber solo en el número de negocios", async () => {
    const business = await createTestBusiness({ ownerWhatsappNumber: MOVIL });
    const mensaje = {
      id: "in-2",
      from: MOVIL,
      type: "text",
      text: { body: "agenda" },
    };

    await handleWhatsappMessages(
      eventoMensajes("evt-3", [mensaje], [], NEGOCIOS)
    );
    await handleWhatsappMessages(
      eventoMensajes("evt-4", [{ ...mensaje, id: "in-3" }], [], CLIENTES)
    );

    const [enNegocios, enClientes] = await prisma.inboundMessage.findMany({
      orderBy: { providerMessageId: "asc" },
    });
    expect(enNegocios).toEqual(
      expect.objectContaining({
        audience: "owner",
        role: "owner",
        businessId: business.id,
        kind: "keyword",
        handler: "agenda:sin-negocio",
      })
    );
    expect(enClientes).toEqual(
      expect.objectContaining({
        audience: "client",
        role: "unknown",
        businessId: null,
      })
    );
  });

  it("un botón se correlaciona con el mensaje enviado y los statuses actualizan su entrega", async () => {
    const business = await createTestBusiness();
    await enviarTexto({
      audience: "client",
      to: MOVIL,
      body: "¿Confirmas?",
      businessId: business.id,
    });

    const enviado = await prisma.sentMessage.findUniqueOrThrow({
      where: { providerMessageId: "msg-out-1" },
    });
    expect(enviado).toEqual(
      expect.objectContaining({
        channel: "whatsapp",
        idempotencyKey: "adhoc:msg-out-1",
        fromNumber: CLIENTES,
        toNumber: MOVIL,
        kind: "text",
        deliveryStatus: "queued",
      })
    );

    await handleWhatsappMessages(
      eventoMensajes(
        "evt-5",
        [
          {
            id: "in-4",
            from: MOVIL,
            type: "interactive",
            context: { from: CLIENTES.slice(1), id: "msg-out-1" },
            interactive: {
              type: "button_reply",
              button_reply: { id: "booking:b1:confirmo", title: "Confirmo" },
            },
          },
        ],
        [
          {
            id: "msg-out-1",
            status: "delivered",
            timestamp: "1789845271",
            recipient_id: MOVIL.slice(1),
          },
          {
            id: "msg-out-1",
            status: "read",
            timestamp: "1789845272",
            recipient_id: MOVIL.slice(1),
          },
        ]
      )
    );

    const boton = await prisma.inboundMessage.findUniqueOrThrow({
      where: { providerMessageId: "in-4" },
    });
    expect(boton).toEqual(
      expect.objectContaining({
        kind: "button",
        buttonId: "booking:b1:confirmo",
        contextMessageId: "msg-out-1",
        // La fila del envío es `adhoc` (sin callbackData `cliente:*`): el
        // botón se correlaciona pero no hay recurso sobre el que actuar.
        handler: "cliente:boton:sin-callback",
      })
    );
    const actualizado = await prisma.sentMessage.findUniqueOrThrow({
      where: { providerMessageId: "msg-out-1" },
    });
    expect(actualizado.deliveryStatus).toBe("read");
    expect(actualizado.deliveredAt).toEqual(new Date(1789845271 * 1000));
    expect(actualizado.readAt).toEqual(new Date(1789845272 * 1000));
  });

  it("message.finalized guarda el coste y un fallo posterior no se pierde", async () => {
    await enviarTexto({ audience: "owner", to: MOVIL, body: "aviso" });

    await handleMessageStatusEvent({
      data: {
        event_type: "message.finalized",
        id: "evt-6",
        occurred_at: "2026-09-19T21:15:34.290+00:00",
        payload: {
          id: "msg-out-1",
          direction: "outbound",
          to: [{ phone_number: MOVIL, status: "delivered" }],
          cost: { amount: "0.0040", currency: "USD" },
        },
      },
    });
    const entregado = await prisma.sentMessage.findUniqueOrThrow({
      where: { providerMessageId: "msg-out-1" },
    });
    expect(entregado.deliveryStatus).toBe("delivered");
    expect(entregado.costAmount?.toString()).toBe("0.004");
    expect(entregado.costCurrency).toBe("USD");

    await handleMessageStatusEvent({
      data: {
        event_type: "message.finalized",
        id: "evt-7",
        occurred_at: "2026-09-19T21:16:00.000+00:00",
        payload: {
          id: "msg-out-1",
          direction: "outbound",
          to: [{ phone_number: MOVIL, status: "delivery_failed" }],
          errors: [
            {
              code: "40008",
              title: "Undeliverable",
              detail: "The recipient carrier did not accept the message.",
            },
          ],
        },
      },
    });
    const fallido = await prisma.sentMessage.findUniqueOrThrow({
      where: { providerMessageId: "msg-out-1" },
    });
    expect(fallido).toEqual(
      expect.objectContaining({ deliveryStatus: "failed", errorCode: "40008" })
    );
  });

  it("un entrante real del dueño abre la ventana de 24 h y limpia la marca de 131026", async () => {
    const business = await createTestBusiness({
      ownerWhatsappNumber: MOVIL,
      ownerWhatsappUnreachableAt: new Date("2026-09-19T10:00:00Z"),
    });
    const timestamp = 1789845237;

    await handleWhatsappMessages(
      eventoMensajes(
        "evt-8",
        [
          {
            id: "in-8",
            from: MOVIL,
            timestamp: String(timestamp),
            type: "text",
            text: { body: "hola" },
          },
        ],
        [],
        NEGOCIOS
      )
    );

    const actualizado = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(actualizado.ownerWindowOpenUntil).toEqual(
      new Date((timestamp + 86_400) * 1000)
    );
    expect(actualizado.ownerWhatsappUnreachableAt).toBeNull();
  });

  it("una reacción del dueño se guarda pero no toca la ventana ni responde", async () => {
    const business = await createTestBusiness({ ownerWhatsappNumber: MOVIL });

    await handleWhatsappMessages(
      eventoMensajes(
        "evt-9",
        [
          {
            id: "in-9",
            from: MOVIL,
            type: "reaction",
            reaction: { emoji: "👍", message_id: "x" },
          },
        ],
        [],
        NEGOCIOS
      )
    );

    const guardado = await prisma.inboundMessage.findUniqueOrThrow({
      where: { providerMessageId: "in-9" },
    });
    expect(guardado).toEqual(
      expect.objectContaining({
        kind: "other",
        handler: "ignorado:reaction",
        role: "owner",
      })
    );
    expect(
      (await prisma.business.findUniqueOrThrow({ where: { id: business.id } }))
        .ownerWindowOpenUntil
    ).toBeNull();
    expect(whatsappAdapter.sendText).not.toHaveBeenCalled();
  });

  it("un duplicado con otro data.id no crea una segunda respuesta", async () => {
    await createTestBusiness({ ownerWhatsappNumber: MOVIL });
    const mensaje = {
      id: "in-10",
      from: MOVIL,
      type: "text",
      text: { body: "hola" },
    };

    await handleWhatsappMessages(
      eventoMensajes("evt-10", [mensaje], [], NEGOCIOS)
    );
    await handleWhatsappMessages(
      eventoMensajes("evt-11", [mensaje], [], NEGOCIOS)
    );

    expect(await prisma.inboundMessage.count()).toBe(1);
    expect(whatsappAdapter.sendText).toHaveBeenCalledTimes(1);
    expect(await prisma.sentMessage.count({ where: { toNumber: MOVIL } })).toBe(
      1
    );
  });

  it("un botón de plantilla type: button con context.id acaba en handler cliente:confirmo", async () => {
    const business = await createTestBusiness({
      telnyxPhoneNumber: "+34930111222",
    });
    const call = await createTestCall(business.id, { fromNumber: MOVIL });
    const booking = await prisma.booking.create({
      data: {
        callId: call.id,
        programedAt: new Date(Date.now() + 3 * 86_400_000),
        numberPeople: 1,
        smsConsent: true,
      },
    });
    await prisma.sentMessage.create({
      data: {
        channel: "whatsapp",
        idempotencyKey: "booking-x-recordatorio-1",
        providerMessageId: "msg-recordatorio",
        businessId: business.id,
        audience: "client",
        toNumber: MOVIL,
        kind: "template",
        templateName: "recordatorio_cita_v2",
        callbackData: `cliente:recordatorio:${booking.id}`,
      },
    });
    const boton = {
      id: "in-12",
      from: MOVIL,
      type: "button",
      button: { payload: "Confirmo", text: "Confirmo" },
      context: { from: CLIENTES.slice(1), id: "msg-recordatorio" },
    };

    expect(
      await handleWhatsappMessages(eventoMensajes("evt-12", [boton]))
    ).toEqual({ success: true });

    const guardado = await prisma.inboundMessage.findUniqueOrThrow({
      where: { providerMessageId: "in-12" },
    });
    expect(guardado).toEqual(
      expect.objectContaining({
        kind: "button",
        buttonId: "Confirmo",
        buttonTitle: "Confirmo",
        contextMessageId: "msg-recordatorio",
        audience: "client",
        role: "client",
        handler: "cliente:confirmo",
      })
    );
    const confirmada = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(confirmada.confirmedByClientAt).not.toBeNull();
    expect(whatsappAdapter.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        from: CLIENTES,
        to: MOVIL,
        body: expect.stringContaining("queda confirmada"),
      })
    );
  });
});
