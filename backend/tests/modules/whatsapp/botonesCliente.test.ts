import { describe, it, expect, beforeEach, vi } from "vitest";
import type { InboundMessage } from "@prisma/client";
import { prisma } from "../../../src/lib/prisma.js";
import { reclamarEnvio } from "../../../src/lib/messageIdempotency.js";
import {
  enviarContacto,
  enviarTexto,
} from "../../../src/modules/whatsapp/service.js";
import { WhatsappOptOutError } from "../../../src/modules/whatsapp/bajas.js";
import {
  avisarAQuienEsperaba,
  cerrarAviso,
  reservaDelLeadCancelada,
  reservarDesdeListaDeEspera,
} from "../../../src/modules/whatsapp/listaDeEspera.js";
import {
  numeroDeClientes,
  programarMensajesAlCliente,
} from "../../../src/modules/whatsapp/mensajesCliente.js";
import { cancelarReserva } from "../../../src/modules/bookings/cancelacion.js";
import * as mensajes from "../../../src/modules/whatsapp/mensajes.js";
import { conversarConRecepcionista } from "../../../src/modules/whatsapp/chatCliente.js";
import {
  accionPorTituloCliente,
  botonEnClientes,
} from "../../../src/modules/whatsapp/botonesCliente.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    sentMessage: { findUnique: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    business: { findFirst: vi.fn() },
    booking: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    lead: { findFirst: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("../../../src/lib/messageIdempotency.js", () => ({
  reclamarEnvio: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/service.js", () => ({
  enviarTexto: vi.fn(),
  enviarContacto: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/listaDeEspera.js", () => ({
  avisarAQuienEsperaba: vi.fn(),
  cerrarAviso: vi.fn(),
  reservaDelLeadCancelada: vi.fn(),
  reservarDesdeListaDeEspera: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/chatCliente.js", () => ({
  conversarConRecepcionista: vi.fn(),
}));
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
      sanearNombre: actual.sanearNombre,
      TARJETA_ALHABLA_RESERVAS: actual.TARJETA_ALHABLA_RESERVAS,
      numeroDeClientes: vi.fn(),
      programarMensajesAlCliente: vi.fn(),
    };
  }
);
vi.mock("../../../src/modules/bookings/cancelacion.js", () => ({
  cancelarReserva: vi.fn(),
}));
vi.mock(
  "../../../src/modules/whatsapp/avisosNegocio.js",
  async (importActual) => {
    const actual =
      await importActual<
        typeof import("../../../src/modules/whatsapp/avisosNegocio.js")
      >();
    return {
      formatearCita: actual.formatearCita,
      avisarRecado: vi.fn().mockResolvedValue({ via: "interactivo" }),
    };
  }
);

const mockedSentFindUnique = vi.mocked(prisma.sentMessage.findUnique);
const mockedSentCount = vi.mocked(prisma.sentMessage.count);
const mockedSentUpdateMany = vi.mocked(prisma.sentMessage.updateMany);
const mockedBizFindFirst = vi.mocked(prisma.business.findFirst);
const mockedBookingFindFirst = vi.mocked(prisma.booking.findFirst);
const mockedBookingUpdateMany = vi.mocked(prisma.booking.updateMany);
const mockedBookingUpdate = vi.mocked(prisma.booking.update);
const mockedLeadFindFirst = vi.mocked(prisma.lead.findFirst);
const mockedLeadCreate = vi.mocked(prisma.lead.create);
const mockedReclamar = vi.mocked(reclamarEnvio);
const mockedEnviarTexto = vi.mocked(enviarTexto);
const mockedEnviarContacto = vi.mocked(enviarContacto);
const mockedAvisar = vi.mocked(avisarAQuienEsperaba);
const mockedCerrarAviso = vi.mocked(cerrarAviso);
const mockedReservar = vi.mocked(reservarDesdeListaDeEspera);
const mockedReservaCancelada = vi.mocked(reservaDelLeadCancelada);
const mockedNumeroDeClientes = vi.mocked(numeroDeClientes);
const mockedProgramar = vi.mocked(programarMensajesAlCliente);
const mockedCancelar = vi.mocked(cancelarReserva);

const MOVIL = "+34692138456";
const OTRO = "+34600000000";
const CLIENTES = "+34930454394";
const CITA = new Date(Date.now() + 3 * 24 * 60 * 60_000);
const PASADA = new Date(Date.now() - 60 * 60_000);
const NEGOCIO = {
  id: "biz_1",
  name: "Peluquería Ana",
  timezone: "Europe/Madrid",
  telnyxPhoneNumber: "+34930454394",
  phone: "+34930000000",
  placeId: null,
};
const TELEFONO = "+34 930 454 394";

let contador = 0;

