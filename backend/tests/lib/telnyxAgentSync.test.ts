import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createTelnyxAssistantForAgent,
  syncAgentToTelnyx,
} from "../../src/lib/telnyxAgentSync.js";
import { prisma } from "../../src/lib/prisma.js";
import { telnyxAiAdapter } from "../../src/adapters/telnyx/TelnyxAiAdapter.js";
import { DEFAULT_AGENT_SETTINGS } from "../../src/lib/managedAgentPrompt.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    service: { findMany: vi.fn() },
    professional: { findMany: vi.fn() },
    agent: { findMany: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: {
    createAssistant: vi.fn(),
    updateAssistant: vi.fn(),
    listVoices: vi.fn(),
  },
}));

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedServiceFindMany = vi.mocked(prisma.service.findMany);
const mockedProfessionalFindMany = vi.mocked(prisma.professional.findMany);
const mockedAgentFindMany = vi.mocked(prisma.agent.findMany);
const mockedAgentUpdate = vi.mocked(prisma.agent.update);
const mockedCreateAssistant = vi.mocked(telnyxAiAdapter.createAssistant);
const mockedUpdateAssistant = vi.mocked(telnyxAiAdapter.updateAssistant);
const mockedListVoices = vi.mocked(telnyxAiAdapter.listVoices);

const ELIGIBLE_VOICES = [
  { id: "Telnyx.Ultra.isabel", language: "es-ES", gender: "Female" },
];

const BASE_BUSINESS = {
  name: "Peluquería Ejemplo",
  businessDetails: null,
  businessType: "peluqueria",
  agentSettings: null,
  minAdvanceBookingMinutes: null,
  maxAppointmentDurationMinutes: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedServiceFindMany.mockResolvedValue([]);
  mockedProfessionalFindMany.mockResolvedValue([]);
  mockedListVoices.mockResolvedValue(ELIGIBLE_VOICES);
});

describe("createTelnyxAssistantForAgent", () => {
  it("crea el assistant y persiste su id cuando el negocio es elegible", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BASE_BUSINESS as any);
    mockedCreateAssistant.mockResolvedValue({
      id: "assistant_1",
      name: "alhabla-biz1-agent1",
      instructions: "i",
    });

    const result = await createTelnyxAssistantForAgent({
      agentId: "agent1",
      businessId: "biz1",
    });

    expect(result).toEqual({ eligible: true, reason: null });
    expect(mockedCreateAssistant).toHaveBeenCalledTimes(1);
    expect(mockedAgentUpdate).toHaveBeenCalledWith({
      where: { id: "agent1" },
      data: expect.objectContaining({
        telnyxAssistantId: "assistant_1",
        telnyxSyncError: null,
      }),
    });
  });

  it("no crea nada si el negocio no es elegible (catalán)", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      ...BASE_BUSINESS,
      agentSettings: {
        ...DEFAULT_AGENT_SETTINGS,
        languages: ["es-ES", "ca-ES"],
      },
    } as any);

    const result = await createTelnyxAssistantForAgent({
      agentId: "agent1",
      businessId: "biz1",
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/catal/i);
    expect(mockedCreateAssistant).not.toHaveBeenCalled();
    expect(mockedAgentUpdate).not.toHaveBeenCalled();
  });

  it("no lanza si Telnyx falla al crear — devuelve el motivo en vez de propagar el error", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BASE_BUSINESS as any);
    mockedCreateAssistant.mockRejectedValue(new Error("Telnyx 500"));

    const result = await createTelnyxAssistantForAgent({
      agentId: "agent1",
      businessId: "biz1",
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("Telnyx 500");
  });

  it("devuelve no elegible si el negocio no existe", async () => {
    mockedBusinessFindUnique.mockResolvedValue(null);

    const result = await createTelnyxAssistantForAgent({
      agentId: "agent1",
      businessId: "biz_missing",
    });

    expect(result).toEqual({
      eligible: false,
      reason: "Negocio no encontrado.",
    });
  });
});

