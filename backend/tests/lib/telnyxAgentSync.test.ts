import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import {
  createTelnyxAssistantForAgent,
  syncAgentToTelnyx,
  reconcileVoiceOrchestrator,
} from "../../src/lib/telnyxAgentSync.js";
import { prisma } from "../../src/lib/prisma.js";
import { telnyxAiAdapter } from "../../src/adapters/telnyx/TelnyxAiAdapter.js";
import { repointTelnyxPhoneNumber } from "../../src/lib/voiceRouting.js";
import { DEFAULT_AGENT_SETTINGS } from "../../src/lib/managedAgentPrompt.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn(), update: vi.fn() },
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

vi.mock("../../src/lib/voiceRouting.js", () => ({
  repointTelnyxPhoneNumber: vi.fn(),
}));

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedBusinessUpdate = vi.mocked(prisma.business.update);
const mockedServiceFindMany = vi.mocked(prisma.service.findMany);
const mockedProfessionalFindMany = vi.mocked(prisma.professional.findMany);
const mockedAgentFindMany = vi.mocked(prisma.agent.findMany);
const mockedAgentUpdate = vi.mocked(prisma.agent.update);
const mockedCreateAssistant = vi.mocked(telnyxAiAdapter.createAssistant);
const mockedUpdateAssistant = vi.mocked(telnyxAiAdapter.updateAssistant);
const mockedListVoices = vi.mocked(telnyxAiAdapter.listVoices);
const mockedRepointPhoneNumber = vi.mocked(repointTelnyxPhoneNumber);

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

  it("fija transcription.language según los idiomas activados, no un \"es\" fijo", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      ...BASE_BUSINESS,
      agentSettings: { ...DEFAULT_AGENT_SETTINGS, languages: ["es-ES", "en-GB"] },
    } as any);
    mockedCreateAssistant.mockResolvedValue({
      id: "assistant_1",
      name: "alhabla-biz1-agent1",
      instructions: "i",
    });

    await createTelnyxAssistantForAgent({ agentId: "agent1", businessId: "biz1" });

    expect(mockedCreateAssistant.mock.calls[0][0]).toMatchObject({
      transcription: { language: "multi" },
    });
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

