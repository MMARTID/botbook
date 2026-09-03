import { describe, it, expect, beforeEach, vi } from "vitest";
import { processSendEmailJob } from "../../src/jobs/sendEmail.js";
import { sendZohoMail } from "../../src/lib/zohoMail.js";

vi.mock("../../src/lib/zohoMail.js", () => ({ sendZohoMail: vi.fn() }));

const mockedSendZohoMail = vi.mocked(sendZohoMail);

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

  it("propaga el error si el envío falla", async () => {
    mockedSendZohoMail.mockRejectedValue(new Error("Zoho caído"));

    await expect(
      processSendEmailJob({ fromAlias: "welcome", toAddress: "a@b.com", subject: "s", html: "h" })
    ).rejects.toThrow("Zoho caído");
  });
});
