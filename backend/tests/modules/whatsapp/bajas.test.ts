import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import {
  bajaVigente,
  estaDadoDeBaja,
  registrarBaja,
  revocarBaja,
  WhatsappOptOutError,
} from "../../../src/modules/whatsapp/bajas.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    whatsappOptOut: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

const mockedFindUnique = vi.mocked(prisma.whatsappOptOut.findUnique);
const mockedUpsert = vi.mocked(prisma.whatsappOptOut.upsert);
const mockedUpdateMany = vi.mocked(prisma.whatsappOptOut.updateMany);

const MOVIL = "+34692138456";

describe("registrarBaja", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUpsert.mockResolvedValue({} as never);
  });

  it("crea la fila por (número, audiencia) con la palabra exacta y la prueba", async () => {
    await registrarBaja({
      phoneNumber: MOVIL,
      audience: "client",
      keyword: "STOP",
      inboundMessageId: "in_1",
      businessId: "biz_1",
    });

    expect(mockedUpsert).toHaveBeenCalledWith({
      where: {
        phoneNumber_audience: { phoneNumber: MOVIL, audience: "client" },
      },
      create: expect.objectContaining({
        phoneNumber: MOVIL,
        audience: "client",
        keyword: "STOP",
        inboundMessageId: "in_1",
        businessId: "biz_1",
        optedOutAt: expect.any(Date),
      }),
      update: expect.objectContaining({
        keyword: "STOP",
        inboundMessageId: "in_1",
        revokedAt: null,
        revokedByMessageId: null,
        optedOutAt: expect.any(Date),
      }),
    });
  });

  it("una fila revocada vuelve a estar vigente con el nuevo STOP (mismo upsert)", async () => {
    await registrarBaja({
      phoneNumber: MOVIL,
      audience: "owner",
      keyword: "BAJA",
      inboundMessageId: "in_2",
    });
    const args = mockedUpsert.mock.calls[0][0];
    expect(args.update).toEqual(
      expect.objectContaining({
        revokedAt: null,
        keyword: "BAJA",
        businessId: null,
      })
    );
  });
});

describe("bajaVigente / estaDadoDeBaja", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve la fecha y la palabra cuando la fila no está revocada", async () => {
    const optedOutAt = new Date("2026-09-20T10:00:00Z");
    mockedFindUnique.mockResolvedValue({
      optedOutAt,
      keyword: "STOP",
      revokedAt: null,
    } as never);

    expect(await bajaVigente("client", MOVIL)).toEqual({
      optedOutAt,
      keyword: "STOP",
    });
    expect(mockedFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          phoneNumber_audience: { phoneNumber: MOVIL, audience: "client" },
        },
      })
    );
    expect(await estaDadoDeBaja("client", MOVIL)).toBe(true);
  });

  it("una fila revocada o inexistente no es baja", async () => {
    mockedFindUnique.mockResolvedValueOnce({
      optedOutAt: new Date(),
      keyword: "STOP",
      revokedAt: new Date(),
    } as never);
    expect(await bajaVigente("client", MOVIL)).toBeNull();

    mockedFindUnique.mockResolvedValueOnce(null);
    expect(await estaDadoDeBaja("client", MOVIL)).toBe(false);
  });

  it("la baja es por audiencia: se consulta con la audiencia pedida", async () => {
    mockedFindUnique.mockResolvedValue(null);
    await bajaVigente("owner", MOVIL);
    expect(mockedFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          phoneNumber_audience: { phoneNumber: MOVIL, audience: "owner" },
        },
      })
    );
  });

  it("si la base de datos falla, se asume sin baja y se deja en el log", async () => {
    mockedFindUnique.mockRejectedValue(new Error("conexión perdida"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(await bajaVigente("client", MOVIL)).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("conexión perdida")
    );
    errorSpy.mockRestore();
  });
});

describe("revocarBaja", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("solo revoca filas vigentes y devuelve cuántas", async () => {
    mockedUpdateMany.mockResolvedValue({ count: 1 });

    expect(
      await revocarBaja({
        phoneNumber: MOVIL,
        audience: "client",
        inboundMessageId: "in_3",
      })
    ).toBe(1);
    expect(mockedUpdateMany).toHaveBeenCalledWith({
      where: { phoneNumber: MOVIL, audience: "client", revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedByMessageId: "in_3" },
    });
  });

  it("sin baja vigente devuelve 0", async () => {
    mockedUpdateMany.mockResolvedValue({ count: 0 });
    expect(
      await revocarBaja({
        phoneNumber: MOVIL,
        audience: "owner",
        inboundMessageId: "in_4",
      })
    ).toBe(0);
  });
});

describe("WhatsappOptOutError", () => {
  it("lleva el código que reconocen el enrutador y el job", () => {
    const error = new WhatsappOptOutError("client", MOVIL);
    expect(error.code).toBe("WHATSAPP_OPT_OUT");
    expect(error.message).toContain(MOVIL);
  });
});
