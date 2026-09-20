import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { resetDb } from "../helpers/db.js";
import {
  createTestBusiness,
  createTestProfessional,
  nextOpenSlot,
} from "../helpers/fixtures.js";
import { calendarService } from "../../../src/modules/calendar/service.js";
import { whatsappAdapter } from "../../../src/adapters/whatsapp/WhatsAppAdapter.js";
import { telnyxAiAdapter } from "../../../src/adapters/telnyx/TelnyxAiAdapter.js";
import { checkAvailability } from "../../../src/lib/availability.js";
import {
  decidirPropuesta,
  registrarPropuesta,
} from "../../../src/modules/gestor/acciones.js";
import {
  decidirEnElPanel,
  historialDelGestor,
  preguntarAlGestor,
} from "../../../src/modules/gestor/panel.js";

// Fase 2 contra Postgres/Redis reales: el registro de propuestas (24 h,
// reclamo atómico, lock por negocio), las acciones de agenda del Gestor
// (Call sintética + Booking en transacción, mover, cancelar como owner_chat,
// ausencias que la disponibilidad real respeta) y el chat del panel sobre
// la misma conversación. El calendario, WhatsApp y el LLM se sustituyen.
vi.mock("../../../src/modules/calendar/service.js", () => ({
  calendarService: {
    bookAppointment: vi.fn(),
    getBusyIntervals: vi.fn(),
    cancelAppointment: vi.fn(),
  },
}));
vi.mock("../../../src/adapters/whatsapp/WhatsAppAdapter.js", () => ({
  whatsappAdapter: {
    isConfigured: vi.fn(() => true),
    sendTemplate: vi.fn(),
    sendText: vi.fn(),
    sendInteractiveButtons: vi.fn(),
    sendContacts: vi.fn(),
    getConversationWindow: vi.fn(),
    listTemplates: vi.fn(),
  },
}));
vi.mock("../../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: {
    createConversation: vi.fn(),
    updateConversation: vi.fn(),
    addConversationMessage: vi.fn(),
    chatWithAssistant: vi.fn(),
    listConversationMessages: vi.fn(),
  },
}));
// El horario se guarda de verdad; la sincronización con los orquestadores
// de voz no es lo que se prueba aquí.
vi.mock("../../../src/modules/businesses/horario.js", async () => {
  const { prisma } = await import("../../../src/lib/prisma.js");
  return {
    guardarHorarioDelNegocio: vi.fn(
      async (businessId: string, schedule: unknown) => {
        await prisma.business.update({
          where: { id: businessId },
          data: { schedule: schedule as object },
        });
        return { sincronizado: true };
      }
    ),
  };
});

const mockedBook = vi.mocked(calendarService.bookAppointment);
const mockedBusy = vi.mocked(calendarService.getBusyIntervals);
const mockedCancelEvent = vi.mocked(calendarService.cancelAppointment);
const mockedChat = vi.mocked(telnyxAiAdapter.chatWithAssistant);

const MOVIL = "+34692138456";

/** «AAAA-MM-DDTHH:MM» local de Madrid del próximo lunes a las 12:00. */
function lunesLocal(hora = "12:00"): { local: string; fecha: string } {
  const fecha = nextOpenSlot().iso.slice(0, 10);
  return { local: `${fecha}T${hora}`, fecha };
}

async function proponerYConfirmar(
  businessId: string,
  tipo: string,
  parametros: unknown,
  resumen = "Lo hago."
) {
  const propuesta = await registrarPropuesta({
    businessId,
    timezone: "Europe/Madrid",
    conversationId: null,
    inboundMessageId: "in_test",
    tipo,
    parametros,
    resumen,
  });
  if (!propuesta.ok)
    throw new Error(`no se pudo proponer ${tipo}: ${propuesta.motivo}`);
  const decision = await decidirPropuesta({
    accionId: propuesta.accionId,
    businessId,
    timezone: "Europe/Madrid",
    decision: "confirmar",
    inboundMessageId: "in_boton",
  });
  return { propuesta, decision };
}

