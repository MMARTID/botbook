import { describe, it, expect, beforeEach, vi } from "vitest";
import type { InboundMessage } from "@prisma/client";
import { prisma } from "../../../src/lib/prisma.js";
import { reclamarEnvio } from "../../../src/lib/messageIdempotency.js";
import {
  enviarBotones,
  enviarTexto,
  resolverRemitente,
} from "../../../src/modules/whatsapp/service.js";
import {
  registrarBaja,
  revocarBaja,
} from "../../../src/modules/whatsapp/bajas.js";
import { textoAgendaDelDia } from "../../../src/modules/whatsapp/avisosNegocio.js";
import {
  enqueueRecordarRecadoJob,
  enqueueRetryBookingJob,
} from "../../../src/lib/cloudTasks.js";
import {
  activarAvisosDelDueno,
  darDeBajaDueno,
  reactivarDueno,
} from "../../../src/modules/whatsapp/altaDueno.js";
import { botonEnClientes } from "../../../src/modules/whatsapp/botonesCliente.js";
import { avisarAQuienEsperaba } from "../../../src/modules/whatsapp/listaDeEspera.js";
import { conversarConRecepcionista } from "../../../src/modules/whatsapp/chatCliente.js";
import {
  anotarEnConversacionDelDueno,
  cerrarConversacionDelDueno,
  chatDelDuenoActivo,
  conversarConGestor,  gestorAssistantId,
  ofrecerPuestaEnMarcha,
  continuarTrasAccion,
} from "../../../src/modules/whatsapp/chatDueno.js";
import {
  decidirPropuesta,
  registrarPropuesta,
} from "../../../src/modules/gestor/acciones.js";
import { telnyxAiAdapter } from "../../../src/adapters/telnyx/TelnyxAiAdapter.js";
import * as mensajes from "../../../src/modules/whatsapp/mensajes.js";
import { enrutarEntrante } from "../../../src/modules/whatsapp/router.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    lead: { findFirst: vi.fn(), update: vi.fn() },
    booking: { findFirst: vi.fn() },
    sentMessage: {
      count: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    inboundMessage: { count: vi.fn() },
    ownerPendingAction: { findUnique: vi.fn() },
    ownerChatFeedback: { create: vi.fn() },
  },
}));
vi.mock("../../../src/lib/messageIdempotency.js", () => ({
  reclamarEnvio: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/service.js", () => ({
  enviarTexto: vi.fn(),
  enviarBotones: vi.fn(),
  resolverRemitente: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/bajas.js", () => ({
  registrarBaja: vi.fn(),
  revocarBaja: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/avisosNegocio.js", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../../src/modules/whatsapp/avisosNegocio.js")
    >();
  // limitesDelDia es pura (fechas) y la usa «Recuérdamelo mañana».
  return { ...actual, textoAgendaDelDia: vi.fn() };
});
vi.mock("../../../src/lib/cloudTasks.js", () => ({
  enqueueRetryBookingJob: vi.fn(),
  enqueueWhatsappJob: vi.fn(),
  enqueueRecordarRecadoJob: vi.fn(),
}));
// Los botones del cliente (PR 4) tienen sus propios tests en
// botonesCliente.test.ts; aquí solo se comprueba la delegación.
vi.mock("../../../src/modules/whatsapp/botonesCliente.js", () => ({
  botonEnClientes: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/listaDeEspera.js", () => ({
  avisarAQuienEsperaba: vi.fn(),
}));
// La recepcionista por chat (fase 2) tiene sus tests en chatCliente.test.ts;
// aquí solo se comprueba que el texto del cliente pasa por ella y que, si
// no atiende, sigue la respuesta fija.
vi.mock("../../../src/modules/whatsapp/chatCliente.js", () => ({
  conversarConRecepcionista: vi.fn(),
}));
// El Gestor (fase 2, PR 2) tiene sus tests en chatDueno.test.ts y
// gestor/acciones.test.ts; aquí solo se comprueba el enrutado.
vi.mock("../../../src/modules/whatsapp/chatDueno.js", () => ({
  conversarConGestor: vi.fn(),
  cerrarConversacionDelDueno: vi.fn(),
  anotarEnConversacionDelDueno: vi.fn(),
  chatDelDuenoActivo: vi.fn(() => false),
  gestorAssistantId: vi.fn(() => null),  ofrecerPuestaEnMarcha: vi.fn(async () => false),
  continuarTrasAccion: vi.fn(async () => undefined),
  botonesDeAccion: vi.fn(
    (accionId: string, titulos = { confirmar: "Confirmar", cancelar: "Cancelar" }) => [
      { id: `accion:${accionId}:confirmar`, title: titulos.confirmar },
      { id: `accion:${accionId}:cancelar`, title: titulos.cancelar },
    ]
  ),
}));
vi.mock("../../../src/modules/gestor/acciones.js", () => ({
  decidirPropuesta: vi.fn(),
  registrarPropuesta: vi.fn(),
}));
vi.mock("../../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: { listConversationMessages: vi.fn() },
}));
// `nombreParaCliente` y `telefonoDeContacto` son puras: se usan las reales.
vi.mock(
  "../../../src/modules/whatsapp/mensajesCliente.js",
  async (importActual) => {
    const actual =
      await importActual<
        typeof import("../../../src/modules/whatsapp/mensajesCliente.js")
      >();
    return {
      nombreParaCliente: actual.nombreParaCliente,
      telefonoDeContacto: actual.telefonoDeContacto,
    };
  }
);
vi.mock("../../../src/modules/whatsapp/altaDueno.js", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../../src/modules/whatsapp/altaDueno.js")
    >();
  return {
    ...actual,
    activarAvisosDelDueno: vi.fn(),
    darDeBajaDueno: vi.fn(),
    reactivarDueno: vi.fn(),
  };
});

const mockedTextoAgenda = vi.mocked(textoAgendaDelDia);
const mockedChat = vi.mocked(conversarConRecepcionista);
const mockedGestor = vi.mocked(conversarConGestor);
const mockedCerrarConversacion = vi.mocked(cerrarConversacionDelDueno);
const mockedAnotar = vi.mocked(anotarEnConversacionDelDueno);
const mockedDecidir = vi.mocked(decidirPropuesta);
const mockedListarMensajes = vi.mocked(telnyxAiAdapter.listConversationMessages);
const mockedEnqueueRetry = vi.mocked(enqueueRetryBookingJob);
const mockedEnqueueRecado = vi.mocked(enqueueRecordarRecadoJob);
const mockedBizFindFirst = vi.mocked(prisma.business.findFirst);
const mockedLeadFindFirst = vi.mocked(prisma.lead.findFirst);
const mockedLeadUpdate = vi.mocked(prisma.lead.update);
const mockedBookingFindFirst = vi.mocked(prisma.booking.findFirst);
const mockedBotonEnClientes = vi.mocked(botonEnClientes);
const mockedAvisarAQuienEsperaba = vi.mocked(avisarAQuienEsperaba);
const mockedBizFindMany = vi.mocked(prisma.business.findMany);
const mockedBizFindUnique = vi.mocked(prisma.business.findUnique);
const mockedBizCount = vi.mocked(prisma.business.count);
const mockedBizUpdateMany = vi.mocked(prisma.business.updateMany);
const mockedSentCount = vi.mocked(prisma.sentMessage.count);
const mockedSentFindUnique = vi.mocked(prisma.sentMessage.findUnique);
const mockedSentFindMany = vi.mocked(prisma.sentMessage.findMany);
const mockedSentUpdateMany = vi.mocked(prisma.sentMessage.updateMany);
const mockedInboundCount = vi.mocked(prisma.inboundMessage.count);
const mockedReclamar = vi.mocked(reclamarEnvio);
const mockedEnviarTexto = vi.mocked(enviarTexto);
const mockedResolverRemitente = vi.mocked(resolverRemitente);
const mockedRegistrarBaja = vi.mocked(registrarBaja);
const mockedRevocarBaja = vi.mocked(revocarBaja);
const mockedActivar = vi.mocked(activarAvisosDelDueno);
const mockedDarDeBaja = vi.mocked(darDeBajaDueno);
const mockedReactivar = vi.mocked(reactivarDueno);

const MOVIL = "+34692138456";
const NEGOCIOS = "+34930453218";
const CLIENTES = "+34930454394";
const AHORA = new Date("2026-09-20T12:00:00Z");
const EN_UNA_SEMANA = new Date("2026-09-27T12:00:00Z");
const PANEL = "https://alhabla.ai/ajustes/telefono#whatsapp";

let contador = 0;

function entrante(overrides: Partial<InboundMessage> = {}): InboundMessage {
  contador += 1;
  return {
    id: `in_${contador}`,
    providerMessageId: `pm_${contador}`,
    foreignId: null,
    eventId: "evt",
    fromNumber: MOVIL,
    toNumber: NEGOCIOS,
    audience: "owner",
    role: "unknown",
    businessId: null,
    kind: "text",
    text: "hola",
    buttonId: null,
    buttonTitle: null,
    contextMessageId: null,
    contactName: null,
    payload: { type: "text" },
    receivedAt: AHORA,
    handledAt: null,
    handler: null,
    error: null,
    createdAt: AHORA,
    ...overrides,
  };
}

function texto(
  body: string,
  overrides: Partial<InboundMessage> = {}
): InboundMessage {
  return entrante({ kind: "text", text: body, ...overrides });
}

function keyword(
  body: string,
  overrides: Partial<InboundMessage> = {}
): InboundMessage {
  return entrante({ kind: "keyword", text: body, ...overrides });
}

function negocio(overrides: Record<string, unknown> = {}) {
  return {
    id: "biz_1",
    name: "Peluquería Ana",
    active: true,
    phone: "+34930000000",
    ownerWhatsappNumber: MOVIL,
    ownerWhatsappOptInAt: null,
    ownerWhatsappOptOutAt: null,
    ownerWhatsappUnreachableAt: null,
    ownerAltaCode: null,
    ownerAltaCodeExpiresAt: null,
    ...overrides,
  };
}

