import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { InboundMessage } from "@prisma/client";
import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";
import { acquireLock, releaseLock } from "../../../src/lib/bookingLock.js";
import { reclamarEnvio } from "../../../src/lib/messageIdempotency.js";
import { enviarTexto } from "../../../src/modules/whatsapp/service.js";
import { telnyxAiAdapter } from "../../../src/adapters/telnyx/TelnyxAiAdapter.js";
import * as mensajes from "../../../src/modules/whatsapp/mensajes.js";
import {
  TURNOS_POR_CLIENTE_Y_DIA,
  callIdDeChat,
  coletillaBeta,
  conversacionVigente,
  conversarConRecepcionista,
  formatearMomento,
  marcadorDeChat,
} from "../../../src/modules/whatsapp/chatCliente.js";

vi.mock("../../../src/lib/prisma.js", () => {
  const tx = {
    call: { create: vi.fn() },
    clientConversation: { upsert: vi.fn() },
  };
  return {
    prisma: {
      business: { findUnique: vi.fn() },
      clientConversation: {
        findUnique: vi.fn(),
        update: vi.fn(),
        upsert: tx.clientConversation.upsert,
      },
      call: { create: tx.call.create },
      sentMessage: { count: vi.fn(), updateMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx)
      ),
    },
  };
});
vi.mock("../../../src/lib/redis.js", () => {
  const redis = { incr: vi.fn(), expire: vi.fn() };
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
}));
vi.mock("../../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: {
    createConversation: vi.fn(),
    chatWithAssistant: vi.fn(),
  },
}));

const mockedBizFindUnique = vi.mocked(prisma.business.findUnique);
const mockedConvFindUnique = vi.mocked(prisma.clientConversation.findUnique);
const mockedConvUpdate = vi.mocked(prisma.clientConversation.update);
const mockedConvUpsert = vi.mocked(prisma.clientConversation.upsert);
const mockedCallCreate = vi.mocked(prisma.call.create);
const mockedSentCount = vi.mocked(prisma.sentMessage.count);
const mockedReclamar = vi.mocked(reclamarEnvio);
const mockedEnviarTexto = vi.mocked(enviarTexto);
const mockedAcquire = vi.mocked(acquireLock);
const mockedRelease = vi.mocked(releaseLock);
const mockedCrear = vi.mocked(telnyxAiAdapter.createConversation);
const mockedChat = vi.mocked(telnyxAiAdapter.chatWithAssistant);
const redis = getRedis() as unknown as {
  incr: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
};

const MOVIL = "+34600123456";
const NEGOCIO = {
  id: "biz_1",
  name: "Peluquería Ana",
  phone: "+34930000000",
  telnyxPhoneNumber: "+34930454394",
  timezone: "Europe/Madrid",
  active: true,
  clientChatEnabled: true,
  subscriptionStatus: "ACTIVE",
  agents: [{ id: "agent_1", telnyxAssistantId: "assistant-1" }],
};

function entrante(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: "in_1",
    providerMessageId: "msg_1",
    foreignId: null,
    eventId: null,
    fromNumber: MOVIL,
    toNumber: "+34930454394",
    audience: "client",
    role: "client",
    businessId: "biz_1",
    kind: "text",
    text: "¿Tenéis hueco mañana por la tarde?",
    buttonId: null,
    buttonTitle: null,
    contextMessageId: null,
    contactName: "Marta",
    payload: {},
    receivedAt: new Date("2026-09-20T15:00:00.000Z"),
    handledAt: null,
    handler: null,
    error: null,
    createdAt: new Date("2026-09-20T15:00:00.000Z"),
    ...overrides,
  } as InboundMessage;
}

function cuerpoEnviado(n = 0): string | undefined {
  return (mockedEnviarTexto.mock.calls[n]?.[0] as { body?: string } | undefined)
    ?.body;
}

