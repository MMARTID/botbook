import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { telnyxAiAdapter } from "../../../src/adapters/telnyx/TelnyxAiAdapter.js";
import {
  anotarEnConversacionDelDueno,
  turnoDelGestor,
} from "../../../src/modules/whatsapp/chatDueno.js";
import {
  decidirPropuesta,
  registrarPropuesta,
} from "../../../src/modules/gestor/acciones.js";
import {
  decidirEnElPanel,
  historialDelGestor,
  preguntarAlGestor,
} from "../../../src/modules/gestor/panel.js";
import * as mensajes from "../../../src/modules/whatsapp/mensajes.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    ownerPendingAction: { findFirst: vi.fn() },
  },
}));
vi.mock("../../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: { listConversationMessages: vi.fn() },
}));
vi.mock("../../../src/modules/whatsapp/chatDueno.js", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../../src/modules/whatsapp/chatDueno.js")
    >();
  return {
    ...actual,
    turnoDelGestor: vi.fn(),
    anotarEnConversacionDelDueno: vi.fn(async () => undefined),
  };
});
vi.mock("../../../src/modules/gestor/acciones.js", () => ({
  decidirPropuesta: vi.fn(),
  registrarPropuesta: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/bajas.js", () => ({
  estaDadoDeBaja: vi.fn(async () => false),
}));

const mockedBiz = vi.mocked(prisma.business.findUnique);
const mockedPendiente = vi.mocked(prisma.ownerPendingAction.findFirst);
const mockedListar = vi.mocked(telnyxAiAdapter.listConversationMessages);
const mockedTurno = vi.mocked(turnoDelGestor);
const mockedDecidir = vi.mocked(decidirPropuesta);
const mockedRegistrar = vi.mocked(registrarPropuesta);
const mockedAnotar = vi.mocked(anotarEnConversacionDelDueno);

const NEGOCIO = {
  id: "biz_1",
  name: "Peluquería Ana",
  businessType: "peluqueria",
  timezone: "Europe/Madrid",
  active: true,
  ownerChatEnabled: true,
  ownerWhatsappNumber: "+34692138456",
  ownerWhatsappOptInAt: new Date(),
  ownerWhatsappOptOutAt: null,
  ownerWhatsappUnreachableAt: null,
  ownerConversationId: "conv_1",
  ownerConversationCreatedAt: new Date(),
  subscriptionStatus: "active",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  process.env.TELNYX_OWNER_CHAT_ENABLED = "true";
  process.env.TELNYX_GESTOR_ASSISTANT_ID = "assistant-1";
  mockedBiz.mockResolvedValue(NEGOCIO as never);
  mockedPendiente.mockResolvedValue(null);
});

describe("historialDelGestor", () => {
  it("devuelve el estado, el historial limpio (sin marcadores ni turnos sintéticos, del más viejo al más nuevo) y la propuesta pendiente con sus botones", async () => {
    mockedListar.mockResolvedValue([
      { role: "assistant", text: "Listo." },
      {
        role: "user",
        text: "[WhatsApp · lunes 21 de septiembre, 10:02 (Europe/Madrid)] (El dueño ha pulsado Confirmar y la acción ya está hecha…)",
      },
      { role: "tool", text: "{}" },
      {
        role: "assistant",
        text: "Mañana tienes dos citas.",
        createdAt: "2026-09-21T08:01:00Z",
      },
      {
        role: "user",
        text: "[WhatsApp · lunes 21 de septiembre, 10:00 (Europe/Madrid)] ¿qué tengo mañana?",
        createdAt: "2026-09-21T08:00:00Z",
      },
    ]);
    mockedPendiente.mockResolvedValue({
      id: "acc_1",
      tipo: "avisar_cliente",
      resumen: "Le aviso a Marta.",
      expiresAt: new Date("2026-09-22T08:00:00Z"),
    } as never);

    const r = await historialDelGestor("biz_1");
    expect(r).toEqual({
      disponible: true,
      activoEnNegocio: true,
      whatsapp: "activo",
      mensajes: [
        {
          de: "dueno",
          texto: "¿qué tengo mañana?",
          en: "2026-09-21T08:00:00Z",
        },
        {
          de: "gestor",
          texto: "Mañana tienes dos citas.",
          en: "2026-09-21T08:01:00Z",
        },
      ],
      propuesta: {
        id: "acc_1",
        resumen: "Le aviso a Marta.",
        expiresAt: "2026-09-22T08:00:00.000Z",
        botones: { confirmar: "Sí, avísale", cancelar: "No" },
      },
    });
    expect(mockedPendiente).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz_1",
          confirmedAt: null,
          rejectedAt: null,
        }),
      })
    );
  });

  it("con el interruptor global apagado no consulta a Telnyx y lo dice; si Telnyx falla, historial vacío sin lanzar", async () => {
    process.env.TELNYX_OWNER_CHAT_ENABLED = "false";
    const apagado = await historialDelGestor("biz_1");
    expect(apagado).toMatchObject({ disponible: false, mensajes: [] });
    expect(mockedListar).not.toHaveBeenCalled();

    process.env.TELNYX_OWNER_CHAT_ENABLED = "true";
    mockedListar.mockRejectedValueOnce(new Error("telnyx caído"));
    expect(await historialDelGestor("biz_1")).toMatchObject({
      disponible: true,
      mensajes: [],
    });
    mockedBiz.mockResolvedValueOnce(null);
    expect(await historialDelGestor("nadie")).toBeNull();
  });
});