const ACTIVO = negocio({ ownerWhatsappOptInAt: AHORA });
const PENDIENTE = negocio({ id: "biz_2", name: "Barbería Ana" });
const DE_BAJA = negocio({
  ownerWhatsappOptInAt: AHORA,
  ownerWhatsappOptOutAt: AHORA,
});

/** Lo que se envió: audiencia, tipo y cuerpo, para afirmaciones compactas. */
function enviado(indice = 0) {
  const call = mockedEnviarTexto.mock.calls[indice]?.[0];
  return call
    ? {
        audience: call.audience,
        to: call.to,
        body: call.body,
        callbackData: call.callbackData,
        permitirBaja: call.permitirBaja,
      }
    : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FRONTEND_URL;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  mockedBizFindMany.mockResolvedValue([]);
  mockedBizFindUnique.mockResolvedValue(null);
  mockedBizCount.mockResolvedValue(0);
  mockedBizUpdateMany.mockResolvedValue({ count: 0 });
  // Por defecto el Gestor (fase 2) no atiende: el texto del dueño recibe la
  // respuesta fija; chatDelDuenoActivo/gestorAssistantId quedan en false/null
  // (vi.fn con implementación en el mock) salvo que un test los cambie.
  mockedGestor.mockResolvedValue({ atendido: false, motivo: "apagado" });
  mockedChat.mockResolvedValue({ atendido: false, motivo: "apagado" });
  vi.mocked(chatDelDuenoActivo).mockReturnValue(false);
  vi.mocked(gestorAssistantId).mockReturnValue(null);
  vi.mocked(ofrecerPuestaEnMarcha).mockResolvedValue(false);
  mockedSentCount.mockResolvedValue(0);
  mockedSentFindUnique.mockResolvedValue(null);
  mockedSentFindMany.mockResolvedValue([]);
  mockedSentUpdateMany.mockResolvedValue({ count: 1 });
  mockedInboundCount.mockResolvedValue(0);
  mockedReclamar.mockResolvedValue(true);
  mockedEnviarTexto.mockResolvedValue({
    messageId: "msg-resp",
    status: "queued",
    from: NEGOCIOS,
  });
  mockedResolverRemitente.mockResolvedValue({
    phoneNumber: NEGOCIOS,
    source: "db",
  });
  mockedRegistrarBaja.mockResolvedValue(undefined);
  mockedRevocarBaja.mockResolvedValue(0);
  mockedActivar.mockResolvedValue({ count: 1, numeroAnterior: MOVIL });
  mockedDarDeBaja.mockResolvedValue({ count: 1 });
  mockedReactivar.mockResolvedValue({ count: 1 });
});

describe("paso 0", () => {
  it("un entrante real del dueño abre la ventana de 24 h y limpia el 131026", async () => {
    mockedBizUpdateMany.mockResolvedValueOnce({ count: 1 });
    await enrutarEntrante(
      texto("hola", { role: "owner", businessId: "biz_1" })
    );

    const nuevaVentana = new Date(AHORA.getTime() + 24 * 60 * 60 * 1000);
    expect(mockedBizUpdateMany).toHaveBeenNthCalledWith(1, {
      where: {
        ownerWhatsappNumber: MOVIL,
        active: true,
        ownerWhatsappUnreachableAt: { not: null },
      },
      data: { ownerWhatsappUnreachableAt: null },
    });
    // La ventana solo avanza: el where excluye una ventana vigente más
    // lejana (una fila antigua enrutada por el barrido no la retrocede).
    expect(mockedBizUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        ownerWhatsappNumber: MOVIL,
        active: true,
        OR: [
          { ownerWindowOpenUntil: null },
          { ownerWindowOpenUntil: { lt: nuevaVentana } },
        ],
      },
      data: { ownerWindowOpenUntil: nuevaVentana },
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("vuelve a ser alcanzable")
    );
  });

  it("un entrante anterior al fin de la ventana vigente no la reduce (barrido de una fila vieja)", async () => {
    // Simula la BD: la ventana vigente llega más lejos que la de esta fila.
    const ventanaVigente = new Date(AHORA.getTime() + 30 * 60 * 60 * 1000);
    const haceDiezMin = new Date(AHORA.getTime() - 10 * 60 * 1000);
    mockedBizUpdateMany.mockImplementation(async ({ where, data }) => {
      const condicion = (where as { OR?: Array<Record<string, unknown>> }).OR;
      if (!condicion) return { count: 0 };
      const nueva = (data as { ownerWindowOpenUntil: Date })
        .ownerWindowOpenUntil;
      return { count: ventanaVigente < nueva ? 1 : 0 };
    });

    await enrutarEntrante(
      texto("hola", { role: "owner", receivedAt: haceDiezMin })
    );

    const indice = mockedBizUpdateMany.mock.calls.findIndex(
      ([args]) => "ownerWindowOpenUntil" in (args.data as object)
    );
    expect(indice).toBeGreaterThanOrEqual(0);
    expect(mockedBizUpdateMany.mock.calls[indice][0].data).toEqual({
      ownerWindowOpenUntil: new Date(
        haceDiezMin.getTime() + 24 * 60 * 60 * 1000
      ),
    });
    await expect(
      mockedBizUpdateMany.mock.results[indice].value
    ).resolves.toEqual({ count: 0 });
  });

  it("sin audiencia se ignora sin responder", async () => {
    expect(await enrutarEntrante(texto("hola", { audience: null }))).toEqual({
      handler: "ignorado:sin-audiencia",
    });
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
  });

  it("reacciones y mensajes de sistema del dueño no responden ni tocan la ventana", async () => {
    expect(
      await enrutarEntrante(
        entrante({
          kind: "other",
          text: null,
          payload: { type: "reaction" },
          role: "owner",
        })
      )
    ).toEqual({ handler: "ignorado:reaction" });
    expect(
      await enrutarEntrante(
        entrante({
          kind: "other",
          text: null,
          payload: { type: "system" },
          role: "owner",
        })
      )
    ).toEqual({ handler: "ignorado:system" });
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
    expect(mockedBizUpdateMany).not.toHaveBeenCalled();
  });

  it("request_welcome recibe la presentación de desconocido una vez", async () => {
    const mensaje = entrante({
      kind: "other",
      text: null,
      payload: { type: "request_welcome" },
    });
    expect(await enrutarEntrante(mensaje)).toEqual({
      handler: "bienvenida-chat:owner",
    });
    expect(enviado()?.body).toBe(mensajes.desconocidoEnNegocios());

    mockedSentCount.mockImplementation(async ({ where }) =>
      (where as { callbackData?: string }).callbackData ? 1 : 0
    );
    expect(await enrutarEntrante(mensaje)).toEqual({
      handler: "bienvenida-chat:owner:silenciado",
    });
    expect(mockedEnviarTexto).toHaveBeenCalledTimes(1);
  });
});

describe("STOP / BAJA en el número de negocios", () => {
  it("dueño con dos negocios (uno consentido): baja de ambos, fila global y confirmación que solo nombra el consentido", async () => {
    mockedBizFindMany.mockResolvedValue([PENDIENTE, ACTIVO] as never);

    const mensaje = keyword("STOP", { role: "owner", businessId: "biz_1" });
    expect(await enrutarEntrante(mensaje)).toEqual({ handler: "stop:dueno" });

    expect(mockedDarDeBaja).toHaveBeenCalledWith({
      from: MOVIL,
      keyword: "STOP",
      inboundMessageId: mensaje.id,
      businessId: "biz_1",
    });
    // La conversación con el Gestor se cierra con la baja (fase 2).
    expect(mockedCerrarConversacion).toHaveBeenCalledWith(MOVIL);
    expect(enviado()).toEqual(
      expect.objectContaining({
        body: mensajes.bajaDueno({ negocios: ["Peluquería Ana"] }),
        permitirBaja: true,
        callbackData: "aviso:stop-dueno",
      })
    );
    expect(enviado()?.body).not.toContain("Barbería");
  });

  it("dueño cuyo negocio nunca consintió: baja igual, pero no se nombra el negocio", async () => {
    mockedBizFindMany.mockResolvedValue([PENDIENTE] as never);
    expect(await enrutarEntrante(keyword("BAJA", { role: "owner" }))).toEqual({
      handler: "stop:dueno",
    });
    expect(mockedDarDeBaja).toHaveBeenCalled();
    expect(enviado()?.body).toBe(mensajes.bajaDesconocido());
  });

  it("«Baja el precio» del dueño es texto libre, no una baja", async () => {
    expect(
      await enrutarEntrante(texto("Baja el precio", { role: "owner" }))
    ).toEqual({
      handler: "texto:dueno",
    });
    expect(mockedDarDeBaja).not.toHaveBeenCalled();
    expect(mockedRegistrarBaja).not.toHaveBeenCalled();
    expect(enviado()?.body).toBe(mensajes.todaviaNoChateo({ panelUrl: PANEL }));
  });

  it("STOP de un desconocido deja la fila y confirma una vez al día", async () => {
    const mensaje = keyword("stop ya");
    expect(await enrutarEntrante(mensaje)).toEqual({
      handler: "stop:desconocido",
    });
    expect(mockedRegistrarBaja).toHaveBeenCalledWith({
      phoneNumber: MOVIL,
      audience: "owner",
      keyword: "STOP",
      inboundMessageId: mensaje.id,
      businessId: null,
    });
    expect(enviado()).toEqual(
      expect.objectContaining({
        body: mensajes.bajaDesconocido(),
        permitirBaja: true,
      })
    );

    mockedSentCount.mockImplementation(async ({ where }) =>
      (where as { callbackData?: string }).callbackData ? 1 : 0
    );
    expect(await enrutarEntrante(keyword("STOP"))).toEqual({
      handler: "stop:desconocido:silenciado",
    });
    expect(mockedRegistrarBaja).toHaveBeenCalledTimes(2);
    expect(mockedEnviarTexto).toHaveBeenCalledTimes(1);
  });
});

