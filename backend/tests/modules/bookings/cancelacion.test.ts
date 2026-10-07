import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";
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
    booking: { findFirst: vi.fn(), update: vi.fn() },
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
const mockedUpdate = vi.mocked(prisma.booking.update);
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
/** Lo que lanza Prisma cuando el `update` no encuentra fila que cumpla el
 * where (aquí: la cita ya estaba cancelada). */
const NO_ENCONTRADA_P2025 = new Prisma.PrismaClientKnownRequestError(
  "No record was found for an update.",
  { code: "P2025", clientVersion: "6.19.3" }
);
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
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mockedFindFirst.mockResolvedValue({ id: "booking_1" } as never);
  mockedUpdate.mockResolvedValue(RESERVA as never);
  mockedBusiness.mockResolvedValue(NEGOCIO as never);
  mockedCancelEvent.mockResolvedValue({ resultado: "borrado" });
  mockedAvisar.mockResolvedValue({ via: "interactivo" });
  mockedNombres.mockResolvedValue(["Mechas"]);
  mockedListaDeEspera.mockResolvedValue({ resultado: "nadie" });
});

describe("cancelarReserva", () => {
  it("update condicional: la segunda llamada (P2025) devuelve ya_cancelada sin borrar evento, avisar ni tocar la lista de espera", async () => {
    expect(await cancelarReserva(ENTRADA)).toEqual({ resultado: "cancelada" });
    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { id: "booking_1", isCancelled: false },
      data: {
        isCancelled: true,
        cancelledAt: expect.any(Date),
        cancelledBy: "client_button",
      },
      select: expect.objectContaining({
        externalEventId: true,
        externalCalendarProvider: true,
        externalCalendarId: true,
        programedAt: true,
        durationMinutes: true,
      }),
    });

    mockedUpdate.mockRejectedValue(NO_ENCONTRADA_P2025);
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
      // La hora de la cita: con ella CalDAV busca el evento si no está en
      // su dirección.
      ventana: { inicio: CITA, fin: new Date(CITA.getTime() + 45 * 60_000) },
    });
    expect(console.log).toHaveBeenCalledWith(
      "[Booking] boton cliente in_1: borrado el evento evt_1 de la cita booking_1 del negocio biz_1 (outlook)"
    );

    mockedCancelEvent.mockRejectedValue(new Error("Graph 500"));
    expect(await cancelarReserva(ENTRADA)).toEqual({ resultado: "cancelada" });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/booking_1.*biz_1.*evt_1.*outlook.*Graph 500/)
    );
    // Sin evento externo no se llama al calendario.
    vi.mocked(mockedCancelEvent).mockClear();
    mockedUpdate.mockResolvedValue({
      ...RESERVA,
      externalEventId: null,
    } as never);
    await cancelarReserva(ENTRADA);
    expect(mockedCancelEvent).not.toHaveBeenCalled();
  });

  it("lee el evento y la hora en la MISMA sentencia que cancela: si un movimiento cambió el puntero tras la comprobación de existencia, borra el evento nuevo", async () => {
    const NUEVA_HORA = new Date("2026-09-25T10:00:00Z");
    // La comprobación de existencia solo mira el id. Entre ella y la
    // cancelación, moverReserva movió la cita: el UPDATE … RETURNING
    // devuelve el puntero y la hora de ese momento.
    mockedUpdate.mockResolvedValueOnce({
      ...RESERVA,
      programedAt: NUEVA_HORA,
      externalEventId: "evt_nuevo",
    } as never);

    expect(await cancelarReserva(ENTRADA)).toEqual({ resultado: "cancelada" });

    expect(mockedFindFirst).toHaveBeenCalledTimes(1);
    expect(mockedFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true } })
    );

    expect(mockedCancelEvent).toHaveBeenCalledTimes(1);
    expect(mockedCancelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt_nuevo",
        ventana: {
          inicio: NUEVA_HORA,
          fin: new Date(NUEVA_HORA.getTime() + 45 * 60_000),
        },
      })
    );
    // Los avisos y la lista de espera, con la hora del momento de cancelar.
    expect(mockedAvisar).toHaveBeenCalledWith(
      expect.objectContaining({ startDateTime: NUEVA_HORA })
    );
    expect(mockedListaDeEspera).toHaveBeenCalledWith(
      expect.objectContaining({
        hueco: {
          inicioMs: NUEVA_HORA.getTime(),
          finMs: NUEVA_HORA.getTime() + 45 * 60_000,
        },
      })
    );
  });

  it("si el calendario dice que el evento no estaba, lo registra con un warn ruidoso (sin datos del cliente)", async () => {
    mockedCancelEvent.mockResolvedValue({
      resultado: "no_estaba",
      estado: 404,
    });

    expect(await cancelarReserva(ENTRADA)).toEqual({ resultado: "cancelada" });

    expect(console.warn).toHaveBeenCalledWith(
      "[Booking] boton cliente in_1: el calendario respondió 404 al borrar el evento evt_1 de la cita booking_1 del negocio biz_1 (outlook): o lo borró el dueño o sigue vivo en otra dirección"
    );
    const avisos = vi.mocked(console.warn).mock.calls.flat().join(" ");
    expect(avisos).not.toContain("Marta");
    expect(console.error).not.toHaveBeenCalled();

    // Borrado en otra dirección: también deja un warn con la dirección real.
    vi.mocked(console.warn).mockClear();
    mockedCancelEvent.mockResolvedValue({
      resultado: "borrado",
      eventIdReal: "https://caldav.icloud.com/cal/otro.ics",
    });
    await cancelarReserva(ENTRADA);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /evt_1 de la cita booking_1 del negocio biz_1 \(outlook\) en otra dirección: el evento estaba en https:\/\/caldav\.icloud\.com\/cal\/otro\.ics/
      )
    );
  });

  it("no relee la cita después de cancelar: lo que pase después (una reactivación) no cambia el evento que se borra ni la hora del #4", async () => {
    // Tras el UPDATE … RETURNING, cualquier lectura de la cita podría ver
    // una reactivación (book_appointment con otra hora en la misma
    // conversación) y borrar su evento. Aquí solo hay una lectura, la de
    // existencia, y es anterior a cancelar.
    mockedFindFirst
      .mockResolvedValueOnce({ id: "booking_1" } as never)
      .mockResolvedValue({
        ...RESERVA,
        isCancelled: false,
        externalEventId: "evt_de_la_reactivacion",
      } as never);

    expect(await cancelarReserva(ENTRADA)).toEqual({ resultado: "cancelada" });

    expect(mockedFindFirst).toHaveBeenCalledTimes(1);
    expect(mockedFindFirst.mock.invocationCallOrder[0]).toBeLessThan(
      mockedUpdate.mock.invocationCallOrder[0]
    );
    expect(mockedCancelEvent).toHaveBeenCalledTimes(1);
    expect(mockedCancelEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt_1" })
    );
  });

  it("si la cancelación falla por otra causa que P2025, el error sube y no se toca nada más", async () => {
    mockedUpdate.mockRejectedValue(new Error("BD caída"));

    await expect(cancelarReserva(ENTRADA)).rejects.toThrow("BD caída");
    expect(mockedCancelEvent).not.toHaveBeenCalled();
    expect(mockedAvisar).not.toHaveBeenCalled();
    expect(mockedListaDeEspera).not.toHaveBeenCalled();
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
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(mockedAvisar).not.toHaveBeenCalled();
  });

  it("cancelada desde el panel: queda como owner_panel, sin aviso #4 al propio dueño y la lista de espera se avisa como cancelación del dueño", async () => {
    await cancelarReserva({ ...ENTRADA, cancelledBy: "owner_panel", etiqueta: "panel" });

    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cancelledBy: "owner_panel" }),
      })
    );
    expect(mockedAvisar).not.toHaveBeenCalled();
    expect(mockedCancelEvent).toHaveBeenCalled();
    expect(mockedListaDeEspera).toHaveBeenCalledWith(
      expect.objectContaining({ origen: "cancelacion_dueno" })
    );
  });
});
