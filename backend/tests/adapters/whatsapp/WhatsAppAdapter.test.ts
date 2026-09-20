import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  WhatsAppAdapter,
  WhatsAppApiError,
} from "../../../src/adapters/whatsapp/WhatsAppAdapter.js";
import {
  getTelnyxClient,
  getTelnyxWhatsappClient,
} from "../../../src/lib/telnyx.js";

vi.mock("../../../src/lib/telnyx.js", () => ({
  getTelnyxClient: vi.fn(),
  getTelnyxWhatsappClient: vi.fn(),
}));

const mockedWhatsappSend = vi.fn();
const mockedConversationWindow = vi.fn();

describe("WhatsAppAdapter", () => {
  const adapter = new WhatsAppAdapter();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELNYX_API_KEY = "KEY";
    process.env.WHATSAPP_TELNYX_FROM_NUMBER = "+34930453218";
    process.env.TELNYX_MESSAGING_PROFILE_ID = "perfil-1";
    mockedWhatsappSend.mockResolvedValue({
      data: {
        id: "msg-1",
        to: [{ phone_number: "+34600111222", status: "queued" }],
      },
    });
    vi.mocked(getTelnyxClient).mockReturnValue({
      messages: { whatsapp: mockedWhatsappSend },
    } as never);
    vi.mocked(getTelnyxWhatsappClient).mockReturnValue({
      whatsapp: {
        phoneNumbers: { retrieveConversationWindow: mockedConversationWindow },
      },
    } as never);
  });

  it("no está configurado si falta cualquiera de las tres variables", () => {
    delete process.env.TELNYX_MESSAGING_PROFILE_ID;
    expect(adapter.isConfigured()).toBe(false);
  });

  it("envía la plantilla por template_id con parámetros nombrados, desde el número indicado y con el perfil de mensajería explícito", async () => {
    const result = await adapter.sendTemplate({
      from: "+34930454394",
      to: "+34600111222",
      templateId: "tpl-uuid",
      bodyParams: {
        negocio_nombre: "Peluquería Ana",
        cita: "lunes a las 10:00",
      },
      callbackData: "booking:b1",
    });

    expect(result).toEqual({ messageId: "msg-1", status: "queued" });
    expect(mockedWhatsappSend).toHaveBeenCalledWith({
      from: "+34930454394",
      to: "+34600111222",
      type: "WHATSAPP",
      messaging_profile_id: "perfil-1",
      whatsapp_message: {
        type: "template",
        biz_opaque_callback_data: "booking:b1",
        template: {
          template_id: "tpl-uuid",
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  parameter_name: "negocio_nombre",
                  text: "Peluquería Ana",
                },
                {
                  type: "text",
                  parameter_name: "cita",
                  text: "lunes a las 10:00",
                },
              ],
            },
          ],
        },
      },
    });
  });

  it("sin template_id cae a nombre + idioma y usa el remitente de la variable de entorno", async () => {
    await adapter.sendTemplate({
      to: "+34600111222",
      templateName: "confirmacion_cita",
      languageCode: "es",
      bodyParams: {},
    });

    const body = mockedWhatsappSend.mock.calls[0][0];
    expect(body.from).toBe("+34930453218");
    expect(body.whatsapp_message.template).toEqual({
      name: "confirmacion_cita",
      language: { policy: "deterministic", code: "es" },
    });
  });

  it("exige template_id o nombre", async () => {
    await expect(
      adapter.sendTemplate({ to: "+34600111222", bodyParams: {} })
    ).rejects.toThrow("templateId o templateName");
  });

  it("los botones interactivos llevan cabecera de texto tipada como exige la API y entre uno y tres botones", async () => {
    await adapter.sendInteractiveButtons({
      to: "+34600111222",
      header: "Recordatorio",
      body: "¿Mantienes tu cita?",
      footer: "Alhabla",
      buttons: [
        { id: "booking:b1:confirmo", title: "Confirmo" },
        { id: "booking:b1:cancelar", title: "Cancelar" },
      ],
    });

    expect(mockedWhatsappSend.mock.calls[0][0].whatsapp_message).toEqual({
      type: "interactive",
      interactive: {
        type: "button",
        header: { type: "text", text: "Recordatorio" },
        body: { text: "¿Mantienes tu cita?" },
        footer: { text: "Alhabla" },
        action: {
          buttons: [
            {
              type: "reply",
              reply: { id: "booking:b1:confirmo", title: "Confirmo" },
            },
            {
              type: "reply",
              reply: { id: "booking:b1:cancelar", title: "Cancelar" },
            },
          ],
        },
      },
    });

    await expect(
      adapter.sendInteractiveButtons({
        to: "+34600111222",
        body: "x",
        buttons: [],
      })
    ).rejects.toThrow("entre uno y tres botones");
  });

  it("la tarjeta de contacto va en el formato de Meta (name.formatted_name, wa_id sin +)", async () => {
    await adapter.sendContacts({
      to: "+34600111222",
      contacts: [
        {
          formattedName: "Alhabla Reservas",
          company: "Alhabla",
          phones: [{ number: "+34930454394" }],
          urls: [{ url: "https://alhabla.ai" }],
        },
      ],
    });

    expect(mockedWhatsappSend.mock.calls[0][0].whatsapp_message).toEqual({
      type: "contacts",
      contacts: [
        {
          name: {
            formatted_name: "Alhabla Reservas",
            first_name: "Alhabla Reservas",
          },
          org: { company: "Alhabla" },
          phones: [
            { phone: "+34930454394", wa_id: "34930454394", type: "WORK" },
          ],
          urls: [{ url: "https://alhabla.ai", type: "WORK" }],
        },
      ],
    });
  });

  it("consulta la ventana de 24 h por el cliente de WhatsApp y la traduce a fechas", async () => {
    mockedConversationWindow.mockResolvedValue({
      data: {
        window_active: true,
        window_expires_at: "2026-09-20T21:41:55.970Z",
        last_user_message_at: "2026-09-19T21:41:55.970Z",
        window_type: "24h",
      },
    });

    const window = await adapter.getConversationWindow(
      "+34930454394",
      "+34600111222"
    );

    expect(mockedConversationWindow).toHaveBeenCalledWith("+34930454394", {
      destination_number: "+34600111222",
    });
    expect(window).toEqual({
      active: true,
      expiresAt: new Date("2026-09-20T21:41:55.970Z"),
      lastUserMessageAt: new Date("2026-09-19T21:41:55.970Z"),
      type: "24h",
    });
  });

  it("envuelve los fallos de la API con el estado HTTP y el contexto del envío", async () => {
    mockedWhatsappSend.mockRejectedValue(new Error("400 Bad Request"));

    const error = await adapter
      .sendText({ to: "+34600111222", body: "hola" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WhatsAppApiError);
    expect((error as Error).message).toContain(
      "al enviar un texto por WhatsApp desde +34930453218"
    );
  });
});

