import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { whatsappAdapter } from "../../../src/adapters/whatsapp/WhatsAppAdapter.js";
import {
  actualizarEstadoEnvio,
  audienciaDelNumero,
  enviarBotones,
  enviarContacto,
  enviarPlantilla,
  enviarTexto,
  invalidarCacheListaDeEspera,
  invalidarCacheRemitentes,
  listaDeEsperaDisponible,
  refrescarPlantilla,
  refrescarPlantillasConClave,
  reiniciarEnfriamientoDePlantillas,
  resolverPlantilla,
  ENFRIAMIENTO_REFRESCO_FALLIDO_MS,
  resolverRemitente,
  ventanaAbierta,
} from "../../../src/modules/whatsapp/service.js";
import { estaDadoDeBaja } from "../../../src/modules/whatsapp/bajas.js";
import {
  limpiarDuenoSinWhatsapp,
  marcarDuenoSinWhatsapp,
} from "../../../src/modules/whatsapp/altaDueno.js";
import { enqueueWhatsappJob } from "../../../src/lib/cloudTasks.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    whatsappSender: { findMany: vi.fn() },
    whatsappTemplate: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    sentMessage: {
      upsert: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    booking: { findFirst: vi.fn(), updateMany: vi.fn() },
    lead: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

// El respaldo de la confirmación (efectos de entrega) encola por Cloud Tasks
// con un import diferido; aquí se sustituye.
vi.mock("../../../src/lib/cloudTasks.js", () => ({
  enqueueWhatsappJob: vi.fn(),
}));

vi.mock("../../../src/adapters/whatsapp/WhatsAppAdapter.js", () => ({
  whatsappAdapter: {
    sendTemplate: vi.fn(),
    sendText: vi.fn(),
    sendInteractiveButtons: vi.fn(),
    sendContacts: vi.fn(),
    getConversationWindow: vi.fn(),
    listTemplates: vi.fn(),
  },
}));

vi.mock("../../../src/modules/whatsapp/bajas.js", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../../src/modules/whatsapp/bajas.js")
    >();
  return { ...actual, estaDadoDeBaja: vi.fn() };
});

vi.mock("../../../src/modules/whatsapp/altaDueno.js", () => ({
  limpiarDuenoSinWhatsapp: vi.fn(),
  marcarDuenoSinWhatsapp: vi.fn(),
}));

const mockedSenders = vi.mocked(prisma.whatsappSender.findMany);
const mockedTemplateFindUnique = vi.mocked(prisma.whatsappTemplate.findUnique);
const mockedTemplateFindMany = vi.mocked(prisma.whatsappTemplate.findMany);
const mockedBookingFindFirst = vi.mocked(prisma.booking.findFirst);
const mockedBookingUpdateMany = vi.mocked(prisma.booking.updateMany);
const mockedLeadFindFirst = vi.mocked(prisma.lead.findFirst);
const mockedLeadUpdate = vi.mocked(prisma.lead.update);
const mockedEnqueue = vi.mocked(enqueueWhatsappJob);
const mockedSentUpsert = vi.mocked(prisma.sentMessage.upsert);
const mockedSentCreate = vi.mocked(prisma.sentMessage.create);
const mockedSentFindUnique = vi.mocked(prisma.sentMessage.findUnique);
const mockedSentUpdate = vi.mocked(prisma.sentMessage.update);
const mockedSentUpdateMany = vi.mocked(prisma.sentMessage.updateMany);
const mockedTemplateUpdate = vi.mocked(prisma.whatsappTemplate.update);
const mockedSendTemplate = vi.mocked(whatsappAdapter.sendTemplate);
const mockedSendText = vi.mocked(whatsappAdapter.sendText);
const mockedSendButtons = vi.mocked(whatsappAdapter.sendInteractiveButtons);
const mockedSendContacts = vi.mocked(whatsappAdapter.sendContacts);
const mockedWindow = vi.mocked(whatsappAdapter.getConversationWindow);
const mockedListTemplates = vi.mocked(whatsappAdapter.listTemplates);
const mockedEstaDadoDeBaja = vi.mocked(estaDadoDeBaja);
const mockedMarcarSinWhatsapp = vi.mocked(marcarDuenoSinWhatsapp);
const mockedLimpiarSinWhatsapp = vi.mocked(limpiarDuenoSinWhatsapp);

