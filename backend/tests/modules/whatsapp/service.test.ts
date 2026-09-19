import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { whatsappAdapter } from "../../../src/adapters/whatsapp/WhatsAppAdapter.js";
import {
  actualizarEstadoEnvio,
  audienciaDelNumero,
  enviarPlantilla,
  enviarTexto,
  invalidarCacheRemitentes,
  resolverRemitente,
  ventanaAbierta,
} from "../../../src/modules/whatsapp/service.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    whatsappSender: { findMany: vi.fn() },
    whatsappTemplate: { findUnique: vi.fn() },
    sentMessage: {
      upsert: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../../src/adapters/whatsapp/WhatsAppAdapter.js", () => ({
  whatsappAdapter: {
    sendTemplate: vi.fn(),
    sendText: vi.fn(),
    sendInteractiveButtons: vi.fn(),
    sendContacts: vi.fn(),
    getConversationWindow: vi.fn(),
  },
}));

const mockedSenders = vi.mocked(prisma.whatsappSender.findMany);
const mockedTemplateFindUnique = vi.mocked(prisma.whatsappTemplate.findUnique);
const mockedSentUpsert = vi.mocked(prisma.sentMessage.upsert);
const mockedSentCreate = vi.mocked(prisma.sentMessage.create);
const mockedSentFindUnique = vi.mocked(prisma.sentMessage.findUnique);
const mockedSentUpdate = vi.mocked(prisma.sentMessage.update);
const mockedSendTemplate = vi.mocked(whatsappAdapter.sendTemplate);
const mockedSendText = vi.mocked(whatsappAdapter.sendText);
const mockedWindow = vi.mocked(whatsappAdapter.getConversationWindow);

const DOS_REMITENTES = [
  { audience: "client", phoneNumber: "+34930454394" },
  { audience: "owner", phoneNumber: "+34930453218" },
];

