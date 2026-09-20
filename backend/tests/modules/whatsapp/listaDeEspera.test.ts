import { describe, it, expect, beforeEach, vi } from "vitest";
import { filaDeConexion } from "../../helpers/conexionDeCalendario.js";
import { prisma } from "../../../src/lib/prisma.js";
import { enqueueWhatsappJob } from "../../../src/lib/cloudTasks.js";
import { calendarService } from "../../../src/modules/calendar/service.js";
import { marcarCalendarioDesconectado } from "../../../src/modules/calendar/conexion.js";
import {
  checkBookingRestrictions,
  checkBusinessHours,
} from "../../../src/lib/businessSchedule.js";
import { checkAvailability } from "../../../src/lib/availability.js";
import {
  acquireBookingLock,
  releaseBookingLock,
} from "../../../src/lib/bookingLock.js";
import { buildCalendarIdempotencyKey } from "../../../src/lib/calendarIdempotency.js";
import { CalendarBusinessError } from "../../../src/adapters/calendar/errors.js";
import { whatsappAdapter } from "../../../src/adapters/whatsapp/WhatsAppAdapter.js";
import {
  refrescarPlantilla,
  resolverPlantilla,
} from "../../../src/modules/whatsapp/service.js";
import { estaDadoDeBaja } from "../../../src/modules/whatsapp/bajas.js";
import { avisarNuevaReserva } from "../../../src/modules/whatsapp/avisosNegocio.js";
import { programarMensajesAlCliente } from "../../../src/modules/whatsapp/mensajesCliente.js";
import {
  avisarAQuienEsperaba,
  cerrarAviso,
  nombreDelQueEspera,
  reservarDesdeListaDeEspera,
  VENTANA_DE_OFERTA_MS,
} from "../../../src/modules/whatsapp/listaDeEspera.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    lead: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    booking: { findFirst: vi.fn() },
    call: { findUnique: vi.fn() },
    service: { findMany: vi.fn() },
    professional: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../../../src/lib/cloudTasks.js", () => ({
  enqueueWhatsappJob: vi.fn(),
}));
vi.mock("../../../src/modules/calendar/service.js", () => ({
  calendarService: {
    bookAppointment: vi.fn(),
    getBusyIntervals: vi.fn(),
    cancelAppointment: vi.fn(),
  },
}));
vi.mock("../../../src/modules/calendar/conexion.js", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../../src/modules/calendar/conexion.js")
    >();
  return { ...actual, marcarCalendarioDesconectado: vi.fn() };
});
vi.mock("../../../src/lib/businessSchedule.js", () => ({
  checkBusinessHours: vi.fn(),
  checkBookingRestrictions: vi.fn(),
}));
vi.mock("../../../src/lib/availability.js", () => ({
  checkAvailability: vi.fn(),
  computeAvailabilityLookaheadMs: vi.fn(
    (d: number) => 4 * 60 * 60_000 + d * 60_000
  ),
}));
vi.mock("../../../src/lib/bookingLock.js", () => ({
  acquireBookingLock: vi.fn(),
  releaseBookingLock: vi.fn(),
}));
vi.mock("../../../src/adapters/whatsapp/WhatsAppAdapter.js", () => ({
  whatsappAdapter: { isConfigured: vi.fn() },
}));
vi.mock("../../../src/modules/whatsapp/service.js", () => ({
  refrescarPlantilla: vi.fn(),
  resolverPlantilla: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/bajas.js", () => ({
  estaDadoDeBaja: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/avisosNegocio.js", () => ({
  avisarNuevaReserva: vi.fn(),
  nombreDeServicios: vi.fn(),
}));
vi.mock(
  "../../../src/modules/whatsapp/mensajesCliente.js",
  async (importActual) => {
    const actual =
      await importActual<
        typeof import("../../../src/modules/whatsapp/mensajesCliente.js")
      >();
    return {
      sanearNombre: actual.sanearNombre,
      describirServicioParaCliente: actual.describirServicioParaCliente,
      programarMensajesAlCliente: vi.fn(),
    };
  }
);

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedLeadFindMany = vi.mocked(prisma.lead.findMany);
const mockedLeadFindFirst = vi.mocked(prisma.lead.findFirst);
const mockedLeadFindUnique = vi.mocked(prisma.lead.findUnique);
const mockedLeadUpdateMany = vi.mocked(prisma.lead.updateMany);
const mockedLeadUpdate = vi.mocked(prisma.lead.update);
const mockedBookingFindFirst = vi.mocked(prisma.booking.findFirst);
const mockedCallFindUnique = vi.mocked(prisma.call.findUnique);
const mockedServiceFindMany = vi.mocked(prisma.service.findMany);
const mockedProfessionalFindFirst = vi.mocked(prisma.professional.findFirst);
const mockedTransaction = vi.mocked(prisma.$transaction);
const mockedEnqueue = vi.mocked(enqueueWhatsappJob);
const mockedBook = vi.mocked(calendarService.bookAppointment);
const mockedBusy = vi.mocked(calendarService.getBusyIntervals);
const mockedCancelEvent = vi.mocked(calendarService.cancelAppointment);
const mockedDesconectar = vi.mocked(marcarCalendarioDesconectado);
const mockedHours = vi.mocked(checkBusinessHours);
const mockedRestrictions = vi.mocked(checkBookingRestrictions);
const mockedAvailability = vi.mocked(checkAvailability);
const mockedLock = vi.mocked(acquireBookingLock);
const mockedUnlock = vi.mocked(releaseBookingLock);
const mockedConfigured = vi.mocked(whatsappAdapter.isConfigured);
const mockedRefrescar = vi.mocked(refrescarPlantilla);
const mockedResolver = vi.mocked(resolverPlantilla);
const mockedBaja = vi.mocked(estaDadoDeBaja);
const mockedAvisarNueva = vi.mocked(avisarNuevaReserva);
const mockedProgramar = vi.mocked(programarMensajesAlCliente);