describe("ALTA <código> en el número de negocios", () => {
  const CON_CODIGO = negocio({
    ownerWhatsappNumber: "+34600000001",
    ownerAltaCode: "7KP3MQ",
    ownerAltaCodeExpiresAt: EN_UNA_SEMANA,
  });

  it("código válido desde otro móvil: vincula, consume y avisa de que apuntó el móvil", async () => {
    mockedBizFindUnique.mockResolvedValue(CON_CODIGO as never);
    mockedActivar.mockResolvedValue({
      count: 1,
      numeroAnterior: "+34600000001",
    });

    const mensaje = keyword("alta: 7kp3mq");
    expect(await enrutarEntrante(mensaje)).toEqual({
      handler: "alta:vinculado",
    });

    expect(mockedBizFindUnique).toHaveBeenCalledWith({
      where: { ownerAltaCode: "7KP3MQ" },
    });
    expect(mockedActivar).toHaveBeenCalledWith({
      businessId: "biz_1",
      from: MOVIL,
      via: "alta_codigo",
      inboundMessageId: mensaje.id,
      codigo: "7KP3MQ",
    });
    expect(enviado()?.body).toBe(
      mensajes.bienvenidaTrasAlta({
        negocios: ["Peluquería Ana"],
        movilApuntado: true,
      })
    );
    expect(mockedReclamar).toHaveBeenCalledWith(
      "whatsapp",
      `entrante:${mensaje.id}:bienvenida`,
      {
        businessId: "biz_1",
        audience: "owner",
        toNumber: MOVIL,
        callbackData: "aviso:bienvenida",
        kind: "text",
      }
    );
  });

  it("desde el móvil tecleado no dice que lo apuntó", async () => {
    mockedBizFindUnique.mockResolvedValue({
      ...CON_CODIGO,
      ownerWhatsappNumber: MOVIL,
    } as never);
    mockedActivar.mockResolvedValue({ count: 1, numeroAnterior: MOVIL });

    await enrutarEntrante(keyword("ALTA7KP3MQ"));
    expect(enviado()?.body).toBe(
      mensajes.bienvenidaTrasAlta({
        negocios: ["Peluquería Ana"],
        movilApuntado: false,
      })
    );
  });

  it("caducado, inexistente e inactivo", async () => {
    mockedBizFindUnique.mockResolvedValue({
      ...CON_CODIGO,
      ownerAltaCodeExpiresAt: new Date(0),
    } as never);
    expect(await enrutarEntrante(keyword("ALTA 7KP3MQ"))).toEqual({
      handler: "alta:codigo-caducado",
    });
    expect(enviado(0)?.body).toBe(mensajes.codigoCaducado());

    mockedBizFindUnique.mockResolvedValue(null);
    expect(await enrutarEntrante(keyword("ALTA 7KP3MQ"))).toEqual({
      handler: "alta:codigo-invalido",
    });
    expect(enviado(1)?.body).toBe(mensajes.codigoNoReconocido());

    mockedBizFindUnique.mockResolvedValue({
      ...CON_CODIGO,
      active: false,
    } as never);
    expect(await enrutarEntrante(keyword("ALTA 7KP3MQ"))).toEqual({
      handler: "alta:codigo-invalido",
    });
    expect(mockedActivar).not.toHaveBeenCalled();
  });

  it("código gastado desde un móvil que ya es dueño activo ⇒ ya activo, con handler propio", async () => {
    mockedBizFindUnique.mockResolvedValue(null);
    mockedBizFindMany.mockResolvedValue([ACTIVO] as never);

    expect(
      await enrutarEntrante(
        keyword("ALTA 7KP3MQ", { role: "owner", businessId: "biz_1" })
      )
    ).toEqual({
      handler: "alta:ya-activo:codigo",
    });
    expect(enviado()?.body).toBe(
      mensajes.yaActivo({ negocios: ["Peluquería Ana"] })
    );
  });

  it("count 0 en la activación (otro proceso lo consumió) con remitente activo ⇒ ya activo", async () => {
    mockedBizFindUnique.mockResolvedValue(CON_CODIGO as never);
    mockedActivar.mockResolvedValue({ count: 0, numeroAnterior: MOVIL });
    mockedBizFindMany.mockResolvedValue([ACTIVO] as never);

    expect(await enrutarEntrante(keyword("ALTA 7KP3MQ"))).toEqual({
      handler: "alta:ya-activo:codigo",
    });
  });

  it("un dueño activo que prueba códigos inventados también se bloquea al sexto", async () => {
    mockedBizFindUnique.mockResolvedValue(null);
    mockedBizFindMany.mockResolvedValue([ACTIVO] as never);
    // Simula la BD: cuenta los handlers guardados que casen con el OR.
    const handlers: string[] = [];
    mockedInboundCount.mockImplementation(async ({ where }) => {
      const patrones = (
        where as { OR: Array<{ handler: { startsWith: string } }> }
      ).OR.map((o) => o.handler.startsWith);
      return handlers.filter((h) => patrones.some((p) => h.startsWith(p)))
        .length;
    });

    for (let i = 0; i < 5; i++) {
      const { handler } = await enrutarEntrante(
        keyword("ALTA 7KP3MQ", { role: "owner", businessId: "biz_1" })
      );
      expect(handler).toBe("alta:ya-activo:codigo");
      handlers.push(handler);
    }
    expect(mockedBizFindUnique).toHaveBeenCalledTimes(5);

    expect(
      await enrutarEntrante(
        keyword("ALTA ZZZZZZ", { role: "owner", businessId: "biz_1" })
      )
    ).toEqual({ handler: "alta:bloqueado" });
    expect(mockedBizFindUnique).toHaveBeenCalledTimes(5);
    expect(enviado(5)?.body).toBe(mensajes.demasiadosIntentos());
  });

  it("cinco fallos en una hora bloquean sin consultar el código; después silencio", async () => {
    mockedInboundCount.mockResolvedValue(5);

    expect(await enrutarEntrante(keyword("ALTA 7KP3MQ"))).toEqual({
      handler: "alta:bloqueado",
    });
    expect(mockedBizFindUnique).not.toHaveBeenCalled();
    expect(enviado()?.body).toBe(mensajes.demasiadosIntentos());
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("códigos de alta fallidos")
    );

    mockedSentCount.mockImplementation(async ({ where }) =>
      (where as { callbackData?: string }).callbackData ? 1 : 0
    );
    expect(await enrutarEntrante(keyword("ALTA 7KP3MQ"))).toEqual({
      handler: "alta:bloqueado:silenciado",
    });
    expect(mockedEnviarTexto).toHaveBeenCalledTimes(1);
  });
});

describe("ALTA a secas en el número de negocios", () => {
  it("dueño con un negocio consentido y de baja ⇒ reactiva", async () => {
    mockedBizFindMany.mockResolvedValue([DE_BAJA] as never);
    const mensaje = keyword("ALTA", { role: "owner", businessId: "biz_1" });

    expect(await enrutarEntrante(mensaje)).toEqual({
      handler: "alta:reactivado",
    });
    expect(mockedReactivar).toHaveBeenCalledWith({
      from: MOVIL,
      inboundMessageId: mensaje.id,
    });
    expect(enviado()?.body).toBe(
      mensajes.avisosReactivados({ negocios: ["Peluquería Ana"] })
    );
  });

  it("dos negocios con el mismo móvil, uno consentido y otro nunca: solo se nombra el consentido", async () => {
    mockedBizFindMany.mockResolvedValue([
      DE_BAJA,
      { ...PENDIENTE, ownerWhatsappOptOutAt: AHORA },
    ] as never);

    expect(await enrutarEntrante(keyword("ALTA", { role: "owner" }))).toEqual({
      handler: "alta:reactivado",
    });
    expect(enviado()?.body).toBe(
      mensajes.avisosReactivados({ negocios: ["Peluquería Ana"] })
    );
    expect(enviado()?.body).not.toContain("Barbería");
  });

  it("dueño solo con negocio pendiente: NO es consentimiento", async () => {
    mockedBizFindMany.mockResolvedValue([PENDIENTE] as never);

    expect(
      await enrutarEntrante(
        keyword("ALTA", { role: "owner", businessId: "biz_2" })
      )
    ).toEqual({
      handler: "alta:sin-codigo",
    });
    expect(mockedReactivar).not.toHaveBeenCalled();
    expect(mockedActivar).not.toHaveBeenCalled();
    expect(enviado()?.body).toBe(mensajes.comoDarseDeAlta());
  });

  it("dueño activo ⇒ ya activo (y revoca una fila de baja si quedara)", async () => {
    mockedBizFindMany.mockResolvedValue([ACTIVO] as never);
    const mensaje = keyword("ALTA", { role: "owner" });

    expect(await enrutarEntrante(mensaje)).toEqual({
      handler: "alta:ya-activo",
    });
    expect(mockedRevocarBaja).toHaveBeenCalledWith({
      phoneNumber: MOVIL,
      audience: "owner",
      inboundMessageId: mensaje.id,
    });
  });

  it("desconocido ⇒ cómo darse de alta, una vez al día", async () => {
    expect(await enrutarEntrante(keyword("ALTA"))).toEqual({
      handler: "alta:sin-codigo",
    });
    expect(enviado()?.body).toBe(mensajes.comoDarseDeAlta());
    mockedSentCount.mockImplementation(async ({ where }) =>
      (where as { callbackData?: string }).callbackData ? 1 : 0
    );
    expect(await enrutarEntrante(keyword("ALTA"))).toEqual({
      handler: "alta:sin-codigo:silenciado",
    });
  });
});

