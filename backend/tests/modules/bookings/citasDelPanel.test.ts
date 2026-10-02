import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { citasDelPanelRoutes } from "../../../src/modules/bookings/citasDelPanel.js";
import { prisma } from "../../../src/lib/prisma.js";
import { cancelarReserva } from "../../../src/modules/bookings/cancelacion.js";
import {
  ACCIONES_DE_AGENDA,
  moverReserva,
} from "../../../src/modules/gestor/accionesAgenda.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    booking: { findFirst: vi.fn() },
  },
}));
vi.mock("../../../src/modules/bookings/cancelacion.js", () => ({
  cancelarReserva: vi.fn(),
}));
// La lógica de mover y avisar es la del Gestor y tiene sus propios tests
// (tests/modules/gestor/accionesAgenda.test.ts); aquí, solo el cableado y
// las palabras del panel.
vi.mock("../../../src/modules/gestor/accionesAgenda.js", () => {
  const schema = { parse: (valor: unknown) => valor };
  return {
    MOTIVO_SIN_CALENDARIO: "motivo-sin-calendario-del-gestor",
    MOTIVO_CALENDARIO_ILEGIBLE: "motivo-calendario-ilegible-del-gestor",
    instanteLocal: (_zona: string, fecha: string, hora: string) =>
      new Date(`${fecha}T${hora}:00+02:00`),
    moverReserva: vi.fn(),
    ACCIONES_DE_AGENDA: {
      mover_cita: { schema, comprobar: vi.fn(), ejecutar: vi.fn() },
      avisar_cliente: { schema, comprobar: vi.fn(), ejecutar: vi.fn() },
    },
  };
});

const mockedMover = vi.mocked(moverReserva);
const mockedComprobarMover = vi.mocked(ACCIONES_DE_AGENDA.mover_cita.comprobar);
const mockedComprobarAviso = vi.mocked(
  ACCIONES_DE_AGENDA.avisar_cliente.comprobar
);
const mockedEjecutarAviso = vi.mocked(ACCIONES_DE_AGENDA.avisar_cliente.ejecutar);
const mockedCancelar = vi.mocked(cancelarReserva);

const CITA = {
  id: "bk_1",
  clientName: "Marta",
  professional: { id: "pro_laura", name: "Laura" },
};

async function servidor() {
  const fastify = Fastify();
  fastify.decorate("authenticate", async (request: any) => {
    request.user = { businessId: "biz_1" };
  });
  await fastify.register(citasDelPanelRoutes);
  return fastify;
}

function mover(fastify: Awaited<ReturnType<typeof servidor>>, body: object) {
  return fastify.inject({
    method: "POST",
    url: "/business/me/bookings/bk_1/mover",
    payload: body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.business.findUnique).mockResolvedValue({
    timezone: "Europe/Madrid",
  } as never);
  vi.mocked(prisma.booking.findFirst).mockResolvedValue({
    clientName: "Marta",
  } as never);
});