function boton(
  title: string,
  overrides: Partial<InboundMessage> = {}
): InboundMessage {
  contador += 1;
  return {
    id: `in_${contador}`,
    providerMessageId: `pm_${contador}`,
    foreignId: null,
    eventId: "evt",
    fromNumber: MOVIL,
    toNumber: CLIENTES,
    audience: "client",
    role: "client",
    businessId: "biz_1",
    kind: "button",
    text: null,
    buttonId: title,
    buttonTitle: title,
    contextMessageId: "msg-out",
    contactName: "Miki",
    payload: { type: "button" },
    receivedAt: new Date(),
    handledAt: null,
    handler: null,
    error: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function envio(callbackData: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "sm_1",
    businessId: "biz_1",
    audience: "client",
    toNumber: MOVIL,
    callbackData,
    ...overrides,
  };
}

function reserva(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking_1",
    callId: "call_row_1",
    programedAt: CITA,
    isCancelled: false,
    clientPhone: null,
    serviceIds: [],
    call: { fromNumber: MOVIL, businessId: "biz_1" },
    professional: null,
    ...overrides,
  };
}

function cuerpo(indice = 0): string | undefined {
  return mockedEnviarTexto.mock.calls[indice]?.[0].body;
}

const cita = () => {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(CITA)
    .reduce(
      (acc, p) => ({ ...acc, [p.type]: p.value }),
      {} as Record<string, string>
    );
};
const CITA_TEXTO = (() => {
  const p = cita();
  return `${p.weekday} ${p.day} de ${p.month} a las ${p.hour}:${p.minute}`;
})();

beforeEach(() => {
  // resetAllMocks (no clearAllMocks): las colas de mockResolvedValueOnce de
  // un test que falle no deben contaminar al siguiente.
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mockedSentCount.mockResolvedValue(0);
  mockedSentUpdateMany.mockResolvedValue({ count: 1 });
  mockedReclamar.mockResolvedValue(true);
  mockedEnviarTexto.mockResolvedValue({
    messageId: "msg-resp",
    status: "queued",
    from: CLIENTES,
  });
  mockedEnviarContacto.mockResolvedValue({
    messageId: "msg-vcard",
    status: "queued",
    from: CLIENTES,
  });
  // Por defecto el chat (fase 2) no atiende: «Cambiar» responde el texto fijo.
  vi.mocked(conversarConRecepcionista).mockResolvedValue({
    atendido: false,
    motivo: "apagado",
  });
  mockedBizFindFirst.mockResolvedValue(NEGOCIO as never);
  mockedBookingFindFirst.mockResolvedValue(reserva() as never);
  mockedBookingUpdateMany.mockResolvedValue({ count: 1 });
  mockedBookingUpdate.mockResolvedValue({} as never);
  mockedNumeroDeClientes.mockResolvedValue(CLIENTES);
  mockedProgramar.mockResolvedValue({ confirmacion: "programada" });
  mockedReservaCancelada.mockResolvedValue(false);
  mockedCancelar.mockResolvedValue({ resultado: "cancelada" });
});