describe("AYUDA y comandos pendientes", () => {
  it("AYUDA del dueño sin límite diario y solo con los negocios que consintieron; de un desconocido una vez", async () => {
    mockedBizFindMany.mockResolvedValue([PENDIENTE, ACTIVO] as never);
    mockedSentCount.mockImplementation(async ({ where }) =>
      (where as { callbackData?: string }).callbackData ? 1 : 0
    );

    expect(
      await enrutarEntrante(keyword("Ayuda con la agenda", { role: "owner" }))
    ).toEqual({
      handler: "ayuda:dueno",
    });
    expect(enviado()?.body).toBe(
      mensajes.ayudaDueno({ negocios: ["Peluquería Ana"], panelUrl: PANEL })
    );
    expect(enviado()?.body).not.toContain("Barbería");

    expect(await enrutarEntrante(keyword("AYUDA"))).toEqual({
      handler: "ayuda:desconocido:silenciado",
    });
    expect(mockedEnviarTexto).toHaveBeenCalledTimes(1);
  });

  it("AYUDA desde un móvil que nunca consintió no nombra el negocio que lo tecleó (puede ser otro tenant)", async () => {
    mockedBizFindMany.mockResolvedValue([
      negocio({ id: "biz_x", name: "Barbería del Atacante" }),
    ] as never);

    expect(
      await enrutarEntrante(
        keyword("AYUDA", { role: "owner", businessId: "biz_x" })
      )
    ).toEqual({ handler: "ayuda:sin-consentimiento" });
    expect(enviado()?.body).toBe(mensajes.comoDarseDeAlta());
    expect(enviado()?.body).not.toContain("Atacante");
    expect(enviado()?.callbackData).toBe("aviso:sin-codigo");

    // Una vez al día.
    mockedSentCount.mockImplementation(async ({ where }) =>
      (where as { callbackData?: string }).callbackData ? 1 : 0
    );
    expect(
      await enrutarEntrante(
        keyword("AYUDA", { role: "owner", businessId: "biz_x" })
      )
    ).toEqual({ handler: "ayuda:sin-consentimiento:silenciado" });
    expect(mockedEnviarTexto).toHaveBeenCalledTimes(1);
  });

  it("PAUSA del dueño queda pendiente (fase 2) con la respuesta fija, y la segunda se silencia", async () => {
    expect(await enrutarEntrante(keyword("pausa", { role: "owner" }))).toEqual({
      handler: "pendiente:palabra-clave:PAUSA",
    });
    expect(enviado()?.body).toBe(mensajes.todaviaNoChateo({ panelUrl: PANEL }));

    mockedSentCount.mockImplementation(async ({ where }) =>
      (where as { callbackData?: string }).callbackData ? 1 : 0
    );
    expect(await enrutarEntrante(keyword("PAUSA", { role: "owner" }))).toEqual({
      handler: "pendiente:palabra-clave:PAUSA:silenciado",
    });
  });

  it("AGENDA / HOY / MAÑANA responden con la agenda del día de los negocios que consintieron", async () => {
    mockedBizFindMany.mockResolvedValue([ACTIVO, PENDIENTE] as never);
    mockedTextoAgenda.mockImplementation(
      async (business, dia) =>
        `${business.name} · ${dia === 0 ? "hoy" : "mañana"}`
    );

    expect(await enrutarEntrante(keyword("agenda", { role: "owner" }))).toEqual(
      {
        handler: "agenda:hoy",
      }
    );
    // Solo el negocio con consentimiento; el pendiente no se lista.
    expect(mockedTextoAgenda).toHaveBeenCalledTimes(1);
    expect(mockedTextoAgenda).toHaveBeenCalledWith(ACTIVO, 0);
    expect(enviado()?.body).toBe("Peluquería Ana · hoy");
    expect(enviado()?.callbackData).toBe("aviso:agenda-0");

    expect(await enrutarEntrante(keyword("Mañana", { role: "owner" }))).toEqual(
      {
        handler: "agenda:manana",
      }
    );
    expect(mockedTextoAgenda).toHaveBeenLastCalledWith(ACTIVO, 1);
  });

  it("AGENDA desde un móvil sin negocio consentido recibe la respuesta fija", async () => {
    mockedBizFindMany.mockResolvedValue([PENDIENTE] as never);

    expect(await enrutarEntrante(keyword("hoy", { role: "owner" }))).toEqual({
      handler: "agenda:sin-negocio",
    });
    expect(mockedTextoAgenda).not.toHaveBeenCalled();
    expect(enviado()?.body).toBe(mensajes.todaviaNoChateo({ panelUrl: PANEL }));
  });
});

describe("botón «Activar avisos»", () => {
  const ACTIVACION = {
    id: "sm_1",
    providerMessageId: "msg-act",
    idempotencyKey: "alta:biz_1:1",
    businessId: "biz_1",
    audience: "owner",
    toNumber: MOVIL,
    callbackData: "alta:biz_1",
    templateName: "bienvenida_negocio",
  };
  const BOTON = entrante({
    kind: "button",
    text: null,
    buttonId: "Activar avisos",
    buttonTitle: "Activar avisos",
    contextMessageId: "msg-act",
    payload: { type: "button" },
    role: "owner",
    businessId: "biz_1",
  });

  it("con context.id válido activa por botón", async () => {
    mockedSentFindUnique.mockResolvedValue(ACTIVACION as never);
    mockedBizFindUnique.mockResolvedValue(negocio() as never);

    expect(await enrutarEntrante(BOTON)).toEqual({
      handler: "boton:activacion:ok",
    });
    expect(mockedActivar).toHaveBeenCalledWith({
      businessId: "biz_1",
      from: MOVIL,
      via: "boton_plantilla",
      inboundMessageId: BOTON.id,
    });
    expect(enviado()?.body).toBe(
      mensajes.bienvenidaTrasAlta({
        negocios: ["Peluquería Ana"],
        movilApuntado: false,
      })
    );
  });

  it("ya activo ⇒ no se reescribe el consentimiento", async () => {
    mockedSentFindUnique.mockResolvedValue(ACTIVACION as never);
    mockedBizFindUnique.mockResolvedValue(ACTIVO as never);

    expect(await enrutarEntrante(BOTON)).toEqual({
      handler: "boton:activacion:ya-activo",
    });
    expect(mockedActivar).not.toHaveBeenCalled();
  });

  it("envío a otro móvil ⇒ warn sin respuesta; negocio con otro móvil ⇒ «era para otro móvil»", async () => {
    mockedSentFindUnique.mockResolvedValue({
      ...ACTIVACION,
      toNumber: "+34600000009",
    } as never);
    expect(await enrutarEntrante(BOTON)).toEqual({
      handler: "boton:activacion:remitente-distinto",
    });
    expect(console.warn).toHaveBeenCalled();
    expect(mockedEnviarTexto).not.toHaveBeenCalled();

    mockedSentFindUnique.mockResolvedValue(ACTIVACION as never);
    mockedBizFindUnique.mockResolvedValue(
      negocio({ ownerWhatsappNumber: "+34600000009" }) as never
    );
    expect(await enrutarEntrante(BOTON)).toEqual({
      handler: "boton:activacion:numero-antiguo",
    });
    expect(enviado()?.body).toBe(mensajes.mensajeParaOtroMovil());
    expect(mockedActivar).not.toHaveBeenCalled();
  });

  it("sin context.id: solo con una activación reciente a ese móvil, y solo ese negocio", async () => {
    const sinContexto = { ...BOTON, contextMessageId: null, id: "in_boton" };
    mockedSentFindMany.mockResolvedValue([ACTIVACION] as never);
    mockedBizFindUnique.mockResolvedValue(negocio() as never);

    expect(await enrutarEntrante(sinContexto)).toEqual({
      handler: "boton:activacion:por-envio",
    });
    expect(mockedSentFindMany).toHaveBeenCalledWith({
      where: {
        audience: "owner",
        toNumber: MOVIL,
        callbackData: { startsWith: "alta:" },
        sentAt: { gt: expect.any(Date) },
        NOT: { deliveryStatus: { in: ["failed", "suppressed"] } },
      },
      orderBy: { sentAt: "desc" },
      take: 2,
    });
    expect(mockedActivar).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "biz_1", via: "boton_plantilla" })
    );
    expect(mockedBizFindMany).not.toHaveBeenCalled();
  });

  it("sin context.id ni activación reciente ⇒ pendiente, aunque el móvil sea dueño de varios negocios", async () => {
    mockedSentFindMany.mockResolvedValue([]);
    mockedBizFindMany.mockResolvedValue([PENDIENTE, negocio()] as never);

    expect(await enrutarEntrante({ ...BOTON, contextMessageId: null })).toEqual(
      {
        handler: "pendiente:boton:sin-contexto",
      }
    );
    expect(mockedActivar).not.toHaveBeenCalled();
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
  });

  it("sin context.id con activaciones de dos negocios distintos en 72 h ⇒ no se activa ninguno", async () => {
    mockedSentFindMany.mockResolvedValue([
      {
        ...ACTIVACION,
        id: "sm_b",
        businessId: "biz_2",
        callbackData: "alta:biz_2",
      },
      ACTIVACION,
    ] as never);

    expect(await enrutarEntrante({ ...BOTON, contextMessageId: null })).toEqual(
      { handler: "pendiente:boton:ambiguo" }
    );
    expect(mockedActivar).not.toHaveBeenCalled();
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
    expect(mockedBizFindUnique).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("biz_2, biz_1")
    );
  });

  it("con context.id pero sin fila en sent_messages no se adivina: pendiente con el id en el log", async () => {
    mockedSentFindUnique.mockResolvedValue(null);
    mockedSentFindMany.mockResolvedValue([ACTIVACION] as never);

    expect(await enrutarEntrante(BOTON)).toEqual({
      handler: "pendiente:boton:sin-fila",
    });
    expect(mockedSentFindMany).not.toHaveBeenCalled();
    expect(mockedActivar).not.toHaveBeenCalled();
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("msg-act")
    );
  });

  it("otros prefijos siguen pendientes (PR 3)", async () => {
    expect(
      await enrutarEntrante(
        entrante({
          kind: "button",
          text: null,
          buttonId: "booking:b1:confirmo",
          buttonTitle: "Confirmo",
          contextMessageId: "msg-x",
        })
      )
    ).toEqual({ handler: "pendiente:boton:booking" });
  });
});

