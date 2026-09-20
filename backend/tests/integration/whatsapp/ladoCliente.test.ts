import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { resetDb } from "../helpers/db.js";
import {
  createTestBusiness,
  createTestCall,
  createTestProfessional,
  nextOpenSlot,
} from "../helpers/fixtures.js";
import {
  CLIENTES,
  eventoMensajes,
  mensajeDeBoton,
  sembrarRemitentes,
} from "../helpers/whatsapp.js";
import { whatsappAdapter } from "../../../src/adapters/whatsapp/WhatsAppAdapter.js";
import { calendarService } from "../../../src/modules/calendar/service.js";
import { executeVoiceTool } from "../../../src/modules/voiceTools/service.js";
import { handleWhatsappMessages } from "../../../src/modules/whatsapp/webhooks.js";
import {
  invalidarCacheListaDeEspera,
  reiniciarEnfriamientoDePlantillas,
} from "../../../src/modules/whatsapp/service.js";

// Contra Postgres/Redis reales: filas de SentMessage, correlación del botón
// con el envío (context.id), Call sintética + Booking en una transacción,
// lock de reserva entre dos toques concurrentes y efectos de un failed
// diferido de Meta. Telnyx (WhatsApp) y el calendario se sustituyen; los
// jobs de Cloud Tasks corren en línea (NODE_ENV=test).
vi.mock("../../../src/adapters/whatsapp/WhatsAppAdapter.js", () => ({
  whatsappAdapter: {
    isConfigured: vi.fn(() => true),
    sendTemplate: vi.fn(),
    sendText: vi.fn(),
    sendInteractiveButtons: vi.fn(),
    sendContacts: vi.fn(),
    getConversationWindow: vi.fn(),
    listTemplates: vi.fn(),
  },
}));
vi.mock("../../../src/modules/calendar/service.js", () => ({
  calendarService: {
    bookAppointment: vi.fn(),
    getBusyIntervals: vi.fn(),
    cancelAppointment: vi.fn(),
  },
}));

const MOVIL = "+34692138456";
const OTRO = "+34600111222";
const DUENO = "+34600999888";

const mockedTemplate = vi.mocked(whatsappAdapter.sendTemplate);
const mockedText = vi.mocked(whatsappAdapter.sendText);
const mockedButtons = vi.mocked(whatsappAdapter.sendInteractiveButtons);
const mockedWindow = vi.mocked(whatsappAdapter.getConversationWindow);
const mockedBook = vi.mocked(calendarService.bookAppointment);
const mockedBusy = vi.mocked(calendarService.getBusyIntervals);
const mockedCancelEvent = vi.mocked(calendarService.cancelAppointment);

let salientes = 0;
function siguienteId() {
  salientes += 1;
  return `msg-${salientes}`;
}

async function sembrarPlantillas(
  extra: Array<{
    key: string;
    name: string;
    language: string;
    status: string;
    components?: unknown;
  }> = []
) {
  const base = [
    {
      key: "confirmacion_cita",
      name: "confirmacion_cita",
      language: "es_ES",
      status: "APPROVED",
    },
    {
      key: "recordatorio_cita",
      name: "recordatorio_cita",
      language: "es",
      status: "APPROVED",
    },
    {
      key: "hueco_libre",
      name: "hueco_libre",
      language: "es",
      status: "APPROVED",
    },
    {
      key: "hora_disponible",
      name: "hora_disponible",
      language: "es",
      status: "APPROVED",
    },
    {
      key: "confirmacion_cita_v2",
      name: "confirmacion_cita_v2",
      language: "es",
      status: "PENDING",
    },
  ];
  for (const t of [...base, ...extra]) {
    await prisma.whatsappTemplate.upsert({
      where: { key: t.key },
      create: {
        key: t.key,
        name: t.name,
        language: t.language,
        telnyxTemplateId: `tpl-${t.key}`,
        category: t.key === "hora_disponible" ? "MARKETING" : "UTILITY",
        status: t.status,
        lastSyncedAt: new Date(),
        components: (t.components as never) ?? undefined,
      },
      update: {
        status: t.status,
        components: (t.components as never) ?? undefined,
      },
    });
  }
}