describe("acciones de agenda del Gestor (integración)", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    mockedBusy.mockResolvedValue({
      intervals: [],
      calendarAvailabilityKnown: true,
    });
    mockedBook.mockResolvedValue({ id: "evt_1" } as never);
    mockedCancelEvent.mockResolvedValue(undefined);
  });

  it("añadir_cita: Call sintética whatsapp:gestor:<accionId>, Booking createdVia owner_chat con evento, pregunta de confirmación; un segundo toque no repite", async () => {
    const business = await createTestBusiness({ bookingCapacity: 2 });
    const laura = await createTestProfessional(business.id, "Laura");
    const corte = await prisma.service.create({
      data: { businessId: business.id, name: "Corte", durationMinutes: 30 },
    });
    const { local } = lunesLocal();

    const { propuesta, decision } = await proponerYConfirmar(
      business.id,
      "añadir_cita",
      {
        cliente: "Marta García",
        telefono: MOVIL,
        fechaHora: local,
        servicios: ["corte"],
        profesional: "laura",
      }
    );
    if (!propuesta.ok) throw new Error("propuesta");
    // Los nombres quedaron resueltos a ids al proponer.
    const guardada = await prisma.ownerPendingAction.findUniqueOrThrow({
      where: { id: propuesta.accionId },
    });
    expect(guardada.parametros).toMatchObject({
      servicios: [corte.id],
      profesional: laura.id,
      duracionMinutos: 30,
    });

    expect(decision.estado).toBe("ejecutada");
    if (decision.estado !== "ejecutada") return;
    expect(decision.siguiente).toMatchObject({
      tipo: "avisar_cliente",
      parametros: { tipo: "confirmacion" },
    });
    const call = await prisma.call.findUniqueOrThrow({
      where: { callId: `whatsapp:gestor:${propuesta.accionId}` },
      include: { booking: true },
    });
    expect(call.voiceProvider).toBe("whatsapp");
    expect(call.businessId).toBe(business.id);
    expect(call.booking).toMatchObject({
      professionalId: laura.id,
      serviceIds: [corte.id],
      clientName: "Marta García",
      clientPhone: MOVIL,
      createdVia: "owner_chat",
      smsConsent: false,
      externalEventId: "evt_1",
      externalCalendarProvider: "google",
    });
    expect(mockedBook).toHaveBeenCalledTimes(1);

    const otraVez = await decidirPropuesta({
      accionId: propuesta.accionId,
      businessId: business.id,
      timezone: "Europe/Madrid",
      decision: "confirmar",
      inboundMessageId: "in_boton_2",
    });
    expect(otraVez.estado).toBe("ya_decidida");
    expect(await prisma.booking.count()).toBe(1);
  });

  it("mover_cita crea el evento nuevo, actualiza la reserva, borra el viejo y no se bloquea a sí misma; cancelar_cita como owner_chat no avisa al dueño", async () => {
    const business = await createTestBusiness({
      bookingCapacity: 1,
      ownerWhatsappNumber: MOVIL,
      ownerWhatsappOptInAt: new Date(),
    });
    const laura = await createTestProfessional(business.id, "Laura");
    await prisma.service.create({
      data: { businessId: business.id, name: "Corte", durationMinutes: 30 },
    });
    const { local, fecha } = lunesLocal();
    const { propuesta } = await proponerYConfirmar(business.id, "añadir_cita", {
      cliente: "Marta",
      fechaHora: local,
      servicios: ["Corte"],
      profesional: laura.id,
    });
    if (!propuesta.ok) throw new Error("propuesta");
    const reserva = await prisma.booking.findFirstOrThrow();

    // Media hora más tarde: se solapa con la hora vieja y con capacidad 1
    // solo cabe si la propia cita (y su evento) quedan fuera del cálculo.
    mockedBook.mockResolvedValueOnce({ id: "evt_2" } as never);
    mockedBusy.mockResolvedValue({
      intervals: [
        {
          externalEventId: "evt_1",
          start: reserva.programedAt,
          end: new Date(reserva.programedAt.getTime() + 30 * 60_000),
        },
      ],
      calendarAvailabilityKnown: true,
    });
    const movida = await proponerYConfirmar(business.id, "mover_cita", {
      cita: reserva.id,
      fechaHora: `${fecha}T12:15`,
    });
    expect(movida.decision.estado).toBe("ejecutada");
    const despues = await prisma.booking.findUniqueOrThrow({
      where: { id: reserva.id },
    });
    expect(despues.programedAt.getTime()).toBe(
      reserva.programedAt.getTime() + 15 * 60_000
    );
    expect(despues.externalEventId).toBe("evt_2");
    expect(despues.confirmedByClientAt).toBeNull();
    expect(mockedCancelEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_1" })
    );

    const cancelada = await proponerYConfirmar(business.id, "cancelar_cita", {
      cita: reserva.id,
    });
    expect(cancelada.decision.estado).toBe("ejecutada");
    const final = await prisma.booking.findUniqueOrThrow({
      where: { id: reserva.id },
    });
    expect(final).toMatchObject({
      isCancelled: true,
      cancelledBy: "owner_chat",
    });
    expect(mockedCancelEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_2" })
    );
    // Sin aviso #4 al propio dueño (ni interactivo ni plantilla).
    expect(
      await prisma.sentMessage.count({
        where: { callbackData: { startsWith: "aviso:cancelacion" } },
      })
    ).toBe(0);
    expect(whatsappAdapter.sendInteractiveButtons).not.toHaveBeenCalled();
  });

  it("marcar_ausencia guarda el tramo en UTC y la disponibilidad real deja de ofrecer a esa persona sin restar plazas; bloquear_franja deja el día con horario especial", async () => {
    const business = await createTestBusiness({ bookingCapacity: 2 });
    const laura = await createTestProfessional(business.id, "Laura");
    await createTestProfessional(business.id, "Marta");
    const { fecha } = lunesLocal();

    const ausencia = await proponerYConfirmar(business.id, "marcar_ausencia", {
      profesional: "Laura",
      desde: fecha,
    });
    expect(ausencia.decision.estado).toBe("ejecutada");
    const fila = await prisma.professionalAbsence.findFirstOrThrow();
    expect(fila.professionalId).toBe(laura.id);
    expect(fila.createdVia).toBe("owner_chat");

    const inicio = new Date(nextOpenSlot().iso);
    const libre = await checkAvailability({
      businessId: business.id,
      schedule: business.schedule,
      timezone: "Europe/Madrid",
      bookingCapacity: 2,
      startDateTime: inicio.toISOString(),
      durationMinutes: 30,
    });
    expect(libre.available).toBe(true);
    if (libre.available) {
      expect(libre.availableProfessionals.map((p) => p.name)).toEqual([
        "Marta",
      ]);
      expect(libre.capacityUsed).toBe(0);
    }
    const conLaura = await checkAvailability({
      businessId: business.id,
      schedule: business.schedule,
      timezone: "Europe/Madrid",
      bookingCapacity: 2,
      startDateTime: inicio.toISOString(),
      durationMinutes: 30,
      professionalId: laura.id,
    });
    expect(conLaura.available).toBe(false);

    const bloqueo = await proponerYConfirmar(business.id, "bloquear_franja", {
      fecha,
      desde: "14:00",
      hasta: "18:00",
    });
    expect(bloqueo.decision.estado).toBe("ejecutada");
    const negocio = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect((negocio.schedule as { exceptions: unknown[] }).exceptions).toEqual([
      {
        date: fecha,
        closed: false,
        intervals: [{ start: "09:00", end: "14:00" }],
      },
    ]);
    // Y la disponibilidad real ya no ofrece la tarde.
    const tarde = await checkAvailability({
      businessId: business.id,
      schedule: negocio.schedule,
      timezone: "Europe/Madrid",
      bookingCapacity: 2,
      startDateTime: new Date(inicio.getTime() + 3 * 60 * 60_000).toISOString(),
      durationMinutes: 30,
    });
    expect(tarde.available).toBe(false);
  });
});

