import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { reclamarEnvio } from "../../../src/lib/messageIdempotency.js";
import { getRedis } from "../../../src/lib/redis.js";
import { bajaVigente } from "../../../src/modules/whatsapp/bajas.js";
import {
  enviarBotones,
  enviarPlantilla,
  resolverPlantilla,
  ventanaAbierta,
} from "../../../src/modules/whatsapp/service.js";
import {
  avisarCancelacion,
  avisarCitaPendiente,
  avisarNuevaReserva,
  avisarRecado,
  describirServicio,
  formatearCita,
  formatearCitaCorta,
  idDeBoton,
  limitesDelDia,
  motivoDeFallo,
  preferenciasDeAvisos,
  textoAgendaDelDia,
} from "../../../src/modules/whatsapp/avisosNegocio.js";
import * as mensajes from "../../../src/modules/whatsapp/mensajes.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    sentMessage: { updateMany: vi.fn() },
    lead: { update: vi.fn() },
    booking: { findMany: vi.fn() },
    service: { findMany: vi.fn() },
  },
}));
vi.mock("../../../src/lib/messageIdempotency.js", () => ({
  reclamarEnvio: vi.fn(),
}));
vi.mock("../../../src/lib/redis.js", () => ({
  getRedis: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/bajas.js", () => ({
  bajaVigente: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/service.js", () => ({
  enviarBotones: vi.fn(),
  enviarPlantilla: vi.fn(),
  resolverPlantilla: vi.fn(),
  ventanaAbierta: vi.fn(),
}));

const mockedBizFindUnique = vi.mocked(prisma.business.findUnique);
const mockedSentUpdateMany = vi.mocked(prisma.sentMessage.updateMany);
const mockedLeadUpdate = vi.mocked(prisma.lead.update);
const mockedBookingFindMany = vi.mocked(prisma.booking.findMany);
const mockedServiceFindMany = vi.mocked(prisma.service.findMany);
const mockedReclamar = vi.mocked(reclamarEnvio);
const mockedRedis = vi.mocked(getRedis);
const mockedBaja = vi.mocked(bajaVigente);
const mockedBotones = vi.mocked(enviarBotones);
const mockedPlantilla = vi.mocked(enviarPlantilla);
const mockedResolverPlantilla = vi.mocked(resolverPlantilla);
const mockedVentana = vi.mocked(ventanaAbierta);

const MOVIL = "+34692138456";
const CITA = new Date("2026-09-24T15:00:00Z"); // jueves 17:00 en Madrid

function negocio(overrides: Record<string, unknown> = {}) {
  return {
    id: "biz_1",
    name: "Peluquería Ana",
    active: true,
    ownerWhatsappNumber: MOVIL,
    ownerWhatsappOptInAt: new Date("2026-09-20T10:00:00Z"),
    ownerWhatsappOptOutAt: null,
    ownerWhatsappUnreachableAt: null,
    notificationPrefs: null,
    ...overrides,
  };
}

const RESERVA = {
  businessId: "biz_1",
  businessName: "Peluquería Ana",
  timezone: "Europe/Madrid",
  bookingId: "booking_1",
  clientName: "Marta",
  startDateTime: CITA,
  serviceNames: ["Corte"],
  professionalName: "Laura",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mockedBizFindUnique.mockResolvedValue(negocio() as never);
  mockedBaja.mockResolvedValue(null);
  mockedReclamar.mockResolvedValue(true);
  mockedVentana.mockResolvedValue(true);
  mockedResolverPlantilla.mockResolvedValue(null);
  mockedBotones.mockResolvedValue({
    messageId: "msg-1",
    status: "queued",
    from: "+34930453218",
  });
  mockedPlantilla.mockResolvedValue({
    messageId: "msg-2",
    status: "queued",
    from: "+34930453218",
  });
  mockedSentUpdateMany.mockResolvedValue({ count: 1 });
  mockedLeadUpdate.mockResolvedValue({} as never);
  const redis = {
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  };
  mockedRedis.mockReturnValue(redis as never);
});