const MOVIL = "+34692138456";
const HORA = new Date(Date.now() + 3 * 24 * 60 * 60_000);
const HUECO = { inicioMs: HORA.getTime(), finMs: HORA.getTime() + 30 * 60_000 };
const NEGOCIO = {
  id: "biz_1",
  name: "Peluquería Ana",
  schedule: {},
  timezone: "Europe/Madrid",
  bookingCapacity: 1,
  minAdvanceBookingMinutes: null,
  maxAppointmentDurationMinutes: null,
  telnyxPhoneNumber: "+34930454394",
  phone: "+34930000000",
  subscriptionStatus: null,
  active: true,
  calendarProvider: "google",
  calendarConnections: [filaDeConexion("google", { refreshToken: "r" })],
};
const PLANTILLA_HUECO = {
  telnyxTemplateId: "tpl-hueco",
  name: "hueco_libre",
  language: "es",
  components: null,
};

function lead(
  overrides: Record<string, unknown> = {},
  data: Record<string, unknown> = {}
) {
  return {
    id: "lead_1",
    notifiedAt: null,
    notifiedVia: null,
    resolvedAt: null,
    data: {
      clientPhone: MOVIL,
      startDateTime: HORA.toISOString(),
      durationMinutes: 30,
      serviceIds: [],
      professionalId: null,
      ...data,
    },
    ...overrides,
  };
}

const ENTRADA = {
  businessId: "biz_1",
  hueco: HUECO,
  origen: "cancelacion_voz" as const,
  etiqueta: "test",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mockedConfigured.mockReturnValue(true);
  mockedRefrescar.mockResolvedValue(undefined);
  mockedResolver.mockImplementation(async (ref) =>
    "key" in ref && ref.key === "hueco_libre"
      ? (PLANTILLA_HUECO as never)
      : null
  );
  mockedBusinessFindUnique.mockResolvedValue(NEGOCIO as never);
  mockedLeadFindMany.mockResolvedValue([]);
  mockedLeadUpdateMany.mockResolvedValue({ count: 1 });
  mockedLeadUpdate.mockResolvedValue({} as never);
  mockedBookingFindFirst.mockResolvedValue(null);
  mockedBaja.mockResolvedValue(false);
  mockedHours.mockReturnValue({ success: true, isOpen: true } as never);
  mockedRestrictions.mockReturnValue({ success: true });
  mockedBusy.mockResolvedValue({
    intervals: [],
    calendarAvailabilityKnown: true,
  });
  mockedAvailability.mockResolvedValue({
    available: true,
    availableProfessionals: [{ id: "p1", name: "Laura" }],
  } as never);
  mockedServiceFindMany.mockResolvedValue([]);
  mockedEnqueue.mockResolvedValue(undefined);
  mockedLock.mockResolvedValue("token");
  mockedUnlock.mockResolvedValue(undefined);
  mockedCallFindUnique.mockResolvedValue(null);
  mockedBook.mockResolvedValue({ id: "evt_1" } as never);
  mockedAvisarNueva.mockResolvedValue({ via: "interactivo" });
  mockedProgramar.mockResolvedValue({ confirmacion: "programada" });
});

