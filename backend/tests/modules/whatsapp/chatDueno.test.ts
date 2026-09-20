import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { InboundMessage } from "@prisma/client";
import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";
import { acquireLock, releaseLock } from "../../../src/lib/bookingLock.js";
import { reclamarEnvio } from "../../../src/lib/messageIdempotency.js";
import {
  enviarBotones,
  enviarTexto,
} from "../../../src/modules/whatsapp/service.js";
import { telnyxAiAdapter } from "../../../src/adapters/telnyx/TelnyxAiAdapter.js";
import {
  claveDePropuesta,
  claveDelTurno,
} from "../../../src/modules/gestor/tools.js";
import * as mensajes from "../../../src/modules/whatsapp/mensajes.js";
import {
  TURNOS_POR_DUENO_Y_DIA,
  anotarEnConversacionDelDueno,
  botonesDeAccion,
  cerrarConversacionDelDueno,
  continuarTrasAccion,
  conversacionDelDueno,
  conversarConGestor,
  marcadorDelGestor,
  systemPromptDelGestor,
} from "../../../src/modules/whatsapp/chatDueno.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    sentMessage: { count: vi.fn(), updateMany: vi.fn() },
    ownerPendingAction: { findUnique: vi.fn() },
  },
}));
vi.mock("../../../src/lib/redis.js", () => {
  const redis = {
    incr: vi.fn(),
    expire: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  };
  return { getRedis: () => redis };
});
vi.mock("../../../src/lib/bookingLock.js", () => ({
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
}));
vi.mock("../../../src/lib/messageIdempotency.js", () => ({
  reclamarEnvio: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/service.js", () => ({
  enviarTexto: vi.fn(),
  enviarBotones: vi.fn(),
}));
vi.mock("../../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: {
    createConversation: vi.fn(),
    updateConversation: vi.fn(),
    addConversationMessage: vi.fn(),
    chatWithAssistant: vi.fn(),
  },
}));

const mockedBizFindUnique = vi.mocked(prisma.business.findUnique);
const mockedBizUpdate = vi.mocked(prisma.business.update);
const mockedBizUpdateMany = vi.mocked(prisma.business.updateMany);
const mockedSentCount = vi.mocked(prisma.sentMessage.count);
const mockedReclamar = vi.mocked(reclamarEnvio);
const mockedEnviarTexto = vi.mocked(enviarTexto);
const mockedEnviarBotones = vi.mocked(enviarBotones);
const mockedAcquire = vi.mocked(acquireLock);
const mockedRelease = vi.mocked(releaseLock);
const mockedCrear = vi.mocked(telnyxAiAdapter.createConversation);
const mockedActualizar = vi.mocked(telnyxAiAdapter.updateConversation);
const mockedAnadir = vi.mocked(telnyxAiAdapter.addConversationMessage);
const mockedChat = vi.mocked(telnyxAiAdapter.chatWithAssistant);
const redis = getRedis() as unknown as Record<
  "incr" | "expire" | "get" | "set" | "del",
  ReturnType<typeof vi.fn>
>;

const MOVIL = "+34692000000";
const AHORA = new Date("2026-09-20T15:00:00.000Z");
const NEGOCIO = {
  id: "biz_1",
  name: "Peluquería Ana",
  businessType: "peluqueria",
  timezone: "Europe/Madrid",
  active: true,
  ownerChatEnabled: true,
  ownerWhatsappNumber: MOVIL,
  ownerWhatsappOptInAt: new Date("2026-09-19T10:00:00.000Z"),
  ownerWhatsappOptOutAt: null,
  ownerWhatsappUnreachableAt: null,
  ownerConversationId: "conv_1",
  ownerConversationCreatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  subscriptionStatus: "ACTIVE",
};

function entrante(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: "in_1",
    providerMessageId: "msg_1",
    foreignId: null,
    eventId: null,
    fromNumber: MOVIL,
    toNumber: "+34930453218",
    audience: "owner",
    role: "owner",
    businessId: "biz_1",
    kind: "text",
    text: "¿Qué tengo mañana?",
    buttonId: null,
    buttonTitle: null,
    contextMessageId: null,
    contactName: "Ana",
    payload: {},
    receivedAt: AHORA,
    handledAt: null,
    handler: null,
    error: null,
    createdAt: AHORA,
    ...overrides,
  } as InboundMessage;
}

function cuerpoTexto(n = 0): string | undefined {
  return (mockedEnviarTexto.mock.calls[n]?.[0] as { body?: string } | undefined)
    ?.body;
}