describe("reconocimiento y pertenencia", () => {
  it("sin context.id no actúa y responde botonSinContexto una vez al día", async () => {
    expect(
      await botonEnClientes(boton("Cancelar", { contextMessageId: null }))
    ).toEqual({ handler: "cliente:boton:sin-contexto" });
    expect(cuerpo()).toBe(mensajes.botonSinContexto());
    expect(mockedSentFindUnique).not.toHaveBeenCalled();
    expect(mockedCancelar).not.toHaveBeenCalled();

    mockedSentCount.mockImplementation(async ({ where }) =>
      (where as { callbackData?: string }).callbackData ? 1 : 0
    );
    expect(
      await botonEnClientes(boton("Cancelar", { contextMessageId: null }))
    ).toEqual({ handler: "cliente:boton:sin-contexto:silenciado" });
  });

  it("context.id sin fila ⇒ cliente:boton:sin-fila con warn; fila sin callbackData cliente: ⇒ sin-callback", async () => {
    mockedSentFindUnique.mockResolvedValue(null);
    expect(await botonEnClientes(boton("Cancelar"))).toEqual({
      handler: "cliente:boton:sin-fila",
    });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("msg-out")
    );

    mockedSentFindUnique.mockResolvedValue(
      envio("aviso:cancelacion:b1") as never
    );
    expect(await botonEnClientes(boton("Vale"))).toEqual({
      handler: "cliente:boton:sin-callback",
    });
    mockedSentFindUnique.mockResolvedValue(
      envio("", { callbackData: null }) as never
    );
    expect(await botonEnClientes(boton("Vale"))).toEqual({
      handler: "cliente:boton:sin-callback",
    });
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
  });

  it("envío a otro móvil o de audiencia owner ⇒ remitente-distinto, sin respuesta", async () => {
    mockedSentFindUnique.mockResolvedValue(
      envio("cliente:recordatorio:booking_1", { toNumber: OTRO }) as never
    );
    expect(await botonEnClientes(boton("Cancelar"))).toEqual({
      handler: "cliente:boton:remitente-distinto",
    });
    mockedSentFindUnique.mockResolvedValue(
      envio("cliente:recordatorio:booking_1", { audience: "owner" }) as never
    );
    expect(await botonEnClientes(boton("Cancelar"))).toEqual({
      handler: "cliente:boton:remitente-distinto",
    });
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
    expect(mockedCancelar).not.toHaveBeenCalled();
  });

  it("id cliente:… con recurso distinto del callbackData ⇒ recurso-distinto; acción no permitida para el tipo ⇒ accion-no-permitida", async () => {
    mockedSentFindUnique.mockResolvedValue(
      envio("cliente:recordatorio:booking_1") as never
    );
    expect(
      await botonEnClientes(
        boton("Cancelar", {
          buttonId: "cliente:recordatorio:booking_OTRA:cancelar",
        })
      )
    ).toEqual({ handler: "cliente:boton:recurso-distinto" });

    // «Guardar contacto» sobre un recordatorio no existe.
    expect(await botonEnClientes(boton("Guardar contacto"))).toEqual({
      handler: "cliente:boton:accion-no-permitida",
    });
    // Un botón del dueño en el número de clientes tampoco.
    expect(await botonEnClientes(boton("Ver agenda de hoy"))).toEqual({
      handler: "cliente:boton:titulo-desconocido",
    });
    expect(mockedCancelar).not.toHaveBeenCalled();
  });

  it("reserva de otro negocio ⇒ recurso-ajeno; reserva cuyo teléfono no es el remitente ⇒ no-titular; negocio inactivo ⇒ negocio-inactivo", async () => {
    mockedSentFindUnique.mockResolvedValue(
      envio("cliente:recordatorio:booking_1") as never
    );
    mockedBookingFindFirst.mockResolvedValue(null);
    expect(await botonEnClientes(boton("Cancelar"))).toEqual({
      handler: "cliente:boton:recurso-ajeno",
    });
    expect(mockedBookingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "booking_1", call: { businessId: "biz_1" } },
      })
    );

    mockedBookingFindFirst.mockResolvedValue(
      reserva({ clientPhone: OTRO }) as never
    );
    expect(await botonEnClientes(boton("Cancelar"))).toEqual({
      handler: "cliente:boton:no-titular",
    });

    mockedBizFindFirst.mockResolvedValue(null);
    expect(await botonEnClientes(boton("Cancelar"))).toEqual({
      handler: "cliente:boton:negocio-inactivo",
    });
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
    expect(mockedCancelar).not.toHaveBeenCalled();
  });

  it("títulos con acentos y coma (SÍ, RESÉRVALA / Confirmo / Ya no) se reconocen", () => {
    expect(accionPorTituloCliente("SÍ, RESÉRVALA")).toBe("reservar");
    expect(accionPorTituloCliente("Sí, resérvala")).toBe("reservar");
    expect(accionPorTituloCliente("confirmo!")).toBe("confirmo");
    expect(accionPorTituloCliente("Ya  no")).toBe("ya_no");
    expect(accionPorTituloCliente("Guardar contacto")).toBe("guardar_contacto");
    expect(accionPorTituloCliente("No me va bien.")).toBe("no_me_va_bien");
    expect(accionPorTituloCliente("Vale")).toBe("vale");
    expect(accionPorTituloCliente("Cambiar")).toBe("cambiar");
    expect(accionPorTituloCliente("Lo que sea")).toBeNull();
  });
});