describe("texto libre, audio y medios en el número de negocios", () => {
  it("el texto del dueño pasa por el Gestor y, si atiende, ahí acaba", async () => {
    mockedGestor.mockResolvedValueOnce({
      atendido: true,
      resultado: { handler: "chat:dueno" },
    });
    expect(
      await enrutarEntrante(
        texto("¿qué tengo mañana?", { role: "owner", businessId: "biz_1" })
      )
    ).toEqual({ handler: "chat:dueno" });
    expect(mockedGestor).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "biz_1", texto: "¿qué tengo mañana?" })
    );
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
  });

  it("dueño: respuesta fija una vez al día; audio del dueño pendiente", async () => {
    mockedGestor.mockResolvedValue({ atendido: false, motivo: "apagado" });
    expect(await enrutarEntrante(texto("hola", { role: "owner" }))).toEqual({
      handler: "texto:dueno",
    });
    expect(enviado()?.body).toBe(mensajes.todaviaNoChateo({ panelUrl: PANEL }));

    mockedSentCount.mockImplementation(async ({ where }) =>
      (where as { callbackData?: string }).callbackData ? 1 : 0
    );
    expect(
      await enrutarEntrante(
        entrante({ kind: "audio", text: null, role: "owner" })
      )
    ).toEqual({
      handler: "pendiente:audio:silenciado",
    });
  });

  it("desconocido: presentación una vez; audio de desconocido se ignora", async () => {
    expect(await enrutarEntrante(texto("hola"))).toEqual({
      handler: "texto:desconocido",
    });
    expect(enviado()?.body).toBe(mensajes.desconocidoEnNegocios());
    expect(
      await enrutarEntrante(entrante({ kind: "audio", text: null }))
    ).toEqual({ handler: "ignorado:audio" });
    expect(mockedEnviarTexto).toHaveBeenCalledTimes(1);
  });
});

describe("número de clientes", () => {
  const enClientes = (overrides: Partial<InboundMessage>) =>
    entrante({ audience: "client", toNumber: CLIENTES, ...overrides });

  it("STOP de cualquier rol es baja global y se confirma", async () => {
    for (const role of ["owner", "client", "unknown"] as const) {
      const mensaje = enClientes({
        kind: "keyword",
        text: "Stop.",
        role,
        businessId: role === "unknown" ? null : "biz_1",
      });
      expect(await enrutarEntrante(mensaje)).toEqual({
        handler: "stop:cliente",
      });
      expect(mockedRegistrarBaja).toHaveBeenLastCalledWith({
        phoneNumber: MOVIL,
        audience: "client",
        keyword: "STOP",
        inboundMessageId: mensaje.id,
        businessId: role === "unknown" ? null : "biz_1",
      });
    }
    expect(enviado()).toEqual(
      expect.objectContaining({
        audience: "client",
        body: mensajes.bajaCliente(),
        permitirBaja: true,
      })
    );
    expect(mockedDarDeBaja).not.toHaveBeenCalled();
  });

  it("ALTA con baja vigente reactiva; sin baja es texto libre", async () => {
    mockedRevocarBaja.mockResolvedValueOnce(1);
    expect(
      await enrutarEntrante(enClientes({ kind: "keyword", text: "ALTA" }))
    ).toEqual({
      handler: "alta:cliente-reactivado",
    });
    expect(enviado(0)?.body).toBe(mensajes.clienteReactivado());

    mockedRevocarBaja.mockResolvedValueOnce(0);
    expect(
      await enrutarEntrante(enClientes({ kind: "keyword", text: "ALTA" }))
    ).toEqual({
      handler: "texto:desconocido",
    });
    expect(enviado(1)?.body).toBe(mensajes.desconocidoEnClientes());
  });

  it("ALTA <código> no valida nada: devuelve el enlace al número de negocios", async () => {
    expect(
      await enrutarEntrante(
        enClientes({ kind: "keyword", text: "ALTA 7KP3MQ" })
      )
    ).toEqual({
      handler: "alta:numero-equivocado",
    });
    expect(mockedBizFindUnique).not.toHaveBeenCalled();
    expect(mockedActivar).not.toHaveBeenCalled();
    expect(enviado()?.body).toBe(
      mensajes.numeroEquivocado({
        enlace: "https://wa.me/34930453218?text=ALTA%207KP3MQ",
      })
    );
  });

  it("dueño conocido (con opt-in) que escribe aquí; dueño tecleado sin opt-in es un desconocido", async () => {
    mockedBizCount.mockResolvedValueOnce(1);
    expect(
      await enrutarEntrante(enClientes({ kind: "text", text: "hola" }))
    ).toEqual({
      handler: "texto:dueno-en-clientes",
    });
    expect(enviado(0)?.body).toBe(
      mensajes.duenoEnClientes({ enlace: "https://wa.me/34930453218" })
    );

    mockedBizCount.mockResolvedValueOnce(0);
    expect(
      await enrutarEntrante(enClientes({ kind: "text", text: "hola" }))
    ).toEqual({
      handler: "texto:desconocido",
    });
    expect(enviado(1)?.body).toBe(mensajes.desconocidoEnClientes());
  });

  it("el texto de un cliente conocido pasa por la recepcionista por chat y, si atiende, ahí acaba", async () => {
    mockedChat.mockResolvedValueOnce({
      atendido: true,
      resultado: { handler: "chat:cliente" },
    });
    expect(
      await enrutarEntrante(
        enClientes({
          kind: "text",
          text: "¿tenéis hueco mañana?",
          role: "client",
          businessId: "biz_1",
        })
      )
    ).toEqual({ handler: "chat:cliente" });
    expect(mockedChat).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        texto: "¿tenéis hueco mañana?",
      })
    );
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
  });

  it("cliente conocido con y sin teléfono del negocio, una vez al día", async () => {
    mockedChat.mockResolvedValue({ atendido: false, motivo: "apagado" });
    mockedBizFindUnique.mockResolvedValueOnce({
      name: "Peluquería Ana",
      phone: "+34930000000",
    } as never);
    expect(
      await enrutarEntrante(
        enClientes({
          kind: "text",
          text: "hola",
          role: "client",
          businessId: "biz_1",
        })
      )
    ).toEqual({
      handler: "pendiente:texto:client",
    });
    expect(enviado(0)?.body).toBe(
      mensajes.clienteConocido({
        negocio: "Peluquería Ana",
        telefono: "+34930000000",
      })
    );

    mockedBizFindUnique.mockResolvedValueOnce({
      name: "Peluquería Ana",
      phone: "TEMP-123",
    } as never);
    await enrutarEntrante(
      enClientes({
        kind: "text",
        text: "hola",
        role: "client",
        businessId: "biz_1",
      })
    );
    expect(enviado(1)?.body).toBe(
      mensajes.clienteConocido({ negocio: "Peluquería Ana", telefono: null })
    );

    mockedSentCount.mockImplementation(async ({ where }) =>
      (where as { callbackData?: string }).callbackData ? 1 : 0
    );
    expect(
      await enrutarEntrante(
        enClientes({
          kind: "text",
          text: "hola",
          role: "client",
          businessId: "biz_1",
        })
      )
    ).toEqual({
      handler: "pendiente:texto:client:silenciado",
    });
  });

  it("un botón en el número de clientes se delega a botonEnClientes; los medios se ignoran", async () => {
    mockedBotonEnClientes.mockResolvedValue({ handler: "cliente:confirmo" });
    const boton = enClientes({
      kind: "button",
      text: null,
      buttonId: "Confirmo",
      buttonTitle: "Confirmo",
      contextMessageId: "msg-rec",
    });

    expect(await enrutarEntrante(boton)).toEqual({
      handler: "cliente:confirmo",
    });
    expect(mockedBotonEnClientes).toHaveBeenCalledWith(boton);
    expect(
      await enrutarEntrante(enClientes({ kind: "media", text: null }))
    ).toEqual({ handler: "ignorado:media" });
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
  });

  it("el texto de un cliente conocido usa el número Telnyx del negocio formateado, no phone, y nombreParaCliente", async () => {
    mockedBizFindUnique.mockResolvedValueOnce({
      name: "Negocio de ana@correo.es",
      phone: "+34930000000",
      telnyxPhoneNumber: "+34930454394",
    } as never);

    await enrutarEntrante(
      enClientes({
        kind: "text",
        text: "hola",
        role: "client",
        businessId: "biz_1",
      })
    );

    expect(enviado(0)?.body).toBe(
      mensajes.clienteConocido({
        negocio: "el negocio",
        telefono: "+34 930 454 394",
      })
    );
    expect(enviado(0)?.body).not.toContain("tu negocio");
    expect(enviado(0)?.body).not.toContain("+34930000000");
  });
});