describe("preguntarAlGestor", () => {
  it("rechaza sin interruptor, sin texto, con el negocio apagado o la suscripción bloqueada, sin llamar al Gestor", async () => {
    process.env.TELNYX_GESTOR_ASSISTANT_ID = "";
    expect(
      await preguntarAlGestor({ businessId: "biz_1", texto: "hola" })
    ).toMatchObject({ ok: false, motivo: "no_disponible" });
    process.env.TELNYX_GESTOR_ASSISTANT_ID = "assistant-1";
    expect(
      await preguntarAlGestor({ businessId: "biz_1", texto: "   " })
    ).toMatchObject({ ok: false, motivo: "sin_texto" });
    mockedBiz.mockResolvedValueOnce({
      ...NEGOCIO,
      ownerChatEnabled: false,
    } as never);
    expect(
      await preguntarAlGestor({ businessId: "biz_1", texto: "hola" })
    ).toMatchObject({
      ok: false,
      motivo: "apagado_negocio",
      // El interruptor vive en Ajustes › Teléfono › Tu móvil (fase 2).
      mensaje: "El asistente está desactivado en Ajustes › Teléfono.",
    });
    mockedBiz.mockResolvedValueOnce({
      ...NEGOCIO,
      subscriptionStatus: "UNPAID",
    } as never);
    expect(
      await preguntarAlGestor({ businessId: "biz_1", texto: "hola" })
    ).toMatchObject({ ok: false, motivo: "negocio_inactivo" });
    expect(mockedTurno).not.toHaveBeenCalled();
  });

  it("manda el turno con un id sintético panel:<uuid>, sin exigir WhatsApp, y devuelve la respuesta con la propuesta del turno", async () => {
    mockedBiz.mockResolvedValue({
      ...NEGOCIO,
      ownerWhatsappNumber: null,
      ownerWhatsappOptInAt: null,
    } as never);
    mockedTurno.mockResolvedValue({
      estado: "ok",
      respuesta: "Si confirmas, cierro el viernes.",
      motivoDeFallo: null,
      accionId: "acc_2",
      turnos: 3,
    });
    mockedPendiente.mockResolvedValue({
      id: "acc_2",
      tipo: "cerrar_dia",
      resumen: "Cierro el viernes.",
      expiresAt: new Date("2026-09-22T08:00:00Z"),
    } as never);
    const r = await preguntarAlGestor({
      businessId: "biz_1",
      texto: "cierra el viernes",
    });
    expect(r).toEqual({
      ok: true,
      respuesta: "Si confirmas, cierro el viernes.",
      propuesta: {
        id: "acc_2",
        resumen: "Cierro el viernes.",
        expiresAt: "2026-09-22T08:00:00.000Z",
        botones: { confirmar: "Confirmar", cancelar: "Cancelar" },
      },
    });
    expect(mockedTurno).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerPhone: "panel",
        texto: "cierra el viernes",
        inboundMessageId: expect.stringMatching(/^panel:[0-9a-f-]{36}$/),
        etiqueta: "biz_1/panel",
      })
    );

    mockedTurno.mockResolvedValueOnce({ estado: "limite" });
    expect(
      await preguntarAlGestor({ businessId: "biz_1", texto: "hola" })
    ).toMatchObject({ ok: false, motivo: "limite" });
    mockedTurno.mockResolvedValueOnce({ estado: "ocupado" });
    expect(
      await preguntarAlGestor({ businessId: "biz_1", texto: "hola" })
    ).toMatchObject({ ok: false, motivo: "ocupado" });
    mockedTurno.mockResolvedValueOnce({
      estado: "ok",
      respuesta: null,
      motivoDeFallo: "timeout",
      accionId: null,
      turnos: 4,
    });
    expect(
      await preguntarAlGestor({ businessId: "biz_1", texto: "hola" })
    ).toMatchObject({ ok: false, motivo: "sin_respuesta" });
  });
});