describe("Guardar contacto", () => {
  beforeEach(() => {
    mockedSentFindUnique.mockResolvedValue(
      envio("cliente:confirmacion:booking_1") as never
    );
  });

  it("envía la vCard de Alhabla Reservas una vez por reserva (contacto-<id>); el segundo toque es :repetido sin respuesta; con baja ⇒ :baja; con error de Telnyx la fila queda failed y responde contactoComoTexto", async () => {
    expect(await botonEnClientes(boton("Guardar contacto"))).toEqual({
      handler: "cliente:guardar_contacto",
    });
    expect(mockedReclamar).toHaveBeenCalledWith(
      "whatsapp",
      "contacto-booking_1",
      {
        businessId: "biz_1",
        audience: "client",
        toNumber: MOVIL,
        callbackData: "cliente:contacto:booking_1",
        kind: "contacts",
      },
      { reintentarFallidos: true }
    );
    expect(mockedEnviarContacto).toHaveBeenCalledWith({
      audience: "client",
      to: MOVIL,
      businessId: "biz_1",
      contact: expect.objectContaining({
        formattedName: "Alhabla Reservas",
        phones: [{ number: CLIENTES, type: "WORK" }],
      }),
      idempotencyKey: "contacto-booking_1",
      callbackData: "cliente:contacto:booking_1",
    });
    expect(mockedEnviarTexto).not.toHaveBeenCalled();

    mockedReclamar.mockResolvedValueOnce(false);
    expect(await botonEnClientes(boton("Guardar contacto"))).toEqual({
      handler: "cliente:guardar_contacto:repetido",
    });
    expect(mockedEnviarContacto).toHaveBeenCalledTimes(1);

    mockedEnviarContacto.mockRejectedValueOnce(
      new WhatsappOptOutError("client", MOVIL)
    );
    expect(await botonEnClientes(boton("Guardar contacto"))).toEqual({
      handler: "cliente:guardar_contacto:baja",
    });
    expect(mockedEnviarTexto).not.toHaveBeenCalled();

    mockedEnviarContacto.mockRejectedValueOnce(new Error("Telnyx 502"));
    expect(await botonEnClientes(boton("Guardar contacto"))).toEqual({
      handler: "cliente:guardar_contacto:fallido",
    });
    expect(mockedSentUpdateMany).toHaveBeenCalledWith({
      where: {
        channel: "whatsapp",
        idempotencyKey: "contacto-booking_1",
        providerMessageId: null,
      },
      data: {
        deliveryStatus: "failed",
        errorCode: "SEND_ERROR",
        errorDetail: "Telnyx 502",
      },
    });
    expect(cuerpo()).toBe(mensajes.contactoComoTexto({ numero: CLIENTES }));

    // Tarde (cita cancelada): la vCard sale igual.
    mockedBookingFindFirst.mockResolvedValue(
      reserva({ isCancelled: true }) as never
    );
    expect(await botonEnClientes(boton("Guardar contacto"))).toEqual({
      handler: "cliente:guardar_contacto",
    });
  });
});