describe("chatDueno — marcador, system prompt y botones", () => {
  it("el marcador solo lleva el momento en la zona del negocio", () => {
    const m = marcadorDelGestor({
      timezone: "Europe/Madrid",
      ahora: new Date("2026-09-20T14:51:00.000Z"),
    });
    expect(m).toBe(
      "[WhatsApp · domingo, 20 de septiembre de 2026, 16:51 (Europe/Madrid)]"
    );
  });

  it("el system prompt nombra el negocio, el sector y la zona, y no pide identificarse", () => {
    const p = systemPromptDelGestor(NEGOCIO);
    expect(p).toContain("Peluquería Ana (peluquería)");
    expect(p).toContain("Europe/Madrid");
    expect(p).toContain("no pidas que se identifique");
    expect(
      systemPromptDelGestor({
        ...NEGOCIO,
        name: "Negocio de ana@x.es",
        businessType: "otro",
      })
    ).toContain("tu negocio (negocio)");
  });

  it("los botones de una acción llevan el id en su id", () => {
    expect(botonesDeAccion("acc_1")).toEqual([
      { id: "accion:acc_1:confirmar", title: "Confirmar" },
      { id: "accion:acc_1:cancelar", title: "Cancelar" },
    ]);
  });
});

describe("conversacionDelDueno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCrear.mockResolvedValue({ id: "conv_nueva" });
    mockedActualizar.mockResolvedValue(undefined);
    mockedBizUpdate.mockResolvedValue({} as never);
  });

  it("reutiliza la conversación guardada de menos de 30 días", async () => {
    expect(
      await conversacionDelDueno({ business: NEGOCIO, ownerPhone: MOVIL })
    ).toEqual({
      conversationId: "conv_1",
      nueva: false,
    });
    expect(mockedCrear).not.toHaveBeenCalled();
  });

  it("crea una nueva con los metadata del negocio y el system_prompt, y la guarda en Business", async () => {
    const r = await conversacionDelDueno({
      business: {
        ...NEGOCIO,
        ownerConversationId: null,
        ownerConversationCreatedAt: null,
      },
      ownerPhone: MOVIL,
    });
    expect(r).toEqual({ conversationId: "conv_nueva", nueva: true });
    expect(mockedCrear).toHaveBeenCalledWith({
      name: "whatsapp:gestor:biz_1",
      metadata: {
        business_id: "biz_1",
        role: "owner",
        channel: "whatsapp",
        owner_phone: MOVIL,
      },
    });
    expect(mockedActualizar).toHaveBeenCalledWith("conv_nueva", {
      systemPrompt: systemPromptDelGestor(NEGOCIO),
    });
    expect(mockedBizUpdate).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: {
        ownerConversationId: "conv_nueva",
        ownerConversationCreatedAt: expect.any(Date),
      },
    });
  });

  it("rota una conversación de más de 30 días y con forzarNueva", async () => {
    await conversacionDelDueno({
      business: {
        ...NEGOCIO,
        ownerConversationCreatedAt: new Date(
          Date.now() - 31 * 24 * 60 * 60 * 1000
        ),
      },
      ownerPhone: MOVIL,
    });
    await conversacionDelDueno({
      business: NEGOCIO,
      ownerPhone: MOVIL,
      forzarNueva: true,
    });
    expect(mockedCrear).toHaveBeenCalledTimes(2);
  });

  it("si Telnyx falla devuelve null sin tocar Business", async () => {
    mockedCrear.mockRejectedValueOnce(new Error("Telnyx caído"));
    expect(
      await conversacionDelDueno({
        business: {
          ...NEGOCIO,
          ownerConversationId: null,
          ownerConversationCreatedAt: null,
        },
        ownerPhone: MOVIL,
      })
    ).toBeNull();
    expect(mockedBizUpdate).not.toHaveBeenCalled();
  });

  it("cerrarConversacionDelDueno vacía la conversación de los negocios del móvil y no lanza", async () => {
    mockedBizUpdateMany.mockResolvedValueOnce({ count: 1 });
    await cerrarConversacionDelDueno(MOVIL);
    expect(mockedBizUpdateMany).toHaveBeenCalledWith({
      where: { ownerWhatsappNumber: MOVIL, ownerConversationId: { not: null } },
      data: { ownerConversationId: null, ownerConversationCreatedAt: null },
    });
    mockedBizUpdateMany.mockRejectedValueOnce(new Error("bd"));
    await expect(cerrarConversacionDelDueno(MOVIL)).resolves.toBeUndefined();
  });

  it("anotarEnConversacionDelDueno manda un mensaje system a la conversación vigente y no lanza", async () => {
    mockedBizFindUnique.mockResolvedValueOnce({
      ownerConversationId: "conv_1",
    } as never);
    mockedAnadir.mockResolvedValueOnce(undefined);
    await anotarEnConversacionDelDueno("biz_1", "El dueño pulsó Confirmar.");
    expect(mockedAnadir).toHaveBeenCalledWith("conv_1", {
      role: "system",
      content: "El dueño pulsó Confirmar.",
    });

    mockedBizFindUnique.mockResolvedValueOnce({
      ownerConversationId: null,
    } as never);
    await anotarEnConversacionDelDueno("biz_1", "x");
    expect(mockedAnadir).toHaveBeenCalledTimes(1);

    mockedBizFindUnique.mockRejectedValueOnce(new Error("bd"));
    await expect(
      anotarEnConversacionDelDueno("biz_1", "x")
    ).resolves.toBeUndefined();
  });
});

