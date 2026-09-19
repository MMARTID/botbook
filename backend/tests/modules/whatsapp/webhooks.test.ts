import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import {
  aE164,
  clasificarEntrante,
  handleMessageStatusEvent,
  handleTemplateStatusEvent,
  handleWhatsappMessages,
  identificarRemitente,
  palabraClaveDe,
} from "../../../src/modules/whatsapp/webhooks.js";
import {
  actualizarEstadoEnvio,
  audienciaDelNumero,
} from "../../../src/modules/whatsapp/service.js";
import { enrutarEntrante } from "../../../src/modules/whatsapp/router.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findFirst: vi.fn() },
    booking: { findFirst: vi.fn() },
    inboundMessage: { create: vi.fn(), update: vi.fn() },
    whatsappTemplate: { updateMany: vi.fn() },
  },
}));

vi.mock("../../../src/modules/whatsapp/service.js", () => ({
  actualizarEstadoEnvio: vi.fn(),
  audienciaDelNumero: vi.fn(),
}));

vi.mock("../../../src/modules/whatsapp/router.js", () => ({
  enrutarEntrante: vi.fn(),
}));

const mockedBusinessFindFirst = vi.mocked(prisma.business.findFirst);
const mockedBookingFindFirst = vi.mocked(prisma.booking.findFirst);
const mockedInboundCreate = vi.mocked(prisma.inboundMessage.create);
const mockedInboundUpdate = vi.mocked(prisma.inboundMessage.update);
const mockedTemplateUpdateMany = vi.mocked(prisma.whatsappTemplate.updateMany);
const mockedActualizarEstado = vi.mocked(actualizarEstadoEnvio);
const mockedAudiencia = vi.mocked(audienciaDelNumero);
const mockedEnrutar = vi.mocked(enrutarEntrante);

/** Evento `whatsapp.messages` tal como lo entrega el webhook del WABA
 * (capturado en la fase 0.1, 2026-09-19). */
function eventoMensajes(messages: unknown[], statuses: unknown[] = []) {
  return {
    data: {
      event_type: "whatsapp.messages",
      id: "evt-1",
      occurred_at: "2026-09-19T19:13:59Z",
      payload: {
        contacts: [{ profile: { name: "Miki" }, wa_id: "34692138456" }],
        messages,
        statuses,
        messaging_product: "whatsapp",
        metadata: {
          display_phone_number: "34930454394",
          phone_number_id: "1305416552659363",
        },
      },
      record_type: "event",
    },
    meta: { attempt: 1 },
  };
}

const TEXTO = {
  foreign_id: "wamid.HBg…",
  from: "+34692138456",
  from_user_id: "ES.1368494302112874",
  id: "2a6f8ea0-355e-4b5f-a4e3-8283837ae317",
  text: { body: "Hola caracola" },
  timestamp: "1789845237",
  type: "text",
};

const BOTON = {
  context: { from: "34930454394", id: "4031a0bb-1769-46f9-b8b6-78a256e2dfa5" },
  from: "+34692138456",
  id: "1c69d4bb-6ace-4408-b951-b7a712b14dc2",
  interactive: {
    action: {},
    button_reply: { id: "booking:demo:confirmo", title: "Confirmo" },
    type: "button_reply",
  },
  timestamp: "1789845273",
  type: "interactive",
};

describe("palabraClaveDe / aE164", () => {
  it("reconoce las palabras clave sin acentos, sin barra y en cualquier caja", () => {
    expect(palabraClaveDe("STOP")).toBe("STOP");
    expect(palabraClaveDe(" baja ")).toBe("BAJA");
    expect(palabraClaveDe("/agenda")).toBe("AGENDA");
    expect(palabraClaveDe("Mañana")).toBe("MANANA");
    expect(palabraClaveDe("hola, quiero cita")).toBeNull();
  });

  it("añade el + que Meta omite en display_phone_number y context.from", () => {
    expect(aE164("34930454394")).toBe("+34930454394");
    expect(aE164("+34692138456")).toBe("+34692138456");
  });
});

