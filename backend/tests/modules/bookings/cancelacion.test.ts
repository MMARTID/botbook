import { describe, it, expect, beforeEach, vi } from "vitest";
import { filaDeConexion } from "../../helpers/conexionDeCalendario.js";
import { prisma } from "../../../src/lib/prisma.js";
import { calendarService } from "../../../src/modules/calendar/service.js";
import {
  avisarCancelacion,
  nombreDeServicios,
} from "../../../src/modules/whatsapp/avisosNegocio.js";
import { avisarAQuienEsperaba } from "../../../src/modules/whatsapp/listaDeEspera.js";
import { cancelarReserva } from "../../../src/modules/bookings/cancelacion.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    booking: { findFirst: vi.fn(), updateMany: vi.fn() },
    business: { findUnique: vi.fn() },
  },
}));
vi.mock("../../../src/modules/calendar/service.js", () => ({
  calendarService: { cancelAppointment: vi.fn() },
}));
vi.mock("../../../src/modules/whatsapp/avisosNegocio.js", () => ({
  avisarCancelacion: vi.fn(),
  nombreDeServicios: vi.fn(),
}));
vi.mock("../../../src/modules/whatsapp/listaDeEspera.js", () => ({
  avisarAQuienEsperaba: vi.fn(),
}));

const mockedFindFirst = vi.mocked(prisma.booking.findFirst);
const mockedUpdateMany = vi.mocked(prisma.booking.updateMany);
const mockedBusiness = vi.mocked(prisma.business.findUnique);
const mockedCancelEvent = vi.mocked(calendarService.cancelAppointment);
const mockedAvisar = vi.mocked(avisarCancelacion);
const mockedNombres = vi.mocked(nombreDeServicios);
const mockedListaDeEspera = vi.mocked(avisarAQuienEsperaba);

const CITA = new Date("2026-09-24T15:00:00Z");
const RESERVA = {
  id: "booking_1",
  programedAt: CITA,
  durationMinutes: 45,
  clientName: "Marta",
  serviceIds: ["s1"],
  externalEventId: "evt_1",
  externalCalendarProvider: "outlook",
  externalCalendarId: "cal-outlook",
};
const NEGOCIO = {
  name: "Peluquería Ana",
  timezone: "Europe/Madrid",
  id: "biz_1",
  calendarProvider: "google",
  calendarConnections: [
    filaDeConexion("google", { refreshToken: "g" }),
    filaDeConexion("outlook", { refreshToken: "o", calendarId: "cal-outlook" }),
  ],
};
const ENTRADA = {
  bookingId: "booking_1",
  businessId: "biz_1",
  cancelledBy: "client_button" as const,
  etiqueta: "boton cliente in_1",
  inboundMessageId: "in_1",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mockedFindFirst.mockResolvedValue(RESERVA as never);
  mockedUpdateMany.mockResolvedValue({ count: 1 });
  mockedBusiness.mockResolvedValue(NEGOCIO as never);
  mockedCancelEvent.mockResolvedValue(undefined);
  mockedAvisar.mockResolvedValue({ via: "interactivo" });
  mockedNombres.mockResolvedValue(["Mechas"]);
  mockedListaDeEspera.mockResolvedValue({ resultado: "nadie" });
});

describe("cancelarReserva", () => {
  it("updateMany condicional: la segunda llamada devuelve ya_cancelada sin borrar evento, avisar ni tocar la lista de espera", async () => {
    expect(await cancelarReserva(ENTRADA)).toEqual({ resultado: "cancelada" });
    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: { id: "booking_1", isCancelled: false },
      data: {
        isCancelled: true,
        cancelledAt: expect.any(Date),
        cancelledBy: "client_button",
      },
    });

    mockedUpdateMany.mockResolvedValue({ count: 0 });
    expect(await cancelarReserva(ENTRADA)).toEqual({
      resultado: "ya_cancelada",
    });
    expect(mockedCancelEvent).toHaveBeenCalledTimes(1);
    expect(mockedAvisar).toHaveBeenCalledTimes(1);
    expect(mockedListaDeEspera).toHaveBeenCalledTimes(1);
  });

  it("borra el evento externo con la conexión con la que se creó; si falla, la cita queda cancelada y loguea negocio, proveedor y evento", async () => {
    await cancelarReserva(ENTRADA);
    expect(mockedCancelEvent).toHaveBeenCalledWith({
      conexion: expect.objectContaining({
        provider: "outlook",
        calendarId: "cal-outlook",
      }),
      eventId: "evt_1",
    });

    mockedCancelEvent.mockRejectedValue(new Error("Graph 500"));
    expect(await cancelarReserva(ENTRADA)).toEqual({ resultado: "cancelada" });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/booking_1.*biz_1.*evt_1.*outlook.*Graph 500/)
    );
    // Sin evento externo no se llama al calendario.
    vi.mocked(mockedCancelEvent).mockClear();
    mockedFindFirst.mockResolvedValue({
      ...RESERVA,
      externalEventId: null,
    } as never);
    await cancelarReserva(ENTRADA);
    expect(mockedCancelEvent).not.toHaveBeenCalled();
  });

  it("avisa #4 y dispara avisarAQuienEsperaba con el hueco exacto y el origen según cancelledBy", async () => {
    await cancelarReserva(ENTRADA);
    expect(mockedAvisar).toHaveBeenCalledWith({
      businessId: "biz_1",
      businessName: "Peluquería Ana",
      timezone: "Europe/Madrid",
      bookingId: "booking_1",
      clientName: "Marta",
      startDateTime: CITA,
      serviceNames: ["Mechas"],
    });
    expect(mockedListaDeEspera).toHaveBeenCalledWith({
      businessId: "biz_1",
      hueco: { inicioMs: CITA.getTime(), finMs: CITA.getTime() + 45 * 60_000 },
      origen: "cancelacion_cliente",
      etiqueta: "boton cliente in_1",
    });

    await cancelarReserva({
      ...ENTRADA,
      cancelledBy: "client_voice",
      etiqueta: "llamada x",
    });
    expect(mockedListaDeEspera).toHaveBeenLastCalledWith(
      expect.objectContaining({
        origen: "cancelacion_voz",
        etiqueta: "llamada x",
      })
    );

    // Un fallo del aviso o de la lista de espera no tumba la cancelación.
    mockedAvisar.mockRejectedValue(new Error("Telnyx"));
    mockedListaDeEspera.mockRejectedValue(new Error("BD"));
    expect(await cancelarReserva(ENTRADA)).toEqual({ resultado: "cancelada" });
  });

  it("reserva de otro negocio ⇒ no_encontrada", async () => {
    mockedFindFirst.mockResolvedValue(null);

    expect(
      await cancelarReserva({ ...ENTRADA, businessId: "biz_OTRO" })
    ).toEqual({
      resultado: "no_encontrada",
    });
    expect(mockedFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "booking_1", call: { businessId: "biz_OTRO" } },
      })
    );
    expect(mockedUpdateMany).not.toHaveBeenCalled();
    expect(mockedAvisar).not.toHaveBeenCalled();
  });
});