async function negocioConDueno(overrides: Record<string, unknown> = {}) {
  return createTestBusiness({
    telnyxPhoneNumber: `+3493${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
    ownerWhatsappNumber: DUENO,
    ownerWhatsappOptInAt: new Date(),
    ...overrides,
  } as never);
}

describe("lado cliente por WhatsApp (integración)", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    salientes = 0;
    reiniciarEnfriamientoDePlantillas();
    invalidarCacheListaDeEspera();
    delete process.env.WHATSAPP_WABA_ID;
    delete process.env.WHATSAPP_TEMPLATE_CONFIRMATION_NAME;
    delete process.env.WHATSAPP_TEMPLATE_REMINDER_NAME;
    delete process.env.WHATSAPP_TEMPLATE_SLOT_AVAILABLE_NAME;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await sembrarRemitentes();
    await sembrarPlantillas();
    mockedTemplate.mockImplementation(async () => ({
      messageId: siguienteId(),
      status: "queued",
    }));
    mockedText.mockImplementation(async () => ({
      messageId: siguienteId(),
      status: "queued",
    }));
    mockedButtons.mockImplementation(async () => ({
      messageId: siguienteId(),
      status: "queued",
    }));
    mockedWindow.mockResolvedValue({
      active: true,
      expiresAt: null,
      lastUserMessageAt: null,
      type: "24h",
    });
    mockedBook.mockImplementation(
      async () =>
        ({
          id: `evt-${siguienteId()}`,
          htmlLink: "https://calendar.google.com/x",
        }) as never
    );
    mockedBusy.mockResolvedValue({
      intervals: [],
      calendarAvailabilityKnown: true,
    });
    mockedCancelEvent.mockResolvedValue(undefined);
  });

  it("(1) reserva por voz con consentimiento ⇒ fila SentMessage booking-<id>-confirmacion-<epoch> con callbackData cliente:confirmacion:<id>, templateName escrito y Booking.clientNotifiedAt", async () => {
    const business = await negocioConDueno();
    await createTestProfessional(business.id);
    const call = await createTestCall(business.id, { fromNumber: MOVIL });
    const slot = nextOpenSlot();

    const result = await executeVoiceTool({
      businessId: business.id,
      toolName: "book_appointment",
      callId: call.callId,
      params: {
        clientName: "Marta",
        startDateTime: slot.iso,
        durationMinutes: 30,
        smsConsent: true,
      },
    });

    expect(result.result.success).toBe(true);
    expect(result.result.mensajeCliente).toBe("whatsapp");
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { callId: call.id },
    });
    expect(booking.createdVia).toBe("voice");
    expect(booking.clientNotifiedAt).not.toBeNull();
    const epoch = Math.floor(booking.programedAt.getTime() / 1000);
    const fila = await prisma.sentMessage.findUniqueOrThrow({
      where: {
        channel_idempotencyKey: {
          channel: "whatsapp",
          idempotencyKey: `booking-${booking.id}-confirmacion-${epoch}`,
        },
      },
    });
    expect(fila).toEqual(
      expect.objectContaining({
        businessId: business.id,
        audience: "client",
        toNumber: MOVIL,
        kind: "template",
        templateName: "confirmacion_cita",
        templateLanguage: "es_ES",
        callbackData: `cliente:confirmacion:${booking.id}`,
        deliveryStatus: "queued",
      })
    );
    expect(fila.providerMessageId).toMatch(/^msg-/);
    // La aprobada con cabecera: exactamente sus 5 parámetros, sin profesional.
    const envio = mockedTemplate.mock.calls.find(
      (c) => c[0].templateId === "tpl-confirmacion_cita"
    )!;
    expect(Object.keys(envio[0].bodyParams).sort()).toEqual([
      "fecha_cita",
      "hora_cita",
      "negocio_nombre",
      "negocio_telefono",
      "servicios",
    ]);
    expect(envio[0].from).toBe(CLIENTES);
    // Plan Inicio: sin recordatorio.
    expect(
      await prisma.sentMessage.count({
        where: { idempotencyKey: { contains: "recordatorio" } },
      })
    ).toBe(0);
  });

  it("(2) «Cancelar» sobre un envío cliente:recordatorio ⇒ isCancelled, cancelledBy client_button, fila aviso:cancelacion y el lead de la lista de espera del mismo negocio reclamado; el de otro negocio no se toca", async () => {
    const business = await negocioConDueno();
    await createTestProfessional(business.id);
    const otro = await createTestBusiness();
    const slot = nextOpenSlot();
    const call = await createTestCall(business.id, { fromNumber: MOVIL });
    const booking = await prisma.booking.create({
      data: {
        callId: call.id,
        programedAt: slot.date,
        durationMinutes: 30,
        numberPeople: 1,
        smsConsent: true,
        clientName: "Marta",
        externalEventId: "evt-1",
        externalCalendarProvider: "google",
        externalCalendarId: "primary",
      },
    });
    await prisma.sentMessage.create({
      data: {
        channel: "whatsapp",
        idempotencyKey: "booking-x-recordatorio-1",
        providerMessageId: "msg-rec",
        businessId: business.id,
        audience: "client",
        toNumber: MOVIL,
        kind: "template",
        callbackData: `cliente:recordatorio:${booking.id}`,
        deliveryStatus: "delivered",
      },
    });
    const datos = {
      clientPhone: OTRO,
      startDateTime: slot.iso,
      durationMinutes: 30,
      serviceIds: [],
    };
    const llamadaEspera = await createTestCall(business.id, {
      fromNumber: OTRO,
    });
    const lead = await prisma.lead.create({
      data: {
        callId: llamadaEspera.id,
        type: "availability_watch",
        isLead: false,
        data: datos,
      },
    });
    const llamadaAjena = await createTestCall(otro.id, { fromNumber: OTRO });
    const leadAjeno = await prisma.lead.create({
      data: {
        callId: llamadaAjena.id,
        type: "availability_watch",
        isLead: false,
        data: datos,
      },
    });

    expect(
      await handleWhatsappMessages(
        eventoMensajes({
          to: CLIENTES,
          waId: MOVIL.slice(1),
          messages: [
            mensajeDeBoton(MOVIL.slice(1), {
              contextId: "msg-rec",
              text: "Cancelar",
            }),
          ],
        })
      )
    ).toEqual({ success: true });

    const cancelada = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(cancelada.isCancelled).toBe(true);
    expect(cancelada.cancelledBy).toBe("client_button");
    expect(mockedCancelEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt-1" })
    );
    const entrante = await prisma.inboundMessage.findFirstOrThrow({
      where: { fromNumber: MOVIL },
    });
    expect(entrante.handler).toBe("cliente:cancelar");
    // #4 al dueño (interactivo dentro de la ventana) con los dos botones.
    const aviso = await prisma.sentMessage.findUniqueOrThrow({
      where: {
        channel_idempotencyKey: {
          channel: "whatsapp",
          idempotencyKey: `aviso:cancelacion:${booking.id}`,
        },
      },
    });
    expect(aviso.toNumber).toBe(DUENO);
    expect(mockedButtons.mock.calls[0][0].buttons.map((b) => b.title)).toEqual([
      "Vale",
      "Avisar lista espera",
    ]);
    // Lista de espera: el lead del negocio recibió hueco_libre (job en línea).
    const ofrecido = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(ofrecido.notifiedAt).not.toBeNull();
    expect(ofrecido.notifiedVia).toBe("plantilla:hueco_libre");
    expect(ofrecido.resolvedAt).toBeNull();
    const oferta = await prisma.sentMessage.findFirstOrThrow({
      where: { idempotencyKey: { startsWith: `espera-${lead.id}-` } },
    });
    expect(oferta.callbackData).toBe(`cliente:hueco:${lead.id}`);
    expect(oferta.templateName).toBe("hueco_libre");
    expect(oferta.toNumber).toBe(OTRO);
    const intacto = await prisma.lead.findUniqueOrThrow({
      where: { id: leadAjeno.id },
    });
    expect(intacto.notifiedAt).toBeNull();
    // Respuesta al cliente desde el número de clientes.
    expect(mockedText).toHaveBeenCalledWith(
      expect.objectContaining({
        from: CLIENTES,
        to: MOVIL,
        body: expect.stringContaining("queda cancelada"),
      })
    );
  });

  it("(3) «Sí, resérvala» ⇒ Call whatsapp:espera:<leadId> con voiceProvider whatsapp, Booking con callId === call.id y createdVia whatsapp_lista_espera, lead reservado; dos toques concurrentes ⇒ un solo Booking", async () => {
    const business = await negocioConDueno();
    await createTestProfessional(business.id);
    const slot = nextOpenSlot();
    const llamada = await createTestCall(business.id, { fromNumber: MOVIL });
    const lead = await prisma.lead.create({
      data: {
        callId: llamada.id,
        type: "availability_watch",
        isLead: false,
        notifiedAt: new Date(),
        notifiedVia: "plantilla:hueco_libre",
        data: {
          clientPhone: MOVIL,
          startDateTime: slot.iso,
          durationMinutes: 30,
          serviceIds: [],
          clientName: "Marta",
        },
      },
    });
    await prisma.sentMessage.create({
      data: {
        channel: "whatsapp",
        idempotencyKey: `espera-${lead.id}-1`,
        providerMessageId: "msg-hueco",
        businessId: business.id,
        audience: "client",
        toNumber: MOVIL,
        kind: "template",
        templateName: "hueco_libre",
        callbackData: `cliente:hueco:${lead.id}`,
        deliveryStatus: "delivered",
      },
    });

    const resultados = await Promise.all([
      handleWhatsappMessages(
        eventoMensajes({
          to: CLIENTES,
          waId: MOVIL.slice(1),
          messages: [
            mensajeDeBoton(MOVIL.slice(1), {
              contextId: "msg-hueco",
              text: "Sí, resérvala",
              id: "in-si-1",
            }),
          ],
        })
      ),
      handleWhatsappMessages(
        eventoMensajes({
          to: CLIENTES,
          waId: MOVIL.slice(1),
          messages: [
            mensajeDeBoton(MOVIL.slice(1), {
              contextId: "msg-hueco",
              text: "Sí, resérvala",
              id: "in-si-2",
            }),
          ],
        })
      ),
    ]);
    expect(resultados).toEqual([{ success: true }, { success: true }]);

    const call = await prisma.call.findUniqueOrThrow({
      where: { callId: `whatsapp:espera:${lead.id}` },
    });
    expect(call.voiceProvider).toBe("whatsapp");
    expect(call.providerCallId).toBe(lead.id);
    expect(call.businessId).toBe(business.id);
    expect(call.fromNumber).toBe(MOVIL);
    const reservas = await prisma.booking.findMany({
      where: { call: { businessId: business.id } },
    });
    expect(reservas).toHaveLength(1);
    const reserva = reservas[0];
    // G1: la FK apunta a calls.id, no a la cadena del proveedor.
    expect(reserva.callId).toBe(call.id);
    expect(reserva.callId).not.toBe(`whatsapp:espera:${lead.id}`);
    expect(reserva.createdVia).toBe("whatsapp_lista_espera");
    expect(reserva.smsConsent).toBe(true);
    expect(reserva.clientName).toBe("Marta");
    expect(reserva.clientPhone).toBe(MOVIL);
    expect(reserva.clientNotifiedAt).not.toBeNull();
    const resuelto = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
    });
    expect(resuelto.resolvedAt).not.toBeNull();
    expect(resuelto.data).toEqual(
      expect.objectContaining({
        resolvedBy: "reservado",
        bookingId: reserva.id,
      })
    );
    expect(mockedBook).toHaveBeenCalledTimes(1);

    const handlers = (
      await prisma.inboundMessage.findMany({
        where: { fromNumber: MOVIL },
        select: { handler: true },
      })
    )
      .map((m) => m.handler)
      .sort();
    expect(handlers).toEqual([
      "cliente:reservar",
      "cliente:reservar:ya-reservada",
    ]);
    // #1 al dueño, una vez.
    expect(
      await prisma.sentMessage.count({
        where: { idempotencyKey: `aviso:nueva_reserva:${reserva.id}` },
      })
    ).toBe(1);
  });

  it("(4) un botón con context.id de un envío a otro número no cambia nada en BD", async () => {
    const business = await negocioConDueno();
    const slot = nextOpenSlot();
    const call = await createTestCall(business.id, { fromNumber: OTRO });
    const booking = await prisma.booking.create({
      data: {
        callId: call.id,
        programedAt: slot.date,
        durationMinutes: 30,
        numberPeople: 1,
        smsConsent: true,
      },
    });
    await prisma.sentMessage.create({
      data: {
        channel: "whatsapp",
        idempotencyKey: "booking-y-recordatorio-1",
        providerMessageId: "msg-otro",
        businessId: business.id,
        audience: "client",
        toNumber: OTRO,
        kind: "template",
        callbackData: `cliente:recordatorio:${booking.id}`,
      },
    });

    await handleWhatsappMessages(
      eventoMensajes({
        to: CLIENTES,
        waId: MOVIL.slice(1),
        messages: [
          mensajeDeBoton(MOVIL.slice(1), {
            contextId: "msg-otro",
            text: "Cancelar",
          }),
        ],
      })
    );

    const intacta = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(intacta.isCancelled).toBe(false);
    const entrante = await prisma.inboundMessage.findFirstOrThrow({
      where: { fromNumber: MOVIL },
    });
    expect(entrante.handler).toBe("cliente:boton:remitente-distinto");
    expect(mockedText).not.toHaveBeenCalled();
    expect(
      await prisma.sentMessage.count({
        where: { idempotencyKey: { startsWith: "aviso:" } },
      })
    ).toBe(0);
  });

  it("(5) un statuses failed 132012 sobre la confirmación (v2) deja clientNotifiedAt null y encola la fila -respaldo con confirmacion_cita", async () => {
    await sembrarPlantillas([
      {
        key: "confirmacion_cita_v2",
        name: "confirmacion_cita_v2",
        language: "es",
        status: "APPROVED",
        components: [
          {
            type: "BUTTONS",
            buttons: [
              { type: "QUICK_REPLY", text: "Guardar contacto" },
              { type: "URL", text: "Cómo llegar" },
            ],
          },
        ],
      },
    ]);
    const business = await negocioConDueno({
      placeId: "ChIJd8BlQ2BZwokRAFUEcm_qrcA",
    });
    await createTestProfessional(business.id);
    const call = await createTestCall(business.id, { fromNumber: MOVIL });
    const slot = nextOpenSlot();
    await executeVoiceTool({
      businessId: business.id,
      toolName: "book_appointment",
      callId: call.callId,
      params: {
        clientName: "Marta",
        startDateTime: slot.iso,
        durationMinutes: 30,
        smsConsent: true,
      },
    });
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { callId: call.id },
    });
    const epoch = Math.floor(booking.programedAt.getTime() / 1000);
    const clave = `booking-${booking.id}-confirmacion-${epoch}`;
    const original = await prisma.sentMessage.findUniqueOrThrow({
      where: {
        channel_idempotencyKey: { channel: "whatsapp", idempotencyKey: clave },
      },
    });
    expect(original.templateName).toBe("confirmacion_cita_v2");
    expect(mockedTemplate.mock.calls[0][0].buttonUrlParams).toEqual([
      { index: 1, text: "ChIJd8BlQ2BZwokRAFUEcm_qrcA" },
    ]);
    expect(booking.clientNotifiedAt).not.toBeNull();

    // El respaldo (en línea) falla en Telnyx: así se observa el estado
    // intermedio (clientNotifiedAt limpio, fila -respaldo failed).
    mockedTemplate.mockRejectedValueOnce(new Error("Telnyx 502"));
    await handleWhatsappMessages(
      eventoMensajes({
        to: CLIENTES,
        statuses: [
          {
            id: original.providerMessageId,
            status: "failed",
            recipient_id: MOVIL.slice(1),
            biz_opaque_callback_data: original.callbackData,
            errors: [
              { code: 132012, title: "Parameter format does not match" },
            ],
          },
        ],
      })
    );

    const tras = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(tras.clientNotifiedAt).toBeNull();
    const rechazada = await prisma.sentMessage.findUniqueOrThrow({
      where: {
        channel_idempotencyKey: { channel: "whatsapp", idempotencyKey: clave },
      },
    });
    expect(rechazada.deliveryStatus).toBe("failed");
    expect(rechazada.errorCode).toBe("132012");
    const respaldo = await prisma.sentMessage.findUniqueOrThrow({
      where: {
        channel_idempotencyKey: {
          channel: "whatsapp",
          idempotencyKey: `${clave}-respaldo`,
        },
      },
    });
    expect(respaldo.callbackData).toBe(`cliente:confirmacion:${booking.id}`);
    expect(respaldo.deliveryStatus).toBe("failed");
    expect(respaldo.errorCode).toBe("SEND_ERROR");
    // El respaldo salió con la aprobada (sinV2), no con la v2.
    const envioRespaldo =
      mockedTemplate.mock.calls[mockedTemplate.mock.calls.length - 1][0];
    expect(envioRespaldo.templateId).toBe("tpl-confirmacion_cita");
    expect(envioRespaldo.buttonUrlParams).toBeUndefined();
  });
});