describe("Confirmo / Cancelar / Cambiar", () => {
  beforeEach(() => {
    mockedSentFindUnique.mockResolvedValue(
      envio("cliente:recordatorio:booking_1") as never
    );
  });

  it("Confirmo pone confirmedByClientAt y responde; repetido responde citaYaConfirmada sin reescribir; sobre cancelada citaYaCancelada; sobre pasada citaYaPasada", async () => {
    expect(await botonEnClientes(boton("Confirmo"))).toEqual({
      handler: "cliente:confirmo",
    });
    expect(mockedBookingUpdateMany).toHaveBeenCalledWith({
      where: { id: "booking_1", isCancelled: false, confirmedByClientAt: null },
      data: { confirmedByClientAt: expect.any(Date) },
    });
    expect(cuerpo(0)).toBe(
      mensajes.citaConfirmadaPorCliente({
        negocio: "Peluquería Ana",
        cita: CITA_TEXTO,
      })
    );

    mockedBookingUpdateMany.mockResolvedValueOnce({ count: 0 });
    expect(await botonEnClientes(boton("Confirmo"))).toEqual({
      handler: "cliente:confirmo:repetido",
    });
    expect(cuerpo(1)).toBe(
      mensajes.citaYaConfirmada({ negocio: "Peluquería Ana", cita: CITA_TEXTO })
    );

    mockedBookingFindFirst.mockResolvedValueOnce(
      reserva({ isCancelled: true }) as never
    );
    mockedBookingFindFirst.mockResolvedValueOnce(null); // otraCitaActiva
    expect(await botonEnClientes(boton("Confirmo"))).toEqual({
      handler: "cliente:confirmo:cancelada",
    });
    expect(cuerpo(2)).toBe(
      mensajes.citaYaCancelada({
        negocio: "Peluquería Ana",
        telefono: TELEFONO,
        otraCita: null,
      })
    );

    mockedBookingFindFirst.mockResolvedValueOnce(
      reserva({ programedAt: PASADA }) as never
    );
    mockedBookingFindFirst.mockResolvedValueOnce(null);
    expect(await botonEnClientes(boton("Confirmo"))).toEqual({
      handler: "cliente:confirmo:pasada",
    });
    expect(cuerpo(3)).toBe(
      mensajes.citaYaPasada({
        negocio: "Peluquería Ana",
        telefono: TELEFONO,
        otraCita: null,
      })
    );
    // Solo la primera escribió.
    expect(mockedBookingUpdateMany).toHaveBeenCalledTimes(2);
  });

  it("sobre una cita cancelada con otra cita activa futura del mismo teléfono en el negocio, Confirmo/Cancelar/Cambiar responden nombrando la cita nueva y no la tocan", async () => {
    const nueva = new Date(CITA.getTime() + 24 * 60 * 60_000);
    // Cancelar delega igualmente (es idempotente) y recibe ya_cancelada.
    mockedCancelar.mockResolvedValue({ resultado: "ya_cancelada" });
    for (const titulo of ["Confirmo", "Cancelar", "Cambiar"]) {
      mockedBookingFindFirst.mockResolvedValueOnce(
        reserva({ isCancelled: true }) as never
      );
      mockedBookingFindFirst.mockResolvedValueOnce({
        programedAt: nueva,
      } as never);
      await botonEnClientes(boton(titulo));
    }
    expect(mockedCancelar).toHaveBeenCalledTimes(1);
    expect(mockedEnviarTexto).toHaveBeenCalledTimes(3);
    for (const llamada of mockedEnviarTexto.mock.calls) {
      expect(llamada[0].body).toContain("La cita que tienes ahora es el ");
      expect(llamada[0].body).toContain("pulsa Cancelar en su recordatorio");
    }
    // La búsqueda de la otra cita es de ESTE negocio y ESTE teléfono.
    expect(mockedBookingFindFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: "booking_1" },
          isCancelled: false,
          call: { businessId: "biz_1" },
          OR: [
            { clientPhone: MOVIL },
            { clientPhone: null, call: { fromNumber: MOVIL } },
          ],
        }),
      })
    );
    expect(mockedBookingUpdateMany).not.toHaveBeenCalled();
  });

  it("Cancelar llama a cancelarReserva con client_button y responde citaCanceladaPorCliente; ya_cancelada ⇒ citaYaCancelada; pasada no cancela", async () => {
    const mensaje = boton("Cancelar");
    expect(await botonEnClientes(mensaje)).toEqual({
      handler: "cliente:cancelar",
    });
    expect(mockedCancelar).toHaveBeenCalledWith({
      bookingId: "booking_1",
      businessId: "biz_1",
      cancelledBy: "client_button",
      etiqueta: `boton cliente ${mensaje.id}`,
      inboundMessageId: mensaje.id,
    });
    expect(cuerpo(0)).toBe(
      mensajes.citaCanceladaPorCliente({
        negocio: "Peluquería Ana",
        cita: CITA_TEXTO,
        telefono: TELEFONO,
      })
    );

    mockedCancelar.mockResolvedValueOnce({ resultado: "ya_cancelada" });
    mockedBookingFindFirst.mockResolvedValueOnce(reserva() as never);
    mockedBookingFindFirst.mockResolvedValueOnce(null);
    expect(await botonEnClientes(boton("Cancelar"))).toEqual({
      handler: "cliente:cancelar:ya-cancelada",
    });
    expect(cuerpo(1)).toBe(
      mensajes.citaYaCancelada({
        negocio: "Peluquería Ana",
        telefono: TELEFONO,
        otraCita: null,
      })
    );

    mockedBookingFindFirst.mockResolvedValueOnce(
      reserva({ programedAt: PASADA }) as never
    );
    mockedBookingFindFirst.mockResolvedValueOnce(null);
    expect(await botonEnClientes(boton("Cancelar"))).toEqual({
      handler: "cliente:cancelar:pasada",
    });
    expect(mockedCancelar).toHaveBeenCalledTimes(2);
  });

  it("Cambiar abre el chat con la recepcionista con la cita identificada cuando el chat atiende", async () => {
    vi.mocked(conversarConRecepcionista).mockResolvedValueOnce({
      atendido: true,
      resultado: { handler: "cliente:cambiar:chat" },
    });
    expect(await botonEnClientes(boton("Cambiar"))).toEqual({
      handler: "cliente:cambiar:chat",
    });
    expect(conversarConRecepcionista).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        etiqueta: "cliente:cambiar:chat",
        texto: expect.stringContaining(
          `recordatorio de mi cita del ${CITA_TEXTO}`
        ),
      })
    );
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
    expect(mockedCancelar).not.toHaveBeenCalled();
  });

  it("Cambiar responde comoCambiarCita con el teléfono de contacto y no toca la reserva", async () => {
    vi.mocked(conversarConRecepcionista).mockResolvedValueOnce({
      atendido: false,
      motivo: "apagado",
    });
    expect(await botonEnClientes(boton("Cambiar"))).toEqual({
      handler: "cliente:cambiar",
    });
    expect(cuerpo()).toBe(
      mensajes.comoCambiarCita({
        negocio: "Peluquería Ana",
        cita: CITA_TEXTO,
        telefono: TELEFONO,
      })
    );
    expect(cuerpo()).toContain(TELEFONO);
    expect(mockedCancelar).not.toHaveBeenCalled();
    expect(mockedBookingUpdateMany).not.toHaveBeenCalled();
    expect(mockedBookingUpdate).not.toHaveBeenCalled();
  });
});