describe("chatCliente — marcador, coletilla y momento", () => {
  it("formatea el momento en la zona del negocio y lo nombra", () => {
    const texto = formatearMomento(
      new Date("2026-09-20T14:51:00.000Z"),
      "Europe/Madrid"
    );
    expect(texto).toContain("20 de septiembre de 2026");
    expect(texto).toContain("16:51");
    expect(texto).toContain("(Europe/Madrid)");
  });

  it("el marcador lleva canal, móvil y momento", () => {
    const marcador = marcadorDeChat({
      clientPhone: MOVIL,
      timezone: "Europe/Madrid",
      ahora: new Date("2026-09-20T14:51:00.000Z"),
    });
    expect(marcador.startsWith("[WhatsApp · +34600123456 · ")).toBe(true);
    expect(marcador).toContain("16:51");
    expect(marcador.endsWith("]")).toBe(true);
  });

  it("la coletilla Beta lleva el nombre y el teléfono de contacto formateado", () => {
    expect(coletillaBeta(NEGOCIO)).toBe(
      "_Beta · si prefieres, llama a Peluquería Ana: +34 930 454 394_"
    );
    expect(
      coletillaBeta({ ...NEGOCIO, telnyxPhoneNumber: null, phone: "TEMP-1" })
    ).toBe("_Beta · si prefieres, llama a Peluquería Ana_");
  });

  it("callIdDeChat es determinista", () => {
    expect(callIdDeChat("abc")).toBe("whatsapp:chat:abc");
  });
});

describe("conversacionVigente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCrear.mockResolvedValue({ id: "conv_nueva" });
  });

  it("reutiliza la conversación guardada si tiene menos de 30 días", async () => {
    mockedConvFindUnique.mockResolvedValueOnce({
      conversationId: "conv_1",
      callId: "whatsapp:chat:conv_1",
      startedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    } as never);

    expect(
      await conversacionVigente({
        business: NEGOCIO,
        agentId: "agent_1",
        clientPhone: MOVIL,
      })
    ).toEqual({
      conversationId: "conv_1",
      callId: "whatsapp:chat:conv_1",
      nueva: false,
    });
    expect(mockedCrear).not.toHaveBeenCalled();
    expect(mockedCallCreate).not.toHaveBeenCalled();
  });

  it("crea una nueva en Telnyx con call_control_id en los metadata y su Call sintética", async () => {
    mockedConvFindUnique.mockResolvedValueOnce(null);

    const creada = await conversacionVigente({
      business: NEGOCIO,
      agentId: "agent_1",
      clientPhone: MOVIL,
    });

    expect(creada?.nueva).toBe(true);
    expect(creada?.conversationId).toBe("conv_nueva");
    expect(creada?.callId.startsWith("whatsapp:chat:")).toBe(true);
    const metadata = mockedCrear.mock.calls[0]![0].metadata;
    expect(metadata).toMatchObject({
      business_id: "biz_1",
      client_phone: MOVIL,
      role: "client",
      channel: "whatsapp",
      call_control_id: creada!.callId,
    });
    expect(mockedCallCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        callId: creada!.callId,
        voiceProvider: "whatsapp",
        providerConversationId: "conv_nueva",
        businessId: "biz_1",
        agentId: "agent_1",
        fromNumber: MOVIL,
        status: "COMPLETED",
      }),
    });
    expect(mockedConvUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId_clientPhone: { businessId: "biz_1", clientPhone: MOVIL },
        },
        update: expect.objectContaining({
          conversationId: "conv_nueva",
          callId: creada!.callId,
          turns: 0,
        }),
      })
    );
  });

  it("rota una conversación de más de 30 días", async () => {
    mockedConvFindUnique.mockResolvedValueOnce({
      conversationId: "conv_vieja",
      callId: "whatsapp:chat:conv_vieja",
      startedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    } as never);

    const creada = await conversacionVigente({
      business: NEGOCIO,
      agentId: "agent_1",
      clientPhone: MOVIL,
    });
    expect(creada?.nueva).toBe(true);
    expect(mockedCrear).toHaveBeenCalledTimes(1);
  });

  it("si Telnyx no crea la conversación devuelve null sin escribir nada", async () => {
    mockedConvFindUnique.mockResolvedValueOnce(null);
    mockedCrear.mockRejectedValueOnce(new Error("Telnyx caído"));

    expect(
      await conversacionVigente({
        business: NEGOCIO,
        agentId: "agent_1",
        clientPhone: MOVIL,
      })
    ).toBeNull();
    expect(mockedCallCreate).not.toHaveBeenCalled();
  });
});