describe("responder", () => {
  it("una clave ya reclamada no vuelve a enviar", async () => {
    mockedReclamar.mockResolvedValue(false);
    expect(await enrutarEntrante(texto("hola"))).toEqual({
      handler: "texto:desconocido",
    });
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
  });

  it("si el envío falla, el handler se conserva, el motivo vuelve en error y la fila queda como fallida", async () => {
    mockedEnviarTexto.mockRejectedValue(new Error("Telnyx caído"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const mensaje = texto("hola");
    expect(await enrutarEntrante(mensaje)).toEqual({
      handler: "texto:desconocido",
      error: "Telnyx caído",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Telnyx caído")
    );
    expect(mockedSentUpdateMany).toHaveBeenCalledWith({
      where: {
        channel: "whatsapp",
        idempotencyKey: `entrante:${mensaje.id}:desconocido-negocios`,
      },
      data: {
        deliveryStatus: "failed",
        errorCode: "SEND_ERROR",
        errorDetail: "Telnyx caído",
      },
    });
    errorSpy.mockRestore();
  });

  it("si Telnyx falla en la primera respuesta del día, el siguiente entrante lo vuelve a intentar", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    // Simula la BD: las filas reclamadas y su estado.
    const filas: Array<{
      key: string;
      callbackData: string;
      status: string | null;
    }> = [];
    mockedReclamar.mockImplementation(async (_canal, key, extra) => {
      filas.push({
        key,
        callbackData: extra?.callbackData ?? "",
        status: null,
      });
      return true;
    });
    mockedSentUpdateMany.mockImplementation(async ({ where, data }) => {
      const fila = filas.find(
        (f) => f.key === (where as { idempotencyKey: string }).idempotencyKey
      );
      if (fila) {
        fila.status = (data as { deliveryStatus: string }).deliveryStatus;
      }
      return { count: fila ? 1 : 0 };
    });
    mockedSentCount.mockImplementation(async ({ where }) => {
      const w = where as {
        callbackData?: string;
        NOT?: { deliveryStatus: string };
      };
      return filas.filter(
        (f) =>
          (!w.callbackData || f.callbackData === w.callbackData) &&
          (!w.NOT || f.status !== w.NOT.deliveryStatus)
      ).length;
    });
    mockedEnviarTexto.mockRejectedValueOnce(new Error("telnyx caído"));

    expect(await enrutarEntrante(texto("hola", { role: "owner" }))).toEqual({
      handler: "texto:dueno",
      error: "telnyx caído",
    });
    expect(
      await enrutarEntrante(texto("hola otra vez", { role: "owner" }))
    ).toEqual({ handler: "texto:dueno" });
    expect(mockedEnviarTexto).toHaveBeenCalledTimes(2);

    // Y una vez enviada de verdad, la tercera se silencia.
    expect(await enrutarEntrante(texto("y otra", { role: "owner" }))).toEqual({
      handler: "texto:dueno:silenciado",
    });
    expect(mockedEnviarTexto).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it("un número con baja recibe el sufijo :baja sin error ni console.error, y la fila queda suprimida", async () => {
    const error = Object.assign(new Error("baja"), {
      code: "WHATSAPP_OPT_OUT",
    });
    mockedEnviarTexto.mockRejectedValue(error);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const mensaje = keyword("AYUDA");
    expect(await enrutarEntrante(mensaje)).toEqual({
      handler: "ayuda:desconocido:baja",
    });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(mockedSentUpdateMany).toHaveBeenCalledWith({
      where: {
        channel: "whatsapp",
        idempotencyKey: `entrante:${mensaje.id}:desconocido-negocios`,
      },
      data: { deliveryStatus: "suppressed", errorCode: "OPT_OUT" },
    });
    errorSpy.mockRestore();
  });

  it("éxito ⇒ log con el providerMessageId", async () => {
    await enrutarEntrante(texto("hola"));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("msg-resp")
    );
  });

  it("techo por hora: con 20 respuestas al número se silencia incluso al dueño; STOP lo salta una vez al día", async () => {
    mockedBizFindMany.mockResolvedValue([ACTIVO] as never);
    mockedSentCount.mockImplementation(async ({ where }) =>
      (where as { callbackData?: string }).callbackData ? 0 : 20
    );

    expect(await enrutarEntrante(keyword("AYUDA", { role: "owner" }))).toEqual({
      handler: "ayuda:dueno:silenciado",
    });
    expect(mockedEnviarTexto).not.toHaveBeenCalled();

    expect(await enrutarEntrante(keyword("STOP", { role: "owner" }))).toEqual({
      handler: "stop:dueno",
    });
    expect(mockedEnviarTexto).toHaveBeenCalledTimes(1);
  });
});

describe("botones de los avisos al negocio (PR 3)", () => {
  const AVISO_RESERVA = {
    id: "sm_av",
    providerMessageId: "msg-aviso",
    businessId: "biz_1",
    audience: "owner",
    toNumber: MOVIL,
    callbackData: "aviso:nueva_reserva:booking_1",
  };
  const AVISO_PENDIENTE = {
    ...AVISO_RESERVA,
    providerMessageId: "msg-pend",
    callbackData: "aviso:cita_pendiente:lead_1",
  };

  function boton(
    id: string,
    title: string,
    context: string | null = "msg-aviso"
  ) {
    return entrante({
      kind: "button",
      text: null,
      buttonId: id,
      buttonTitle: title,
      contextMessageId: context,
      payload: { type: "interactive" },
      role: "owner",
      businessId: "biz_1",
    });
  }

  beforeEach(() => {
    mockedSentFindUnique.mockResolvedValue(AVISO_RESERVA as never);
    mockedBizFindFirst.mockResolvedValue(ACTIVO as never);
    mockedLeadUpdate.mockResolvedValue({} as never);
    mockedEnqueueRetry.mockResolvedValue(undefined);
  });

  it("«Vale» solo cierra el aviso, sin responder", async () => {
    expect(
      await enrutarEntrante(boton("aviso:nueva_reserva:booking_1:vale", "Vale"))
    ).toEqual({ handler: "aviso:nueva_reserva:vale" });
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
  });

  it("«Ver agenda de hoy» responde con la agenda del negocio del aviso", async () => {
    mockedTextoAgenda.mockResolvedValue("Peluquería Ana, hoy: sin citas.");

    expect(
      await enrutarEntrante(
        boton("aviso:nueva_reserva:booking_1:agenda_hoy", "Ver agenda de hoy")
      )
    ).toEqual({ handler: "aviso:nueva_reserva:agenda_hoy" });
    expect(mockedTextoAgenda).toHaveBeenCalledWith(ACTIVO, 0);
    expect(enviado()?.body).toBe("Peluquería Ana, hoy: sin citas.");
  });

  it("el botón de una PLANTILLA (sin id propio) se resuelve por el título y el context.id", async () => {
    mockedTextoAgenda.mockResolvedValue("agenda");

    expect(
      await enrutarEntrante(boton("Ver agenda de hoy", "Ver agenda de hoy"))
    ).toEqual({ handler: "aviso:nueva_reserva:agenda_hoy" });
  });

  it("un botón de aviso sin envío original o de un envío a otro móvil no actúa", async () => {
    mockedSentFindUnique.mockResolvedValue(null);
    expect(
      await enrutarEntrante(
        boton("aviso:nueva_reserva:booking_1:vale", "Vale", null)
      )
    ).toEqual({ handler: "pendiente:boton:aviso" });

    mockedSentFindUnique.mockResolvedValue({
      ...AVISO_RESERVA,
      toNumber: "+34600000000",
    } as never);
    expect(
      await enrutarEntrante(boton("aviso:nueva_reserva:booking_1:vale", "Vale"))
    ).toEqual({ handler: "pendiente:boton:aviso" });
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
  });

  it("si el negocio del aviso ya no tiene este móvil, responde «otro móvil» y no toca nada", async () => {
    mockedBizFindFirst.mockResolvedValue(null);

    expect(
      await enrutarEntrante(boton("aviso:nueva_reserva:booking_1:vale", "Vale"))
    ).toEqual({ handler: "aviso:nueva_reserva:vale:numero-antiguo" });
    expect(enviado()?.body).toBe(mensajes.mensajeParaOtroMovil());
  });

  it("«La apunté yo» resuelve el lead del negocio y lo confirma", async () => {
    mockedSentFindUnique.mockResolvedValue(AVISO_PENDIENTE as never);
    mockedLeadFindFirst.mockResolvedValue({
      id: "lead_1",
      resolvedAt: null,
      data: { clientName: "Juan" },
    } as never);

    expect(
      await enrutarEntrante(
        boton(
          "aviso:cita_pendiente:lead_1:apuntada",
          "La apunté yo",
          "msg-pend"
        )
      )
    ).toEqual({ handler: "aviso:cita_pendiente:apuntada" });
    expect(mockedLeadFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "lead_1",
          type: "pending_booking",
          call: { businessId: "biz_1" },
        },
      })
    );
    expect(mockedLeadUpdate).toHaveBeenCalledWith({
      where: { id: "lead_1" },
      data: {
        resolvedAt: expect.any(Date),
        data: expect.objectContaining({
          clientName: "Juan",
          resolvedBy: "owner_whatsapp",
        }),
      },
    });
    expect(enviado()?.body).toBe(mensajes.citaApuntada({ cliente: "Juan" }));
  });

  it("«Reintentar» encola el reintento; un lead ya resuelto o ajeno no hace nada", async () => {
    mockedSentFindUnique.mockResolvedValue(AVISO_PENDIENTE as never);
    mockedLeadFindFirst.mockResolvedValue({
      id: "lead_1",
      resolvedAt: null,
      data: {},
    } as never);

    expect(
      await enrutarEntrante(
        boton(
          "aviso:cita_pendiente:lead_1:reintentar",
          "Reintentar",
          "msg-pend"
        )
      )
    ).toEqual({ handler: "aviso:cita_pendiente:reintentar" });
    expect(mockedEnqueueRetry).toHaveBeenCalledWith({ leadId: "lead_1" });
    expect(enviado()?.body).toBe(
      mensajes.reintentandoCita({ cliente: "ese cliente" })
    );

    mockedLeadFindFirst.mockResolvedValue({
      id: "lead_1",
      resolvedAt: new Date(),
      data: {},
    } as never);
    expect(
      await enrutarEntrante(
        boton(
          "aviso:cita_pendiente:lead_1:reintentar",
          "Reintentar",
          "msg-pend"
        )
      )
    ).toEqual({ handler: "aviso:cita_pendiente:reintentar:ya-resuelta" });

    mockedLeadFindFirst.mockResolvedValue(null);
    expect(
      await enrutarEntrante(
        boton(
          "aviso:cita_pendiente:lead_1:apuntada",
          "La apunté yo",
          "msg-pend"
        )
      )
    ).toEqual({ handler: "aviso:cita_pendiente:apuntada:lead-ajeno" });
    expect(mockedEnqueueRetry).toHaveBeenCalledTimes(1);
  });

  it("«Reconectar» manda al panel", async () => {
    mockedSentFindUnique.mockResolvedValue(AVISO_PENDIENTE as never);
    expect(
      await enrutarEntrante(
        boton(
          "aviso:cita_pendiente:lead_1:reconectar",
          "Reconectar",
          "msg-pend"
        )
      )
    ).toEqual({ handler: "aviso:cita_pendiente:reconectar" });
    expect(enviado()?.body).toContain("https://alhabla.ai/ajustes");
  });

  describe("«Avisar a quien esperaba» (lista de espera, PR 4)", () => {
    const CANCELADA = {
      id: "booking_1",
      isCancelled: true,
      programedAt: EN_UNA_SEMANA,
      durationMinutes: 45,
    };

    beforeEach(() => {
      mockedSentFindUnique.mockResolvedValue({
        ...AVISO_RESERVA,
        callbackData: "aviso:cancelacion:booking_1",
      } as never);
      mockedBookingFindFirst.mockResolvedValue(CANCELADA as never);
    });

    it("(interactivo y por título Avisar lista espera) dispara avisarAQuienEsperaba y responde avisada / en oferta / nadie / sin plantilla / error sin nombrar el teléfono", async () => {
      mockedAvisarAQuienEsperaba.mockResolvedValueOnce({
        resultado: "avisado",
        leadId: "lead_9",
        cliente: "Marta",
      });
      expect(
        await enrutarEntrante(
          boton(
            "aviso:cancelacion:booking_1:avisar_espera",
            "Avisar lista espera"
          )
        )
      ).toEqual({ handler: "aviso:cancelacion:avisar_espera" });
      expect(mockedAvisarAQuienEsperaba).toHaveBeenCalledWith({
        businessId: "biz_1",
        hueco: {
          inicioMs: EN_UNA_SEMANA.getTime(),
          finMs: EN_UNA_SEMANA.getTime() + 45 * 60_000,
        },
        origen: "boton_dueno",
        etiqueta: expect.stringContaining("boton dueño"),
      });
      // La reserva se busca en ESTE negocio, nunca solo por id.
      expect(mockedBookingFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "booking_1", call: { businessId: "biz_1" } },
        })
      );
      expect(enviado(0)?.body).toBe(
        mensajes.listaDeEsperaAvisada({
          negocio: "Peluquería Ana",
          cliente: "Marta",
        })
      );

      // Por título de la plantilla («Avisar a quien esperaba»), sin id propio.
      mockedAvisarAQuienEsperaba.mockResolvedValueOnce({
        resultado: "en_oferta",
        cliente: null,
        minutos: 4,
      });
      expect(
        await enrutarEntrante(
          boton("Avisar a quien esperaba", "Avisar a quien esperaba")
        )
      ).toEqual({ handler: "aviso:cancelacion:avisar_espera:en-oferta" });
      expect(enviado(1)?.body).toBe(
        mensajes.listaDeEsperaEnOferta({
          negocio: "Peluquería Ana",
          cliente: null,
          minutos: 4,
        })
      );

      mockedAvisarAQuienEsperaba.mockResolvedValueOnce({ resultado: "nadie" });
      expect(
        await enrutarEntrante(
          boton("Avisar lista espera", "Avisar lista espera")
        )
      ).toEqual({ handler: "aviso:cancelacion:avisar_espera:nadie" });
      expect(enviado(2)?.body).toBe(
        mensajes.listaDeEsperaNadie({ negocio: "Peluquería Ana" })
      );

      mockedAvisarAQuienEsperaba.mockResolvedValueOnce({
        resultado: "sin_plantilla",
      });
      expect(
        await enrutarEntrante(
          boton("Avisar lista espera", "Avisar lista espera")
        )
      ).toEqual({ handler: "aviso:cancelacion:avisar_espera:sin-plantilla" });
      expect(enviado(3)?.body).toBe(
        mensajes.listaDeEsperaSinPlantilla({ negocio: "Peluquería Ana" })
      );

      mockedAvisarAQuienEsperaba.mockResolvedValueOnce({
        resultado: "error",
        motivo: "BD",
      });
      expect(
        await enrutarEntrante(
          boton("Avisar lista espera", "Avisar lista espera")
        )
      ).toEqual({ handler: "aviso:cancelacion:avisar_espera:error" });
      expect(enviado(4)?.body).toBe(
        mensajes.listaDeEsperaError({ negocio: "Peluquería Ana" })
      );

      for (const llamada of mockedEnviarTexto.mock.calls) {
        expect(llamada[0].body).not.toMatch(/\+34\d{9}/);
        expect(llamada[0].audience).toBe("owner");
      }
    });

    it("sobre una cita no cancelada responde que sigue en pie, sobre una pasada que ya pasó y sobre una reserva ajena no actúa", async () => {
      mockedBookingFindFirst.mockResolvedValueOnce({
        ...CANCELADA,
        isCancelled: false,
      } as never);
      expect(
        await enrutarEntrante(
          boton(
            "aviso:cancelacion:booking_1:avisar_espera",
            "Avisar lista espera"
          )
        )
      ).toEqual({ handler: "aviso:cancelacion:avisar_espera:no-cancelada" });
      expect(enviado(0)?.body).toBe(
        mensajes.listaDeEsperaSinHueco({ negocio: "Peluquería Ana" })
      );

      mockedBookingFindFirst.mockResolvedValueOnce({
        ...CANCELADA,
        programedAt: new Date(Date.now() - 60_000),
      } as never);
      expect(
        await enrutarEntrante(
          boton(
            "aviso:cancelacion:booking_1:avisar_espera",
            "Avisar lista espera"
          )
        )
      ).toEqual({ handler: "aviso:cancelacion:avisar_espera:pasada" });
      expect(enviado(1)?.body).toBe(
        mensajes.listaDeEsperaPasada({ negocio: "Peluquería Ana" })
      );

      mockedBookingFindFirst.mockResolvedValueOnce(null);
      expect(
        await enrutarEntrante(
          boton(
            "aviso:cancelacion:booking_1:avisar_espera",
            "Avisar lista espera"
          )
        )
      ).toEqual({ handler: "aviso:cancelacion:avisar_espera:reserva-ajena" });
      expect(mockedEnviarTexto).toHaveBeenCalledTimes(2);
      expect(mockedAvisarAQuienEsperaba).not.toHaveBeenCalled();
    });
  });
});