describe("syncAgentToTelnyx", () => {
  it("no hace nada si ningún agente tiene telnyxAssistantId todavía", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BASE_BUSINESS as any);
    mockedAgentFindMany.mockResolvedValue([]);

    await syncAgentToTelnyx("biz1");

    expect(mockedUpdateAssistant).not.toHaveBeenCalled();
    expect(mockedAgentUpdate).not.toHaveBeenCalled();
  });

  it("actualiza el assistant cuando la configuración cambió", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BASE_BUSINESS as any);
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent1",
        telnyxAssistantId: "assistant_1",
        telnyxConfigHash: "hash-vieja",
        systemPrompt: "prompt guardado",
        promptManuallyEdited: false,
      },
    ] as any);

    await syncAgentToTelnyx("biz1");

    expect(mockedUpdateAssistant).toHaveBeenCalledTimes(1);
    expect(mockedUpdateAssistant.mock.calls[0][0]).toBe("assistant_1");
    expect(mockedAgentUpdate).toHaveBeenCalledWith({
      where: { id: "agent1" },
      data: expect.objectContaining({ telnyxSyncError: null }),
    });
  });

  it("no llama a Telnyx si el hash de configuración no cambió", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BASE_BUSINESS as any);
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent1",
        telnyxAssistantId: "assistant_1",
        // Se calcula en el propio test tras una primera pasada para no
        // acoplarse al hash exacto que produce buildTelnyxAssistantPayload.
        telnyxConfigHash: "PENDIENTE",
        systemPrompt: "prompt guardado",
        promptManuallyEdited: false,
      },
    ] as any);

    // Primera pasada: calienta el hash real.
    await syncAgentToTelnyx("biz1");
    const [firstCallArg] = mockedAgentUpdate.mock.calls[0];
    const realHash = (firstCallArg as any).data.telnyxConfigHash;
    mockedUpdateAssistant.mockClear();
    mockedAgentUpdate.mockClear();

    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent1",
        telnyxAssistantId: "assistant_1",
        telnyxConfigHash: realHash,
        systemPrompt: "prompt guardado",
        promptManuallyEdited: false,
      },
    ] as any);

    await syncAgentToTelnyx("biz1");

    expect(mockedUpdateAssistant).not.toHaveBeenCalled();
    // Sigue refrescando telnyxSyncedAt aunque no haya cambiado nada remoto.
    expect(mockedAgentUpdate).toHaveBeenCalledTimes(1);
  });

  it("salta los agentes editados a mano cuando onlyManagedPrompts es true", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BASE_BUSINESS as any);
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent_manual",
        telnyxAssistantId: "assistant_1",
        telnyxConfigHash: null,
        systemPrompt: "prompt manual",
        promptManuallyEdited: true,
      },
    ] as any);

    await syncAgentToTelnyx("biz1", prisma, { onlyManagedPrompts: true });

    expect(mockedUpdateAssistant).not.toHaveBeenCalled();
    expect(mockedAgentUpdate).not.toHaveBeenCalled();
  });

  it("registra telnyxSyncError sin lanzar cuando el negocio deja de ser elegible", async () => {
    mockedBusinessFindUnique.mockResolvedValue(BASE_BUSINESS as any);
    mockedListVoices.mockResolvedValue([]);
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent1",
        telnyxAssistantId: "assistant_1",
        telnyxConfigHash: null,
        systemPrompt: "prompt guardado",
        promptManuallyEdited: false,
      },
    ] as any);

    await expect(syncAgentToTelnyx("biz1")).resolves.toBeUndefined();

    expect(mockedUpdateAssistant).not.toHaveBeenCalled();
    expect(mockedAgentUpdate).toHaveBeenCalledWith({
      where: { id: "agent1" },
      data: { telnyxSyncError: expect.stringMatching(/voz Telnyx compatible/) },
    });
  });

  it("no lanza si prisma falla al buscar el negocio", async () => {
    mockedBusinessFindUnique.mockRejectedValue(new Error("DB caída"));

    await expect(syncAgentToTelnyx("biz1")).resolves.toBeUndefined();
  });
});