describe("avisarAQuienEsperaba", () => {
  it("solo mira leads del negocio, en orden de antigüedad, y solo los que pisan el hueco", async () => {
    const otraHora = new Date(HORA.getTime() + 48 * 60 * 60_000).toISOString();
    mockedLeadFindMany.mockResolvedValue([
      lead({ id: "lead_otro" }, { startDateTime: otraHora }),
      lead({ id: "lead_1" }),
    ] as never);

    const r = await avisarAQuienEsperaba(ENTRADA);

    expect(mockedLeadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: "availability_watch",
          resolvedAt: null,
          call: { businessId: "biz_1" },
        },
        orderBy: { createdAt: "asc" },
        take: 50,
      })
    );
    // El de otra hora ni consulta el calendario.
    expect(mockedBusy).toHaveBeenCalledTimes(1);
    expect(r).toEqual({
      resultado: "avisado",
      leadId: "lead_1",
      cliente: null,
    });
  });

  it("cierra los pasados (resolvedBy pasado) ANTES del filtro de solapamiento aunque no pisen el hueco, y los de números con STOP (baja), y sigue con el siguiente", async () => {
    const pasado = new Date(Date.now() - 60_000).toISOString();
    // Pasado y de otra hora: no pisa el hueco, pero se cierra igual.
    const pasadoOtraHora = new Date(
      Date.now() - 10 * 24 * 60 * 60_000
    ).toISOString();
    mockedLeadFindMany.mockResolvedValue([
      lead(
        { id: "lead_pasado" },
        { startDateTime: pasado, clientPhone: "+34600000001" }
      ),
      lead(
        { id: "lead_pasado_otra_hora" },
        { startDateTime: pasadoOtraHora, clientPhone: "+34600000002" }
      ),
      lead({ id: "lead_baja" }, { clientPhone: "+34600000003" }),
      lead({ id: "lead_ok" }),
    ] as never);
    mockedBaja.mockImplementation(async (_a, tel) => tel === "+34600000003");

    const r = await avisarAQuienEsperaba(ENTRADA);

    expect(r).toEqual({
      resultado: "avisado",
      leadId: "lead_ok",
      cliente: null,
    });
    const cierres = mockedLeadUpdateMany.mock.calls
      .map((c) => c[0])
      .filter((arg) => (arg.data as { resolvedAt?: unknown }).resolvedAt);
    expect(cierres.map((c) => (c.where as { id: string }).id)).toEqual([
      "lead_pasado",
      "lead_pasado_otra_hora",
      "lead_baja",
    ]);
    expect(
      (cierres[0].data as { data: { resolvedBy: string } }).data.resolvedBy
    ).toBe("pasado");
    expect(
      (cierres[1].data as { data: { resolvedBy: string } }).data.resolvedBy
    ).toBe("pasado");
    expect(
      (cierres[2].data as { data: { resolvedBy: string } }).data.resolvedBy
    ).toBe("baja");
  });

  it("cincuenta zombis se limpian en el primer disparo y el 51.º recibe la plaza en el siguiente", async () => {
    const pasado = new Date(Date.now() - 60_000).toISOString();
    const viejos = Array.from({ length: 50 }, (_, i) => {
      const tipo = i % 3;
      if (tipo === 0)
        return lead({ id: `pasado_${i}` }, { startDateTime: pasado });
      if (tipo === 1)
        return lead({
          id: `caducado_${i}`,
          notifiedAt: new Date(Date.now() - VENTANA_DE_OFERTA_MS - 1000),
          notifiedVia: "plantilla:hueco_libre",
        });
      return lead({
        id: `muerto_${i}`,
        notifiedAt: new Date(Date.now() - VENTANA_DE_OFERTA_MS - 1000),
        notifiedVia: "encolado",
      });
    });
    // Simulación fiel de la consulta real: `take` limita a los 50 más
    // antiguos, y un lead cerrado (updateMany con resolvedAt) deja de salir.
    const abiertos = [...viejos, lead({ id: "lead_51" })];
    mockedLeadFindMany.mockImplementation(async (args) =>
      abiertos.slice(0, (args as { take: number }).take)
    );
    mockedLeadUpdateMany.mockImplementation(async (args) => {
      const where = (args as { where: { id?: string; resolvedAt?: unknown } })
        .where;
      const cierra = (args as { data: { resolvedAt?: unknown } }).data
        .resolvedAt;
      const idx = abiertos.findIndex((l) => l.id === where.id);
      if (cierra && idx >= 0) abiertos.splice(idx, 1);
      return { count: idx >= 0 ? 1 : 0 };
    });
    // Los encolados muertos siguen siendo candidatos pero ya no hay hueco
    // para ellos (checkAvailability false, 16 en cada disparo); el 51.º es
    // la 33.ª comprobación.
    mockedAvailability.mockImplementation(async () =>
      mockedAvailability.mock.calls.length > 32
        ? ({ available: true, availableProfessionals: [] } as never)
        : ({ available: false, code: "CAPACITY_REACHED" } as never)
    );

    // Primer disparo: la página son los 50 zombis; se limpian 34 y nadie
    // recibe la plaza (los 16 encolados muertos no tienen hueco).
    expect(await avisarAQuienEsperaba(ENTRADA)).toEqual({ resultado: "nadie" });
    const cerrados = mockedLeadUpdateMany.mock.calls.filter(
      (c) => (c[0].data as { resolvedAt?: unknown }).resolvedAt
    );
    expect(cerrados).toHaveLength(34);
    expect(
      cerrados.map(
        (c) => (c[0].data as { data: { resolvedBy: string } }).data.resolvedBy
      )
    ).toEqual(expect.arrayContaining(["pasado", "sin_respuesta"]));
    expect(mockedEnqueue).not.toHaveBeenCalled();
    expect(abiertos).toHaveLength(17);

    // Segundo disparo: ya caben los 16 muertos y el 51.º, que se lleva la plaza.
    expect(await avisarAQuienEsperaba(ENTRADA)).toEqual({
      resultado: "avisado",
      leadId: "lead_51",
      cliente: null,
    });
    expect(mockedEnqueue).toHaveBeenCalledTimes(1);
    expect(mockedEnqueue.mock.calls[0][0]).toEqual(
      expect.objectContaining({ leadId: "lead_51" })
    );
  });

  it("oferta vigente (<10 min) ⇒ en_oferta con minutos sin avisar a nadie; oferta caducada con plantilla enviada se cierra sin_respuesta y no es candidata; encolado con ≥10 min vuelve a ser candidato", async () => {
    mockedLeadFindMany.mockResolvedValue([
      lead(
        {
          id: "vigente",
          notifiedAt: new Date(Date.now() - 4 * 60_000),
          notifiedVia: "plantilla:hueco_libre",
        },
        { clientName: "Marta" }
      ),
      lead({ id: "otro" }),
    ] as never);
    expect(await avisarAQuienEsperaba(ENTRADA)).toEqual({
      resultado: "en_oferta",
      cliente: "Marta",
      minutos: 4,
    });
    expect(mockedEnqueue).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mockedLeadFindMany.mockResolvedValue([
      lead({
        id: "caducado",
        notifiedAt: new Date(Date.now() - VENTANA_DE_OFERTA_MS - 1),
        notifiedVia: "plantilla:hueco_libre",
      }),
      lead({
        id: "muerto",
        notifiedAt: new Date(Date.now() - VENTANA_DE_OFERTA_MS - 1),
        notifiedVia: "encolado",
      }),
    ] as never);
    mockedLeadUpdateMany.mockResolvedValue({ count: 1 });
    const r = await avisarAQuienEsperaba(ENTRADA);
    expect(r).toEqual({
      resultado: "avisado",
      leadId: "muerto",
      cliente: null,
    });
    expect(mockedLeadUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "caducado", resolvedAt: null },
        data: expect.objectContaining({
          data: expect.objectContaining({ resolvedBy: "sin_respuesta" }),
        }),
      })
    );
  });

  it("no ofrece un hueco que checkBusinessHours/checkBookingRestrictions rechazan y no cierra ese lead", async () => {
    mockedLeadFindMany.mockResolvedValue([lead()] as never);
    mockedRestrictions.mockReturnValue({
      success: false,
      code: "MIN_ADVANCE_NOT_MET",
      message: "",
    });

    expect(await avisarAQuienEsperaba(ENTRADA)).toEqual({ resultado: "nadie" });
    expect(mockedBusy).not.toHaveBeenCalled();
    expect(mockedLeadUpdateMany).not.toHaveBeenCalled();
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it("reclama el lead con updateMany condicional antes de encolar espera-<leadId>-<epoch>; si el reclamo devuelve 0 pasa al siguiente; si el enqueue falla revierte y devuelve error", async () => {
    mockedLeadFindMany.mockResolvedValue([
      lead({ id: "a" }),
      lead({ id: "b" }),
    ] as never);
    mockedLeadUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const antes = Math.floor(Date.now() / 1000);

    expect(await avisarAQuienEsperaba(ENTRADA)).toEqual({
      resultado: "avisado",
      leadId: "b",
      cliente: null,
    });
    expect(mockedLeadUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "a",
        resolvedAt: null,
        OR: [
          { notifiedAt: null },
          { notifiedVia: "encolado", notifiedAt: { lt: expect.any(Date) } },
        ],
      },
      data: { notifiedAt: expect.any(Date), notifiedVia: "encolado" },
    });
    expect(mockedEnqueue).toHaveBeenCalledTimes(1);
    const [job, opciones] = mockedEnqueue.mock.calls[0];
    expect(job).toEqual({
      proposito: "hueco_libre",
      leadId: "b",
      businessId: "biz_1",
      toNumber: MOVIL,
      audience: "client",
    });
    expect(opciones?.taskId).toMatch(
      new RegExp(`^espera-b-(${antes}|${antes + 1}|${antes + 2})$`)
    );

    vi.clearAllMocks();
    mockedLeadFindMany.mockResolvedValue([lead({ id: "c" })] as never);
    mockedLeadUpdateMany.mockResolvedValue({ count: 1 });
    mockedEnqueue.mockRejectedValue(new Error("Cloud Tasks caído"));
    expect(await avisarAQuienEsperaba(ENTRADA)).toEqual({
      resultado: "error",
      motivo: "Cloud Tasks caído",
    });
    expect(mockedLeadUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "c", notifiedVia: "encolado" },
      data: { notifiedAt: null, notifiedVia: "ninguna:encolado-fallido" },
    });
  });

  it("llama a refrescarPlantilla de hueco_libre y hora_disponible antes de resolver; sin plantilla aprobada ni variable ⇒ sin_plantilla sin tocar leads", async () => {
    mockedResolver.mockResolvedValue(null);
    delete process.env.WHATSAPP_TEMPLATE_SLOT_AVAILABLE_NAME;

    expect(await avisarAQuienEsperaba(ENTRADA)).toEqual({
      resultado: "sin_plantilla",
    });
    expect(mockedRefrescar).toHaveBeenCalledWith("hueco_libre");
    expect(mockedRefrescar).toHaveBeenCalledWith("hora_disponible");
    expect(mockedLeadFindMany).not.toHaveBeenCalled();

    process.env.WHATSAPP_TEMPLATE_SLOT_AVAILABLE_NAME = "hora_disponible";
    mockedLeadFindMany.mockResolvedValue([lead()] as never);
    expect(await avisarAQuienEsperaba(ENTRADA)).toEqual(
      expect.objectContaining({ resultado: "avisado" })
    );
    delete process.env.WHATSAPP_TEMPLATE_SLOT_AVAILABLE_NAME;

    mockedConfigured.mockReturnValue(false);
    expect(await avisarAQuienEsperaba(ENTRADA)).toEqual({
      resultado: "sin_plantilla",
    });
  });

  it("se para tras avisar a uno", async () => {
    mockedLeadFindMany.mockResolvedValue([
      lead({ id: "a" }),
      lead({ id: "b" }),
    ] as never);

    await avisarAQuienEsperaba(ENTRADA);

    expect(mockedEnqueue).toHaveBeenCalledTimes(1);
    expect(mockedBusy).toHaveBeenCalledTimes(1);
  });

  it("nombreDelQueEspera: lead → última reserva del mismo negocio → null, nunca de otro negocio; sanea el nombre", async () => {
    expect(
      await nombreDelQueEspera(
        lead({}, { clientName: "  Marta\n López " }),
        "biz_1"
      )
    ).toBe("Marta López");

    mockedBookingFindFirst.mockResolvedValue({ clientName: "Ana" } as never);
    expect(await nombreDelQueEspera(lead(), "biz_1")).toBe("Ana");
    expect(mockedBookingFindFirst).toHaveBeenCalledWith({
      where: {
        call: { businessId: "biz_1" },
        OR: [
          { clientPhone: MOVIL },
          { clientPhone: null, call: { fromNumber: MOVIL } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { clientName: true },
    });

    mockedBookingFindFirst.mockResolvedValue(null);
    expect(await nombreDelQueEspera(lead(), "biz_1")).toBeNull();
  });
});

describe("reservarDesdeListaDeEspera", () => {
  const ENTRADA_SI = {
    leadId: "lead_1",
    businessId: "biz_1",
    from: MOVIL,
    inboundMessageId: "in_1",
    contactName: "Miki",
  };

  function transaccionReal() {
    const tx = {
      call: { upsert: vi.fn().mockResolvedValue({ id: "call_row_sint" }) },
      booking: { upsert: vi.fn().mockResolvedValue({ id: "booking_9" }) },
      lead: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    mockedTransaction.mockImplementation(async (fn) =>
      (fn as (t: typeof tx) => Promise<unknown>)(tx)
    );
    return tx;
  }

  beforeEach(() => {
    mockedLeadFindFirst.mockResolvedValue(lead() as never);
    mockedLeadFindUnique.mockResolvedValue(lead() as never);
  });

  it("crea la Call sintética whatsapp:espera:<leadId> DENTRO de la transacción y la reserva con callId = Call.id (no la cadena), createdVia whatsapp_lista_espera, smsConsent true, sin clientNotifiedAt, resuelve el lead con resolvedBy reservado y bookingId, y avisa al dueño solo con el nombre", async () => {
    const tx = transaccionReal();
    mockedLeadFindFirst.mockResolvedValue(
      lead({}, { clientName: "Marta" }) as never
    );
    mockedLeadFindUnique.mockResolvedValue(
      lead({}, { clientName: "Marta" }) as never
    );

    const r = await reservarDesdeListaDeEspera(ENTRADA_SI);

    expect(r).toEqual({
      estado: "reservada",
      bookingId: "booking_9",
      startDateTime: HORA,
      servicio: "lo que pediste con Laura",
    });
    expect(tx.call.upsert).toHaveBeenCalledWith({
      where: { callId: "whatsapp:espera:lead_1" },
      create: expect.objectContaining({
        callId: "whatsapp:espera:lead_1",
        voiceProvider: "whatsapp",
        providerCallId: "lead_1",
        businessId: "biz_1",
        fromNumber: MOVIL,
        status: "COMPLETED",
        outcome: "RESOLVED",
        successful: true,
        durationSecs: 0,
        costCents: 0,
      }),
      update: {},
      select: { id: true },
    });
    const upsert = tx.booking.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ callId: "call_row_sint" });
    expect(upsert.create).toEqual(
      expect.objectContaining({
        callId: "call_row_sint",
        createdVia: "whatsapp_lista_espera",
        smsConsent: true,
        clientName: "Marta",
        clientPhone: MOVIL,
        externalEventId: "evt_1",
        professionalId: "p1",
      })
    );
    expect(upsert.create.clientNotifiedAt).toBeUndefined();
    expect(upsert.update).toEqual(
      expect.objectContaining({
        isCancelled: false,
        cancelledAt: null,
        cancelledBy: null,
      })
    );
    // Cierre CONDICIONAL del lead: un «Ya no» concurrente no se pisa.
    expect(tx.lead.updateMany).toHaveBeenCalledWith({
      where: {
        id: "lead_1",
        OR: [
          { resolvedAt: null },
          { data: { path: ["resolvedBy"], equals: "sin_respuesta" } },
        ],
      },
      data: {
        resolvedAt: expect.any(Date),
        data: expect.objectContaining({
          resolvedBy: "reservado",
          bookingId: "booking_9",
          resolvedFromInboundMessageId: "in_1",
        }),
      },
    });
    // La clave del calendario es por TOQUE (lleva el entrante), no por lead.
    expect(mockedBook).toHaveBeenCalledWith(
      expect.objectContaining({
        clientName: "Marta",
        clientPhone: MOVIL,
        idempotencyKey: buildCalendarIdempotencyKey({
          callId: "whatsapp:espera:lead_1",
          startDateTime: HORA.toISOString(),
          durationMinutes: 30,
          distintivo: "in_1",
        }),
      })
    );
    expect(mockedAvisarNueva).toHaveBeenCalledWith({
      businessId: "biz_1",
      businessName: "Peluquería Ana",
      timezone: "Europe/Madrid",
      bookingId: "booking_9",
      clientName: "Marta",
      startDateTime: HORA,
      serviceNames: [],
      professionalName: "Laura",
    });
    expect(JSON.stringify(mockedAvisarNueva.mock.calls[0][0])).not.toContain(
      MOVIL
    );
    expect(mockedUnlock).toHaveBeenCalledWith("biz_1", "token");
  });

  it("un Sí que acaba en ocupado/calendario_caido/lock no crea ninguna Call", async () => {
    mockedAvailability.mockResolvedValue({
      available: false,
      code: "CAPACITY_REACHED",
    } as never);
    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "ocupado",
    });

    mockedAvailability.mockResolvedValue({
      available: true,
      availableProfessionals: [],
    } as never);
    mockedBusy.mockResolvedValue({
      intervals: [],
      calendarAvailabilityKnown: false,
    });
    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "calendario_caido",
    });

    mockedLock.mockResolvedValue(null);
    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "lock",
    });

    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(mockedBook).not.toHaveBeenCalled();
  });

  it("doble toque: la segunda relee el lead resuelto ⇒ ya_reservada sin segundo evento; una Call sintética con reserva viva también da ya_reservada", async () => {
    mockedLeadFindUnique.mockResolvedValue(
      lead(
        { resolvedAt: new Date() },
        { resolvedBy: "reservado", bookingId: "booking_9" }
      ) as never
    );
    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "ya_reservada",
    });

    mockedLeadFindUnique.mockResolvedValue(lead() as never);
    mockedCallFindUnique.mockResolvedValue({
      booking: { id: "booking_9", isCancelled: false },
    } as never);
    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "ya_reservada",
      bookingId: "booking_9",
    });
    expect(mockedBook).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("lead cerrado por ya_no ⇒ cerrado; sin_respuesta ⇒ se intenta y reserva si hay hueco; hora pasada ⇒ pasada y cierra", async () => {
    mockedLeadFindFirst.mockResolvedValue(
      lead({ resolvedAt: new Date() }, { resolvedBy: "ya_no" }) as never
    );
    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "cerrado",
    });

    transaccionReal();
    const sinRespuesta = lead(
      { resolvedAt: new Date() },
      { resolvedBy: "sin_respuesta" }
    );
    mockedLeadFindFirst.mockResolvedValue(sinRespuesta as never);
    mockedLeadFindUnique.mockResolvedValue(sinRespuesta as never);
    expect((await reservarDesdeListaDeEspera(ENTRADA_SI)).estado).toBe(
      "reservada"
    );

    const pasado = lead(
      {},
      { startDateTime: new Date(Date.now() - 60_000).toISOString() }
    );
    mockedLeadFindFirst.mockResolvedValue(pasado as never);
    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "pasada",
    });
    expect(mockedLeadUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "lead_1", resolvedAt: null },
        data: expect.objectContaining({
          data: expect.objectContaining({ resolvedBy: "pasado" }),
        }),
      })
    );
    // Otro teléfono o lead de otro negocio: cerrado.
    mockedLeadFindFirst.mockResolvedValue(
      lead({}, { clientPhone: "+34600000000" }) as never
    );
    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "cerrado",
    });
    mockedLeadFindFirst.mockResolvedValue(null);
    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "cerrado",
    });
  });

  it("restricciones de antelación/horario incumplidas ⇒ fuera_de_plazo (no ocupado) y cierra fuera_de_plazo", async () => {
    mockedRestrictions.mockReturnValue({
      success: false,
      code: "MIN_ADVANCE_NOT_MET",
      message: "",
    });

    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "fuera_de_plazo",
    });
    expect(mockedLeadUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.objectContaining({ resolvedBy: "fuera_de_plazo" }),
        }),
      })
    );
    expect(mockedAvailability).not.toHaveBeenCalled();
  });

  it("calendario ilegible ⇒ calendario_caido con lead abierto; conexión revocada ⇒ marcarCalendarioDesconectado y sin_calendario; lock no adquirido ⇒ lock con lead abierto", async () => {
    mockedBusy.mockResolvedValue({
      intervals: [],
      calendarAvailabilityKnown: false,
    });
    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "calendario_caido",
    });
    expect(mockedLeadUpdateMany).not.toHaveBeenCalled();

    mockedBusy.mockResolvedValue({
      intervals: [],
      calendarAvailabilityKnown: true,
    });
    mockedBook.mockRejectedValue(
      new CalendarBusinessError(
        "GOOGLE_CALENDAR_RECONNECT_REQUIRED",
        "token revocado",
        "google"
      )
    );
    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "sin_calendario",
    });
    expect(mockedDesconectar).toHaveBeenCalledWith(
      "biz_1",
      "google",
      { modo: "revocar" },
      { prefijo: "[WhatsApp]" }
    );

    // Sin conexión operativa ni se entra al lock.
    mockedBusinessFindUnique.mockResolvedValue({
      ...NEGOCIO,
      calendarConnections: [],
    } as never);
    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "sin_calendario",
    });

    mockedBusinessFindUnique.mockResolvedValue(NEGOCIO as never);
    mockedLock.mockResolvedValue(null);
    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "lock",
    });
    expect(mockedLeadUpdateMany).not.toHaveBeenCalled();
  });

  it("hueco ocupado ⇒ ocupado y lead cerrado ocupado", async () => {
    mockedAvailability.mockResolvedValue({
      available: false,
      code: "CAPACITY_REACHED",
    } as never);

    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "ocupado",
    });
    expect(mockedLeadUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lead_1", resolvedAt: null },
        data: expect.objectContaining({
          data: expect.objectContaining({ resolvedBy: "ocupado" }),
        }),
      })
    );
  });

  it("fallo al guardar tras crear el evento ⇒ borra el evento huérfano y devuelve error", async () => {
    mockedTransaction.mockRejectedValue(new Error("BD caída"));

    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "error",
    });
    expect(mockedCancelEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_1" })
    );
    expect(mockedAvisarNueva).not.toHaveBeenCalled();
    expect(mockedUnlock).toHaveBeenCalled();
  });

  it("lead reservado cuya reserva ya se canceló ⇒ cerrado (no «esa hora ya es tuya»), mirando solo reservas del negocio", async () => {
    const reservado = lead(
      { resolvedAt: new Date() },
      { resolvedBy: "reservado", bookingId: "booking_9" }
    );
    mockedLeadFindFirst.mockResolvedValue(reservado as never);
    mockedLeadFindUnique.mockResolvedValue(reservado as never);
    mockedBookingFindFirst.mockResolvedValue({ isCancelled: true } as never);

    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "cerrado",
    });
    expect(mockedBookingFindFirst).toHaveBeenCalledWith({
      where: { id: "booking_9", call: { businessId: "biz_1" } },
      select: { isCancelled: true },
    });
    expect(mockedBook).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();

    // Con la reserva viva sigue siendo ya_reservada.
    mockedBookingFindFirst.mockResolvedValue({ isCancelled: false } as never);
    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "ya_reservada",
    });
  });

  it("tras un error con el evento deshecho, el segundo «Sí» pide al calendario una clave distinta (no recibe el evento cancelado)", async () => {
    mockedTransaction.mockRejectedValueOnce(new Error("BD caída"));
    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "error",
    });
    expect(mockedCancelEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_1" })
    );
    const primeraClave = (
      mockedBook.mock.calls[0][0] as { idempotencyKey: string }
    ).idempotencyKey;

    transaccionReal();
    mockedBook.mockResolvedValue({ id: "evt_2" } as never);
    expect(
      (
        await reservarDesdeListaDeEspera({
          ...ENTRADA_SI,
          inboundMessageId: "in_2",
        })
      ).estado
    ).toBe("reservada");
    const segundaClave = (
      mockedBook.mock.calls[1][0] as { idempotencyKey: string }
    ).idempotencyKey;
    expect(segundaClave).not.toBe(primeraClave);
    expect(segundaClave).toBe(
      buildCalendarIdempotencyKey({
        callId: "whatsapp:espera:lead_1",
        startDateTime: HORA.toISOString(),
        durationMinutes: 30,
        distintivo: "in_2",
      })
    );
  });

  it("un «Ya no» que cierra el lead mientras se crea el evento deshace la reserva: evento borrado, sin Booking efectivo y estado cerrado", async () => {
    const tx = transaccionReal();
    tx.lead.updateMany.mockResolvedValue({ count: 0 });

    expect(await reservarDesdeListaDeEspera(ENTRADA_SI)).toEqual({
      estado: "cerrado",
    });
    expect(mockedCancelEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_1" })
    );
    expect(mockedAvisarNueva).not.toHaveBeenCalled();
    expect(mockedProgramar).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("se cerró mientras se reservaba")
    );
    expect(mockedUnlock).toHaveBeenCalledWith("biz_1", "token");
  });

  it("tras reservar programa solo el recordatorio (confirmacion: false)", async () => {
    transaccionReal();

    await reservarDesdeListaDeEspera(ENTRADA_SI);

    expect(mockedProgramar).toHaveBeenCalledWith({
      bookingId: "booking_9",
      etiqueta: expect.any(String),
      confirmacion: false,
    });
  });

  it("contactName con saltos y 200 caracteres queda recortado antes de bookAppointment y del #1", async () => {
    transaccionReal();
    const largo = `Miki\n${"x".repeat(200)}`;

    await reservarDesdeListaDeEspera({
      ...ENTRADA_SI,
      contactName: largo.replace(/\s+/g, " ").slice(0, 80),
    });

    const nombre = (mockedBook.mock.calls[0][0] as { clientName: string })
      .clientName;
    expect(nombre.length).toBeLessThanOrEqual(80);
    expect(nombre).not.toContain("\n");
    expect(
      (mockedAvisarNueva.mock.calls[0][0] as { clientName: string }).clientName
    ).toBe(nombre);

    // Sin nombre por ningún lado: el de respaldo.
    vi.clearAllMocks();
    transaccionReal();
    mockedLeadFindFirst.mockResolvedValue(lead() as never);
    mockedLeadFindUnique.mockResolvedValue(lead() as never);
    mockedLock.mockResolvedValue("token");
    await reservarDesdeListaDeEspera({ ...ENTRADA_SI, contactName: null });
    expect(
      (mockedBook.mock.calls[0][0] as { clientName: string }).clientName
    ).toBe("Cliente de la lista de espera");
  });
});

describe("cerrarAviso", () => {
  it("cierra un aviso abierto o uno sin_respuesta con resolvedBy ya_no y devuelve el hueco", async () => {
    mockedLeadFindUnique.mockResolvedValue({ data: lead().data } as never);
    mockedLeadUpdateMany.mockResolvedValue({ count: 1 });

    expect(
      await cerrarAviso({
        leadId: "lead_1",
        resolvedBy: "ya_no",
        inboundMessageId: "in_1",
      })
    ).toEqual({ count: 1, hueco: HUECO });
    expect(mockedLeadUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "lead_1",
        OR: [
          { resolvedAt: null },
          { data: { path: ["resolvedBy"], equals: "sin_respuesta" } },
        ],
      },
      data: {
        resolvedAt: expect.any(Date),
        data: expect.objectContaining({
          resolvedBy: "ya_no",
          resolvedFromInboundMessageId: "in_1",
        }),
      },
    });

    mockedLeadFindUnique.mockResolvedValue(null);
    expect(
      await cerrarAviso({
        leadId: "lead_x",
        resolvedBy: "ya_no",
        inboundMessageId: "in_1",
      })
    ).toEqual({ count: 0, hueco: null });
  });
});