describe("resolverRemitente / audienciaDelNumero", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidarCacheRemitentes();
    process.env.WHATSAPP_TELNYX_FROM_NUMBER = "+34930453218";
  });

  it("cada audiencia sale por su número cuando la tabla los tiene", async () => {
    mockedSenders.mockResolvedValue(DOS_REMITENTES as never);

    expect(await resolverRemitente("client")).toEqual({
      phoneNumber: "+34930454394",
      source: "db",
    });
    expect(await resolverRemitente("owner")).toEqual({
      phoneNumber: "+34930453218",
      source: "db",
    });
    // Cacheado: una sola lectura para las dos resoluciones.
    expect(mockedSenders).toHaveBeenCalledTimes(1);
    expect(mockedSenders).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "CONNECTED" } })
    );
  });

  it("si el número de clientes no está conectado, los clientes salen por el de negocios", async () => {
    mockedSenders.mockResolvedValue([DOS_REMITENTES[1]] as never);

    expect(await resolverRemitente("client")).toEqual({
      phoneNumber: "+34930453218",
      source: "db",
    });
  });

  it("con la tabla vacía usa WHATSAPP_TELNYX_FROM_NUMBER, y sin ella falla", async () => {
    mockedSenders.mockResolvedValue([]);

    expect(await resolverRemitente("client")).toEqual({
      phoneNumber: "+34930453218",
      source: "env",
    });

    delete process.env.WHATSAPP_TELNYX_FROM_NUMBER;
    await expect(resolverRemitente("owner")).rejects.toThrow(
      "No hay remitente de WhatsApp"
    );
  });

  it("si la BD falla no se pierde el envío: cae a la variable de entorno y lo deja en el log", async () => {
    mockedSenders.mockRejectedValue(new Error("conexión perdida"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(await resolverRemitente("client")).toEqual({
      phoneNumber: "+34930453218",
      source: "env",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("conexión perdida")
    );
    errorSpy.mockRestore();
  });

  it("reconoce a qué audiencia pertenece un número de Alhabla", async () => {
    mockedSenders.mockResolvedValue(DOS_REMITENTES as never);

    expect(await audienciaDelNumero("+34930454394")).toBe("client");
    expect(await audienciaDelNumero("+34930453218")).toBe("owner");
    expect(await audienciaDelNumero("+34600000000")).toBeNull();
  });

  it("sin tabla, el número de la variable de entorno es el de negocios", async () => {
    mockedSenders.mockResolvedValue([]);

    expect(await audienciaDelNumero("+34930453218")).toBe("owner");
  });
});

describe("enviarPlantilla", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidarCacheRemitentes();
    process.env.WHATSAPP_TELNYX_FROM_NUMBER = "+34930453218";
    mockedSenders.mockResolvedValue(DOS_REMITENTES as never);
    mockedSendTemplate.mockResolvedValue({
      messageId: "msg-1",
      status: "queued",
    });
    mockedSendText.mockResolvedValue({ messageId: "msg-1", status: "queued" });
    mockedSentUpsert.mockResolvedValue({} as never);
    mockedSentCreate.mockResolvedValue({} as never);
  });

  it("por clave: usa el template_id de la tabla, el número de la audiencia y completa la fila del job", async () => {
    mockedTemplateFindUnique.mockResolvedValue({
      telnyxTemplateId: "tpl-confirmacion",
      name: "confirmacion_cita",
      language: "es_ES",
      status: "APPROVED",
    } as never);

    const result = await enviarPlantilla({
      audience: "client",
      to: "+34600111222",
      template: { key: "confirmacion_cita" },
      bodyParams: { negocio_nombre: "Peluquería Ana" },
      businessId: "biz_1",
      idempotencyKey: "confirm-sms-booking_1",
    });

    expect(result).toEqual({
      messageId: "msg-1",
      status: "queued",
      from: "+34930454394",
    });
    expect(mockedTemplateFindUnique).toHaveBeenCalledWith({
      where: { key: "confirmacion_cita" },
    });
    expect(mockedSendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "+34930454394",
        to: "+34600111222",
        templateId: "tpl-confirmacion",
        templateName: undefined,
        languageCode: undefined,
      })
    );
    expect(mockedSentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          channel_idempotencyKey: {
            channel: "whatsapp",
            idempotencyKey: "confirm-sms-booking_1",
          },
        },
        update: expect.objectContaining({
          providerMessageId: "msg-1",
          businessId: "biz_1",
          audience: "client",
          fromNumber: "+34930454394",
          toNumber: "+34600111222",
          kind: "template",
          templateName: "confirmacion_cita",
          templateLanguage: "es_ES",
          deliveryStatus: "queued",
        }),
      })
    );
  });

  it("por nombre + idioma: si la tabla la tiene aprobada va por template_id; si no, por nombre como hasta ahora", async () => {
    mockedTemplateFindUnique.mockResolvedValueOnce({
      telnyxTemplateId: "tpl-es",
      name: "confirmacion_cita",
      language: "es",
      status: "APPROVED",
    } as never);

    await enviarPlantilla({
      audience: "client",
      to: "+34600111222",
      template: { name: "confirmacion_cita", language: "es" },
      bodyParams: {},
    });
    expect(mockedTemplateFindUnique).toHaveBeenCalledWith({
      where: { name_language: { name: "confirmacion_cita", language: "es" } },
    });
    expect(mockedSendTemplate).toHaveBeenLastCalledWith(
      expect.objectContaining({ templateId: "tpl-es", templateName: undefined })
    );

    mockedTemplateFindUnique.mockResolvedValueOnce(null);
    await enviarPlantilla({
      audience: "client",
      to: "+34600111222",
      template: { name: "confirmacion_cita", language: "es" },
      bodyParams: {},
    });
    expect(mockedSendTemplate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        templateId: undefined,
        templateName: "confirmacion_cita",
        languageCode: "es",
      })
    );
  });

  it("una plantilla pendiente de aprobación no vale como clave", async () => {
    mockedTemplateFindUnique.mockResolvedValue({
      telnyxTemplateId: "tpl-v2",
      name: "confirmacion_cita_v2",
      language: "es",
      status: "PENDING",
    } as never);

    await expect(
      enviarPlantilla({
        audience: "client",
        to: "+34600111222",
        template: { key: "confirmacion_cita_v2" },
        bodyParams: {},
      })
    ).rejects.toThrow("no está en WhatsappTemplate o no está aprobada");
    expect(mockedSendTemplate).not.toHaveBeenCalled();
  });

  it("un envío sin job se registra con clave adhoc, y un fallo al registrar no tumba el envío ya hecho", async () => {
    mockedSentCreate.mockRejectedValueOnce(new Error("BD caída"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await enviarTexto({
      audience: "owner",
      to: "+34600111222",
      body: "hola",
    });

    expect(result.from).toBe("+34930453218");
    expect(mockedSendText).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "+34930453218",
        to: "+34600111222",
        body: "hola",
      })
    );
    expect(mockedSentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: "whatsapp",
        idempotencyKey: "adhoc:msg-1",
        kind: "text",
      }),
    });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("no se pudo registrar en SentMessage")
    );
    errorSpy.mockRestore();
  });
});