describe("decidirEnElPanel", () => {
  const DECISION = {
    businessId: "biz_1",
    accionId: "acc_1",
    decision: "confirmar" as const,
  };

  it("ejecutada con pregunta siguiente: la registra, la devuelve con sus botones, anota en la conversación y no abre turno de seguimiento", async () => {
    mockedPendiente.mockResolvedValue({ tipo: "añadir_cita" } as never);
    mockedDecidir.mockResolvedValue({
      estado: "ejecutada",
      mensaje: "Hecho: Marta queda apuntada.",
      nota: "Cita b_1 creada.",
      siguiente: {
        tipo: "avisar_cliente",
        parametros: { cita: "b_1", tipo: "confirmacion" },
        resumen: "Le mando la confirmación.",
        pregunta: "¿Le mando a Marta la confirmación?",
        botones: { confirmar: "Sí, mándasela", cancelar: "No" },
      },
    });
    mockedRegistrar.mockResolvedValue({
      ok: true,
      accionId: "acc_2",
      descripcion: "x",
      expiresAt: new Date("2026-09-22T08:00:00Z"),
    });

    const r = await decidirEnElPanel(DECISION);
    expect(r).toEqual({
      ok: true,
      estado: "ejecutada",
      mensaje: "Hecho: Marta queda apuntada.",
      propuesta: {
        id: "acc_2",
        resumen: "¿Le mando a Marta la confirmación?",
        expiresAt: "2026-09-22T08:00:00.000Z",
        botones: { confirmar: "Sí, mándasela", cancelar: "No" },
      },
      seguimiento: null,
    });
    expect(mockedDecidir).toHaveBeenCalledWith(
      expect.objectContaining({
        accionId: "acc_1",
        businessId: "biz_1",
        decision: "confirmar",
      })
    );
    expect(mockedAnotar).toHaveBeenCalledWith(
      "biz_1",
      expect.stringContaining("propuesta acc_2")
    );
    expect(mockedTurno).not.toHaveBeenCalled();
  });

  it("ejecutada sin pregunta: abre el turno de seguimiento y devuelve lo que añada el Gestor (o nada si dice «Listo.»), con su propuesta si la hay", async () => {
    mockedPendiente.mockResolvedValueOnce({ tipo: "crear_servicios" } as never);
    mockedDecidir.mockResolvedValue({
      estado: "ejecutada",
      mensaje: "Hecho: servicios creados.",
    });
    mockedTurno.mockResolvedValueOnce({
      estado: "ok",
      respuesta: "¿Quién trabaja contigo? Si confirmas, apunto a Laura.",
      motivoDeFallo: null,
      accionId: "acc_3",
      turnos: 5,
    });
    mockedPendiente.mockResolvedValueOnce({
      id: "acc_3",
      tipo: "crear_profesionales",
      resumen: "Apunto a Laura.",
      expiresAt: new Date("2026-09-22T08:00:00Z"),
    } as never);
    const r = await decidirEnElPanel(DECISION);
    expect(r).toMatchObject({
      ok: true,
      estado: "ejecutada",
      seguimiento: "¿Quién trabaja contigo? Si confirmas, apunto a Laura.",
      propuesta: {
        id: "acc_3",
        botones: { confirmar: "Confirmar", cancelar: "Cancelar" },
      },
    });

    mockedPendiente.mockResolvedValueOnce({ tipo: "crear_servicios" } as never);
    mockedTurno.mockResolvedValueOnce({
      estado: "ok",
      respuesta: "Listo.",
      motivoDeFallo: null,
      accionId: null,
      turnos: 6,
    });
    expect(await decidirEnElPanel(DECISION)).toMatchObject({
      seguimiento: null,
      propuesta: null,
    });
  });

  it("«No» a la pregunta de avisar responde el texto propio, sin turno; caducada / ya decidida / no encontrada devuelven ok:false", async () => {
    mockedPendiente.mockResolvedValue({ tipo: "avisar_cliente" } as never);
    mockedDecidir.mockResolvedValueOnce({ estado: "rechazada" });
    expect(
      await decidirEnElPanel({ ...DECISION, decision: "cancelar" })
    ).toEqual({
      ok: true,
      estado: "rechazada",
      mensaje: mensajes.avisoAlClienteDescartado(),
      propuesta: null,
      seguimiento: null,
    });
    expect(mockedTurno).not.toHaveBeenCalled();

    mockedDecidir.mockResolvedValueOnce({ estado: "caducada" });
    expect(await decidirEnElPanel(DECISION)).toEqual({
      ok: false,
      motivo: "caducada",
      mensaje: mensajes.accionCaducada(),
    });
    mockedDecidir.mockResolvedValueOnce({ estado: "ya_decidida" });
    expect(await decidirEnElPanel(DECISION)).toMatchObject({
      ok: false,
      motivo: "ya_decidida",
    });
    mockedDecidir.mockResolvedValueOnce({ estado: "no_encontrada" });
    expect(await decidirEnElPanel(DECISION)).toMatchObject({
      ok: false,
      motivo: "no_encontrada",
    });
  });
});
