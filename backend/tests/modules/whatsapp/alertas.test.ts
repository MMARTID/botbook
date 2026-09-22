import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { enqueueEmailJob } from "../../../src/lib/cloudTasks.js";
import { avisarAlerta } from "../../../src/modules/whatsapp/avisosNegocio.js";
import {
  alertarCalendarioDesconectado,
  alertarDesvioComprobado,
  alertarDesvioSinComprobar,
  alertarMinutos,
  alertarNumeroNoActivo,
  alertarPagoFallido,
  alertarPruebaTermina,
} from "../../../src/modules/whatsapp/alertas.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}));
vi.mock("../../../src/lib/cloudTasks.js", () => ({ enqueueEmailJob: vi.fn() }));
vi.mock(
  "../../../src/modules/whatsapp/avisosNegocio.js",
  async (importActual) => {
    const actual =
      await importActual<
        typeof import("../../../src/modules/whatsapp/avisosNegocio.js")
      >();
    return { ...actual, avisarAlerta: vi.fn() };
  }
);

const mockedBiz = vi.mocked(prisma.business.findUnique);
const mockedUser = vi.mocked(prisma.user.findFirst);
const mockedAvisar = vi.mocked(avisarAlerta);
const mockedEmail = vi.mocked(enqueueEmailJob);

const HOY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
  .format(new Date())
  .replace(/-/g, "");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mockedBiz.mockResolvedValue({
    name: "Peluquería Ana",
    timezone: "Europe/Madrid",
  } as never);
  mockedUser.mockResolvedValue({ email: "dueno@example.com" } as never);
  mockedAvisar.mockResolvedValue({ via: "interactivo" });
});

describe("alertas operativas (#5)", () => {
  it("calendario desconectado: una por proveedor y día, con email de respaldo", async () => {
    await alertarCalendarioDesconectado({
      businessId: "biz_1",
      proveedor: "Google Calendar",
      providerId: "google",
    });

    expect(mockedAvisar).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        businessName: "Peluquería Ana",
        causa: "calendario",
        recursoId: `calendario:biz_1:google:${HOY}`,
        texto: expect.stringContaining(
          "tu calendario de Google Calendar se ha desconectado"
        ),
        email: expect.any(Function),
      })
    );
    await mockedAvisar.mock.calls[0][0].email!();
    expect(mockedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toAddress: "dueno@example.com",
        subject: "Necesita tu atención — Peluquería Ana",
      }),
      `alerta-calendario-biz_1-google-${HOY}`
    );
    expect(mockedEmail.mock.calls[0][0].html).toContain(
      "https://alhabla.ai/ajustes/calendario"
    );
  });

  it("número no activo: una al día", async () => {
    await alertarNumeroNoActivo({ businessId: "biz_1" });
    expect(mockedAvisar).toHaveBeenCalledWith(
      expect.objectContaining({
        causa: "telefono",
        recursoId: `telefono:biz_1:${HOY}`,
      })
    );
  });

  it("desvío sin comprobar: causa teléfono, recurso por negocio e intento (para poder reintentar) y email de respaldo", async () => {
    const intento = new Date("2026-09-22T10:00:00.000Z");
    await alertarDesvioSinComprobar({ businessId: "biz_1", intento });
    expect(mockedAvisar).toHaveBeenCalledWith(
      expect.objectContaining({
        causa: "telefono",
        recursoId: "desvio:biz_1:2026-09-22T10:00:00.000Z",
        texto: expect.stringContaining("aún no has comprobado el desvío"),
        email: expect.any(Function),
      })
    );
    await mockedAvisar.mock.calls[0][0].email!();
    expect(mockedEmail.mock.calls[0][0].subject).toContain(
      "Necesita tu atención"
    );
    expect(mockedEmail.mock.calls[0][0].html).toContain(
      "https://alhabla.ai/ajustes/telefono"
    );
    // El id de la tarea de email también cambia por intento: Cloud Tasks
    // rechaza un nombre repetido durante horas.
    expect(mockedEmail.mock.calls[0][1]).toBe(
      "alerta-desvio-biz_1-2026-09-22T10-00-00-000Z"
    );
  });

  it("desvío comprobado: misma cascada con otro recurso, y el email es la buena noticia, no la alerta", async () => {
    const intento = new Date("2026-09-22T10:00:00.000Z");
    await alertarDesvioComprobado({ businessId: "biz_1", intento });
    expect(mockedAvisar).toHaveBeenCalledWith(
      expect.objectContaining({
        causa: "telefono",
        recursoId: "desvio-ok:biz_1:2026-09-22T10:00:00.000Z",
        texto: expect.stringContaining("tu desvío de llamadas está comprobado"),
        email: expect.any(Function),
      })
    );
    await mockedAvisar.mock.calls[0][0].email!();
    expect(mockedEmail.mock.calls[0][0].subject).toBe(
      "Tu desvío está comprobado — Peluquería Ana"
    );
    expect(mockedEmail.mock.calls[0][0].html).not.toContain(
      "Necesita tu atención"
    );
    expect(mockedEmail.mock.calls[0][0].html).toContain(
      "https://alhabla.ai/ajustes/telefono"
    );
  });

  it("prueba que termina: fecha en la zona del negocio y con respaldo", async () => {
    await alertarPruebaTermina({
      businessId: "biz_1",
      subscriptionId: "sub_1",
      trialEnd: new Date("2026-09-23T22:30:00Z"),
    });
    expect(mockedAvisar).toHaveBeenCalledWith(
      expect.objectContaining({
        causa: "prueba",
        recursoId: "prueba:sub_1",
        texto: expect.stringContaining("termina el 24 de septiembre de 2026"),
        email: expect.any(Function),
      })
    );
  });

  it("80 % de minutos y pago fallido: sin email de respaldo (ya sale el de facturación)", async () => {
    await alertarMinutos({
      businessId: "biz_1",
      periodId: "per_1",
      consumidos: 80,
      incluidos: 100,
      extraMinuteCents: 15,
    });
    expect(mockedAvisar).toHaveBeenCalledWith(
      expect.objectContaining({
        causa: "minutos",
        recursoId: "minutos:per_1",
        texto:
          "has usado 80 de los 100 minutos de tu plan este mes. A partir de ahí cada minuto cuesta 0,15 €; puedes cambiar de plan en el panel.",
        email: undefined,
      })
    );

    await alertarPagoFallido({
      businessId: "biz_1",
      invoiceId: "in_1",
      suspensionAt: new Date("2026-09-27T10:00:00Z"),
    });
    expect(mockedAvisar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        causa: "pago",
        recursoId: "pago:in_1",
        texto: expect.stringContaining("antes del 27 de septiembre de 2026"),
        email: undefined,
      })
    );
  });

  it("nunca lanza: negocio inexistente o base de datos caída", async () => {
    mockedBiz.mockResolvedValue(null);
    expect(await alertarNumeroNoActivo({ businessId: "biz_x" })).toEqual({
      via: "ninguna",
      motivo: "negocio inexistente",
    });

    mockedBiz.mockRejectedValue(new Error("BD caída"));
    expect((await alertarNumeroNoActivo({ businessId: "biz_x" })).via).toBe(
      "ninguna"
    );
    expect(mockedAvisar).not.toHaveBeenCalled();
  });
});