describe("botones del aviso de recado (#2)", () => {
  const AVISO_RECADO = {
    id: "sm_rec",
    providerMessageId: "msg-rec",
    businessId: "biz_1",
    audience: "owner",
    toNumber: MOVIL,
    callbackData: "aviso:recado:lead_9",
  };
  function boton(id: string, title: string) {
    return entrante({
      kind: "button",
      text: null,
      buttonId: id,
      buttonTitle: title,
      contextMessageId: "msg-rec",
      payload: { type: "interactive" },
      role: "owner",
      businessId: "biz_1",
    });
  }

  beforeEach(() => {
    mockedSentFindUnique.mockResolvedValue(AVISO_RECADO as never);
    mockedBizFindFirst.mockResolvedValue({
      ...ACTIVO,
      timezone: "Europe/Madrid",
    } as never);
    mockedLeadFindFirst.mockResolvedValue({
      id: "lead_9",
      resolvedAt: null,
    } as never);
    mockedLeadUpdate.mockResolvedValue({} as never);
    mockedEnqueueRecado.mockResolvedValue(undefined);
  });

  it("«Atendido» resuelve el recado del negocio y lo confirma", async () => {
    expect(
      await enrutarEntrante(boton("aviso:recado:lead_9:atendido", "Atendido"))
    ).toEqual({ handler: "aviso:recado:atendido" });
    expect(mockedLeadFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lead_9", type: "message", call: { businessId: "biz_1" } },
      })
    );
    expect(mockedLeadUpdate).toHaveBeenCalledWith({
      where: { id: "lead_9" },
      data: { resolvedAt: expect.any(Date), snoozedUntil: null },
    });
    expect(enviado()?.body).toBe(mensajes.recadoAtendido());
  });

  it("«Recuérdamelo mañana» pospone hasta las 09:00 del día siguiente y programa el job (también desde el botón de la plantilla)", async () => {
    expect(
      await enrutarEntrante(boton("Recuérdamelo mañana", "Recuérdamelo mañana"))
    ).toEqual({ handler: "aviso:recado:manana" });
    expect(mockedLeadUpdate).toHaveBeenCalledWith({
      where: { id: "lead_9" },
      data: { snoozedUntil: expect.any(Date) },
    });
    const cuando = (
      mockedLeadUpdate.mock.calls[0][0].data as { snoozedUntil: Date }
    ).snoozedUntil;
    expect(cuando.getTime()).toBeGreaterThan(Date.now());
    expect(
      new Intl.DateTimeFormat("es-ES", {
        timeZone: "Europe/Madrid",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(cuando)
    ).toBe("09:00");
    expect(mockedEnqueueRecado).toHaveBeenCalledWith({ leadId: "lead_9" }, cuando);
    expect(enviado()?.body).toBe(mensajes.recadoPospuesto());
  });

  it("un recado ya atendido o ajeno no se toca", async () => {
    mockedLeadFindFirst.mockResolvedValue({
      id: "lead_9",
      resolvedAt: new Date(),
    } as never);
    expect(
      await enrutarEntrante(boton("aviso:recado:lead_9:atendido", "Atendido"))
    ).toEqual({ handler: "aviso:recado:atendido:ya-atendido" });
    expect(enviado()?.body).toBe(mensajes.recadoYaAtendido());

    mockedLeadFindFirst.mockResolvedValue(null);
    expect(
      await enrutarEntrante(
        boton("aviso:recado:lead_9:manana", "Recuérdamelo mañana")
      )
    ).toEqual({ handler: "aviso:recado:manana:lead-ajeno" });
    expect(mockedLeadUpdate).not.toHaveBeenCalled();
    expect(mockedEnqueueRecado).not.toHaveBeenCalled();
  });
});