describe("helpers de formato", () => {
  it("formatea la cita larga y corta en la zona del negocio", () => {
    expect(formatearCita(CITA, "Europe/Madrid")).toBe(
      "jueves 24 de septiembre a las 17:00"
    );
    expect(formatearCitaCorta(CITA, "Europe/Madrid")).toBe("jueves 17:00");
    expect(formatearCitaCorta(CITA, "Atlantic/Canary")).toBe("jueves 16:00");
  });

  it("describe el servicio con y sin profesional", () => {
    expect(describirServicio(["Corte"], "Laura")).toBe("Corte, con Laura");
    expect(describirServicio(["Corte", "Mechas"], null)).toBe("Corte y Mechas");
    expect(describirServicio([], "Laura")).toBe("con Laura");
    expect(describirServicio([], null)).toBe("cita");
  });

  it("traduce el código de fallo del calendario y lee las preferencias", () => {
    expect(motivoDeFallo("calendar_reconnect_required")).toBe(
      "la conexión con tu calendario estaba caducada"
    );
    expect(motivoDeFallo("lo que sea")).toBe("tu calendario no respondió");
    expect(preferenciasDeAvisos(null)).toEqual({});
    expect(preferenciasDeAvisos({ avisoPorReserva: false })).toEqual({
      avisoPorReserva: false,
    });
    expect(preferenciasDeAvisos(["x"] as never)).toEqual({});
    expect(idDeBoton("nueva_reserva", "b1", "vale")).toBe(
      "aviso:nueva_reserva:b1:vale"
    );
  });

  it("calcula los límites del día en la zona del negocio (hoy y mañana)", () => {
    const ahora = new Date("2026-09-20T22:30:00Z"); // 00:30 del 21 en Madrid
    const hoy = limitesDelDia("Europe/Madrid", 0, ahora);
    expect(hoy.inicio.toISOString()).toBe("2026-09-20T22:00:00.000Z");
    expect(hoy.fin.toISOString()).toBe("2026-09-21T22:00:00.000Z");
    expect(hoy.etiqueta).toBe("lunes, 21 de septiembre");
    const manana = limitesDelDia("Europe/Madrid", 1, ahora);
    expect(manana.inicio.toISOString()).toBe("2026-09-21T22:00:00.000Z");
  });
});