describe("conversarConGestor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.TELNYX_OWNER_CHAT_ENABLED = "true";
    process.env.TELNYX_GESTOR_ASSISTANT_ID = "assistant-gestor";
    mockedBizFindUnique.mockResolvedValue(NEGOCIO as never);
    mockedBizUpdate.mockResolvedValue({} as never);
    redis.incr.mockResolvedValue(1);
    redis.expire.mockResolvedValue(1);
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue("OK");
    redis.del.mockResolvedValue(1);
    mockedAcquire.mockResolvedValue("token");
    mockedSentCount.mockResolvedValue(0);
    mockedReclamar.mockResolvedValue(true);
    mockedEnviarTexto.mockResolvedValue({ messageId: "out_1" } as never);
    mockedEnviarBotones.mockResolvedValue({ messageId: "out_2" } as never);
    mockedChat.mockResolvedValue("Mañana no tienes citas.");
    mockedCrear.mockResolvedValue({ id: "conv_nueva" });
    mockedActualizar.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.TELNYX_OWNER_CHAT_ENABLED;
    delete process.env.TELNYX_GESTOR_ASSISTANT_ID;
  });

  it("apagado, sin id del Gestor o sin texto: no atiende ni consulta la BD", async () => {
    process.env.TELNYX_OWNER_CHAT_ENABLED = "false";
    expect(
      await conversarConGestor({
        message: entrante(),
        businessId: "biz_1",
        texto: "hola",
      })
    ).toEqual({
      atendido: false,
      motivo: "apagado",
    });
    process.env.TELNYX_OWNER_CHAT_ENABLED = "true";
    delete process.env.TELNYX_GESTOR_ASSISTANT_ID;
    expect(
      await conversarConGestor({
        message: entrante(),
        businessId: "biz_1",
        texto: "hola",
      })
    ).toEqual({
      atendido: false,
      motivo: "sin_gestor",
    });
    process.env.TELNYX_GESTOR_ASSISTANT_ID = "assistant-gestor";
    expect(
      await conversarConGestor({
        message: entrante(),
        businessId: "biz_1",
        texto: "   ",
      })
    ).toEqual({
      atendido: false,
      motivo: "sin_texto",
    });
    expect(mockedBizFindUnique).not.toHaveBeenCalled();
  });

  it("negocio con el chat apagado, inactivo, con suscripción bloqueada, o dueño no activo / otro móvil: no atiende", async () => {
    const casos: Array<[Record<string, unknown>, string]> = [
      [{ ownerChatEnabled: false }, "apagado_negocio"],
      [{ active: false }, "negocio_inactivo"],
      [{ subscriptionStatus: "CANCELED" }, "negocio_inactivo"],
      [{ ownerWhatsappOptInAt: null }, "dueno_no_activo"],
      [{ ownerWhatsappOptOutAt: new Date() }, "dueno_no_activo"],
      [{ ownerWhatsappNumber: "+34600999999" }, "dueno_no_activo"],
    ];
    for (const [cambio, motivo] of casos) {
      mockedBizFindUnique.mockResolvedValueOnce({
        ...NEGOCIO,
        ...cambio,
      } as never);
      expect(
        await conversarConGestor({
          message: entrante(),
          businessId: "biz_1",
          texto: "hola",
        })
      ).toEqual({ atendido: false, motivo });
    }
    expect(mockedChat).not.toHaveBeenCalled();
  });

  it("un turno normal: anota el turno en Redis, manda marcador + texto, responde el texto tal cual y libera el lock", async () => {
    const message = entrante();
    const r = await conversarConGestor({
      message,
      businessId: "biz_1",
      texto: message.text!,
    });

    expect(r).toEqual({ atendido: true, resultado: { handler: "chat:dueno" } });
    expect(redis.set).toHaveBeenCalledWith(
      claveDelTurno("biz_1"),
      JSON.stringify({ inboundMessageId: "in_1", conversationId: "conv_1" }),
      "EX",
      180
    );
    const [assistantId, turno] = mockedChat.mock.calls[0]!;
    expect(assistantId).toBe("assistant-gestor");
    expect(turno.conversationId).toBe("conv_1");
    expect(turno.name).toBe("Ana");
    expect(turno.content).toMatch(
      /^\[WhatsApp · .*\(Europe\/Madrid\)\] ¿Qué tengo mañana\?$/
    );
    expect(mockedReclamar).toHaveBeenCalledWith(
      "whatsapp",
      "entrante:in_1:chat-dueno",
      expect.objectContaining({
        audience: "owner",
        toNumber: MOVIL,
        kind: "text",
      })
    );
    expect(cuerpoTexto()).toBe("Mañana no tienes citas.");
    expect(cuerpoTexto()).not.toMatch(/beta/i);
    expect(mockedEnviarBotones).not.toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith(claveDelTurno("biz_1"));
    expect(mockedRelease).toHaveBeenCalledWith(
      "lock:whatsapp:chat:dueno:biz_1",
      "token"
    );
  });

  it("si el LLM propuso una acción en el turno, la respuesta sale con los botones Confirmar/Cancelar", async () => {
    redis.get.mockImplementation(async (clave: string) =>
      clave === claveDePropuesta("biz_1") ? "acc_7" : null
    );
    mockedChat.mockResolvedValueOnce(
      "Si confirmas, doy por resuelta la cita pendiente de Elena."
    );

    const r = await conversarConGestor({
      message: entrante(),
      businessId: "biz_1",
      texto: "la de Elena ya la apunté",
    });

    expect(r).toEqual({
      atendido: true,
      resultado: { handler: "chat:dueno:propuesta" },
    });
    expect(mockedReclamar).toHaveBeenCalledWith(
      "whatsapp",
      "entrante:in_1:chat-dueno",
      expect.objectContaining({ kind: "interactive" })
    );
    expect(mockedEnviarBotones).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: "owner",
        to: MOVIL,
        body: "Si confirmas, doy por resuelta la cita pendiente de Elena.",
        buttons: botonesDeAccion("acc_7"),
      })
    );
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
  });

  it("el turno 61 del día responde el límite sin llamar al Gestor", async () => {
    redis.incr.mockResolvedValueOnce(TURNOS_POR_DUENO_Y_DIA + 1);
    const r = await conversarConGestor({
      message: entrante(),
      businessId: "biz_1",
      texto: "hola",
    });
    expect(r).toEqual({
      atendido: true,
      resultado: { handler: "chat:dueno:limite" },
    });
    expect(mockedChat).not.toHaveBeenCalled();
    expect(cuerpoTexto()).toBe(
      mensajes.limiteDiarioDelGestor({ panelUrl: "https://alhabla.ai/" })
    );
  });

  it("hilo ocupado: no responde; Telnyx caído: responde que no está disponible", async () => {
    mockedAcquire.mockResolvedValueOnce(null);
    expect(
      await conversarConGestor({
        message: entrante(),
        businessId: "biz_1",
        texto: "hola",
      })
    ).toEqual({
      atendido: true,
      resultado: { handler: "chat:dueno:ocupado" },
    });
    expect(mockedChat).not.toHaveBeenCalled();

    mockedChat.mockRejectedValueOnce(new Error("500"));
    expect(
      await conversarConGestor({
        message: entrante(),
        businessId: "biz_1",
        texto: "hola",
      })
    ).toEqual({
      atendido: true,
      resultado: { handler: "chat:dueno:error" },
    });
    expect(cuerpoTexto()).toBe(
      mensajes.gestorNoDisponible({
        negocio: "Peluquería Ana",
        panelUrl: "https://alhabla.ai/",
      })
    );
  });

  it("una conversación que Telnyx ya no tiene (404) se rota y el turno se repite una vez", async () => {
    mockedChat.mockRejectedValueOnce(
      Object.assign(new Error("Not found"), { status: 404 })
    );
    mockedChat.mockResolvedValueOnce("Hola de nuevo.");

    const r = await conversarConGestor({
      message: entrante(),
      businessId: "biz_1",
      texto: "hola",
    });
    expect(r).toEqual({ atendido: true, resultado: { handler: "chat:dueno" } });
    expect(mockedCrear).toHaveBeenCalledTimes(1);
    expect(mockedChat).toHaveBeenCalledTimes(2);
    expect(mockedChat.mock.calls[1]![1].conversationId).toBe("conv_nueva");
    expect(cuerpoTexto()).toBe("Hola de nuevo.");
  });
});