describe("clasificarEntrante", () => {
  const contexto = { toNumber: "+34930454394", contactName: "Miki" };

  it("texto normal", () => {
    const entrante = clasificarEntrante(TEXTO as never, contexto);
    expect(entrante).toEqual(
      expect.objectContaining({
        providerMessageId: TEXTO.id,
        foreignId: "wamid.HBg…",
        fromNumber: "+34692138456",
        toNumber: "+34930454394",
        kind: "text",
        text: "Hola caracola",
        buttonId: null,
        contextMessageId: null,
        contactName: "Miki",
        receivedAt: new Date(1789845237 * 1000),
      })
    );
  });

  it("palabra clave", () => {
    expect(
      clasificarEntrante(
        { ...TEXTO, text: { body: "stop" } } as never,
        contexto
      ).kind
    ).toBe("keyword");
  });

  it("respuesta a un botón interactivo, con el id del mensaje al que responde", () => {
    const entrante = clasificarEntrante(BOTON as never, contexto);
    expect(entrante).toEqual(
      expect.objectContaining({
        kind: "button",
        buttonId: "booking:demo:confirmo",
        buttonTitle: "Confirmo",
        contextMessageId: "4031a0bb-1769-46f9-b8b6-78a256e2dfa5",
      })
    );
  });

  it("botón de respuesta rápida de una plantilla (formato button de Meta)", () => {
    const entrante = clasificarEntrante(
      {
        ...TEXTO,
        text: undefined,
        type: "button",
        button: { payload: "lead:l1:atendido", text: "Atendido" },
        context: { id: "msg-out" },
      } as never,
      contexto
    );
    expect(entrante).toEqual(
      expect.objectContaining({
        kind: "button",
        buttonId: "lead:l1:atendido",
        buttonTitle: "Atendido",
        contextMessageId: "msg-out",
      })
    );
  });

  it("audio y medios", () => {
    expect(
      clasificarEntrante(
        {
          ...TEXTO,
          text: undefined,
          type: "audio",
          audio: { url: "https://…" },
        } as never,
        contexto
      ).kind
    ).toBe("audio");
    expect(
      clasificarEntrante(
        { ...TEXTO, text: undefined, type: "image" } as never,
        contexto
      ).kind
    ).toBe("media");
    expect(
      clasificarEntrante(
        { ...TEXTO, text: undefined, type: "reaction" } as never,
        contexto
      ).kind
    ).toBe("other");
  });
});

describe("identificarRemitente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("en el número de negocios busca un dueño dado de alta", async () => {
    mockedBusinessFindFirst.mockResolvedValue({ id: "biz_1" } as never);

    expect(await identificarRemitente("+34692138456", "owner")).toEqual({
      role: "owner",
      businessId: "biz_1",
    });
    expect(mockedBusinessFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerWhatsappNumber: "+34692138456", active: true },
      })
    );
    expect(mockedBookingFindFirst).not.toHaveBeenCalled();
  });

  it("en el número de clientes busca reservas por el teléfono de la cita o de la llamada", async () => {
    mockedBookingFindFirst.mockResolvedValue({
      call: { businessId: "biz_2" },
    } as never);

    expect(await identificarRemitente("+34692138456", "client")).toEqual({
      role: "client",
      businessId: "biz_2",
    });
    expect(mockedBookingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { clientPhone: "+34692138456" },
            { call: { fromNumber: "+34692138456" } },
          ],
        },
      })
    );
    expect(mockedBusinessFindFirst).not.toHaveBeenCalled();
  });

  it("un dueño que escribe al número de clientes no se confunde con un cliente", async () => {
    mockedBookingFindFirst.mockResolvedValue(null);

    expect(await identificarRemitente("+34692138456", "client")).toEqual({
      role: "unknown",
      businessId: null,
    });
  });
});

describe("handleWhatsappMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAudiencia.mockResolvedValue("client");
    mockedBookingFindFirst.mockResolvedValue({
      call: { businessId: "biz_2" },
    } as never);
    mockedInboundCreate.mockImplementation(
      async ({ data }) => ({ id: "in_1", ...data }) as never
    );
    mockedInboundUpdate.mockResolvedValue({} as never);
    mockedEnrutar.mockResolvedValue({ handler: "pendiente:texto:client" });
  });

  it("guarda el entrante clasificado, con audiencia y negocio, y lo enruta", async () => {
    const result = await handleWhatsappMessages(eventoMensajes([TEXTO]));

    expect(result).toEqual({ success: true });
    expect(mockedAudiencia).toHaveBeenCalledWith("+34930454394");
    expect(mockedInboundCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerMessageId: TEXTO.id,
        eventId: "evt-1",
        fromNumber: "+34692138456",
        toNumber: "+34930454394",
        audience: "client",
        role: "client",
        businessId: "biz_2",
        kind: "text",
        text: "Hola caracola",
        contactName: "Miki",
        payload: TEXTO,
      }),
    });
    expect(mockedEnrutar).toHaveBeenCalledWith(
      expect.objectContaining({ id: "in_1", kind: "text" })
    );
    expect(mockedInboundUpdate).toHaveBeenCalledWith({
      where: { id: "in_1" },
      data: expect.objectContaining({
        handler: "pendiente:texto:client",
        handledAt: expect.any(Date),
      }),
    });
  });

  it("un reintento del mismo mensaje no se procesa dos veces", async () => {
    mockedInboundCreate.mockRejectedValue({ code: "P2002" });

    const result = await handleWhatsappMessages(eventoMensajes([TEXTO]));

    expect(result).toEqual({ success: true });
    expect(mockedEnrutar).not.toHaveBeenCalled();
  });

  it("si el enrutador falla, el mensaje queda guardado con el error y el webhook responde bien", async () => {
    mockedEnrutar.mockRejectedValue(new Error("handler roto"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await handleWhatsappMessages(eventoMensajes([BOTON]));

    expect(result).toEqual({ success: true });
    expect(mockedInboundUpdate).toHaveBeenCalledWith({
      where: { id: "in_1" },
      data: { error: "handler roto" },
    });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("handler roto")
    );
    errorSpy.mockRestore();
  });

  it("los statuses[] de Meta actualizan la entrega del mensaje enviado (con callback data y destinatario)", async () => {
    await handleWhatsappMessages(
      eventoMensajes(
        [],
        [
          {
            biz_opaque_callback_data: "prueba:botones2",
            conversation: { id: "", origin: { type: "" } },
            id: "4031a0bb-1769-46f9-b8b6-78a256e2dfa5",
            recipient_id: "34692138456",
            status: "read",
            timestamp: "1789845271",
          },
        ]
      )
    );

    expect(mockedActualizarEstado).toHaveBeenCalledWith({
      providerMessageId: "4031a0bb-1769-46f9-b8b6-78a256e2dfa5",
      status: "read",
      at: new Date(1789845271 * 1000),
      errorCode: null,
      errorDetail: null,
      callbackData: "prueba:botones2",
      from: "+34930454394",
      to: "+34692138456",
    });
    expect(mockedInboundCreate).not.toHaveBeenCalled();
  });

  it("un payload con otra forma no rompe: se registra y se devuelve fallo", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(
      await handleWhatsappMessages({
        data: { id: "x", event_type: "whatsapp.messages" },
      })
    ).toEqual({ success: false });
    errorSpy.mockRestore();
  });
});