describe("enviarAvisoAlNegocio (vía avisarNuevaReserva)", () => {
  it("dentro de la ventana: interactivo con botones, reclamado por reserva", async () => {
    const resultado = await avisarNuevaReserva(RESERVA);

    expect(resultado).toEqual({ via: "interactivo" });
    expect(mockedReclamar).toHaveBeenCalledWith(
      "whatsapp",
      "aviso:nueva_reserva:booking_1",
      {
        businessId: "biz_1",
        audience: "owner",
        toNumber: MOVIL,
        callbackData: "aviso:nueva_reserva:booking_1",
        kind: "interactive",
      }
    );
    expect(mockedBotones).toHaveBeenCalledWith({
      audience: "owner",
      to: MOVIL,
      businessId: "biz_1",
      body: mensajes.avisoNuevaReserva({
        negocio: "Peluquería Ana",
        cliente: "Marta",
        cita: "jueves 17:00",
        servicio: "Corte, con Laura",
      }),
      buttons: [
        { id: "aviso:nueva_reserva:booking_1:vale", title: "Vale" },
        {
          id: "aviso:nueva_reserva:booking_1:agenda_hoy",
          title: "Ver agenda de hoy",
        },
      ],
      idempotencyKey: "aviso:nueva_reserva:booking_1",
      callbackData: "aviso:nueva_reserva:booking_1",
    });
    expect(mockedPlantilla).not.toHaveBeenCalled();
  });

  it("fuera de la ventana con la plantilla aprobada: plantilla por id con los parámetros nombrados", async () => {
    mockedVentana.mockResolvedValue(false);
    mockedResolverPlantilla.mockResolvedValue({
      telnyxTemplateId: "tpl-nueva",
      name: "nueva_reserva_negocio",
      language: "es",
    });

    expect(await avisarNuevaReserva(RESERVA)).toEqual({ via: "plantilla" });
    expect(mockedResolverPlantilla).toHaveBeenCalledWith({
      key: "nueva_reserva_negocio",
    });
    expect(mockedPlantilla).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: "owner",
        to: MOVIL,
        template: { id: "tpl-nueva" },
        bodyParams: {
          negocio_nombre: "Peluquería Ana",
          cliente_nombre: "Marta",
          servicio: "Corte, con Laura",
          cita: "jueves 24 de septiembre a las 17:00",
        },
        idempotencyKey: "aviso:nueva_reserva:booking_1",
      })
    );
    // La fila reclamada pasa a plantilla.
    expect(mockedSentUpdateMany).toHaveBeenCalledWith({
      where: {
        channel: "whatsapp",
        idempotencyKey: "aviso:nueva_reserva:booking_1",
      },
      data: { kind: "template" },
    });
  });

  it("fuera de la ventana y sin plantilla aprobada: nada, y la fila queda como omitida", async () => {
    mockedVentana.mockResolvedValue(false);

    const resultado = await avisarNuevaReserva(RESERVA);

    expect(resultado.via).toBe("ninguna");
    expect(resultado.motivo).toContain(
      "plantilla nueva_reserva_negocio sin aprobar"
    );
    expect(mockedSentUpdateMany).toHaveBeenCalledWith({
      where: {
        channel: "whatsapp",
        idempotencyKey: "aviso:nueva_reserva:booking_1",
      },
      data: expect.objectContaining({
        deliveryStatus: "skipped",
        errorCode: "SIN_VENTANA_NI_PLANTILLA",
      }),
    });
    expect(mockedBotones).not.toHaveBeenCalled();
    expect(mockedPlantilla).not.toHaveBeenCalled();
  });

  it("no avisa a un móvil que no está activo (sin consentimiento, con STOP, con 131026 o con baja global) ni sin móvil", async () => {
    for (const caso of [
      negocio({ ownerWhatsappOptInAt: null }),
      negocio({ ownerWhatsappOptOutAt: new Date() }),
      negocio({ ownerWhatsappUnreachableAt: new Date() }),
      negocio({ ownerWhatsappNumber: null }),
    ]) {
      mockedBizFindUnique.mockResolvedValue(caso as never);
      expect((await avisarNuevaReserva(RESERVA)).via).toBe("ninguna");
    }
    mockedBizFindUnique.mockResolvedValue(negocio() as never);
    mockedBaja.mockResolvedValue({ optedOutAt: new Date() } as never);
    expect((await avisarNuevaReserva(RESERVA)).via).toBe("ninguna");
    expect(mockedReclamar).not.toHaveBeenCalled();
    expect(mockedBotones).not.toHaveBeenCalled();
  });

  it("respeta la preferencia avisoPorReserva = false", async () => {
    mockedBizFindUnique.mockResolvedValue(
      negocio({ notificationPrefs: { avisoPorReserva: false } }) as never
    );

    expect(await avisarNuevaReserva(RESERVA)).toEqual({
      via: "ninguna",
      motivo: "aviso por reserva desactivado",
    });
    expect(mockedReclamar).not.toHaveBeenCalled();
  });

  it("un reintento del mismo recurso no avisa dos veces", async () => {
    mockedReclamar.mockResolvedValue(false);

    expect(await avisarNuevaReserva(RESERVA)).toEqual({
      via: "ninguna",
      motivo: "ya enviado",
    });
    expect(mockedBotones).not.toHaveBeenCalled();
  });

  it("si Telnyx falla, la fila queda fallida y no lanza", async () => {
    mockedBotones.mockRejectedValue(new Error("Telnyx caído"));

    const resultado = await avisarNuevaReserva(RESERVA);

    expect(resultado.via).toBe("ninguna");
    expect(resultado.motivo).toContain("Telnyx caído");
    expect(mockedSentUpdateMany).toHaveBeenCalledWith({
      where: {
        channel: "whatsapp",
        idempotencyKey: "aviso:nueva_reserva:booking_1",
      },
      data: expect.objectContaining({
        deliveryStatus: "failed",
        errorCode: "SEND_ERROR",
      }),
    });
  });
});