beforeEach(() => {
  mockedEstaDadoDeBaja.mockResolvedValue(false);
  mockedSentUpdateMany.mockResolvedValue({ count: 1 });
});

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

  it("enviarPlantilla por id con templateName/templateLanguage informados los escribe en SentMessage; sin ellos sigue como hoy", async () => {
    await enviarPlantilla({
      audience: "client",
      to: "+34600111222",
      template: { id: "tpl-conf-v2" },
      templateName: "confirmacion_cita_v2",
      templateLanguage: "es",
      bodyParams: {},
      businessId: "biz_1",
      idempotencyKey: "booking-b1-confirmacion-1",
    });
    expect(mockedSendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: "tpl-conf-v2",
        templateName: undefined,
      })
    );
    expect(mockedSentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          templateName: "confirmacion_cita_v2",
          templateLanguage: "es",
        }),
      })
    );

    mockedSentUpsert.mockClear();
    await enviarPlantilla({
      audience: "owner",
      to: "+34600111222",
      template: { id: "tpl-x" },
      bodyParams: {},
      idempotencyKey: "aviso:x",
    });
    expect(mockedSentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          templateName: null,
          templateLanguage: null,
        }),
      })
    );
  });

  it("resolverPlantilla devuelve components", async () => {
    const components = [{ type: "BUTTONS", buttons: [{ type: "URL" }] }];
    mockedTemplateFindUnique.mockResolvedValue({
      telnyxTemplateId: "tpl-conf-v2",
      name: "confirmacion_cita_v2",
      language: "es",
      status: "APPROVED",
      components,
    } as never);

    expect(await resolverPlantilla({ key: "confirmacion_cita_v2" })).toEqual({
      telnyxTemplateId: "tpl-conf-v2",
      name: "confirmacion_cita_v2",
      language: "es",
      components,
    });
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

  it("si el statuses[] se adelantó y ya existe la fila adhoc, se fusiona con los datos del envío", async () => {
    mockedSentUpsert.mockRejectedValueOnce({ code: "P2002" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await enviarTexto({
      audience: "owner",
      to: "+34600111222",
      body: "hola",
      businessId: "biz_1",
      idempotencyKey: "entrante:in_1:bienvenida",
      callbackData: "aviso:bienvenida",
    });

    expect(mockedSentUpdateMany).toHaveBeenCalledWith({
      where: { providerMessageId: "msg-1" },
      data: expect.objectContaining({
        businessId: "biz_1",
        audience: "owner",
        toNumber: "+34600111222",
        kind: "text",
        callbackData: "aviso:bienvenida",
      }),
    });
    expect(mockedSentUpdateMany.mock.calls[0][0].data).not.toHaveProperty(
      "deliveryStatus"
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("ya tenía fila adhoc; se fusiona")
    );
    logSpy.mockRestore();
  });
});

describe("guardia de baja", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidarCacheRemitentes();
    mockedSenders.mockResolvedValue(DOS_REMITENTES as never);
    mockedSentUpdateMany.mockResolvedValue({ count: 1 });
    mockedSentCreate.mockResolvedValue({} as never);
    mockedSentUpsert.mockResolvedValue({} as never);
    mockedTemplateFindUnique.mockResolvedValue({
      telnyxTemplateId: "tpl",
      name: "x",
      language: "es",
      status: "APPROVED",
    } as never);
    const ok = { messageId: "msg-1", status: "queued" };
    mockedSendTemplate.mockResolvedValue(ok);
    mockedSendText.mockResolvedValue(ok);
    mockedSendButtons.mockResolvedValue(ok);
    mockedSendContacts.mockResolvedValue(ok);
  });

  it("las cuatro funciones suprimen el envío a un número con baja y marcan la fila reclamada", async () => {
    mockedEstaDadoDeBaja.mockResolvedValue(true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const comun = {
      audience: "client" as const,
      to: "+34600111222",
      idempotencyKey: "k-1",
    };

    await expect(
      enviarPlantilla({ ...comun, template: { key: "x" }, bodyParams: {} })
    ).rejects.toMatchObject({ code: "WHATSAPP_OPT_OUT" });
    await expect(enviarTexto({ ...comun, body: "hola" })).rejects.toMatchObject(
      {
        code: "WHATSAPP_OPT_OUT",
      }
    );
    await expect(
      enviarBotones({
        ...comun,
        body: "hola",
        buttons: [{ id: "a", title: "A" }],
      })
    ).rejects.toMatchObject({ code: "WHATSAPP_OPT_OUT" });
    await expect(
      enviarContacto({
        ...comun,
        contact: { formattedName: "Alhabla", phones: [] } as never,
      })
    ).rejects.toMatchObject({ code: "WHATSAPP_OPT_OUT" });

    expect(mockedSendTemplate).not.toHaveBeenCalled();
    expect(mockedSendText).not.toHaveBeenCalled();
    expect(mockedSendButtons).not.toHaveBeenCalled();
    expect(mockedSendContacts).not.toHaveBeenCalled();
    expect(mockedEstaDadoDeBaja).toHaveBeenCalledWith("client", "+34600111222");
    expect(mockedSentUpdateMany).toHaveBeenCalledTimes(4);
    expect(mockedSentUpdateMany).toHaveBeenCalledWith({
      where: { channel: "whatsapp", idempotencyKey: "k-1" },
      data: { deliveryStatus: "suppressed", errorCode: "OPT_OUT" },
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("suprimido: el número pidió STOP")
    );
    logSpy.mockRestore();
  });

  it("permitirBaja deja pasar la confirmación del propio STOP", async () => {
    mockedEstaDadoDeBaja.mockResolvedValue(true);

    await enviarTexto({
      audience: "client",
      to: "+34600111222",
      body: "Hecho.",
      permitirBaja: true,
    });

    expect(mockedSendText).toHaveBeenCalled();
    expect(mockedEstaDadoDeBaja).not.toHaveBeenCalled();
  });

  it("si la comprobación de baja lanza, se envía y se deja en el log (fail-open)", async () => {
    mockedEstaDadoDeBaja.mockRejectedValue(new Error("BD caída"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await enviarTexto({ audience: "client", to: "+34600111222", body: "hola" });

    expect(mockedSendText).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("BD caída"));
    errorSpy.mockRestore();
  });
});

describe("refrescarPlantilla", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reiniciarEnfriamientoDePlantillas();
    process.env.WHATSAPP_WABA_ID = "waba-1";
    mockedTemplateUpdate.mockResolvedValue({} as never);
  });

  const fila = {
    id: "wt_1",
    key: "bienvenida_negocio",
    name: "bienvenida_negocio",
    language: "es",
    telnyxTemplateId: "tpl-b",
    status: "PENDING",
    lastSyncedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  };

  it("con sincronización reciente no consulta el WABA", async () => {
    mockedTemplateFindUnique.mockResolvedValue({
      ...fila,
      lastSyncedAt: new Date(),
    } as never);

    await refrescarPlantilla("bienvenida_negocio");

    expect(mockedListTemplates).not.toHaveBeenCalled();
  });

  it("con más de 24 h consulta el WABA y actualiza estado y lastSyncedAt", async () => {
    mockedTemplateFindUnique.mockResolvedValue(fila as never);
    mockedListTemplates.mockResolvedValue([
      {
        telnyxTemplateId: "tpl-b",
        metaTemplateId: null,
        name: "bienvenida_negocio",
        language: "es",
        category: "UTILITY",
        status: "APPROVED",
        qualityRating: null,
        rejectionReason: null,
        components: null,
      },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await refrescarPlantilla("bienvenida_negocio");

    expect(mockedListTemplates).toHaveBeenCalledWith("waba-1");
    expect(mockedTemplateUpdate).toHaveBeenCalledWith({
      where: { id: "wt_1" },
      data: expect.objectContaining({
        status: "APPROVED",
        lastSyncedAt: expect.any(Date),
      }),
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("PENDING → APPROVED")
    );
    logSpy.mockRestore();
  });

  it("si el adaptador falla, lo deja en el log y no relanza; sin WHATSAPP_WABA_ID no consulta", async () => {
    mockedTemplateFindUnique.mockResolvedValue(fila as never);
    mockedListTemplates.mockRejectedValue(new Error("timeout"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      refrescarPlantilla("bienvenida_negocio")
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "No se pudo refrescar el estado de bienvenida_negocio"
      )
    );
    errorSpy.mockRestore();

    delete process.env.WHATSAPP_WABA_ID;
    mockedListTemplates.mockClear();
    await refrescarPlantilla("bienvenida_negocio");
    expect(mockedListTemplates).not.toHaveBeenCalled();
  });

  it("tras un fallo del WABA no vuelve a consultarlo hasta pasado el enfriamiento", async () => {
    mockedTemplateFindUnique.mockResolvedValue(fila as never);
    mockedListTemplates.mockRejectedValue(new Error("429 Too Many Requests"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await refrescarPlantilla("bienvenida_negocio");
    await refrescarPlantilla("bienvenida_negocio");
    await refrescarPlantilla("bienvenida_negocio");

    expect(mockedListTemplates).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("no se reintenta hasta dentro de 15 min")
    );

    // Pasado el enfriamiento se vuelve a intentar.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + ENFRIAMIENTO_REFRESCO_FALLIDO_MS + 1000);
    mockedListTemplates.mockResolvedValue([]);
    await refrescarPlantilla("bienvenida_negocio");
    expect(mockedListTemplates).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    errorSpy.mockRestore();
  });
});

describe("listaDeEsperaDisponible (gate del prompt)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reiniciarEnfriamientoDePlantillas();
    invalidarCacheListaDeEspera();
    delete process.env.WHATSAPP_WABA_ID;
  });

  it("true solo con hueco_libre APPROVED (hora_disponible no cuenta), llama a refrescarPlantilla, caché de 60 s e invalidarCacheListaDeEspera", async () => {
    // Sin WHATSAPP_WABA_ID refrescarPlantilla vuelve sin leer; con él lee
    // la fila (sincronizada hace poco ⇒ no consulta el WABA).
    process.env.WHATSAPP_WABA_ID = "waba-1";
    mockedTemplateFindUnique.mockResolvedValue({
      id: "wt_h",
      key: "hueco_libre",
      status: "APPROVED",
      lastSyncedAt: new Date(),
    } as never);

    expect(await listaDeEsperaDisponible()).toBe(true);
    // refrescarPlantilla (1) + lectura del gate (1).
    expect(mockedTemplateFindUnique).toHaveBeenCalledTimes(2);
    expect(mockedTemplateFindUnique).toHaveBeenLastCalledWith({
      where: { key: "hueco_libre" },
      select: { status: true },
    });
    expect(mockedListTemplates).not.toHaveBeenCalled();

    // Cacheado 60 s: ni refresco ni lectura.
    mockedTemplateFindUnique.mockClear();
    expect(await listaDeEsperaDisponible()).toBe(true);
    expect(mockedTemplateFindUnique).not.toHaveBeenCalled();

    invalidarCacheListaDeEspera();
    mockedTemplateFindUnique.mockResolvedValue({
      id: "wt_h",
      key: "hueco_libre",
      status: "PENDING",
      lastSyncedAt: new Date(),
    } as never);
    expect(await listaDeEsperaDisponible()).toBe(false);

    // Solo mira hueco_libre: una fila hora_disponible aprobada no activa nada.
    invalidarCacheListaDeEspera();
    mockedTemplateFindUnique.mockImplementation(async (args) =>
      (args as { where: { key?: string } }).where.key === "hora_disponible"
        ? ({ status: "APPROVED" } as never)
        : (null as never)
    );
    expect(await listaDeEsperaDisponible()).toBe(false);
    for (const llamada of mockedTemplateFindUnique.mock.calls) {
      expect((llamada[0] as { where: { key: string } }).where.key).toBe(
        "hueco_libre"
      );
    }
  });

  it("con la BD caída devuelve el último valor conocido sin cachearlo y loguea; sin valor previo devuelve false", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedTemplateFindUnique.mockRejectedValue(new Error("BD caída"));

    expect(await listaDeEsperaDisponible()).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("se mantiene false")
    );

    // Un valor real, después la BD cae: se mantiene true y no se cachea el fallo.
    mockedTemplateFindUnique.mockResolvedValue({ status: "APPROVED" } as never);
    expect(await listaDeEsperaDisponible()).toBe(true);
    invalidarCacheListaDeEspera();
    mockedTemplateFindUnique.mockRejectedValue(new Error("BD caída"));
    expect(await listaDeEsperaDisponible()).toBe(true);
    expect(errorSpy).toHaveBeenLastCalledWith(
      expect.stringContaining("se mantiene true")
    );
    // Sin caché del fallo: la siguiente llamada vuelve a leer.
    mockedTemplateFindUnique.mockClear();
    mockedTemplateFindUnique.mockResolvedValue({ status: "PAUSED" } as never);
    expect(await listaDeEsperaDisponible()).toBe(false);
    expect(mockedTemplateFindUnique).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("refrescarPlantillasConClave refresca cada fila con key y nunca lanza", async () => {
    process.env.WHATSAPP_WABA_ID = "waba-1";
    mockedTemplateFindMany.mockResolvedValue([
      { key: "hueco_libre" },
      { key: "confirmacion_cita_v2" },
    ] as never);
    mockedTemplateFindUnique.mockResolvedValue({
      id: "wt",
      status: "PENDING",
      lastSyncedAt: new Date(),
    } as never);

    await refrescarPlantillasConClave();

    expect(mockedTemplateFindMany).toHaveBeenCalledWith({
      where: { key: { not: null } },
      select: { key: true },
    });
    expect(mockedTemplateFindUnique).toHaveBeenCalledWith({
      where: { key: "hueco_libre" },
    });
    expect(mockedTemplateFindUnique).toHaveBeenCalledWith({
      where: { key: "confirmacion_cita_v2" },
    });

    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockedTemplateFindMany.mockRejectedValue(new Error("BD caída"));
    await expect(refrescarPlantillasConClave()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("refrescarPlantilla que cambia hueco_libre hacia/desde APPROVED invalida la caché del gate y lo loguea", async () => {
    process.env.WHATSAPP_WABA_ID = "waba-1";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fila = {
      id: "wt_h",
      key: "hueco_libre",
      name: "hueco_libre",
      language: "es",
      telnyxTemplateId: "tpl-h",
      status: "PENDING",
      lastSyncedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    };
    const remota = {
      telnyxTemplateId: "tpl-h",
      metaTemplateId: null,
      name: "hueco_libre",
      language: "es",
      category: "UTILITY",
      status: "APPROVED",
      qualityRating: null,
      rejectionReason: null,
      components: null,
    };
    // Primero el gate cachea false (fila PENDING, sincronizada hace poco).
    mockedTemplateFindUnique.mockResolvedValue({
      ...fila,
      lastSyncedAt: new Date(),
    } as never);
    expect(await listaDeEsperaDisponible()).toBe(false);

    // El refresco la ve APPROVED en el WABA: invalida la caché.
    mockedTemplateFindUnique.mockResolvedValue(fila as never);
    mockedListTemplates.mockResolvedValue([remota]);
    mockedTemplateUpdate.mockResolvedValue({} as never);
    await refrescarPlantilla("hueco_libre");
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "hueco_libre APPROVED: la frase de la lista de espera cambia"
      )
    );

    // Sin la invalidación, el gate seguiría devolviendo el false cacheado.
    mockedTemplateFindUnique.mockResolvedValue({
      ...fila,
      status: "APPROVED",
      lastSyncedAt: new Date(),
    } as never);
    expect(await listaDeEsperaDisponible()).toBe(true);

    // Un cambio que no cruza APPROVED (PENDING → REJECTED) no avisa.
    logSpy.mockClear();
    mockedTemplateFindUnique.mockResolvedValue(fila as never);
    mockedListTemplates.mockResolvedValue([{ ...remota, status: "REJECTED" }]);
    await refrescarPlantilla("hueco_libre");
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("la frase de la lista de espera cambia")
    );
    logSpy.mockRestore();
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

  describe("131026 y entregas al dueño", () => {
    const filaOwner = {
      id: "sm_1",
      deliveryStatus: "sent",
      audience: "owner",
      businessId: "biz_1",
      toNumber: "+34600123456",
      callbackData: "alta:biz_1",
    };
    const at = new Date("2026-09-20T12:00:00Z");

    it("un failed con código 131026 sobre una fila del dueño marca el negocio como sin WhatsApp", async () => {
      mockedSentFindUnique.mockResolvedValue(filaOwner as never);

      await actualizarEstadoEnvio({
        providerMessageId: "msg-1",
        status: "failed",
        at,
        errorCode: "131026",
        errorDetail: "Message undeliverable",
      });

      expect(mockedMarcarSinWhatsapp).toHaveBeenCalledWith(
        "biz_1",
        "+34600123456",
        at
      );
    });

    it("también cuando el código viene solo en el detalle, o la fila es adhoc con callbackData alta:<id>", async () => {
      mockedSentFindUnique.mockResolvedValue(filaOwner as never);
      await actualizarEstadoEnvio({
        providerMessageId: "msg-1",
        status: "failed",
        at,
        errorCode: null,
        errorDetail: "Error 131026: recipient is not a WhatsApp user",
      });
      expect(mockedMarcarSinWhatsapp).toHaveBeenCalledTimes(1);

      // Fila adhoc sin negocio ni audiencia: el negocio sale del callback
      // que llega en el propio statuses[].
      mockedSentFindUnique.mockResolvedValue(null);
      await actualizarEstadoEnvio({
        providerMessageId: "msg-2",
        status: "failed",
        at,
        errorCode: "131026",
        callbackData: "alta:biz_7",
        to: "+34600999888",
      });
      expect(mockedMarcarSinWhatsapp).toHaveBeenLastCalledWith(
        "biz_7",
        "+34600999888",
        at
      );

      // Y si el statuses[] llegó tras el message.finalized (sin callback),
      // se hereda el de la fila.
      mockedSentFindUnique.mockResolvedValue({
        ...filaOwner,
        audience: null,
        businessId: null,
        toNumber: "+34600123456",
        callbackData: "alta:biz_8",
      } as never);
      await actualizarEstadoEnvio({
        providerMessageId: "msg-3",
        status: "failed",
        at,
        errorCode: "131026",
      });
      expect(mockedMarcarSinWhatsapp).toHaveBeenLastCalledWith(
        "biz_8",
        "+34600123456",
        at
      );
    });

    it("en audiencia cliente, o con otro código, no toca el negocio", async () => {
      const logSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);
      mockedSentFindUnique.mockResolvedValue({
        ...filaOwner,
        audience: "client",
        callbackData: null,
      } as never);
      await actualizarEstadoEnvio({
        providerMessageId: "msg-1",
        status: "failed",
        at,
        errorCode: "131026",
      });
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("131026"));

      mockedSentFindUnique.mockResolvedValue(filaOwner as never);
      await actualizarEstadoEnvio({
        providerMessageId: "msg-1",
        status: "failed",
        at,
        errorCode: "131047",
      });
      expect(mockedMarcarSinWhatsapp).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it("un delivered o read al dueño limpia la marca de sin WhatsApp", async () => {
      mockedSentFindUnique.mockResolvedValue(filaOwner as never);

      await actualizarEstadoEnvio({
        providerMessageId: "msg-1",
        status: "delivered",
        at,
      });
      await actualizarEstadoEnvio({
        providerMessageId: "msg-1",
        status: "read",
        at,
      });

      expect(mockedLimpiarSinWhatsapp).toHaveBeenCalledTimes(2);
      expect(mockedLimpiarSinWhatsapp).toHaveBeenCalledWith(
        "biz_1",
        "+34600123456"
      );
    });

    it("la limpieza lleva el móvil del envío (un read tardío al móvil antiguo no toca el nuevo) y sin destino no limpia", async () => {
      // El `to` del evento manda sobre la fila: es lo que se compara con el
      // ownerWhatsappNumber actual dentro de limpiarDuenoSinWhatsapp.
      mockedSentFindUnique.mockResolvedValue(filaOwner as never);
      await actualizarEstadoEnvio({
        providerMessageId: "msg-1",
        status: "read",
        at,
        to: "+34600000001",
      });
      expect(mockedLimpiarSinWhatsapp).toHaveBeenCalledWith(
        "biz_1",
        "+34600000001"
      );

      mockedLimpiarSinWhatsapp.mockClear();
      mockedSentFindUnique.mockResolvedValue({
        ...filaOwner,
        toNumber: null,
      } as never);
      await actualizarEstadoEnvio({
        providerMessageId: "msg-1",
        status: "delivered",
        at,
      });
      expect(mockedLimpiarSinWhatsapp).not.toHaveBeenCalled();
    });
  });
});

describe("efectos de entrega sobre los envíos al cliente (PR 4)", () => {
  const at = new Date("2026-09-20T12:00:00Z");
  const CITA = new Date("2026-09-24T15:00:00Z");
  const filaCliente = {
    id: "sm_c",
    idempotencyKey: "booking-booking_1-confirmacion-1",
    deliveryStatus: "sent",
    audience: "client",
    businessId: "biz_1",
    toNumber: "+34600111222",
    callbackData: "cliente:confirmacion:booking_1",
    templateName: "confirmacion_cita_v2",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    mockedSentUpdate.mockResolvedValue({} as never);
    mockedBookingFindFirst.mockResolvedValue({
      id: "booking_1",
      programedAt: CITA,
    } as never);
    mockedBookingUpdateMany.mockResolvedValue({ count: 1 });
    mockedLeadUpdate.mockResolvedValue({} as never);
    mockedEnqueue.mockResolvedValue(undefined);
  });

  it("un statuses failed 132012 sobre cliente:confirmacion:<id> (plantilla confirmacion_cita_v2) loguea con la plantilla, deja clientNotifiedAt en null y encola una vez el respaldo -respaldo con sinV2; sobre la fila -respaldo no encola nada más", async () => {
    mockedSentFindUnique.mockResolvedValue(filaCliente as never);

    await actualizarEstadoEnvio({
      providerMessageId: "msg-1",
      status: "failed",
      at,
      errorCode: "132012",
      errorDetail: "Parameter format does not match",
    });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(
        /Meta rechazó cliente:confirmacion:booking_1 \(plantilla confirmacion_cita_v2, negocio biz_1, destino \+34600111222\): 132012/
      )
    );
    expect(mockedBookingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "booking_1", call: { businessId: "biz_1" } },
      })
    );
    expect(mockedBookingUpdateMany).toHaveBeenCalledWith({
      where: { id: "booking_1" },
      data: { clientNotifiedAt: null },
    });
    expect(mockedEnqueue).toHaveBeenCalledWith(
      {
        proposito: "confirmacion",
        bookingId: "booking_1",
        programedAtMs: CITA.getTime(),
        toNumber: "+34600111222",
        businessId: "biz_1",
        audience: "client",
        sinV2: true,
      },
      {
        taskId: `booking-booking_1-confirmacion-${Math.floor(CITA.getTime() / 1000)}-respaldo`,
      }
    );

    // La fila del respaldo rechazada: solo limpia y loguea.
    mockedEnqueue.mockClear();
    mockedBookingUpdateMany.mockClear();
    mockedSentFindUnique.mockResolvedValue({
      ...filaCliente,
      idempotencyKey: "booking-booking_1-confirmacion-1-respaldo",
      templateName: "confirmacion_cita",
    } as never);
    await actualizarEstadoEnvio({
      providerMessageId: "msg-2",
      status: "failed",
      at,
      errorCode: "132012",
    });
    expect(mockedBookingUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockedEnqueue).not.toHaveBeenCalled();

    // Un código que no es de plantilla (tier) tampoco encola respaldo.
    mockedSentFindUnique.mockResolvedValue(filaCliente as never);
    await actualizarEstadoEnvio({
      providerMessageId: "msg-3",
      status: "failed",
      at,
      errorCode: "130429",
    });
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it("si el statuses[] se adelantó al registro (fila adhoc:<wamid>), el respaldo se encola igual con un taskId válido para Cloud Tasks (solo [A-Za-z0-9_-]) derivado de la reserva", async () => {
    mockedSentFindUnique.mockResolvedValue({
      ...filaCliente,
      idempotencyKey:
        "adhoc:wamid.HBgLMzQ2OTIxMzg0NTYVAgARGBI5QUI3QzQ4RkY2RTk1RkU2AA==",
    } as never);

    await actualizarEstadoEnvio({
      providerMessageId:
        "wamid.HBgLMzQ2OTIxMzg0NTYVAgARGBI5QUI3QzQ4RkY2RTk1RkU2AA==",
      status: "failed",
      at,
      errorCode: "132012",
    });

    expect(mockedEnqueue).toHaveBeenCalledTimes(1);
    const taskId = (mockedEnqueue.mock.calls[0][1] as { taskId: string })
      .taskId;
    expect(taskId).toBe(
      `booking-booking_1-confirmacion-${Math.floor(CITA.getTime() / 1000)}-respaldo`
    );
    expect(taskId).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("un statuses failed sobre cliente:hueco:<leadId> reabre el lead (notifiedAt null, notifiedVia ninguna:meta:<código>, resolvedAt null) salvo si resolvedBy está presente; 131026 lo cierra sin_whatsapp", async () => {
    const filaHueco = {
      ...filaCliente,
      idempotencyKey: "espera-lead_1-1",
      callbackData: "cliente:hueco:lead_1",
      templateName: "hueco_libre",
    };
    mockedSentFindUnique.mockResolvedValue(filaHueco as never);
    mockedLeadFindFirst.mockResolvedValue({
      id: "lead_1",
      data: { clientPhone: "+34600111222" },
    } as never);

    await actualizarEstadoEnvio({
      providerMessageId: "msg-1",
      status: "failed",
      at,
      errorCode: "131049",
    });
    expect(mockedLeadFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "lead_1",
          type: "availability_watch",
          call: { businessId: "biz_1" },
        },
      })
    );
    expect(mockedLeadUpdate).toHaveBeenCalledWith({
      where: { id: "lead_1" },
      data: {
        resolvedAt: null,
        notifiedAt: null,
        notifiedVia: "ninguna:meta:131049",
      },
    });

    mockedLeadUpdate.mockClear();
    mockedLeadFindFirst.mockResolvedValue({
      id: "lead_1",
      data: { clientPhone: "+34600111222", resolvedBy: "reservado" },
    } as never);
    await actualizarEstadoEnvio({
      providerMessageId: "msg-2",
      status: "failed",
      at,
      errorCode: "131049",
    });
    expect(mockedLeadUpdate).not.toHaveBeenCalled();

    mockedLeadFindFirst.mockResolvedValue({
      id: "lead_1",
      data: { clientPhone: "+34600111222" },
    } as never);
    await actualizarEstadoEnvio({
      providerMessageId: "msg-3",
      status: "failed",
      at,
      errorCode: "131026",
    });
    expect(mockedLeadUpdate).toHaveBeenCalledWith({
      where: { id: "lead_1" },
      data: {
        resolvedAt: at,
        data: { clientPhone: "+34600111222", resolvedBy: "sin_whatsapp" },
      },
    });
    // Nunca toca al dueño.
    expect(mockedMarcarSinWhatsapp).not.toHaveBeenCalled();
  });

  it("un statuses failed sobre cliente:recordatorio o cliente:contacto solo loguea", async () => {
    for (const callbackData of [
      "cliente:recordatorio:booking_1",
      "cliente:contacto:booking_1",
    ]) {
      mockedSentFindUnique.mockResolvedValue({
        ...filaCliente,
        callbackData,
      } as never);
      await actualizarEstadoEnvio({
        providerMessageId: "msg-1",
        status: "failed",
        at,
        errorCode: "132000",
      });
    }
    expect(console.error).toHaveBeenCalledTimes(2);
    expect(mockedBookingUpdateMany).not.toHaveBeenCalled();
    expect(mockedLeadUpdate).not.toHaveBeenCalled();
    expect(mockedEnqueue).not.toHaveBeenCalled();
    // Los delivered/read de audiencia client no tienen efectos.
    mockedSentFindUnique.mockResolvedValue(filaCliente as never);
    await actualizarEstadoEnvio({
      providerMessageId: "msg-1",
      status: "read",
      at,
    });
    expect(mockedLimpiarSinWhatsapp).not.toHaveBeenCalled();
  });
});