describe("conversarConRecepcionista", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TELNYX_CLIENT_CHAT_ENABLED = "true";
    mockedBizFindUnique.mockResolvedValue(NEGOCIO as never);
    mockedConvFindUnique.mockResolvedValue({
      conversationId: "conv_1",
      callId: "whatsapp:chat:conv_1",
      startedAt: new Date(),
    } as never);
    mockedConvUpdate.mockResolvedValue({} as never);
    redis.incr.mockResolvedValue(1);
    redis.expire.mockResolvedValue(1);
    mockedAcquire.mockResolvedValue("token");
    mockedSentCount.mockResolvedValue(0);
    mockedReclamar.mockResolvedValue(true);
    mockedEnviarTexto.mockResolvedValue({ messageId: "out_1" } as never);
    mockedChat.mockResolvedValue(
      "Mañana a las cinco tengo hueco. ¿Te lo reservo?"
    );
    mockedCrear.mockResolvedValue({ id: "conv_nueva" });
  });

  afterEach(() => {
    delete process.env.TELNYX_CLIENT_CHAT_ENABLED;
  });

  it("con el interruptor global apagado no atiende ni toca la base de datos", async () => {
    process.env.TELNYX_CLIENT_CHAT_ENABLED = "false";
    expect(
      await conversarConRecepcionista({
        message: entrante(),
        businessId: "biz_1",
        texto: "hola",
      })
    ).toEqual({ atendido: false, motivo: "apagado" });
    expect(mockedBizFindUnique).not.toHaveBeenCalled();
  });

  it("negocio con el chat apagado, sin recepcionista en Telnyx o con la suscripción bloqueada: no atiende", async () => {
    mockedBizFindUnique.mockResolvedValueOnce({
      ...NEGOCIO,
      clientChatEnabled: false,
    } as never);
    expect(
      await conversarConRecepcionista({
        message: entrante(),
        businessId: "biz_1",
        texto: "hola",
      })
    ).toEqual({ atendido: false, motivo: "apagado_negocio" });

    mockedBizFindUnique.mockResolvedValueOnce({
      ...NEGOCIO,
      agents: [],
    } as never);
    expect(
      await conversarConRecepcionista({
        message: entrante(),
        businessId: "biz_1",
        texto: "hola",
      })
    ).toEqual({ atendido: false, motivo: "sin_recepcionista" });

    mockedBizFindUnique.mockResolvedValueOnce({
      ...NEGOCIO,
      subscriptionStatus: "CANCELED",
    } as never);
    expect(
      await conversarConRecepcionista({
        message: entrante(),
        businessId: "biz_1",
        texto: "hola",
      })
    ).toEqual({ atendido: false, motivo: "negocio_inactivo" });
    expect(mockedChat).not.toHaveBeenCalled();
  });

  it("un turno normal: marcador + texto al assistant, respuesta con coletilla Beta, turno anotado", async () => {
    const message = entrante();
    const resultado = await conversarConRecepcionista({
      message,
      businessId: "biz_1",
      texto: message.text!,
    });

    expect(resultado).toEqual({
      atendido: true,
      resultado: { handler: "chat:cliente" },
    });
    expect(mockedChat).toHaveBeenCalledTimes(1);
    const [assistantId, turno] = mockedChat.mock.calls[0]!;
    expect(assistantId).toBe("assistant-1");
    expect(turno.conversationId).toBe("conv_1");
    expect(turno.name).toBe("Marta");
    expect(turno.content.startsWith(`[WhatsApp · ${MOVIL} · `)).toBe(true);
    expect(turno.content.endsWith("] ¿Tenéis hueco mañana por la tarde?")).toBe(
      true
    );
    expect(turno.content).toContain("(Europe/Madrid)");

    expect(mockedReclamar).toHaveBeenCalledWith(
      "whatsapp",
      "entrante:in_1:chat",
      expect.objectContaining({ audience: "client", toNumber: MOVIL })
    );
    expect(cuerpoEnviado()).toBe(
      "Mañana a las cinco tengo hueco. ¿Te lo reservo?\n\n_Beta · si prefieres, llama a Peluquería Ana: +34 930 454 394_"
    );
    expect(mockedConvUpdate).toHaveBeenCalledWith({
      where: { conversationId: "conv_1" },
      data: expect.objectContaining({ turns: { increment: 1 } }),
    });
    expect(mockedRelease).toHaveBeenCalledWith(
      "lock:whatsapp:chat:biz_1:+34600123456",
      "token"
    );
  });

  it("el turno 21 del día responde el límite (una vez al día) sin llamar al assistant", async () => {
    redis.incr.mockResolvedValueOnce(TURNOS_POR_CLIENTE_Y_DIA + 1);
    const resultado = await conversarConRecepcionista({
      message: entrante(),
      businessId: "biz_1",
      texto: "hola",
    });
    expect(resultado).toEqual({
      atendido: true,
      resultado: { handler: "chat:cliente:limite" },
    });
    expect(mockedChat).not.toHaveBeenCalled();
    expect(cuerpoEnviado()).toBe(
      mensajes.limiteDiarioDelChat({
        negocio: "Peluquería Ana",
        telefono: "+34 930 454 394",
      })
    );
  });

  it("si el hilo está ocupado no responde nada y no llama al assistant", async () => {
    mockedAcquire.mockResolvedValueOnce(null);
    expect(
      await conversarConRecepcionista({
        message: entrante(),
        businessId: "biz_1",
        texto: "hola",
      })
    ).toEqual({
      atendido: true,
      resultado: { handler: "chat:cliente:ocupado" },
    });
    expect(mockedChat).not.toHaveBeenCalled();
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
  });

  it("si Telnyx falla responde que no está disponible (una vez al día) y libera el lock", async () => {
    mockedChat.mockRejectedValueOnce(new Error("500 desde Telnyx"));
    const resultado = await conversarConRecepcionista({
      message: entrante(),
      businessId: "biz_1",
      texto: "hola",
    });
    expect(resultado).toEqual({
      atendido: true,
      resultado: { handler: "chat:cliente:error" },
    });
    expect(cuerpoEnviado()).toBe(
      mensajes.chatNoDisponible({
        negocio: "Peluquería Ana",
        telefono: "+34 930 454 394",
      })
    );
    expect(mockedRelease).toHaveBeenCalledTimes(1);
  });

  it("una conversación que Telnyx ya no tiene (404) se rota y el turno se repite una vez", async () => {
    mockedChat.mockRejectedValueOnce(
      Object.assign(new Error("Not found"), { status: 404 })
    );
    mockedChat.mockResolvedValueOnce("Hola de nuevo. ¿En qué te ayudo?");

    const resultado = await conversarConRecepcionista({
      message: entrante(),
      businessId: "biz_1",
      texto: "hola",
    });

    expect(resultado).toEqual({
      atendido: true,
      resultado: { handler: "chat:cliente" },
    });
    expect(mockedCrear).toHaveBeenCalledTimes(1);
    expect(mockedChat).toHaveBeenCalledTimes(2);
    expect(mockedChat.mock.calls[1]![1].conversationId).toBe("conv_nueva");
    expect(cuerpoEnviado()).toContain("Hola de nuevo.");
  });

  it("una respuesta vacía del assistant se trata como fallo", async () => {
    mockedChat.mockResolvedValueOnce("   ");
    const resultado = await conversarConRecepcionista({
      message: entrante(),
      businessId: "biz_1",
      texto: "hola",
    });
    expect(resultado.atendido && resultado.resultado.handler).toBe(
      "chat:cliente:error"
    );
  });

  it("la etiqueta personaliza el handler (botón «Cambiar»)", async () => {
    const resultado = await conversarConRecepcionista({
      message: entrante({ kind: "button", text: null }),
      businessId: "biz_1",
      texto: "He pulsado Cambiar",
      etiqueta: "cliente:cambiar:chat",
    });
    expect(resultado).toEqual({
      atendido: true,
      resultado: { handler: "cliente:cambiar:chat" },
    });
    expect(mockedChat.mock.calls[0]![1].content).toContain(
      "He pulsado Cambiar"
    );
  });
});
