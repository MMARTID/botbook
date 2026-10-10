import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { APIError } from "telnyx/core/error";
import { processSendSmsJob } from "../../src/jobs/sendSms.js";
import { telnyxAdapter } from "../../src/adapters/telnyx/TelnyxAdapter.js";
import { PermanentJobError } from "../../src/lib/jobErrors.js";
import { prisma } from "../../src/lib/prisma.js";

vi.mock("../../src/adapters/telnyx/TelnyxAdapter.js", () => ({
  telnyxAdapter: { sendSms: vi.fn() },
}));
vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { sentMessage: { create: vi.fn(), updateMany: vi.fn() } },
}));

const mockedSendSms = vi.mocked(telnyxAdapter.sendSms);
const mockedCreate = vi.mocked(prisma.sentMessage.create);
const mockedUpdateMany = vi.mocked(prisma.sentMessage.updateMany);

/** El error tal cual lo lanza el SDK de Telnyx ante un 4xx/5xx. */
function errorDeTelnyx(status: number, code: string, title: string) {
  return APIError.generate(
    status,
    { errors: [{ code, title, detail: title }] },
    undefined,
    new Headers()
  );
}

const AVISO = {
  fromNumber: "ALHABLA",
  toNumber: "+34612345678",
  text: "Nueva reserva — María",
  messagingProfileId: "perfil_sms",
  businessId: "business_123",
  proposito: "aviso_dueno" as const,
  idempotencyKey: "aviso-sms-booking_1",
};

describe("processSendSmsJob", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedSendSms.mockResolvedValue(undefined);
    mockedCreate.mockResolvedValue({} as never);
    mockedUpdateMany.mockResolvedValue({ count: 1 } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("envía con el Sender ID y su Messaging Profile", async () => {
    await processSendSmsJob(AVISO);

    expect(mockedSendSms).toHaveBeenCalledWith({
      from: "ALHABLA",
      to: "+34612345678",
      text: "Nueva reserva — María",
      messagingProfileId: "perfil_sms",
    });
  });

  // Lo que pasaba en INFINITY: «Enviando SMS a ***219 desde ***219».
  it("descarta como definitivo un SMS cuyo destino es el propio remitente, sin llamar a Telnyx ni reclamar la clave", async () => {
    const job = {
      ...AVISO,
      fromNumber: "+34911222219",
      toNumber: "+34911222219",
    };

    const error = await processSendSmsJob(job).catch((e) => e);

    expect(error).toBeInstanceOf(PermanentJobError);
    expect(error.reason).toBe("sms_a_si_mismo");
    expect(mockedSendSms).not.toHaveBeenCalled();
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(
        /SMS aviso_dueno del negocio business_123 descartado \(proveedor telnyx\)/
      )
    );
  });

  it("un 40305 de Telnyx («Invalid 'from' address») es definitivo: PermanentJobError con el código y log ruidoso", async () => {
    mockedSendSms.mockRejectedValue(
      errorDeTelnyx(400, "40305", "Invalid 'from' address")
    );

    const error = await processSendSmsJob(AVISO).catch((e) => e);

    expect(error).toBeInstanceOf(PermanentJobError);
    expect(error.reason).toBe("telnyx_40305");
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(
        /SMS aviso_dueno del negocio business_123 rechazado por Telnyx de forma definitiva \(HTTP 400, código 40305\)/
      )
    );
    // La fila queda marcada como fallida, no como enviada.
    expect(mockedUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          channel: "sms",
          idempotencyKey: "aviso-sms-booking_1",
        }),
        data: expect.objectContaining({ deliveryStatus: "failed" }),
      })
    );
  });

  it.each([
    [429, "10011"],
    [401, "10009"],
    [500, "10007"],
  ])(
    "un %i de Telnyx no es definitivo: se relanza tal cual para que Cloud Tasks reintente",
    async (status, code) => {
      const original = errorDeTelnyx(status, code, "transitorio");
      mockedSendSms.mockRejectedValue(original);

      const error = await processSendSmsJob(AVISO).catch((e) => e);

      expect(error).toBe(original);
      expect(error).not.toBeInstanceOf(PermanentJobError);
    }
  );

  it("un fallo de red (sin estado HTTP) tampoco es definitivo", async () => {
    mockedSendSms.mockRejectedValue(new Error("ECONNRESET"));

    const error = await processSendSmsJob(AVISO).catch((e) => e);

    expect(error).not.toBeInstanceOf(PermanentJobError);
  });

  it("un reintento tras un fallo que Telnyx nunca aceptó vuelve a reclamar la clave", async () => {
    // La clave ya existe (primer intento fallido) y se reabre.
    mockedCreate.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" })
    );
    mockedUpdateMany.mockResolvedValue({ count: 1 } as never);

    await processSendSmsJob(AVISO);

    expect(mockedSendSms).toHaveBeenCalledTimes(1);
  });

  it("una entrega repetida de algo ya enviado no se manda dos veces", async () => {
    mockedCreate.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" })
    );
    mockedUpdateMany.mockResolvedValue({ count: 0 } as never);

    await processSendSmsJob(AVISO);

    expect(mockedSendSms).not.toHaveBeenCalled();
  });
});