describe("Sí, resérvala / Ya no", () => {
  const LEAD = {
    id: "lead_1",
    resolvedAt: null,
    data: {
      clientPhone: MOVIL,
      startDateTime: CITA.toISOString(),
      durationMinutes: 30,
      serviceIds: [],
    },
  };

  beforeEach(() => {
    mockedSentFindUnique.mockResolvedValue(
      envio("cliente:hueco:lead_1") as never
    );
    mockedLeadFindFirst.mockResolvedValue(LEAD as never);
  });

  it("Sí, resérvala responde según cada estado de reservarDesdeListaDeEspera (reservada, ya_reservada, ocupado, fuera_de_plazo, pasada, cerrado, sin_calendario, calendario_caido, lock, error)", async () => {
    const esperado: Array<[string, string, string]> = [
      [
        "ya_reservada",
        "cliente:reservar:ya-reservada",
        mensajes.huecoYaReservado({
          negocio: "Peluquería Ana",
          cita: CITA_TEXTO,
        }),
      ],
      [
        "ocupado",
        "cliente:reservar:ocupado",
        mensajes.huecoYaOcupado({
          negocio: "Peluquería Ana",
          telefono: TELEFONO,
        }),
      ],
      [
        "fuera_de_plazo",
        "cliente:reservar:fuera-de-plazo",
        mensajes.huecoFueraDePlazo({
          negocio: "Peluquería Ana",
          telefono: TELEFONO,
        }),
      ],
      [
        "pasada",
        "cliente:reservar:pasada",
        mensajes.huecoYaPasado({
          negocio: "Peluquería Ana",
          telefono: TELEFONO,
        }),
      ],
      [
        "cerrado",
        "cliente:reservar:cerrado",
        mensajes.huecoCerrado({
          negocio: "Peluquería Ana",
          telefono: TELEFONO,
        }),
      ],
      [
        "sin_calendario",
        "cliente:reservar:sin_calendario",
        mensajes.noPudeReservarAhora({
          negocio: "Peluquería Ana",
          telefono: TELEFONO,
        }),
      ],
      [
        "calendario_caido",
        "cliente:reservar:calendario_caido",
        mensajes.noPudeReservarAhora({
          negocio: "Peluquería Ana",
          telefono: TELEFONO,
        }),
      ],
      [
        "lock",
        "cliente:reservar:lock",
        mensajes.noPudeReservarAhora({
          negocio: "Peluquería Ana",
          telefono: TELEFONO,
        }),
      ],
      [
        "error",
        "cliente:reservar:error",
        mensajes.noPudeReservarAhora({
          negocio: "Peluquería Ana",
          telefono: TELEFONO,
        }),
      ],
    ];
    let i = 0;
    for (const [estado, handler, texto] of esperado) {
      mockedReservar.mockResolvedValueOnce({ estado } as never);
      expect(await botonEnClientes(boton("Sí, resérvala"))).toEqual({
        handler,
      });
      expect(cuerpo(i)).toBe(texto);
      i += 1;
    }

    mockedReservar.mockResolvedValueOnce({
      estado: "reservada",
      bookingId: "booking_9",
      startDateTime: CITA,
      servicio: "corte con Laura",
    });
    const mensaje = boton("Sí, resérvala");
    expect(await botonEnClientes(mensaje)).toEqual({
      handler: "cliente:reservar",
    });
    expect(mockedReservar).toHaveBeenLastCalledWith({
      leadId: "lead_1",
      businessId: "biz_1",
      from: MOVIL,
      inboundMessageId: mensaje.id,
      contactName: "Miki",
    });
    expect(cuerpo(i)).toBe(
      mensajes.huecoReservado({
        negocio: "Peluquería Ana",
        servicio: "corte con Laura",
        cita: CITA_TEXTO,
        telefono: TELEFONO,
      })
    );
    // El lead se busca en ESTE negocio.
    expect(mockedLeadFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "lead_1",
          type: "availability_watch",
          call: { businessId: "biz_1" },
        },
      })
    );
  });

  it("Sí, resérvala reservada: la respuesta salta el techo; si sale, escribe clientNotifiedAt; si falla por Telnyx, deja clientNotifiedAt null y encola programarMensajesAlCliente con confirmacion: true; con baja no encola nada", async () => {
    mockedReservar.mockResolvedValue({
      estado: "reservada",
      bookingId: "booking_9",
      startDateTime: CITA,
      servicio: "corte",
    });
    // 20 respuestas en la última hora: el techo silenciaría cualquier otra.
    mockedSentCount.mockImplementation(async ({ where }) =>
      (where as { callbackData?: string }).callbackData ? 0 : 20
    );
    expect(await botonEnClientes(boton("Sí, resérvala"))).toEqual({
      handler: "cliente:reservar",
    });
    expect(mockedEnviarTexto).toHaveBeenCalledTimes(1);
    expect(mockedBookingUpdate).toHaveBeenCalledWith({
      where: { id: "booking_9" },
      data: { clientNotifiedAt: expect.any(Date) },
    });
    expect(mockedProgramar).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mockedSentCount.mockResolvedValue(0);
    mockedReclamar.mockResolvedValue(true);
    mockedEnviarTexto.mockRejectedValue(new Error("Telnyx 500"));
    const r = await botonEnClientes(boton("Sí, resérvala"));
    expect(r.handler).toBe("cliente:reservar");
    expect(r.error).toBe("Telnyx 500");
    expect(mockedBookingUpdate).not.toHaveBeenCalled();
    expect(mockedProgramar).toHaveBeenCalledWith({
      bookingId: "booking_9",
      etiqueta: expect.stringContaining("boton cliente"),
      confirmacion: true,
    });

    vi.clearAllMocks();
    mockedSentCount.mockResolvedValue(0);
    mockedReclamar.mockResolvedValue(true);
    mockedEnviarTexto.mockRejectedValue(
      new WhatsappOptOutError("client", MOVIL)
    );
    expect(await botonEnClientes(boton("Sí, resérvala"))).toEqual({
      handler: "cliente:reservar:baja",
    });
    expect(mockedBookingUpdate).not.toHaveBeenCalled();
    expect(mockedProgramar).not.toHaveBeenCalled();
  });

  it("Ya no cierra el aviso (también uno sin_respuesta), responde huecoRechazado y llama a avisarAQuienEsperaba con origen renuncia; repetido ⇒ :repetido; ya reservada ⇒ huecoYaReservadoNoSeAnula", async () => {
    const hueco = {
      inicioMs: CITA.getTime(),
      finMs: CITA.getTime() + 30 * 60_000,
    };
    mockedCerrarAviso.mockResolvedValue({ count: 1, hueco });
    mockedAvisar.mockResolvedValue({ resultado: "nadie" });
    const mensaje = boton("Ya no");
    expect(await botonEnClientes(mensaje)).toEqual({
      handler: "cliente:ya_no",
    });
    expect(mockedCerrarAviso).toHaveBeenCalledWith({
      leadId: "lead_1",
      resolvedBy: "ya_no",
      inboundMessageId: mensaje.id,
    });
    expect(cuerpo(0)).toBe(
      mensajes.huecoRechazado({ negocio: "Peluquería Ana" })
    );
    expect(mockedAvisar).toHaveBeenCalledWith({
      businessId: "biz_1",
      hueco,
      origen: "renuncia",
      etiqueta: `renuncia ${mensaje.id}`,
    });

    // sin_respuesta: cerrarAviso lo admite (count 1), mismo camino.
    mockedLeadFindFirst.mockResolvedValueOnce({
      ...LEAD,
      resolvedAt: new Date(),
      data: { ...LEAD.data, resolvedBy: "sin_respuesta" },
    } as never);
    expect(await botonEnClientes(boton("Ya no"))).toEqual({
      handler: "cliente:ya_no",
    });

    mockedCerrarAviso.mockResolvedValueOnce({ count: 0, hueco });
    expect(await botonEnClientes(boton("Ya no"))).toEqual({
      handler: "cliente:ya_no:repetido",
    });
    expect(mockedEnviarTexto).toHaveBeenCalledTimes(2);

    mockedLeadFindFirst.mockResolvedValueOnce({
      ...LEAD,
      resolvedAt: new Date(),
      data: { ...LEAD.data, resolvedBy: "reservado", bookingId: "booking_9" },
    } as never);
    expect(await botonEnClientes(boton("Ya no"))).toEqual({
      handler: "cliente:ya_no:ya-reservada",
    });
    expect(cuerpo(2)).toBe(
      mensajes.huecoYaReservadoNoSeAnula({
        negocio: "Peluquería Ana",
        cita: CITA_TEXTO,
      })
    );
    expect(mockedCerrarAviso).toHaveBeenCalledTimes(3);
  });

  it("Ya no sobre un lead reservado cuya reserva ya se canceló responde huecoRechazado (no «pulsa Cancelar en el recordatorio») sin cerrar nada", async () => {
    mockedLeadFindFirst.mockResolvedValue({
      ...LEAD,
      resolvedAt: new Date(),
      data: { ...LEAD.data, resolvedBy: "reservado", bookingId: "booking_9" },
    } as never);
    mockedReservaCancelada.mockResolvedValue(true);

    expect(await botonEnClientes(boton("Ya no"))).toEqual({
      handler: "cliente:ya_no:reserva-cancelada",
    });
    expect(mockedReservaCancelada).toHaveBeenCalledWith(
      expect.objectContaining({
        resolvedBy: "reservado",
        bookingId: "booking_9",
      }),
      "biz_1"
    );
    expect(cuerpo(0)).toBe(
      mensajes.huecoRechazado({ negocio: "Peluquería Ana" })
    );
    expect(cuerpo(0)).not.toContain("recordatorio");
    expect(mockedCerrarAviso).not.toHaveBeenCalled();
    expect(mockedAvisar).not.toHaveBeenCalled();
  });
});