describe("avisarCitaPendiente", () => {
  const PENDIENTE = {
    businessId: "biz_1",
    businessName: "Peluquería Ana",
    timezone: "Europe/Madrid",
    leadId: "lead_1",
    clientName: "Juan",
    startDateTime: CITA,
    failureCode: "calendar_reconnect_required",
  };

  it("interactivo con los tres botones y anota el aviso en el lead", async () => {
    const email = vi.fn().mockResolvedValue(undefined);

    expect(await avisarCitaPendiente({ ...PENDIENTE, email })).toEqual({
      via: "interactivo",
    });
    expect(mockedBotones).toHaveBeenCalledWith(
      expect.objectContaining({
        buttons: [
          { id: "aviso:cita_pendiente:lead_1:apuntada", title: "La apunté yo" },
          { id: "aviso:cita_pendiente:lead_1:reintentar", title: "Reintentar" },
          { id: "aviso:cita_pendiente:lead_1:reconectar", title: "Reconectar" },
        ],
      })
    );
    expect(mockedBotones.mock.calls[0][0].body).toContain(
      "la conexión con tu calendario estaba caducada"
    );
    expect(email).not.toHaveBeenCalled();
    expect(mockedLeadUpdate).toHaveBeenCalledWith({
      where: { id: "lead_1" },
      data: { notifiedAt: expect.any(Date), notifiedVia: "interactivo" },
    });
  });

  it("sin WhatsApp posible cae al email y lo anota", async () => {
    mockedBizFindUnique.mockResolvedValue(
      negocio({ ownerWhatsappOptInAt: null }) as never
    );
    const email = vi.fn().mockResolvedValue(undefined);

    expect(await avisarCitaPendiente({ ...PENDIENTE, email })).toEqual({
      via: "email",
      motivo: "el móvil del dueño no está activo",
    });
    expect(email).toHaveBeenCalledTimes(1);
    expect(mockedLeadUpdate).toHaveBeenCalledWith({
      where: { id: "lead_1" },
      data: {
        notifiedAt: expect.any(Date),
        notifiedVia: "email:el móvil del dueño no está activo",
      },
    });
  });

  it("tope de cinco avisos por negocio y hora: el sexto no sale por WhatsApp", async () => {
    const redis = { incr: vi.fn().mockResolvedValue(6), expire: vi.fn() };
    mockedRedis.mockReturnValue(redis as never);

    expect(await avisarCitaPendiente(PENDIENTE)).toEqual({
      via: "ninguna",
      motivo: "tope por hora",
    });
    expect(mockedBotones).not.toHaveBeenCalled();
    expect(mockedLeadUpdate).toHaveBeenCalledWith({
      where: { id: "lead_1" },
      data: { notifiedAt: undefined, notifiedVia: "ninguna:tope por hora" },
    });
  });
});

describe("avisarCancelacion", () => {
  it("interactivo con «Vale» y el nombre del cliente o «Un cliente»", async () => {
    await avisarCancelacion({
      businessId: "biz_1",
      businessName: "Peluquería Ana",
      timezone: "Europe/Madrid",
      bookingId: "booking_1",
      clientName: null,
      startDateTime: CITA,
      serviceNames: ["Mechas"],
    });

    expect(mockedBotones).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Peluquería Ana: Un cliente canceló su cita del jueves 17:00 (Mechas). Ese hueco queda libre.",
        buttons: [
          { id: "aviso:cancelacion:booking_1:vale", title: "Vale" },
          {
            id: "aviso:cancelacion:booking_1:avisar_espera",
            title: "Avisar lista espera",
          },
        ],
        idempotencyKey: "aviso:cancelacion:booking_1",
      })
    );
  });

  it("#4 lleva los botones Vale y Avisar lista espera (≤ 20 caracteres) con ids aviso:cancelacion:<id>:vale y :avisar_espera", async () => {
    await avisarCancelacion({
      businessId: "biz_1",
      businessName: "Peluquería Ana",
      timezone: "Europe/Madrid",
      bookingId: "booking_2",
      clientName: "Laura",
      startDateTime: CITA,
      serviceNames: [],
    });

    const botones = mockedBotones.mock.calls[0][0].buttons;
    expect(botones.map((b) => b.id)).toEqual([
      "aviso:cancelacion:booking_2:vale",
      "aviso:cancelacion:booking_2:avisar_espera",
    ]);
    for (const boton of botones) {
      expect(boton.title.length).toBeLessThanOrEqual(20);
    }
    expect(botones[1].title).toBe("Avisar lista espera");
  });
});