describe("POST /business/me/bookings/:id/mover", () => {
  it("con soloComprobar no mueve nada y traduce los motivos que el Gestor escribe para el modelo", async () => {
    const fastify = await servidor();
    mockedComprobarMover.mockResolvedValueOnce({ ok: true, descripcion: "…" });
    const libre = await mover(fastify, {
      fechaHora: "2026-10-09T17:00",
      profesionalId: "pro_marta",
      soloComprobar: true,
    });
    expect(libre.json()).toEqual({ ok: true });
    expect(mockedComprobarMover).toHaveBeenCalledWith(
      { businessId: "biz_1", timezone: "Europe/Madrid" },
      { cita: "bk_1", fechaHora: "2026-10-09T17:00", profesional: "pro_marta" }
    );

    mockedComprobarMover.mockResolvedValueOnce({
      ok: false,
      motivo: "motivo-sin-calendario-del-gestor",
    });
    const sinCalendario = await mover(fastify, {
      fechaHora: "2026-10-09T17:00",
      soloComprobar: true,
    });
    expect(sinCalendario.statusCode).toBe(409);
    expect(sinCalendario.json().error).toBe(
      "Conecta tu calendario para mover citas desde aquí."
    );

    mockedComprobarMover.mockResolvedValueOnce({
      ok: false,
      motivo: "No encuentro esa cita en este negocio.",
    });
    expect(
      (await mover(fastify, { fechaHora: "2026-10-09T17:00", soloComprobar: true }))
        .statusCode
    ).toBe(404);
    expect(mockedMover).not.toHaveBeenCalled();
  });

  it("mueve la cita en la hora local del negocio y ofrece avisar al cliente", async () => {
    const fastify = await servidor();
    mockedMover.mockResolvedValue({
      ok: true,
      cita: CITA,
      start: new Date("2026-10-09T15:00:00Z"),
      asignado: { id: "pro_laura", name: "Laura" },
      descripcionAntes: "…",
    } as never);
    mockedComprobarAviso.mockResolvedValue({
      ok: true,
      descripcion: "…",
      parametros: { cita: "bk_1", tipo: "cambio", telefono: "+34600111222" },
    });

    const response = await mover(fastify, { fechaHora: "2026-10-09T17:00" });

    expect(response.statusCode).toBe(200);
    expect(mockedMover).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        citaId: "bk_1",
        start: new Date("2026-10-09T15:00:00Z"),
        profesional: null,
        prefijoDeLog: "[Booking]",
      })
    );
    expect(response.json()).toEqual({
      ok: true,
      mensaje:
        "Cita movida al viernes 9 de octubre a las 17:00 con Laura. Tu calendario ya está al día.",
      cita: {
        id: "bk_1",
        programedAt: "2026-10-09T15:00:00.000Z",
        professional: { id: "pro_laura", name: "Laura" },
      },
      avisoAlCliente: { telefono: "+34600111222", cliente: "Marta" },
    });
    expect(mockedComprobarAviso).toHaveBeenCalledWith(
      { businessId: "biz_1", timezone: "Europe/Madrid" },
      { cita: "bk_1", tipo: "cambio" }
    );
  });

  it("sin forma de escribirle al cliente, no ofrece el aviso", async () => {
    const fastify = await servidor();
    mockedMover.mockResolvedValue({
      ok: true,
      cita: CITA,
      start: new Date("2026-10-09T15:00:00Z"),
      asignado: null,
      descripcionAntes: "…",
    } as never);
    mockedComprobarAviso.mockResolvedValue({ ok: false, motivo: "sin móvil" });

    const response = await mover(fastify, { fechaHora: "2026-10-09T17:00" });

    expect(response.json().avisoAlCliente).toBeNull();
    expect(response.json().mensaje).toBe(
      "Cita movida al viernes 9 de octubre a las 17:00. Tu calendario ya está al día."
    );
  });

  it("cada fallo sale con su código y en palabras del panel", async () => {
    const fastify = await servidor();
    const casos: Array<[object, number, string]> = [
      [
        { motivo: "sin_hueco", detalle: "El negocio está cerrado el sábado." },
        409,
        "El negocio está cerrado el sábado.",
      ],
      [
        { motivo: "sin_hueco", detalle: "motivo-calendario-ilegible-del-gestor" },
        409,
        "Ahora mismo no se puede leer tu calendario. Inténtalo en un rato.",
      ],
      [{ motivo: "no_existe", detalle: "" }, 404, "No existe esa cita en tu negocio."],
      [
        { motivo: "calendario_rechaza", detalle: "" },
        502,
        "Tu calendario no ha aceptado la nueva hora. La cita sigue como estaba; inténtalo en un rato.",
      ],
      [
        { motivo: "error_interno", detalle: "" },
        500,
        "No se ha podido mover la cita. Inténtalo en un rato.",
      ],
    ];
    for (const [fallo, status, error] of casos) {
      mockedMover.mockResolvedValueOnce({ ok: false, ...fallo } as never);
      const response = await mover(fastify, { fechaHora: "2026-10-09T17:00" });
      expect(response.statusCode).toBe(status);
      expect(response.json().error).toBe(error);
    }
  });

  it("valida la hora con 400 antes de tocar nada", async () => {
    const fastify = await servidor();
    const response = await mover(fastify, { fechaHora: "9 de octubre" });
    expect(response.statusCode).toBe(400);
    expect(mockedMover).not.toHaveBeenCalled();
  });
});

