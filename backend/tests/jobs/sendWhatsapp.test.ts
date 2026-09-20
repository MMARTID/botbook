import { describe, it, expect, beforeEach, vi } from "vitest";
import { processSendWhatsappJob } from "../../src/jobs/sendWhatsapp.js";
import { reclamarEnvio } from "../../src/lib/messageIdempotency.js";
import { enviarPlantilla } from "../../src/modules/whatsapp/service.js";
import { WhatsappOptOutError } from "../../src/modules/whatsapp/bajas.js";
import { enviarMensajeAlCliente } from "../../src/modules/whatsapp/mensajesCliente.js";
import { prisma } from "../../src/lib/prisma.js";

vi.mock("../../src/lib/messageIdempotency.js", () => ({
  reclamarEnvio: vi.fn(),
}));
vi.mock("../../src/modules/whatsapp/service.js", () => ({
  enviarPlantilla: vi.fn(),
}));
vi.mock("../../src/modules/whatsapp/mensajesCliente.js", () => ({
  enviarMensajeAlCliente: vi.fn(),
}));
vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    sentMessage: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  },
}));

const mockedReclamar = vi.mocked(reclamarEnvio);
const mockedEnviar = vi.mocked(enviarPlantilla);
const mockedEnviarAlCliente = vi.mocked(enviarMensajeAlCliente);
const mockedUpdateMany = vi.mocked(prisma.sentMessage.updateMany);

describe("processSendWhatsappJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedReclamar.mockResolvedValue(true);
    mockedEnviar.mockResolvedValue({
      messageId: "msg-1",
      status: "queued",
      from: "+34930454394",
    });
  });

  it("envía por el servicio con la plantilla por nombre + idioma, el negocio, la audiencia y la clave del job", async () => {
    await processSendWhatsappJob({
      toNumber: "+34600111222",
      templateName: "confirmacion_cita",
      languageCode: "es",
      bodyParams: { negocio_nombre: "Peluquería Ana" },
      idempotencyKey: "confirm-sms-booking_1",
      businessId: "biz_1",
      audience: "client",
    });

    expect(mockedReclamar).toHaveBeenCalledWith(
      "whatsapp",
      "confirm-sms-booking_1",
      undefined,
      { reintentarFallidos: true }
    );
    expect(mockedEnviar).toHaveBeenCalledWith({
      audience: "client",
      to: "+34600111222",
      template: { name: "confirmacion_cita", language: "es" },
      bodyParams: { negocio_nombre: "Peluquería Ana" },
      businessId: "biz_1",
      idempotencyKey: "confirm-sms-booking_1",
    });
  });

  it("sin audiencia sale por el número de clientes", async () => {
    await processSendWhatsappJob({
      toNumber: "+34600111222",
      templateName: "x",
      languageCode: "es",
      bodyParams: {},
    });

    expect(mockedEnviar).toHaveBeenCalledWith(
      expect.objectContaining({ audience: "client" })
    );
  });

  it("una entrega repetida de Cloud Tasks no vuelve a enviar", async () => {
    mockedReclamar.mockResolvedValue(false);

    await processSendWhatsappJob({
      toNumber: "+34600111222",
      templateName: "x",
      languageCode: "es",
      bodyParams: {},
      idempotencyKey: "k",
    });

    expect(mockedEnviar).not.toHaveBeenCalled();
  });

  it("si el número pidió la baja, el job termina sin lanzar (no hay nada que reintentar)", async () => {
    mockedEnviar.mockRejectedValue(
      new WhatsappOptOutError("client", "+34600111222")
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      processSendWhatsappJob({
        toNumber: "+34600111222",
        templateName: "x",
        languageCode: "es",
        bodyParams: {},
        idempotencyKey: "k",
        audience: "client",
      })
    ).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("descartado: el número pidió la baja (client)")
    );
    logSpy.mockRestore();
  });

  it("cualquier otro error sigue lanzando para que Cloud Tasks reintente", async () => {
    mockedEnviar.mockRejectedValue(new Error("Telnyx 500"));

    await expect(
      processSendWhatsappJob({
        toNumber: "+34600111222",
        templateName: "x",
        languageCode: "es",
        bodyParams: {},
      })
    ).rejects.toThrow("Telnyx 500");
  });

  it("la forma legada (templateName + languageCode + bodyParams) sigue enviando igual", async () => {
    await processSendWhatsappJob({
      toNumber: "+34600111222",
      templateName: "hora_disponible",
      languageCode: "es",
      bodyParams: { negocio_nombre: "Peluquería Ana" },
      idempotencyKey: "k-legado",
      businessId: "biz_1",
      audience: "client",
    });

    expect(mockedEnviarAlCliente).not.toHaveBeenCalled();
    expect(mockedEnviar).toHaveBeenCalledWith(
      expect.objectContaining({
        template: { name: "hora_disponible", language: "es" },
        idempotencyKey: "k-legado",
      })
    );
  });

  it("la forma por propósito delega en enviarMensajeAlCliente", async () => {
    const data = {
      proposito: "confirmacion" as const,
      bookingId: "booking_1",
      programedAtMs: 1_800_000_000_000,
      toNumber: "+34600111222",
      businessId: "biz_1",
      audience: "client" as const,
      idempotencyKey: "booking-booking_1-confirmacion-1800000000",
    };

    await processSendWhatsappJob(data);

    expect(mockedEnviarAlCliente).toHaveBeenCalledWith(data);
    expect(mockedReclamar).not.toHaveBeenCalled();
    expect(mockedEnviar).not.toHaveBeenCalled();
  });

  it("un error de envío en la forma legada marca la fila failed antes de relanzar y reclama con reintentarFallidos", async () => {
    mockedEnviar.mockRejectedValue(new Error("Telnyx 502"));

    await expect(
      processSendWhatsappJob({
        toNumber: "+34600111222",
        templateName: "x",
        languageCode: "es",
        bodyParams: {},
        idempotencyKey: "k-fallo",
      })
    ).rejects.toThrow("Telnyx 502");

    expect(mockedReclamar).toHaveBeenCalledWith(
      "whatsapp",
      "k-fallo",
      undefined,
      {
        reintentarFallidos: true,
      }
    );
    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: {
        channel: "whatsapp",
        idempotencyKey: "k-fallo",
        providerMessageId: null,
      },
      data: {
        deliveryStatus: "failed",
        errorCode: "SEND_ERROR",
        errorDetail: "Telnyx 502",
      },
    });
  });
});