describe("el Gestor en el número de negocios (fase 2, PR 2)", () => {
  const PROPUESTA_ID = "acc_1";

  function botonDeAccion(decision: "confirmar" | "cancelar") {
    return entrante({
      kind: "button",
      text: null,
      role: "owner",
      businessId: "biz_1",
      buttonId: `accion:${PROPUESTA_ID}:${decision}`,
      buttonTitle: decision === "confirmar" ? "Confirmar" : "Cancelar",
      contextMessageId: "msg_prop",
    });
  }

  it("«Confirmar» ejecuta la propuesta del negocio del móvil, responde el resultado y lo anota en la conversación", async () => {
    vi.mocked(prisma.ownerPendingAction.findUnique).mockResolvedValue({
      businessId: "biz_1",
    } as never);
    mockedBizFindFirst.mockResolvedValue({ id: "biz_1", timezone: "Europe/Madrid" } as never);
    mockedDecidir.mockResolvedValue({
      estado: "ejecutada",
      mensaje: "Hecho: doy por resuelta la cita pendiente de Elena.",
    });

    const mensaje = botonDeAccion("confirmar");
    expect(await enrutarEntrante(mensaje)).toEqual({ handler: "accion:confirmar" });
    expect(mockedDecidir).toHaveBeenCalledWith({
      accionId: PROPUESTA_ID,
      businessId: "biz_1",
      timezone: "Europe/Madrid",
      decision: "confirmar",
      inboundMessageId: mensaje.id,
    });
    expect(enviado()?.body).toBe("Hecho: doy por resuelta la cita pendiente de Elena.");    expect(mockedAnotar).toHaveBeenCalledWith(
      "biz_1",
      expect.stringContaining("pulsó Confirmar")
    );
    // Tras el botón, el Gestor recibe un turno para seguir (onboarding).
    expect(vi.mocked(continuarTrasAccion)).toHaveBeenCalledWith({
      message: mensaje,
      businessId: "biz_1",
      resultado: "ejecutada",
    });
  });

  it("una acción con pregunta de seguimiento («¿le mando la confirmación?») registra la nueva propuesta y la manda con sus botones, sin turno del Gestor", async () => {
    vi.mocked(prisma.ownerPendingAction.findUnique).mockResolvedValue({
      businessId: "biz_1",
      tipo: "añadir_cita",
    } as never);
    mockedBizFindFirst.mockResolvedValue({ id: "biz_1", timezone: "Europe/Madrid" } as never);
    mockedDecidir.mockResolvedValue({
      estado: "ejecutada",
      mensaje: "Hecho: Marta queda apuntada.",
      nota: "Cita b_1 creada.",
      siguiente: {
        tipo: "avisar_cliente",
        parametros: { cita: "b_1", tipo: "confirmacion" },
        resumen: "Le mando a Marta la confirmación.",
        pregunta: "¿Le mando a Marta la confirmación por WhatsApp al +34600111222?",
        botones: { confirmar: "Sí, mándasela", cancelar: "No" },
      },
    });
    vi.mocked(registrarPropuesta).mockResolvedValue({
      ok: true,
      accionId: "acc_2",
      descripcion: "mandar a Marta la confirmación",
      expiresAt: new Date(),
    });
    vi.mocked(enviarBotones).mockResolvedValue({ messageId: "m_btn" } as never);

    const mensaje = botonDeAccion("confirmar");
    expect(await enrutarEntrante(mensaje)).toEqual({ handler: "accion:confirmar" });
    expect(enviado()?.body).toBe("Hecho: Marta queda apuntada.");
    expect(vi.mocked(registrarPropuesta)).toHaveBeenCalledWith({
      businessId: "biz_1",
      timezone: "Europe/Madrid",
      conversationId: null,
      inboundMessageId: mensaje.id,
      tipo: "avisar_cliente",
      parametros: { cita: "b_1", tipo: "confirmacion" },
      resumen: "Le mando a Marta la confirmación.",
    });
    expect(vi.mocked(enviarBotones)).toHaveBeenCalledWith(
      expect.objectContaining({
        to: MOVIL,
        body: "¿Le mando a Marta la confirmación por WhatsApp al +34600111222?",
        buttons: [
          { id: "accion:acc_2:confirmar", title: "Sí, mándasela" },
          { id: "accion:acc_2:cancelar", title: "No" },
        ],
      })
    );
    expect(mockedAnotar).toHaveBeenCalledWith(
      "biz_1",
      expect.stringContaining("propuesta acc_2")
    );
    expect(vi.mocked(continuarTrasAccion)).not.toHaveBeenCalled();

    // Si la pregunta no se puede registrar, el seguimiento sigue como siempre.
    vi.mocked(registrarPropuesta).mockResolvedValueOnce({ ok: false, motivo: "sin móvil" });
    await enrutarEntrante(botonDeAccion("confirmar"));
    expect(vi.mocked(continuarTrasAccion)).toHaveBeenCalledTimes(1);
  });

  it("«No» / «Le llamo yo» a la pregunta de avisar al cliente cierra sin turno de seguimiento", async () => {
    vi.mocked(prisma.ownerPendingAction.findUnique).mockResolvedValue({
      businessId: "biz_1",
      tipo: "avisar_cliente",
    } as never);
    mockedBizFindFirst.mockResolvedValue({ id: "biz_1", timezone: "Europe/Madrid" } as never);
    mockedDecidir.mockResolvedValueOnce({ estado: "rechazada" });
    expect(await enrutarEntrante(botonDeAccion("cancelar"))).toEqual({
      handler: "accion:cancelar",
    });
    expect(enviado()?.body).toBe(mensajes.avisoAlClienteDescartado());
    expect(mockedAnotar).toHaveBeenCalledWith(
      "biz_1",
      expect.stringContaining("no avisar al cliente")
    );
    expect(vi.mocked(continuarTrasAccion)).not.toHaveBeenCalled();
  });

  it("«Cancelar» rechaza; caducada, ya decidida y no encontrada responden su texto", async () => {
    vi.mocked(prisma.ownerPendingAction.findUnique).mockResolvedValue({
      businessId: "biz_1",
    } as never);
    mockedBizFindFirst.mockResolvedValue({ id: "biz_1", timezone: "Europe/Madrid" } as never);

    mockedDecidir.mockResolvedValueOnce({ estado: "rechazada" });
    expect(await enrutarEntrante(botonDeAccion("cancelar"))).toEqual({
      handler: "accion:cancelar",
    });
    expect(enviado(0)?.body).toBe(mensajes.accionRechazada());

    mockedDecidir.mockResolvedValueOnce({ estado: "caducada" });
    expect(await enrutarEntrante(botonDeAccion("confirmar"))).toEqual({
      handler: "accion:confirmar:caducada",
    });
    expect(enviado(1)?.body).toBe(mensajes.accionCaducada());

    mockedDecidir.mockResolvedValueOnce({ estado: "ya_decidida" });
    expect(await enrutarEntrante(botonDeAccion("confirmar"))).toEqual({
      handler: "accion:confirmar:ya-decidida",
    });
    expect(enviado(2)?.body).toBe(mensajes.accionYaDecidida());

    mockedDecidir.mockResolvedValueOnce({
      estado: "fallida",
      mensaje: "No he podido hacerlo ahora mismo.",
    });
    expect(await enrutarEntrante(botonDeAccion("confirmar"))).toEqual({
      handler: "accion:confirmar:fallida",
    });
    expect(enviado(3)?.body).toBe("No he podido hacerlo ahora mismo.");
  });

  it("un botón sobre una propuesta de otro negocio (o de un móvil distinto) no ejecuta nada", async () => {
    vi.mocked(prisma.ownerPendingAction.findUnique).mockResolvedValue({
      businessId: "biz_ajeno",
    } as never);
    mockedBizFindFirst.mockResolvedValue(null);

    expect(await enrutarEntrante(botonDeAccion("confirmar"))).toEqual({
      handler: "accion:boton:ajena",
    });
    expect(mockedDecidir).not.toHaveBeenCalled();
    expect(enviado()?.body).toBe(mensajes.accionNoEncontrada());
    expect(mockedBizFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({        where: expect.objectContaining({
          id: "biz_ajeno",
          ownerWhatsappNumber: MOVIL,
          ownerWhatsappOptOutAt: null,
          ownerChatEnabled: true,
        }),
      })
    );
  });

  it("un id de botón accion: malformado no responde", async () => {
    expect(
      await enrutarEntrante(
        entrante({ kind: "button", text: null, role: "owner", buttonId: "accion:x:borrar" })
      )
    ).toEqual({ handler: "accion:boton:malformado" });
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
  });

  it("MAL guarda la última pareja pregunta/respuesta de la conversación del Gestor (sin el marcador)", async () => {
    mockedBizFindFirst.mockResolvedValue({
      id: "biz_1",
      ownerConversationId: "conv_dueno",
    } as never);
    mockedListarMensajes.mockResolvedValue([
      { role: "assistant", text: "Mañana no tienes citas." },
      { role: "tool", text: "{}" },
      { role: "user", text: "[WhatsApp · domingo 20 de septiembre, 18:09 (Europe/Madrid)] ¿Qué tengo mañana?" },
      { role: "assistant", text: "Hola, ¿en qué te ayudo?" },
    ]);
    vi.mocked(prisma.ownerChatFeedback.create).mockResolvedValue({} as never);

    expect(
      await enrutarEntrante(keyword("MAL", { role: "owner", businessId: "biz_1" }))
    ).toEqual({ handler: "mal:guardado" });
    expect(prisma.ownerChatFeedback.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz_1",
        conversationId: "conv_dueno",
        question: "¿Qué tengo mañana?",
        answer: "Mañana no tienes citas.",
      },
    });
    expect(enviado()?.body).toBe(mensajes.feedbackGuardado());
  });

  it("MAL sin conversación con el Gestor responde que no hay nada que anotar (una vez al día)", async () => {
    mockedBizFindFirst.mockResolvedValue({ id: "biz_1", ownerConversationId: null } as never);
    expect(
      await enrutarEntrante(keyword("MAL", { role: "owner", businessId: "biz_1" }))
    ).toEqual({ handler: "mal:sin-conversacion" });
    expect(enviado()?.body).toBe(mensajes.feedbackSinConversacion());
    expect(mockedListarMensajes).not.toHaveBeenCalled();
  });

  it("la bienvenida tras el alta ofrece la puesta en marcha por chat cuando el Gestor lo indica", async () => {
    mockedBizFindUnique.mockResolvedValue({
      ...negocio(),
      ownerAltaCode: "7KP3MQ",
      ownerAltaCodeExpiresAt: new Date(AHORA.getTime() + 7 * 24 * 60 * 60 * 1000),
    } as never);
    mockedActivar.mockResolvedValue({ count: 1, numeroAnterior: null } as never);
    vi.mocked(ofrecerPuestaEnMarcha).mockResolvedValueOnce(true);

    await enrutarEntrante(keyword("alta: 7kp3mq"));
    expect(vi.mocked(ofrecerPuestaEnMarcha)).toHaveBeenCalledWith("biz_1");
    expect(enviado()?.body).toContain("escríbeme «empezamos»");
  });

  it("AYUDA cuenta que se puede preguntar solo con el Gestor encendido", async () => {
    mockedBizFindMany.mockResolvedValue([ACTIVO] as never);
    vi.mocked(chatDelDuenoActivo).mockReturnValueOnce(true);
    vi.mocked(gestorAssistantId).mockReturnValueOnce("assistant-gestor");

    await enrutarEntrante(keyword("AYUDA", { role: "owner" }));
    expect(enviado()?.body).toBe(
      mensajes.ayudaDueno({ negocios: ["Peluquería Ana"], panelUrl: PANEL, chat: true })
    );
    expect(enviado()?.body).toContain("MAL");
  });
});
