import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { processRecordarRecadoJob } from "../../src/jobs/recordarRecado.js";
import { avisarRecado } from "../../src/modules/whatsapp/avisosNegocio.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { lead: { findUnique: vi.fn() } },
}));
vi.mock("../../src/modules/whatsapp/avisosNegocio.js", () => ({
  avisarRecado: vi.fn(),
}));

const mockedFind = vi.mocked(prisma.lead.findUnique);
const mockedAvisar = vi.mocked(avisarRecado);

const LEAD = {
  id: "lead_1",
  type: "message",
  resolvedAt: null,
  data: {
    clientName: "María",
    clientPhone: "+34612345678",
    motivo: "balayage",
    quiereQueLeLlamen: true,
  },
  call: { business: { id: "biz_1", name: "Peluquería Ana" } },
};

describe("processRecordarRecadoJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    mockedAvisar.mockResolvedValue({ via: "interactivo" });
  });

  it("vuelve a avisar del recado pendiente con el número de intento", async () => {
    mockedFind.mockResolvedValue(LEAD as never);

    await processRecordarRecadoJob({ leadId: "lead_1", intento: 2 });

    expect(mockedAvisar).toHaveBeenCalledWith({
      businessId: "biz_1",
      businessName: "Peluquería Ana",
      leadId: "lead_1",
      clientName: "María",
      clientPhone: "+34612345678",
      motivo: "balayage",
      quiereQueLeLlamen: true,
      intento: 2,
    });
  });

  it("no avisa si el recado ya está atendido, no existe, no es un recado o se pasó del tope", async () => {
    mockedFind.mockResolvedValue({ ...LEAD, resolvedAt: new Date() } as never);
    await processRecordarRecadoJob({ leadId: "lead_1" });
    mockedFind.mockResolvedValue(null);
    await processRecordarRecadoJob({ leadId: "lead_1" });
    mockedFind.mockResolvedValue({ ...LEAD, type: "pending_booking" } as never);
    await processRecordarRecadoJob({ leadId: "lead_1" });
    mockedFind.mockResolvedValue(LEAD as never);
    await processRecordarRecadoJob({ leadId: "lead_1", intento: 4 });

    expect(mockedAvisar).not.toHaveBeenCalled();
  });

  it("un aviso que falla no tumba el job", async () => {
    mockedFind.mockResolvedValue(LEAD as never);
    mockedAvisar.mockRejectedValue(new Error("caído"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      processRecordarRecadoJob({ leadId: "lead_1" })
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});