describe("textoAgendaDelDia", () => {
  it("lista las citas del día con hora, cliente, servicios y profesional", async () => {
    mockedBookingFindMany.mockResolvedValue([
      {
        programedAt: new Date("2026-09-24T08:00:00Z"),
        clientName: "Marta",
        serviceIds: ["s1"],
        professional: { name: "Laura" },
      },
      {
        programedAt: new Date("2026-09-24T15:30:00Z"),
        clientName: null,
        serviceIds: [],
        professional: null,
      },
    ] as never);
    mockedServiceFindMany.mockResolvedValue([
      { id: "s1", name: "Corte" },
    ] as never);

    const texto = await textoAgendaDelDia(
      { id: "biz_1", name: "Peluquería Ana", timezone: "Europe/Madrid" },
      0
    );

    expect(texto.split("\n").slice(1)).toEqual([
      "10:00 · Marta · Corte · Laura",
      "17:30 · Sin nombre",
    ]);
    expect(texto.split("\n")[0]).toMatch(
      /^Peluquería Ana, hoy \(.+\): 2 citas\.$/
    );
    expect(mockedBookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          call: { businessId: "biz_1" },
          isCancelled: false,
        }),
      })
    );
  });

  it("sin citas lo dice", async () => {
    mockedBookingFindMany.mockResolvedValue([]);

    const texto = await textoAgendaDelDia(
      { id: "biz_1", name: "Peluquería Ana", timezone: "Europe/Madrid" },
      1
    );
    expect(texto).toMatch(/^Peluquería Ana, mañana \(.+\): sin citas\.$/);
  });
});

describe("avisarRecado (#2)", () => {
  it("interactivo con «Atendido» y «Recuérdamelo mañana», parámetros de la plantilla recado_negocio y anotación en el lead", async () => {
    const email = vi.fn().mockResolvedValue(undefined);

    expect(
      await avisarRecado({
        businessId: "biz_1",
        businessName: "Peluquería Ana",
        leadId: "lead_7",
        clientName: "María",
        clientPhone: "+34612345678",
        motivo: "Quiere saber si hacéis balayage.",
        quiereQueLeLlamen: true,
        email,
      })
    ).toEqual({ via: "interactivo" });
    expect(mockedBotones).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Peluquería Ana: recado de María (+34612345678). Quiere saber si hacéis balayage. Pide que le llames.",
        buttons: [
          { id: "aviso:recado:lead_7:atendido", title: "Atendido" },
          { id: "aviso:recado:lead_7:manana", title: "Recuérdamelo mañana" },
        ],
        idempotencyKey: "aviso:recado:lead_7",
      })
    );
    expect(email).not.toHaveBeenCalled();
    expect(mockedLeadUpdate).toHaveBeenCalledWith({
      where: { id: "lead_7" },
      data: { notifiedAt: expect.any(Date), notifiedVia: "interactivo" },
    });
  });

  it("fuera de la ventana usa recado_negocio con sus cuatro parámetros; un recordatorio lleva sufijo de intento", async () => {
    mockedVentana.mockResolvedValue(false);
    mockedResolverPlantilla.mockResolvedValue({
      telnyxTemplateId: "tpl-recado",
      name: "recado_negocio",
      language: "es",
    });

    await avisarRecado({
      businessId: "biz_1",
      businessName: "Peluquería Ana",
      leadId: "lead_7",
      clientName: null,
      clientPhone: null,
      motivo: "Pregunta por precios.",
      quiereQueLeLlamen: false,
      intento: 2,
    });

    expect(mockedPlantilla).toHaveBeenCalledWith(
      expect.objectContaining({
        template: { id: "tpl-recado" },
        bodyParams: {
          negocio_nombre: "Peluquería Ana",
          cliente_nombre: "Un cliente",
          cliente_telefono: "sin teléfono",
          motivo: "Pregunta por precios.",
        },
        idempotencyKey: "aviso:recado:lead_7:r2",
      })
    );
  });
});
