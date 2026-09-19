import { describe, it, expect, beforeEach, vi } from "vitest";
import { processSendWhatsappJob } from "../../src/jobs/sendWhatsapp.js";
import { reclamarEnvio } from "../../src/lib/messageIdempotency.js";
import { enviarPlantilla } from "../../src/modules/whatsapp/service.js";

vi.mock("../../src/lib/messageIdempotency.js", () => ({
  reclamarEnvio: vi.fn(),
}));
vi.mock("../../src/modules/whatsapp/service.js", () => ({
  enviarPlantilla: vi.fn(),
}));

const mockedReclamar = vi.mocked(reclamarEnvio);
const mockedEnviar = vi.mocked(enviarPlantilla);

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
      "confirm-sms-booking_1"
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
});