describe("WhatsAppAdapter — cta_url (alertas)", () => {
  const adapter = new WhatsAppAdapter();

  beforeEach(() => {
    process.env.TELNYX_API_KEY = "KEY";
    process.env.WHATSAPP_TELNYX_FROM_NUMBER = "+34930453218";
    process.env.TELNYX_MESSAGING_PROFILE_ID = "perfil-1";
    mockedWhatsappSend.mockResolvedValue({
      data: { id: "msg-1", to: [{ phone_number: "+34600111222", status: "queued" }] },
    });
    vi.mocked(getTelnyxClient).mockReturnValue({
      messages: { whatsapp: mockedWhatsappSend },
    } as never);
  });

  it("monta el interactivo cta_url con el botón y la URL, y rechaza URLs que no sean https", async () => {
    await adapter.sendInteractiveCtaUrl({
      to: "+34600111222",
      header: "Alerta",
      body: "Tu calendario se ha desconectado.",
      buttonText: "Ir a Ajustes",
      url: "https://alhabla.ai/ajustes/calendario",
    });

    expect(mockedWhatsappSend.mock.calls.at(-1)![0].whatsapp_message).toEqual({
      type: "interactive",
      interactive: {
        type: "cta_url",
        header: { type: "text", text: "Alerta" },
        body: { text: "Tu calendario se ha desconectado." },
        action: {
          name: "cta_url",
          parameters: { display_text: "Ir a Ajustes", url: "https://alhabla.ai/ajustes/calendario" },
        },
      },
    });

    await expect(
      adapter.sendInteractiveCtaUrl({ to: "+34600111222", body: "x", buttonText: "Ir", url: "http://alhabla.ai" })
    ).rejects.toThrow("https");
  });
});