describe("Vale / No me va bien (fase 2)", () => {
  it("Vale de cambio/cancelación no responde; No me va bien crea el Lead client_change_rejected una sola vez (callId = Call.id) y responde cambioNoMeVaBien", async () => {
    mockedSentFindUnique.mockResolvedValue(
      envio("cliente:cambio:booking_1") as never
    );
    expect(await botonEnClientes(boton("Vale"))).toEqual({
      handler: "cliente:vale",
    });
    mockedSentFindUnique.mockResolvedValue(
      envio("cliente:cancelacion:booking_1") as never
    );
    expect(await botonEnClientes(boton("Vale"))).toEqual({
      handler: "cliente:vale",
    });
    expect(mockedEnviarTexto).not.toHaveBeenCalled();
    // «No me va bien» no cabe en una cancelación.
    expect(await botonEnClientes(boton("No me va bien"))).toEqual({
      handler: "cliente:boton:accion-no-permitida",
    });

    mockedSentFindUnique.mockResolvedValue(
      envio("cliente:cambio:booking_1") as never
    );
    mockedLeadFindFirst.mockResolvedValueOnce(null);
    mockedLeadCreate.mockResolvedValue({ id: "lead_x" } as never);
    const { avisarRecado } =
      await import("../../../src/modules/whatsapp/avisosNegocio.js");
    vi.mocked(avisarRecado).mockResolvedValue({ via: "interactivo" });
    const mensaje = boton("No me va bien");
    expect(await botonEnClientes(mensaje)).toEqual({
      handler: "cliente:no_me_va_bien",
    });
    expect(mockedLeadCreate).toHaveBeenCalledWith({
      data: {
        callId: "call_row_1",
        type: "client_change_rejected",
        isLead: false,
        data: {
          bookingId: "booking_1",
          clientPhone: MOVIL,
          inboundMessageId: mensaje.id,
        },
      },
      select: { id: true },
    });
    expect(cuerpo(0)).toBe(
      mensajes.cambioNoMeVaBien({
        negocio: "Peluquería Ana",
        telefono: TELEFONO,
      })
    );
    // El dueño se entera como de un recado, con el teléfono del cliente.
    expect(vi.mocked(avisarRecado)).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        leadId: "lead_x",
        clientPhone: MOVIL,
        quiereQueLeLlamen: true,
      })
    );

    mockedLeadFindFirst.mockResolvedValueOnce({ id: "lead_x" } as never);
    await botonEnClientes(boton("No me va bien"));
    expect(mockedLeadCreate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(avisarRecado)).toHaveBeenCalledTimes(1);
  });
});