describe("continuarTrasAccion (turno de seguimiento tras un botón)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.TELNYX_OWNER_CHAT_ENABLED = "true";
    process.env.TELNYX_GESTOR_ASSISTANT_ID = "assistant-gestor";
    mockedBizFindUnique.mockResolvedValue(NEGOCIO as never);
    redis.incr.mockResolvedValue(1);
    redis.expire.mockResolvedValue(1);
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue("OK");
    redis.del.mockResolvedValue(1);
    mockedAcquire.mockResolvedValue("token");
    mockedSentCount.mockResolvedValue(0);
    mockedReclamar.mockResolvedValue(true);
    mockedEnviarTexto.mockResolvedValue({ messageId: "out_1" } as never);
  });
  afterEach(() => {
    delete process.env.TELNYX_OWNER_CHAT_ENABLED;
    delete process.env.TELNYX_GESTOR_ASSISTANT_ID;
  });

  it("tras una acción ejecutada da un turno al Gestor con el contexto y manda su respuesta como seguimiento", async () => {
    mockedChat.mockResolvedValueOnce(
      "Ahora el equipo: ¿quién trabaja contigo?"
    );
    await continuarTrasAccion({
      message: entrante(),
      businessId: "biz_1",
      resultado: "ejecutada",
    });
    expect(mockedChat.mock.calls[0]![1].content).toContain(
      "ha pulsado Confirmar y la acción ya está hecha"
    );
    expect(mockedReclamar).toHaveBeenCalledWith(
      "whatsapp",
      "entrante:in_1:chat-dueno-seguimiento",
      expect.anything()
    );
    expect(cuerpoTexto()).toBe("Ahora el equipo: ¿quién trabaja contigo?");
  });

  it("si el Gestor contesta «Listo.» no se manda nada; con el chat apagado no hace nada; un fallo no lanza", async () => {
    mockedChat.mockResolvedValueOnce("Listo.");
    await continuarTrasAccion({
      message: entrante(),
      businessId: "biz_1",
      resultado: "ejecutada",
    });
    expect(mockedEnviarTexto).not.toHaveBeenCalled();

    process.env.TELNYX_OWNER_CHAT_ENABLED = "false";
    await continuarTrasAccion({
      message: entrante(),
      businessId: "biz_1",
      resultado: "rechazada",
    });
    expect(mockedChat).toHaveBeenCalledTimes(1);

    process.env.TELNYX_OWNER_CHAT_ENABLED = "true";
    mockedBizFindUnique.mockRejectedValueOnce(new Error("bd"));
    await expect(
      continuarTrasAccion({
        message: entrante(),
        businessId: "biz_1",
        resultado: "fallida",
      })
    ).resolves.toBeUndefined();
  });

  it("una propuesta con respuesta larga manda el texto y aparte los botones con el resumen", async () => {
    redis.get.mockImplementation(async (clave: string) =>
      clave === claveDePropuesta("biz_1") ? "acc_7" : null
    );
    vi.mocked(prisma.ownerPendingAction.findUnique).mockResolvedValue({
      resumen: "Doy de alta 15 servicios.",
    } as never);
    mockedChat.mockResolvedValueOnce(
      "Si confirmas, daré de alta: " +
        "- Servicio con nombre largo, 30 minutos, 15 euros\n".repeat(30)
    );
    mockedEnviarBotones.mockResolvedValue({ messageId: "out_2" } as never);

    const r = await conversarConGestor({
      message: entrante(),
      businessId: "biz_1",
      texto: "dalos de alta",
    });
    expect(r).toEqual({
      atendido: true,
      resultado: { handler: "chat:dueno:propuesta" },
    });
    expect(mockedEnviarTexto).toHaveBeenCalledTimes(1);
    expect(mockedEnviarBotones).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "¿Confirmas? Doy de alta 15 servicios.",
        buttons: botonesDeAccion("acc_7"),
      })
    );
  });
});