describe("el Gestor desde el panel (integración)", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    process.env.TELNYX_OWNER_CHAT_ENABLED = "true";
    process.env.TELNYX_GESTOR_ASSISTANT_ID = "assistant-test";
    vi.mocked(telnyxAiAdapter.createConversation).mockResolvedValue({
      id: "conv_panel",
    } as never);
    vi.mocked(telnyxAiAdapter.updateConversation).mockResolvedValue(
      undefined as never
    );
    vi.mocked(telnyxAiAdapter.addConversationMessage).mockResolvedValue(
      undefined as never
    );
    vi.mocked(telnyxAiAdapter.listConversationMessages).mockResolvedValue([]);
  });

  it("abre la conversación del negocio sin WhatsApp, devuelve la propuesta que el LLM registró durante el turno y el botón del panel la ejecuta; el historial la deja de enseñar", async () => {
    const business = await createTestBusiness({ bookingCapacity: 2 });
    const laura = await createTestProfessional(business.id, "Laura");
    const { fecha } = lunesLocal();

    // El LLM, durante el turno, llama a proponer_accion: aquí se simula
    // registrando la propuesta con el turno en curso (mismo Redis).
    mockedChat.mockImplementationOnce(async () => {
      const { handleGestorToolInvocation } =
        await import("../../../src/modules/gestor/tools.js");
      const r = await handleGestorToolInvocation({
        businessId: business.id,
        role: "owner",
        toolName: "proponer_accion",
        params: {
          tipo: "marcar_ausencia",
          parametros: { profesional: "Laura", desde: fecha },
          resumen: "Marco a Laura como ausente.",
        },
      });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ ok: true });
      return "Si confirmas, marco a Laura como ausente.";
    });

    const respuesta = await preguntarAlGestor({
      businessId: business.id,
      texto: "Laura no viene el lunes",
    });
    expect(respuesta).toMatchObject({
      ok: true,
      respuesta: "Si confirmas, marco a Laura como ausente.",
      propuesta: {
        resumen: "Marco a Laura como ausente.",
        botones: { confirmar: "Confirmar", cancelar: "Cancelar" },
      },
    });
    if (!respuesta.ok || !respuesta.propuesta) throw new Error("sin propuesta");
    const negocio = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(negocio.ownerConversationId).toBe("conv_panel");
    expect(mockedChat).toHaveBeenCalledWith(
      "assistant-test",
      expect.objectContaining({
        conversationId: "conv_panel",
        content: expect.stringMatching(
          /^\[WhatsApp · .*\] Laura no viene el lunes$/
        ),
      })
    );
    const propuestaFila = await prisma.ownerPendingAction.findUniqueOrThrow({
      where: { id: respuesta.propuesta.id },
    });
    expect(propuestaFila.inboundMessageId).toMatch(/^panel:/);

    mockedChat.mockResolvedValueOnce("Listo.");
    const decision = await decidirEnElPanel({
      businessId: business.id,
      accionId: respuesta.propuesta.id,
      decision: "confirmar",
    });
    expect(decision).toMatchObject({
      ok: true,
      estado: "ejecutada",
      propuesta: null,
      seguimiento: null,
    });
    expect(
      await prisma.professionalAbsence.count({
        where: { professionalId: laura.id },
      })
    ).toBe(1);
    expect(telnyxAiAdapter.addConversationMessage).toHaveBeenCalledWith(
      "conv_panel",
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("desde el panel"),
      })
    );

    const historial = await historialDelGestor(business.id);
    expect(historial).toMatchObject({
      disponible: true,
      activoEnNegocio: true,
      whatsapp: "sin_numero",
      propuesta: null,
    });
  });

  it("con el negocio apagado no abre conversación; una propuesta de otro negocio no se puede decidir desde este", async () => {
    const apagado = await createTestBusiness({ ownerChatEnabled: false });
    expect(
      await preguntarAlGestor({ businessId: apagado.id, texto: "hola" })
    ).toMatchObject({ ok: false, motivo: "apagado_negocio" });
    expect(telnyxAiAdapter.createConversation).not.toHaveBeenCalled();

    const otro = await createTestBusiness();
    await createTestProfessional(otro.id, "Laura");
    const propuesta = await registrarPropuesta({
      businessId: otro.id,
      timezone: "Europe/Madrid",
      conversationId: null,
      inboundMessageId: "in_x",
      tipo: "marcar_ausencia",
      parametros: { profesional: "Laura", desde: lunesLocal().fecha },
      resumen: "x",
    });
    if (!propuesta.ok) throw new Error(propuesta.motivo);
    expect(
      await decidirEnElPanel({
        businessId: apagado.id,
        accionId: propuesta.accionId,
        decision: "confirmar",
      })
    ).toMatchObject({
      ok: false,
      motivo: "no_encontrada",
    });
    expect(await prisma.professionalAbsence.count()).toBe(0);
  });
});