describe("POST /business/me/bookings/:id/cancelar", () => {
  it("cancela como owner_panel y ofrece avisar de la cancelación", async () => {
    const fastify = await servidor();
    mockedCancelar.mockResolvedValue({ resultado: "cancelada" });
    mockedComprobarAviso.mockResolvedValue({
      ok: true,
      descripcion: "…",
      parametros: { cita: "bk_1", tipo: "cancelacion", telefono: "+34600111222" },
    });

    const response = await fastify.inject({
      method: "POST",
      url: "/business/me/bookings/bk_1/cancelar",
    });

    expect(mockedCancelar).toHaveBeenCalledWith({
      bookingId: "bk_1",
      businessId: "biz_1",
      cancelledBy: "owner_panel",
      etiqueta: "panel",
    });
    expect(response.json()).toEqual({
      ok: true,
      yaCancelada: false,
      mensaje: "Cita cancelada y quitada de tu calendario.",
      avisoAlCliente: { telefono: "+34600111222", cliente: "Marta" },
    });
  });

  it("si ya estaba cancelada no ofrece avisar otra vez; si es de otro negocio, 404", async () => {
    const fastify = await servidor();
    mockedCancelar.mockResolvedValueOnce({ resultado: "ya_cancelada" });
    const ya = await fastify.inject({
      method: "POST",
      url: "/business/me/bookings/bk_1/cancelar",
    });
    expect(ya.json()).toMatchObject({ yaCancelada: true, avisoAlCliente: null });
    expect(mockedComprobarAviso).not.toHaveBeenCalled();

    mockedCancelar.mockResolvedValueOnce({ resultado: "no_encontrada" });
    const ajena = await fastify.inject({
      method: "POST",
      url: "/business/me/bookings/bk_ajena/cancelar",
    });
    expect(ajena.statusCode).toBe(404);
  });
});

describe("POST /business/me/bookings/:id/avisar", () => {
  it("manda el aviso con los parámetros comprobados", async () => {
    const fastify = await servidor();
    const parametros = { cita: "bk_1", tipo: "cambio", telefono: "+34600111222" };
    mockedComprobarAviso.mockResolvedValue({ ok: true, descripcion: "…", parametros });
    mockedEjecutarAviso.mockResolvedValue({ ok: true, mensaje: "Le aviso." });

    const response = await fastify.inject({
      method: "POST",
      url: "/business/me/bookings/bk_1/avisar",
      payload: { tipo: "cambio" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().mensaje).toBe(
      "Le estamos mandando el aviso por WhatsApp."
    );
    expect(mockedEjecutarAviso).toHaveBeenCalledWith(
      { businessId: "biz_1", timezone: "Europe/Madrid" },
      parametros,
      expect.objectContaining({ inboundMessageId: expect.stringMatching(/^panel:/) })
    );
  });

  it("si no se le puede escribir, lo dice sin las instrucciones internas del Gestor", async () => {
    const fastify = await servidor();
    mockedComprobarAviso.mockResolvedValue({
      ok: false,
      motivo: "No tengo el móvil del cliente: pídeselo al dueño y vuelve a proponerlo con el parámetro telefono.",
    });

    const response = await fastify.inject({
      method: "POST",
      url: "/business/me/bookings/bk_1/avisar",
      payload: { tipo: "cancelacion" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe(
      "No se le puede escribir por WhatsApp a este cliente. Llámale tú."
    );
    expect(mockedEjecutarAviso).not.toHaveBeenCalled();
  });
});
