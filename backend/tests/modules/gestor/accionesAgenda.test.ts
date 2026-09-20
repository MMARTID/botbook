import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { DEFAULT_BUSINESS_SCHEDULE } from "../../../src/lib/businessSchedule.js";
import { checkAvailability } from "../../../src/lib/availability.js";
import { calendarService } from "../../../src/modules/calendar/service.js";
import { cancelarReserva } from "../../../src/modules/bookings/cancelacion.js";
import { guardarHorarioDelNegocio } from "../../../src/modules/businesses/horario.js";
import {
  programarAvisoAlCliente,
  programarMensajesAlCliente,
} from "../../../src/modules/whatsapp/mensajesCliente.js";
import { ACCIONES_DEL_GESTOR } from "../../../src/modules/gestor/acciones.js";
import {
  instanteLocal,
  restarTramo,
} from "../../../src/modules/gestor/accionesAgenda.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    service: { findMany: vi.fn() },
    professional: { findMany: vi.fn() },
    business: { findUnique: vi.fn() },
    booking: {
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    call: { findUnique: vi.fn() },
    professionalAbsence: { findFirst: vi.fn(), create: vi.fn() },
    lead: { findFirst: vi.fn(), updateMany: vi.fn() },
    ownerPendingAction: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock("../../../src/lib/availability.js", async (importActual) => {
  const actual =
    await importActual<typeof import("../../../src/lib/availability.js")>();
  return { ...actual, checkAvailability: vi.fn() };
});
vi.mock("../../../src/lib/bookingLock.js", () => ({
  acquireLock: vi.fn(async () => "token"),
  releaseLock: vi.fn(async () => undefined),
  acquireBookingLock: vi.fn(async () => "token"),
  releaseBookingLock: vi.fn(async () => undefined),
}));
vi.mock("../../../src/modules/calendar/service.js", () => ({
  calendarService: {
    getBusyIntervals: vi.fn(),
    bookAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
  },
}));
vi.mock("../../../src/modules/calendar/conexion.js", () => ({
  SELECT_CONEXION_DE_CALENDARIO: {
    id: true,
    calendarProvider: true,
    calendarConnections: true,
  },
  resolverConexionDeCalendario: vi.fn(() => ({
    provider: "google",
    calendarId: "primary",
    credentials: {},
    businessId: "biz_1",
    calendarIdConfigurado: "primary",
    marcadaConectada: true,
  })),
  conexionOperativa: vi.fn(() => true),
  usaCalendarioExterno: vi.fn(() => true),
  origenDeCalendario: vi.fn(() => ({
    provider: "google",
    calendarId: "primary",
  })),
  marcarCalendarioDesconectado: vi.fn(),
}));
vi.mock("../../../src/modules/bookings/cancelacion.js", () => ({
  cancelarReserva: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/bajas.js", () => ({
  estaDadoDeBaja: vi.fn(async () => false),
}));
vi.mock("../../../src/modules/businesses/horario.js", () => ({
  guardarHorarioDelNegocio: vi.fn(),
}));
vi.mock("../../../src/modules/bookings/service.js", () => ({
  createService: vi.fn(),
  updateService: vi.fn(),
  deleteService: vi.fn(),
  createProfessional: vi.fn(),
  updateProfessional: vi.fn(),
  deleteProfessional: vi.fn(),
  syncBookingConfiguration: vi.fn(),
}));
vi.mock(
  "../../../src/modules/whatsapp/mensajesCliente.js",
  async (importActual) => {
    const actual =
      await importActual<
        typeof import("../../../src/modules/whatsapp/mensajesCliente.js")
      >();
    return {
      ...actual,
      programarMensajesAlCliente: vi.fn(),
      programarAvisoAlCliente: vi.fn(),
    };
  }
);

const mockedServiceFindMany = vi.mocked(prisma.service.findMany);
const mockedProFindMany = vi.mocked(prisma.professional.findMany);
const mockedBizFindUnique = vi.mocked(prisma.business.findUnique);
const mockedBookingFindFirst = vi.mocked(prisma.booking.findFirst);
const mockedBookingCount = vi.mocked(prisma.booking.count);
const mockedBookingUpdateMany = vi.mocked(prisma.booking.updateMany);
const mockedCallFindUnique = vi.mocked(prisma.call.findUnique);
const mockedTransaction = vi.mocked(prisma.$transaction);
const mockedCheckAvailability = vi.mocked(checkAvailability);
const mockedBusy = vi.mocked(calendarService.getBusyIntervals);
const mockedBook = vi.mocked(calendarService.bookAppointment);
const mockedCancelEvent = vi.mocked(calendarService.cancelAppointment);
const mockedCancelarReserva = vi.mocked(cancelarReserva);
const mockedGuardarHorario = vi.mocked(guardarHorarioDelNegocio);
const mockedProgramarMensajes = vi.mocked(programarMensajesAlCliente);
const mockedProgramarAviso = vi.mocked(programarAvisoAlCliente);

const CTX = { businessId: "biz_1", timezone: "Europe/Madrid" };
const META = { inboundMessageId: "in_boton", accionId: "acc_1" };
const SERVICIOS = [
  { id: "svc_corte", name: "Corte", durationMinutes: 30 },
  { id: "svc_color", name: "Color", durationMinutes: 90 },
];
const PROFESIONALES = [
  { id: "pro_laura", name: "Laura" },
  { id: "pro_marta", name: "Marta" },
];
const NEGOCIO = {
  id: "biz_1",
  name: "Peluquería Ana",
  schedule: DEFAULT_BUSINESS_SCHEDULE,
  timezone: "Europe/Madrid",
  bookingCapacity: 2,
  minAdvanceBookingMinutes: null,
  maxAppointmentDurationMinutes: null,
  subscriptionStatus: "active",
  active: true,
  calendarProvider: "google",
  calendarConnections: [],
};
// Jueves 12-11-2026 a las 17:00 en Madrid (CET) = 16:00Z; dentro de los 120
// días que admite checkBookingRestrictions desde el 20-09-2026.
const HORA_LOCAL = "2026-11-12T17:00";
const HORA_UTC = "2026-11-12T16:00:00.000Z";
const CITA = {
  id: "b_1",
  callId: "call_1",
  programedAt: new Date("2026-11-12T10:00:00.000Z"),
  durationMinutes: 30,
  clientName: "Marta García",
  clientPhone: "+34600111222",
  serviceIds: ["svc_corte"],
  professionalId: "pro_laura",
  isCancelled: false,
  smsConsent: false,
  externalEventId: "evt_viejo",
  externalCalendarProvider: "google",
  externalCalendarId: "primary",
  professional: { id: "pro_laura", name: "Laura" },
  call: { fromNumber: null },
};

function accion(tipo: string) {
  const a = ACCIONES_DEL_GESTOR[tipo];
  if (!a) throw new Error(`acción desconocida ${tipo}`);
  return a;
}

async function comprobar(tipo: string, params: unknown) {
  const a = accion(tipo);
  const parsed = a.schema.safeParse(params);
  if (!parsed.success)
    return {
      ok: false as const,
      motivo: `schema: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    };
  return a.comprobar(CTX, parsed.data);
}

async function ejecutar(tipo: string, params: unknown) {
  const a = accion(tipo);
  return a.ejecutar(CTX, a.schema.parse(params), META);
}

function disponible() {
  mockedCheckAvailability.mockResolvedValue({
    available: true,
    message: "",
    capacityUsed: 0,
    capacityTotal: 2,
    availableProfessionals: [
      { id: "pro_marta", name: "Marta" },
      { id: "pro_laura", name: "Laura" },
    ],
  });
}

function transaccionReal() {
  const tx = {
    call: { upsert: vi.fn().mockResolvedValue({ id: "call_row_sint" }) },
    booking: { upsert: vi.fn().mockResolvedValue({ id: "b_nueva" }) },
  };
  mockedTransaction.mockImplementation(async (fn) =>
    (fn as (t: typeof tx) => Promise<unknown>)(tx)
  );
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mockedServiceFindMany.mockResolvedValue(SERVICIOS as never);
  mockedProFindMany.mockResolvedValue(PROFESIONALES as never);
  mockedBizFindUnique.mockResolvedValue(NEGOCIO as never);
  mockedBusy.mockResolvedValue({
    intervals: [],
    calendarAvailabilityKnown: true,
  });
  mockedBookingCount.mockResolvedValue(0);
  mockedCallFindUnique.mockResolvedValue(null);
  vi.mocked(prisma.professionalAbsence.findFirst).mockResolvedValue(null);
  disponible();
});

describe("instanteLocal y restarTramo", () => {
  it("convierte la hora de pared del negocio a UTC, con y sin horario de verano", () => {
    expect(
      instanteLocal("Europe/Madrid", "2026-11-12", "17:00").toISOString()
    ).toBe(HORA_UTC);
    expect(
      instanteLocal("Europe/Madrid", "2027-07-14", "17:00").toISOString()
    ).toBe("2027-07-14T15:00:00.000Z");
    expect(
      instanteLocal("Europe/Madrid", "2027-12-14", "17:00").toISOString()
    ).toBe("2027-12-14T16:00:00.000Z");
    expect(
      instanteLocal("Atlantic/Canary", "2027-12-14", "17:00").toISOString()
    ).toBe("2027-12-14T17:00:00.000Z");
  });

  it("quita el tramo bloqueado y deja el resto ordenado", () => {
    const dia = [
      { start: "09:00", end: "14:00" },
      { start: "16:00", end: "20:00" },
    ];
    expect(restarTramo(dia, "16:00", "20:00")).toEqual([
      { start: "09:00", end: "14:00" },
    ]);
    expect(restarTramo(dia, "11:00", "12:00")).toEqual([
      { start: "09:00", end: "11:00" },
      { start: "12:00", end: "14:00" },
      { start: "16:00", end: "20:00" },
    ]);
    expect(restarTramo(dia, "13:00", "17:00")).toEqual([
      { start: "09:00", end: "13:00" },
      { start: "17:00", end: "20:00" },
    ]);
    expect(restarTramo(dia, "08:00", "21:00")).toEqual([]);
    expect(restarTramo(dia, "14:00", "16:00")).toEqual(dia);
  });
});

describe("añadir_cita", () => {
  it("resuelve nombres a ids, suma la duración de los servicios y describe la cita con quien esté libre", async () => {
    // Dos horas de cita: a las 15:00 para que quepan antes del cierre.
    const r = await comprobar("añadir_cita", {
      cliente: "Marta García",
      fechaHora: "2026-11-12T15:00",
      servicios: ["corte", "Color"],
    });
    if (!r.ok) throw new Error(r.motivo);
    expect(r).toMatchObject({
      ok: true,
      descripcion:
        "apuntar a Marta García el jueves 12 de noviembre a las 15:00, Corte y Color (120 min) con Marta",
      parametros: {
        cliente: "Marta García",
        fechaHora: "2026-11-12T15:00",
        servicios: ["svc_corte", "svc_color"],
        duracionMinutos: 120,
      },
    });
    expect(mockedCheckAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        startDateTime: "2026-11-12T14:00:00.000Z",
        durationMinutes: 120,
        serviceIds: ["svc_corte", "svc_color"],
        professionalId: null,
        calendarAvailabilityKnown: true,
      })
    );
    // El alias sin eñe es la misma acción.
    expect(ACCIONES_DEL_GESTOR.anadir_cita).toBe(
      ACCIONES_DEL_GESTOR["añadir_cita"]
    );
  });

  it("rechaza servicio desconocido, hora pasada, fuera de horario y sin calendario, con palabras del dueño", async () => {
    expect(
      (
        await comprobar("añadir_cita", {
          cliente: "M",
          fechaHora: HORA_LOCAL,
          servicios: ["Peinado"],
        })
      ).motivo
    ).toContain("No encuentro el servicio «Peinado»");
    expect(
      (
        await comprobar("añadir_cita", {
          cliente: "M",
          fechaHora: "2020-01-01T10:00",
          servicios: ["Corte"],
        })
      ).motivo
    ).toBe("Esa hora ya ha pasado.");
    // Domingo: cerrado.
    expect(
      (
        await comprobar("añadir_cita", {
          cliente: "M",
          fechaHora: "2026-11-15T10:00",
          servicios: ["Corte"],
        })
      ).motivo
    ).toContain("cerrado");
    const conexion = await import("../../../src/modules/calendar/conexion.js");
    vi.mocked(conexion.conexionOperativa).mockReturnValueOnce(false);
    expect(
      (
        await comprobar("añadir_cita", {
          cliente: "M",
          fechaHora: HORA_LOCAL,
          servicios: ["Corte"],
        })
      ).motivo
    ).toContain("calendario no está conectado");
    expect(mockedCheckAvailability).not.toHaveBeenCalled();
  });

  it("si no hay hueco devuelve el motivo con la alternativa más cercana; si el calendario no se puede leer, no propone", async () => {
    mockedCheckAvailability.mockResolvedValueOnce({
      available: false,
      code: "ALL_PROFESSIONALS_BUSY",
      message:
        "Todos los profesionales que pueden hacer este servicio están ocupados en ese horario.",
      suggestedNextSlot: {
        startDateTime: "2026-11-12T16:30:00.000Z",
        availableProfessionals: [{ id: "pro_laura", name: "Laura" }],
      },
    });
    expect(
      (
        await comprobar("añadir_cita", {
          cliente: "M",
          fechaHora: HORA_LOCAL,
          servicios: ["Corte"],
          profesional: "Laura",
        })
      ).motivo
    ).toBe(
      "Todos los profesionales que pueden hacer este servicio están ocupados en ese horario. El hueco libre más cercano es el jueves 12 de noviembre a las 17:30 con Laura."
    );
    mockedBusy.mockResolvedValueOnce({
      intervals: [],
      calendarAvailabilityKnown: false,
    });
    expect(
      (
        await comprobar("añadir_cita", {
          cliente: "M",
          fechaHora: HORA_LOCAL,
          servicios: ["Corte"],
        })
      ).motivo
    ).toContain("no puedo leer el calendario");
  });

  it("al confirmar crea el evento y la reserva con Call sintética y pregunta si mandar la confirmación (solo con móvil)", async () => {
    const tx = transaccionReal();
    mockedBook.mockResolvedValue({ id: "evt_nuevo" } as never);
    const r = await ejecutar("añadir_cita", {
      cliente: "Marta García",
      telefono: "+34 600 111 222",
      fechaHora: HORA_LOCAL,
      servicios: ["svc_corte"],
      profesional: "pro_laura",
      duracionMinutos: 30,
    });
    expect(r.ok).toBe(true);
    expect(r.mensaje).toBe(
      "Hecho: Marta García queda apuntado el jueves 12 de noviembre a las 17:00, Corte con Laura. Ya está en tu calendario."
    );
    expect(r.ok && r.siguiente).toMatchObject({
      tipo: "avisar_cliente",
      parametros: { cita: "b_nueva", tipo: "confirmacion" },
      botones: { confirmar: "Sí, mándasela", cancelar: "No" },
    });
    expect(mockedBook).toHaveBeenCalledWith(
      expect.objectContaining({
        clientName: "Marta García",
        startDateTime: HORA_UTC,
        durationMinutes: 30,
        clientPhone: "+34600111222",
        serviceNames: ["Corte"],
        professionalName: "Laura",
      })
    );
    expect(tx.call.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { callId: "whatsapp:gestor:acc_1" },
        create: expect.objectContaining({
          voiceProvider: "whatsapp",
          businessId: "biz_1",
          fromNumber: "+34600111222",
        }),
      })
    );
    expect(tx.booking.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { callId: "call_row_sint" },
        create: expect.objectContaining({
          programedAt: new Date(HORA_UTC),
          professionalId: "pro_laura",
          serviceIds: ["svc_corte"],
          clientPhone: "+34600111222",
          smsConsent: false,
          createdVia: "owner_chat",
          externalEventId: "evt_nuevo",
        }),
      })
    );
    // Sin confirmación automática: eso lo decide el dueño con el botón.
    expect(mockedProgramarMensajes).not.toHaveBeenCalled();

    const sinMovil = await ejecutar("añadir_cita", {
      cliente: "Pepe",
      fechaHora: HORA_LOCAL,
      servicios: ["svc_corte"],
    });
    expect(sinMovil.ok && sinMovil.siguiente).toBeUndefined();
  });

  it("si la reserva no se puede guardar, deshace el evento y lo dice", async () => {
    mockedBook.mockResolvedValue({ id: "evt_nuevo" } as never);
    mockedTransaction.mockRejectedValue(new Error("bd caída"));
    const r = await ejecutar("añadir_cita", {
      cliente: "Pepe",
      fechaHora: HORA_LOCAL,
      servicios: ["svc_corte"],
    });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain("No he podido apuntar la cita");
    expect(r.mensaje).not.toContain("bd caída");
    expect(mockedCancelEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_nuevo" })
    );
  });

  it("un segundo intento sobre la misma acción con reserva viva no duplica", async () => {
    mockedCallFindUnique.mockResolvedValueOnce({
      booking: { id: "b_nueva", isCancelled: false },
    } as never);
    const r = await ejecutar("añadir_cita", {
      cliente: "Pepe",
      fechaHora: HORA_LOCAL,
      servicios: ["svc_corte"],
    });
    expect(r).toMatchObject({
      ok: false,
      mensaje: "Esa cita ya estaba apuntada.",
    });
    expect(mockedBook).not.toHaveBeenCalled();
  });
});

describe("mover_cita", () => {
  beforeEach(() => {
    mockedBookingFindFirst.mockResolvedValue(CITA as never);
  });

  it("comprueba el hueco excluyendo la propia cita y describe el cambio con el móvil del cliente", async () => {
    const r = await comprobar("mover_cita", {
      cita: "b_1",
      fechaHora: HORA_LOCAL,
    });
    expect(r).toMatchObject({
      ok: true,
      descripcion:
        "mover la cita de Marta García del jueves 12 de noviembre a las 11:00 (Corte) con Laura al jueves 12 de noviembre a las 17:00 con Laura (móvil del cliente: +34600111222, por si prefieres llamarle antes; la propuesta sigue vigente 24 h)",
    });
    expect(mockedCheckAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        professionalId: "pro_laura",
        durationMinutes: 30,
        excluir: { bookingId: "b_1", externalEventId: "evt_viejo" },
      })
    );
    mockedBookingFindFirst.mockResolvedValueOnce({
      ...CITA,
      isCancelled: true,
    } as never);
    expect(
      (await comprobar("mover_cita", { cita: "b_1", fechaHora: HORA_LOCAL }))
        .motivo
    ).toBe("Esa cita está cancelada.");
    mockedBookingFindFirst.mockResolvedValueOnce(null);
    expect(
      (await comprobar("mover_cita", { cita: "ajena", fechaHora: HORA_LOCAL }))
        .motivo
    ).toContain("No encuentro esa cita");
  });

  it("al confirmar: evento nuevo, reserva actualizada, evento viejo borrado, recordatorio reprogramado y pregunta de aviso", async () => {
    mockedBook.mockResolvedValue({ id: "evt_nuevo" } as never);
    mockedBookingUpdateMany.mockResolvedValue({ count: 1 });
    mockedProgramarMensajes.mockResolvedValue({ confirmacion: "programada" });
    const r = await ejecutar("mover_cita", {
      cita: "b_1",
      fechaHora: HORA_LOCAL,
      profesional: "Marta",
    });
    expect(r.ok).toBe(true);
    expect(r.mensaje).toContain(
      "pasa al jueves 12 de noviembre a las 17:00 con Marta"
    );
    expect(mockedBookingUpdateMany).toHaveBeenCalledWith({
      where: { id: "b_1", isCancelled: false },
      data: {
        programedAt: new Date(HORA_UTC),
        professionalId: "pro_marta",
        externalEventId: "evt_nuevo",
        externalCalendarProvider: "google",
        externalCalendarId: "primary",
        confirmedByClientAt: null,
      },
    });
    expect(mockedCancelEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_viejo" })
    );
    expect(mockedProgramarMensajes).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "b_1", confirmacion: false })
    );
    expect(r.ok && r.siguiente).toMatchObject({
      tipo: "avisar_cliente",
      parametros: { cita: "b_1", tipo: "cambio" },
      botones: { confirmar: "Sí, avísale", cancelar: "Le llamo yo" },
    });
  });

  it("si la cita se canceló entre medias, deshace el evento nuevo y no toca el viejo", async () => {
    mockedBook.mockResolvedValue({ id: "evt_nuevo" } as never);
    mockedBookingUpdateMany.mockResolvedValue({ count: 0 });
    const r = await ejecutar("mover_cita", {
      cita: "b_1",
      fechaHora: HORA_LOCAL,
    });
    expect(r).toMatchObject({
      ok: false,
      mensaje: expect.stringContaining("se canceló mientras"),
    });
    expect(mockedCancelEvent).toHaveBeenCalledTimes(1);
    expect(mockedCancelEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_nuevo" })
    );
  });
});

describe("cancelar_cita", () => {
  it("cancela como owner_chat (sin aviso #4 al propio dueño) y pregunta si avisar al cliente", async () => {
    mockedBookingFindFirst.mockResolvedValue(CITA as never);
    expect(await comprobar("cancelar_cita", { cita: "b_1" })).toMatchObject({
      ok: true,
      descripcion: expect.stringContaining(
        "cancelar la cita de Marta García del jueves 12 de noviembre a las 11:00 (Corte) con Laura (móvil del cliente: +34600111222"
      ),
    });
    mockedCancelarReserva.mockResolvedValue({ resultado: "cancelada" });
    const r = await ejecutar("cancelar_cita", { cita: "b_1" });
    expect(mockedCancelarReserva).toHaveBeenCalledWith({
      bookingId: "b_1",
      businessId: "biz_1",
      cancelledBy: "owner_chat",
      etiqueta: "cancelar_cita acc_1",
      inboundMessageId: "in_boton",
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.siguiente).toMatchObject({
      parametros: { cita: "b_1", tipo: "cancelacion" },
      pregunta: expect.stringContaining("+34600111222"),
    });

    mockedCancelarReserva.mockResolvedValue({ resultado: "ya_cancelada" });
    expect(await ejecutar("cancelar_cita", { cita: "b_1" })).toEqual({
      ok: false,
      mensaje: "Esa cita ya estaba cancelada.",
    });

    mockedBookingFindFirst.mockResolvedValue({
      ...CITA,
      clientPhone: null,
    } as never);
    mockedCancelarReserva.mockResolvedValue({ resultado: "cancelada" });
    const sinMovil = await ejecutar("cancelar_cita", { cita: "b_1" });
    expect(sinMovil.ok && sinMovil.siguiente).toBeUndefined();
  });
});

describe("avisar_cliente", () => {
  it("exige móvil (del parámetro o de la cita), número de Alhabla en el negocio, sin STOP, y que el tipo case con el estado de la cita", async () => {
    mockedBizFindUnique.mockResolvedValue({
      ...NEGOCIO,
      telnyxPhoneNumber: "+34930454394",
    } as never);
    mockedBookingFindFirst.mockResolvedValue({
      ...CITA,
      clientPhone: null,
    } as never);
    expect(
      (await comprobar("avisar_cliente", { cita: "b_1", tipo: "confirmacion" }))
        .motivo
    ).toContain("No tengo el móvil");
    expect(
      await comprobar("avisar_cliente", {
        cita: "b_1",
        tipo: "confirmacion",
        telefono: "+34600999888",
      })
    ).toMatchObject({
      ok: true,
      descripcion:
        "mandar a Marta García la confirmación de la cita por WhatsApp al +34600999888",
      parametros: {
        cita: "b_1",
        tipo: "confirmacion",
        telefono: "+34600999888",
      },
    });
    expect(
      (
        await comprobar("avisar_cliente", {
          cita: "b_1",
          tipo: "cancelacion",
          telefono: "+34600999888",
        })
      ).motivo
    ).toBe("Esa cita no está cancelada.");
    mockedBizFindUnique.mockResolvedValueOnce({
      telnyxPhoneNumber: null,
    } as never);
    expect(
      (
        await comprobar("avisar_cliente", {
          cita: "b_1",
          tipo: "confirmacion",
          telefono: "+34600999888",
        })
      ).motivo
    ).toContain("número de Alhabla");
    const { estaDadoDeBaja } =
      await import("../../../src/modules/whatsapp/bajas.js");
    vi.mocked(estaDadoDeBaja).mockResolvedValueOnce(true);
    expect(
      (
        await comprobar("avisar_cliente", {
          cita: "b_1",
          tipo: "confirmacion",
          telefono: "+34600999888",
        })
      ).motivo
    ).toContain("no recibir mensajes");
    mockedBookingFindFirst.mockResolvedValue({
      ...CITA,
      isCancelled: true,
    } as never);
    expect(
      (await comprobar("avisar_cliente", { cita: "b_1", tipo: "cambio" }))
        .motivo
    ).toContain("solo cabe avisar de la cancelación");
  });

  it("al confirmar anota el consentimiento (y el móvil nuevo) y programa la confirmación o el aviso", async () => {
    mockedBookingFindFirst.mockResolvedValue(CITA as never);
    mockedProgramarMensajes.mockResolvedValue({ confirmacion: "programada" });
    const r = await ejecutar("avisar_cliente", {
      cita: "b_1",
      tipo: "confirmacion",
      telefono: "+34600999888",
    });
    expect(prisma.booking.update).toHaveBeenCalledWith({
      where: { id: "b_1" },
      data: { smsConsent: true, clientPhone: "+34600999888" },
    });
    expect(mockedProgramarMensajes).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "b_1" })
    );
    expect(r).toMatchObject({
      ok: true,
      mensaje: "Le mando a Marta García la confirmación al +34600999888.",
    });

    mockedProgramarAviso.mockResolvedValue({
      programado: false,
      motivo: "el número pidió STOP",
    });
    const cambio = await ejecutar("avisar_cliente", {
      cita: "b_1",
      tipo: "cambio",
    });
    expect(mockedProgramarAviso).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "b_1", proposito: "cambio" })
    );
    expect(cambio).toMatchObject({
      ok: false,
      mensaje:
        "No he podido avisar a Marta García (ese número pidió no recibir mensajes).",
    });
  });
});

describe("marcar_ausencia", () => {
  it("días enteros en la zona del negocio, con aviso de citas afectadas; rechaza solapes y tramos absurdos", async () => {
    mockedBookingCount.mockResolvedValue(2);
    const r = await comprobar("marcar_ausencia", {
      profesional: "laura",
      desde: "2026-11-09",
      hasta: "2026-11-11",
    });
    expect(r).toMatchObject({
      ok: true,
      descripcion:
        "marcar a Laura como ausente del lunes, 9 de noviembre al miércoles, 11 de noviembre: la recepcionista no le reservará nada en ese tramo. Ojo: ya tiene 2 citas ahí, que no se mueven solas",
      parametros: {
        profesional: "pro_laura",
        desde: "2026-11-09",
        hasta: "2026-11-11",
      },
    });
    expect(mockedBookingCount).toHaveBeenCalledWith({
      where: {
        call: { businessId: "biz_1" },
        professionalId: "pro_laura",
        isCancelled: false,
        programedAt: {
          gte: new Date("2026-11-08T23:00:00.000Z"),
          lt: new Date("2026-11-11T23:00:00.000Z"),
        },
      },
    });
    expect(
      (
        await comprobar("marcar_ausencia", {
          profesional: "Laura",
          desde: "2026-11-11",
          hasta: "2026-11-09",
        })
      ).motivo
    ).toContain("anterior a la inicial");
    expect(
      (
        await comprobar("marcar_ausencia", {
          profesional: "Laura",
          desde: "2026-11-01",
          hasta: "2027-02-01",
        })
      ).motivo
    ).toContain("62 días");
    expect(
      (
        await comprobar("marcar_ausencia", {
          profesional: "Laura",
          desde: "2026-11-09",
          horaInicio: "09:00",
        })
      ).motivo
    ).toContain("van juntas");
    vi.mocked(prisma.professionalAbsence.findFirst).mockResolvedValueOnce({
      id: "a_1",
    } as never);
    expect(
      (
        await comprobar("marcar_ausencia", {
          profesional: "Laura",
          desde: "2026-11-09",
        })
      ).motivo
    ).toContain("ya tiene una ausencia");
  });

  it("al confirmar guarda la ausencia (con horas si las hay) y sugiere qué hacer con las citas", async () => {
    vi.mocked(prisma.professionalAbsence.create).mockResolvedValue({} as never);
    mockedBookingCount.mockResolvedValue(1);
    const r = await ejecutar("marcar_ausencia", {
      profesional: "Laura",
      desde: "2026-11-09",
      horaInicio: "09:00",
      horaFin: "14:00",
      motivo: "médico",
    });
    expect(prisma.professionalAbsence.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz_1",
        professionalId: "pro_laura",
        startsAt: new Date("2026-11-09T08:00:00.000Z"),
        endsAt: new Date("2026-11-09T13:00:00.000Z"),
        reason: "médico",
        createdVia: "owner_chat",
      },
    });
    expect(r.ok).toBe(true);
    expect(r.mensaje).toBe(
      "Hecho: Laura no está el lunes, 9 de noviembre de 09:00 a 14:00; la recepcionista no le reservará nada ahí. Tiene 1 cita en ese tramo: dime si las movemos o las cancelamos."
    );
  });
});

describe("bloquear_franja", () => {
  it("describe lo que queda abierto y, al confirmar, guarda la excepción con horario especial (o cerrado si no queda nada)", async () => {
    mockedGuardarHorario.mockResolvedValue({ sincronizado: true });
    expect(
      await comprobar("bloquear_franja", {
        fecha: "2026-11-12",
        desde: "14:00",
        hasta: "18:00",
        motivo: "formación",
      })
    ).toMatchObject({
      ok: true,
      descripcion:
        "bloquear el jueves, 12 de noviembre de 14:00 a 18:00 (formación): ese día queda de 09:00 a 14:00",
    });
    const r = await ejecutar("bloquear_franja", {
      fecha: "2026-11-12",
      desde: "14:00",
      hasta: "18:00",
      motivo: "formación",
    });
    expect(r.ok).toBe(true);
    expect(mockedGuardarHorario.mock.calls[0]![1].exceptions).toEqual([
      {
        date: "2026-11-12",
        closed: false,
        intervals: [{ start: "09:00", end: "14:00" }],
        label: "formación",
      },
    ]);

    await ejecutar("bloquear_franja", {
      fecha: "2026-11-12",
      desde: "08:00",
      hasta: "20:00",
    });
    expect(mockedGuardarHorario.mock.calls[1]![1].exceptions).toEqual([
      { date: "2026-11-12", closed: true, intervals: [] },
    ]);
  });

  it("rechaza días pasados, ya cerrados y tramos que ya están fuera del horario", async () => {
    expect(
      (
        await comprobar("bloquear_franja", {
          fecha: "2020-01-01",
          desde: "10:00",
          hasta: "11:00",
        })
      ).motivo
    ).toBe("Esa fecha ya ha pasado.");
    expect(
      (
        await comprobar("bloquear_franja", {
          fecha: "2026-11-15",
          desde: "10:00",
          hasta: "11:00",
        })
      ).motivo
    ).toContain("ya está cerrado");
    expect(
      (
        await comprobar("bloquear_franja", {
          fecha: "2026-11-12",
          desde: "19:00",
          hasta: "21:00",
        })
      ).motivo
    ).toContain("ya está fuera del horario");
    expect(
      (
        await comprobar("bloquear_franja", {
          fecha: "2026-11-12",
          desde: "12:00",
          hasta: "11:00",
        })
      ).motivo
    ).toContain("posterior a desde");
  });
});