describe("ventanaAbierta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidarCacheRemitentes();
    mockedSenders.mockResolvedValue(DOS_REMITENTES as never);
  });

  it("pregunta a Telnyx desde el número de la audiencia", async () => {
    mockedWindow.mockResolvedValue({
      active: true,
      expiresAt: null,
      lastUserMessageAt: null,
      type: "24h",
    });

    expect(await ventanaAbierta("owner", "+34600111222")).toBe(true);
    expect(mockedWindow).toHaveBeenCalledWith("+34930453218", "+34600111222");
  });

  it("si la consulta falla, asume la ventana cerrada (la plantilla siempre llega)", async () => {
    mockedWindow.mockRejectedValue(new Error("timeout"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(await ventanaAbierta("client", "+34600111222")).toBe(false);
    errorSpy.mockRestore();
  });
});

describe("actualizarEstadoEnvio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSentUpdate.mockResolvedValue({} as never);
    mockedSentCreate.mockResolvedValue({} as never);
  });

  it("avanza el estado y guarda fechas y coste", async () => {
    mockedSentFindUnique.mockResolvedValue({
      id: "sm_1",
      deliveryStatus: "sent",
    } as never);
    const at = new Date("2026-09-19T21:18:31Z");

    await actualizarEstadoEnvio({
      providerMessageId: "msg-1",
      status: "delivered",
      at,
      costAmount: "0.0240",
      costCurrency: "USD",
    });

    expect(mockedSentUpdate).toHaveBeenCalledWith({
      where: { id: "sm_1" },
      data: expect.objectContaining({
        deliveryStatus: "delivered",
        deliveredAt: at,
        costCurrency: "USD",
      }),
    });
    const data = mockedSentUpdate.mock.calls[0][0].data as {
      costAmount: { toString(): string };
    };
    expect(data.costAmount.toString()).toBe("0.024");
  });

  it("un 'delivered' tardío no pisa un 'read' ya guardado, pero el fallo siempre gana", async () => {
    mockedSentFindUnique.mockResolvedValue({
      id: "sm_1",
      deliveryStatus: "read",
    } as never);

    await actualizarEstadoEnvio({
      providerMessageId: "msg-1",
      status: "delivered",
      at: new Date(),
    });
    expect(mockedSentUpdate.mock.calls[0][0].data).not.toHaveProperty(
      "deliveryStatus"
    );

    await actualizarEstadoEnvio({
      providerMessageId: "msg-1",
      status: "failed",
      at: new Date(),
      errorCode: "40008",
      errorDetail: "Undeliverable",
    });
    expect(mockedSentUpdate.mock.calls[1][0].data).toEqual(
      expect.objectContaining({
        deliveryStatus: "failed",
        errorCode: "40008",
        errorDetail: "Undeliverable",
      })
    );
  });

  it("un mensaje que no se registró (envío manual) se crea con clave adhoc para no perder el coste", async () => {
    mockedSentFindUnique.mockResolvedValue(null);

    await actualizarEstadoEnvio({
      providerMessageId: "msg-9",
      status: "read",
      at: new Date("2026-09-19T21:20:00Z"),
      from: "+34930454394",
      to: "+34692138456",
    });

    expect(mockedSentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: "whatsapp",
        idempotencyKey: "adhoc:msg-9",
        providerMessageId: "msg-9",
        deliveryStatus: "read",
        fromNumber: "+34930454394",
        toNumber: "+34692138456",
      }),
    });
  });
});
