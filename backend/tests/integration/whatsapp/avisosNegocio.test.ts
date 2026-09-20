import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { resetDb } from "../helpers/db.js";
import { createTestBusiness, createTestCall } from "../helpers/fixtures.js";
import { whatsappAdapter } from "../../../src/adapters/whatsapp/WhatsAppAdapter.js";
import { invalidarCacheRemitentes } from "../../../src/modules/whatsapp/service.js";
import {
  avisarNuevaReserva,
  avisarCitaPendiente,
} from "../../../src/modules/whatsapp/avisosNegocio.js";
import { handleWhatsappMessages } from "../../../src/modules/whatsapp/webhooks.js";
import { eventoMensajes, CLIENTES, NEGOCIOS } from "../helpers/whatsapp.js";

// Contra Postgres real: idempotencia por recurso, correlación del botón con
// el aviso (context.id → SentMessage.callbackData) y la resolución del lead.
// Telnyx se sustituye.
vi.mock("../../../src/adapters/whatsapp/WhatsAppAdapter.js", () => ({
  whatsappAdapter: {
    sendInteractiveButtons: vi.fn(),
    sendTemplate: vi.fn(),
    sendText: vi.fn(),
    getConversationWindow: vi.fn(),
  },
}));

const MOVIL = "+34692138456";
const CITA = new Date("2026-09-24T15:00:00Z");

const mockedBotones = vi.mocked(whatsappAdapter.sendInteractiveButtons);
const mockedTexto = vi.mocked(whatsappAdapter.sendText);
const mockedVentana = vi.mocked(whatsappAdapter.getConversationWindow);

let mensajes = 0;

describe("avisos al negocio (integración)", () => {
  beforeEach(async () => {
    await resetDb();
    invalidarCacheRemitentes();
    vi.clearAllMocks();
    mensajes = 0;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await prisma.whatsappSender.createMany({
      data: [
        { audience: "client", phoneNumber: CLIENTES, status: "CONNECTED" },
        { audience: "owner", phoneNumber: NEGOCIOS, status: "CONNECTED" },
      ],
    });
    mockedVentana.mockResolvedValue({
      active: true,
      expiresAt: null,
      lastUserMessageAt: null,
      type: "24h",
    });
    mockedBotones.mockImplementation(async () => ({
      messageId: `msg-${++mensajes}`,
      status: "queued",
    }));
    mockedTexto.mockImplementation(async () => ({
      messageId: `msg-${++mensajes}`,
      status: "queued",
    }));
  });

  it("avisa una sola vez por reserva y deja la fila con la correlación del botón", async () => {
    const business = await createTestBusiness({
      ownerWhatsappNumber: MOVIL,
      ownerWhatsappOptInAt: new Date(),
    });
    const reserva = {
      businessId: business.id,
      businessName: business.name,
      timezone: "Europe/Madrid",
      bookingId: "booking_x",
      clientName: "Marta",
      startDateTime: CITA,
      serviceNames: ["Corte"],
      professionalName: null,
    };

    expect(await avisarNuevaReserva(reserva)).toEqual({ via: "interactivo" });
    expect(await avisarNuevaReserva(reserva)).toEqual({
      via: "ninguna",
      motivo: "ya enviado",
    });
    expect(mockedBotones).toHaveBeenCalledTimes(1);

    const fila = await prisma.sentMessage.findUniqueOrThrow({
      where: {
        channel_idempotencyKey: {
          channel: "whatsapp",
          idempotencyKey: "aviso:nueva_reserva:booking_x",
        },
      },
    });
    expect(fila).toEqual(
      expect.objectContaining({
        providerMessageId: "msg-1",
        businessId: business.id,
        audience: "owner",
        toNumber: MOVIL,
        kind: "interactive",
        callbackData: "aviso:nueva_reserva:booking_x",
      })
    );
  });

  it("un móvil sin consentimiento no recibe nada y no deja fila", async () => {
    const business = await createTestBusiness({ ownerWhatsappNumber: MOVIL });

    const resultado = await avisarNuevaReserva({
      businessId: business.id,
      businessName: business.name,
      timezone: "Europe/Madrid",
      bookingId: "booking_y",
      clientName: "Marta",
      startDateTime: CITA,
      serviceNames: [],
      professionalName: null,
    });

    expect(resultado.via).toBe("ninguna");
    expect(mockedBotones).not.toHaveBeenCalled();
    expect(await prisma.sentMessage.count()).toBe(0);
  });

  it("cita pendiente: el aviso queda anotado en el lead y «La apunté yo» lo resuelve desde el botón", async () => {
    const business = await createTestBusiness({
      ownerWhatsappNumber: MOVIL,
      ownerWhatsappOptInAt: new Date(),
    });
    const call = await createTestCall(business.id, {
      fromNumber: "+34600111222",
    });
    const lead = await prisma.lead.create({
      data: {
        callId: call.id,
        type: "pending_booking",
        data: {
          clientName: "Juan",
          startDateTime: CITA.toISOString(),
          failureCode: "calendar_reconnect_required",
        },
      },
    });

    expect(
      await avisarCitaPendiente({
        businessId: business.id,
        businessName: business.name,
        timezone: "Europe/Madrid",
        leadId: lead.id,
        clientName: "Juan",
        startDateTime: CITA,
        failureCode: "calendar_reconnect_required",
      })
    ).toEqual({ via: "interactivo" });
    const anotado = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(anotado.notifiedVia).toBe("interactivo");
    expect(anotado.notifiedAt).not.toBeNull();

    // El dueño pulsa «La apunté yo» en ese aviso (context.id = msg-1).
    await handleWhatsappMessages(
      eventoMensajes({
        to: NEGOCIOS,
        waId: MOVIL.slice(1),
        messages: [
          {
            id: "in-boton",
            from: MOVIL,
            type: "interactive",
            context: { from: NEGOCIOS.slice(1), id: "msg-1" },
            interactive: {
              type: "button_reply",
              button_reply: {
                id: `aviso:cita_pendiente:${lead.id}:apuntada`,
                title: "La apunté yo",
              },
            },
          },
        ],
      })
    );

    const resuelto = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(resuelto.resolvedAt).not.toBeNull();
    expect((resuelto.data as { resolvedBy?: string }).resolvedBy).toBe(
      "owner_whatsapp"
    );
    const entrante = await prisma.inboundMessage.findUniqueOrThrow({
      where: { providerMessageId: "in-boton" },
    });
    expect(entrante.handler).toBe("aviso:cita_pendiente:apuntada");
    expect(mockedTexto).toHaveBeenCalledWith(
      expect.objectContaining({ to: MOVIL })
    );
  });
});
