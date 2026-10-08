import { describe, it, expect, beforeEach, vi } from "vitest";
import { processSendEmailJob } from "../../src/jobs/sendEmail.js";
import { sendZohoMail } from "../../src/lib/zohoMail.js";
import { prisma } from "../../src/lib/prisma.js";

vi.mock("../../src/lib/zohoMail.js", () => ({ sendZohoMail: vi.fn() }));
vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { sentMessage: { create: vi.fn(), updateMany: vi.fn() } },
}));

const mockedSendZohoMail = vi.mocked(sendZohoMail);
const mockedCreate = vi.mocked(prisma.sentMessage.create);
const mockedUpdateMany = vi.mocked(prisma.sentMessage.updateMany);

describe("processSendEmailJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSendZohoMail.mockResolvedValue(undefined);
  });

  it("envía desde welcome@alhabla.ai cuando fromAlias es welcome", async () => {
    await processSendEmailJob({
      fromAlias: "welcome",
      toAddress: "cliente@example.com",
      subject: "Bienvenido",
      html: "<p>hola</p>",
    });

    expect(mockedSendZohoMail).toHaveBeenCalledWith({
      fromAddress: "welcome@alhabla.ai",
      toAddress: "cliente@example.com",
      subject: "Bienvenido",
      html: "<p>hola</p>",
    });
  });

  it("envía desde support@alhabla.ai cuando fromAlias es support", async () => {
    await processSendEmailJob({
      fromAlias: "support",
      toAddress: "cliente@example.com",
      subject: "Aviso de pago",
      html: "<p>ojo</p>",
    });

    expect(mockedSendZohoMail).toHaveBeenCalledWith(
      expect.objectContaining({ fromAddress: "support@alhabla.ai" })
    );
  });

  // La regresión: la fila de idempotencia quedaba reclamada tras un fallo
  // transitorio de Zoho y el reintento de Cloud Tasks se descartaba como «ya
  // enviado». El correo se perdía sin que nadie lo supiera.
  it("un fallo transitorio deja el envío reintentable con la misma clave", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const job = {
      fromAlias: "support" as const,
      toAddress: "a@b.com",
      subject: "Tu pago ha fallado",
      html: "h",
      idempotencyKey: "pago-fallido-1",
    };

    // Primer intento: se reclama la fila y Zoho falla.
    mockedCreate.mockResolvedValueOnce({} as never);
    mockedSendZohoMail.mockRejectedValueOnce(new Error("Zoho 503"));
    await expect(processSendEmailJob(job)).rejects.toThrow("Zoho 503");
    expect(mockedUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          channel: "email",
          idempotencyKey: "pago-fallido-1",
          providerMessageId: null,
        },
        data: expect.objectContaining({ deliveryStatus: "failed" }),
      })
    );

    // Reintento: la fila ya existe, pero está `failed`, así que se reabre y
    // el correo sale.
    mockedCreate.mockRejectedValueOnce(Object.assign(new Error("único"), { code: "P2002" }));
    mockedUpdateMany.mockResolvedValueOnce({ count: 1 } as never);
    await processSendEmailJob(job);
    expect(mockedSendZohoMail).toHaveBeenCalledTimes(2);
  });

  it("propaga el error si el envío falla", async () => {
    mockedSendZohoMail.mockRejectedValue(new Error("Zoho caído"));

    await expect(
      processSendEmailJob({ fromAlias: "welcome", toAddress: "a@b.com", subject: "s", html: "h" })
    ).rejects.toThrow("Zoho caído");
  });
});