describe("reconcileVoiceOrchestrator", () => {
  const ORIGINAL_ENV = {
    STRIPE_PRICE_INICIO: process.env.STRIPE_PRICE_INICIO,
    STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO,
    STRIPE_PRICE_SCALE: process.env.STRIPE_PRICE_SCALE,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRICE_INICIO = "price_inicio";
    process.env.STRIPE_PRICE_PRO = "price_pro";
    process.env.STRIPE_PRICE_SCALE = "price_scale";
    mockedBusinessUpdate.mockResolvedValue({} as any);
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("cambia a Retell cuando catalán está activo en un plan Pro", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      orchestrator: "telnyx",
      agentSettings: { ...DEFAULT_AGENT_SETTINGS, languages: ["es-ES", "ca-ES"] },
      stripePriceId: "price_pro",
      telnyxPhoneNumberId: "pn_1",
    } as any);
    mockedRepointPhoneNumber.mockResolvedValue({ success: true });

    await reconcileVoiceOrchestrator("biz1");

    expect(mockedRepointPhoneNumber).toHaveBeenCalledWith("biz1", "pn_1", "retell");
    expect(mockedBusinessUpdate).toHaveBeenCalledWith({
      where: { id: "biz1" },
      data: expect.objectContaining({
        orchestrator: "retell",
        voiceRoutingTarget: "retell",
        voiceFailoverActive: false,
      }),
    });
  });

  it("cambia a Telnyx cuando catalán se desactiva y Telnyx es elegible", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      orchestrator: "retell",
      agentSettings: { ...DEFAULT_AGENT_SETTINGS, languages: ["es-ES"] },
      stripePriceId: "price_pro",
      telnyxPhoneNumberId: "pn_1",
    } as any);
    mockedListVoices.mockResolvedValue(ELIGIBLE_VOICES);
    mockedRepointPhoneNumber.mockResolvedValue({ success: true });

    await reconcileVoiceOrchestrator("biz1");

    expect(mockedRepointPhoneNumber).toHaveBeenCalledWith("biz1", "pn_1", "telnyx");
    expect(mockedBusinessUpdate).toHaveBeenCalledWith({
      where: { id: "biz1" },
      data: expect.objectContaining({ orchestrator: "telnyx", voiceRoutingTarget: "telnyx" }),
    });
  });

  it("no hace nada si el orquestador deseado ya coincide con el actual", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      orchestrator: "telnyx",
      agentSettings: { ...DEFAULT_AGENT_SETTINGS, languages: ["es-ES"] },
      stripePriceId: "price_inicio",
      telnyxPhoneNumberId: "pn_1",
    } as any);
    mockedListVoices.mockResolvedValue(ELIGIBLE_VOICES);

    await reconcileVoiceOrchestrator("biz1");

    expect(mockedRepointPhoneNumber).not.toHaveBeenCalled();
    expect(mockedBusinessUpdate).not.toHaveBeenCalled();
  });

  it("mantiene Retell como red de seguridad si catalán sigue activo en un plan Inicio (dato preexistente)", async () => {
    // No debería poder guardarse hoy (la ruta lo bloquea antes de llegar
    // aquí), pero si un negocio ya lo tenía guardado de antes, Telnyx sigue
    // sin poder atender catalán — nunca debe terminar ahí pase lo que pase.
    mockedBusinessFindUnique.mockResolvedValue({
      orchestrator: "retell",
      agentSettings: { ...DEFAULT_AGENT_SETTINGS, languages: ["es-ES", "ca-ES"] },
      stripePriceId: "price_inicio",
      telnyxPhoneNumberId: "pn_1",
    } as any);

    await reconcileVoiceOrchestrator("biz1");

    expect(mockedRepointPhoneNumber).not.toHaveBeenCalled();
    expect(mockedBusinessUpdate).not.toHaveBeenCalled();
  });

  it("solo actualiza la intención en BD si el negocio todavía no tiene número Telnyx propio", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      orchestrator: "telnyx",
      agentSettings: { ...DEFAULT_AGENT_SETTINGS, languages: ["es-ES", "ca-ES"] },
      stripePriceId: "price_scale",
      telnyxPhoneNumberId: null,
    } as any);

    await reconcileVoiceOrchestrator("biz1");

    expect(mockedRepointPhoneNumber).not.toHaveBeenCalled();
    expect(mockedBusinessUpdate).toHaveBeenCalledWith({
      where: { id: "biz1" },
      data: { orchestrator: "retell", voiceRoutingTarget: "retell" },
    });
  });

  it("no lanza y no actualiza nada si falla el repunte del número", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      orchestrator: "telnyx",
      agentSettings: { ...DEFAULT_AGENT_SETTINGS, languages: ["es-ES", "ca-ES"] },
      stripePriceId: "price_pro",
      telnyxPhoneNumberId: "pn_1",
    } as any);
    mockedRepointPhoneNumber.mockResolvedValue({ success: false, error: "Telnyx 500" });

    await expect(reconcileVoiceOrchestrator("biz1")).resolves.toBeUndefined();

    expect(mockedBusinessUpdate).not.toHaveBeenCalled();
  });

  it("no lanza si el negocio no existe", async () => {
    mockedBusinessFindUnique.mockResolvedValue(null);

    await expect(reconcileVoiceOrchestrator("biz1")).resolves.toBeUndefined();
  });

  it("no lanza si prisma falla", async () => {
    mockedBusinessFindUnique.mockRejectedValue(new Error("DB caída"));

    await expect(reconcileVoiceOrchestrator("biz1")).resolves.toBeUndefined();
  });
});