describe("handleMessageStatusEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function evento(
    eventType: string,
    status: string,
    extra: Record<string, unknown> = {}
  ) {
    return {
      data: {
        event_type: eventType,
        id: "evt-2",
        occurred_at: "2026-09-19T21:15:34.290+00:00",
        payload: {
          id: "4031a0bb-863f-4e06-8aab-a7af5eb651aa",
          direction: "outbound",
          from: { phone_number: "+34930454394", carrier: "Telnyx" },
          to: [{ phone_number: "+34692138456", status, carrier: "Orange" }],
          errors: [],
          cost: { amount: null, currency: null },
          type: "WHATSAPP",
          ...extra,
        },
      },
    };
  }

  it("message.finalized con delivery_failed guarda el fallo con su código", async () => {
    await handleMessageStatusEvent(
      evento("message.finalized", "delivery_failed", {
        errors: [
          {
            code: "40008",
            title: "Undeliverable",
            detail: "The recipient carrier did not accept the message.",
          },
        ],
      })
    );

    expect(mockedActualizarEstado).toHaveBeenCalledWith(
      expect.objectContaining({
        providerMessageId: "4031a0bb-863f-4e06-8aab-a7af5eb651aa",
        status: "failed",
        errorCode: "40008",
        errorDetail: "The recipient carrier did not accept the message.",
        at: new Date("2026-09-19T21:15:34.290+00:00"),
      })
    );
  });

  it("message.finalized entregado con coste, y message.read", async () => {
    await handleMessageStatusEvent(
      evento("message.finalized", "delivered", {
        cost: { amount: "0.0240", currency: "USD" },
      })
    );
    expect(mockedActualizarEstado).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "delivered",
        costAmount: "0.0240",
        costCurrency: "USD",
      })
    );

    await handleMessageStatusEvent(evento("message.read", "read"));
    expect(mockedActualizarEstado).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "read" })
    );
  });

  it("ignora los eventos de mensajes entrantes (dirección inbound)", async () => {
    await handleMessageStatusEvent(
      evento("message.finalized", "delivered", { direction: "inbound" })
    );
    expect(mockedActualizarEstado).not.toHaveBeenCalled();
  });
});

describe("handleTemplateStatusEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedTemplateUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("actualiza el estado de la plantilla por su id de Telnyx", async () => {
    await handleTemplateStatusEvent({
      data: {
        id: "evt-3",
        event_type: "whatsapp.template.approved",
        payload: {
          template_id: "01a0bafc-e57c-74aa-a848-f01dae3d135a",
          template_name: "confirmacion_cita_v2",
          status: "APPROVED",
        },
      },
    });

    expect(mockedTemplateUpdateMany).toHaveBeenCalledWith({
      where: { telnyxTemplateId: "01a0bafc-e57c-74aa-a848-f01dae3d135a" },
      data: expect.objectContaining({ status: "APPROVED" }),
    });
  });

  it("sin status en el payload deduce el estado del nombre del evento y guarda el motivo de rechazo", async () => {
    await handleTemplateStatusEvent({
      data: {
        id: "evt-4",
        event_type: "whatsapp.template.rejected",
        payload: { template_id: "tpl-1", reason: "INVALID_FORMAT" },
      },
    });

    expect(mockedTemplateUpdateMany).toHaveBeenCalledWith({
      where: { telnyxTemplateId: "tpl-1" },
      data: expect.objectContaining({
        status: "REJECTED",
        rejectionReason: "INVALID_FORMAT",
      }),
    });
  });

  it("avisa si la plantilla no está en la tabla", async () => {
    mockedTemplateUpdateMany.mockResolvedValue({ count: 0 });
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    await handleTemplateStatusEvent({
      data: {
        id: "evt-5",
        event_type: "whatsapp.template.paused",
        payload: { template_id: "tpl-x" },
      },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("sincronizarWhatsapp")
    );
    warnSpy.mockRestore();
  });
});