describe("techo, STOP y nombre del negocio", () => {
  it("las acciones se ejecutan aunque la respuesta se silencie por el techo o se suprima por STOP", async () => {
    mockedSentFindUnique.mockResolvedValue(
      envio("cliente:recordatorio:booking_1") as never
    );
    mockedSentCount.mockImplementation(async ({ where }) =>
      (where as { callbackData?: string }).callbackData ? 0 : 20
    );
    expect(await botonEnClientes(boton("Confirmo"))).toEqual({
      handler: "cliente:confirmo:silenciado",
    });
    expect(mockedBookingUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockedEnviarTexto).not.toHaveBeenCalled();

    mockedSentCount.mockResolvedValue(0);
    mockedEnviarTexto.mockRejectedValue(
      new WhatsappOptOutError("client", MOVIL)
    );
    expect(await botonEnClientes(boton("Cancelar"))).toEqual({
      handler: "cliente:cancelar:baja",
    });
    expect(mockedCancelar).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: "booking_1",
        cancelledBy: "client_button",
      })
    );
  });

  it("el nombre del negocio en las respuestas sale de nombreParaCliente", async () => {
    mockedSentFindUnique.mockResolvedValue(
      envio("cliente:recordatorio:booking_1") as never
    );
    mockedBizFindFirst.mockResolvedValue({
      ...NEGOCIO,
      name: "Negocio de ana@correo.es",
    } as never);

    await botonEnClientes(boton("Cambiar"));

    expect(cuerpo()).toContain("llama a el negocio al +34 930 454 394");
    expect(cuerpo()).not.toContain("tu negocio");
    expect(cuerpo()).not.toContain("@");
  });
});
