import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildInboundCallDynamicVariables,
  syncAgentToRetell,
  createBusinessAgent,
  RETELL_VOICE_ID_BY_GENDER,
  resolveRetellVoiceProfile,
} from "../../src/lib/agentBootstrap.js";
import { prisma } from "../../src/lib/prisma.js";
import { retellAdapter } from "../../src/adapters/retell/RetellAdapter.js";
import { calendarService } from "../../src/modules/calendar/service.js";
import { DEFAULT_BUSINESS_SCHEDULE } from "../../src/lib/businessSchedule.js";
import { DEFAULT_AGENT_SETTINGS } from "../../src/lib/managedAgentPrompt.js";
import { telnyxAiAdapter } from "../../src/adapters/telnyx/TelnyxAiAdapter.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    service: {
      findMany: vi.fn(),
    },
    professional: {
      findMany: vi.fn(),
    },
    agent: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: {
    createAssistant: vi.fn(),
    updateAssistant: vi.fn(),
    listVoices: vi.fn(),
  },
}));

vi.mock("../../src/adapters/retell/RetellAdapter.js", () => ({
  retellAdapter: {
    updateLlm: vi.fn(),
    updateAgent: vi.fn(),
    createAgentVersion: vi.fn(),
    publishAgent: vi.fn(),
    getAgent: vi.fn(),
    createLlm: vi.fn(),
    createAgent: vi.fn(),
  },
}));

vi.mock("../../src/modules/calendar/service.js", () => ({
  calendarService: {
    syncCalendarToolsToAgents: vi.fn(),
  },
}));

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedServiceFindMany = vi.mocked(prisma.service.findMany);
const mockedProfessionalFindMany = vi.mocked(prisma.professional.findMany);
const mockedAgentFindMany = vi.mocked(prisma.agent.findMany);
const mockedAgentUpdate = vi.mocked(prisma.agent.update);
const mockedAgentCreate = vi.mocked(prisma.agent.create);
const mockedUpdateLlm = vi.mocked(retellAdapter.updateLlm);
const mockedUpdateAgent = vi.mocked(retellAdapter.updateAgent);
const mockedCreateAgentVersion = vi.mocked(retellAdapter.createAgentVersion);
const mockedPublishAgent = vi.mocked(retellAdapter.publishAgent);
const mockedGetAgent = vi.mocked(retellAdapter.getAgent);
const mockedCreateLlm = vi.mocked(retellAdapter.createLlm);
const mockedCreateAgent = vi.mocked(retellAdapter.createAgent);
const mockedSyncCalendarToolsToAgents = vi.mocked(calendarService.syncCalendarToolsToAgents);
const mockedBusinessUpdate = vi.mocked(prisma.business.update);
const mockedTelnyxCreateAssistant = vi.mocked(telnyxAiAdapter.createAssistant);
const mockedTelnyxListVoices = vi.mocked(telnyxAiAdapter.listVoices);

describe("buildInboundCallDynamicVariables", () => {
  it("devuelve solo el contexto mínimo por llamada", async () => {
    mockedBusinessFindUnique.mockResolvedValue({ schedule: DEFAULT_BUSINESS_SCHEDULE } as any);
    mockedServiceFindMany.mockResolvedValue([
      { id: "svc_1", name: "Corte", durationMinutes: 30 },
    ] as any);
    mockedProfessionalFindMany.mockResolvedValue([
      { id: "pro_1", name: "Ana" },
    ] as any);

    const variables = await buildInboundCallDynamicVariables("biz_123");

    expect(variables.nombre_negocio).toBe("el negocio");
    expect(variables.zona_horaria).toBe("Europe/Madrid");
    expect(variables).not.toHaveProperty("servicios_disponibles");
    expect(variables).not.toHaveProperty("empleados");
    expect(variables).not.toHaveProperty("horario_semanal");
  });

  it("no revienta si el negocio no existe (findUnique devuelve null)", async () => {
    mockedBusinessFindUnique.mockResolvedValue(null);
    mockedServiceFindMany.mockResolvedValue([]);
    mockedProfessionalFindMany.mockResolvedValue([]);

    const variables = await buildInboundCallDynamicVariables("biz_inexistente");

    expect(variables.nombre_negocio).toBe("el negocio");
    expect(variables.zona_horaria).toBe("Europe/Madrid");
  });

  it("incluye nombre y zona horaria como variables dinámicas", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      name: "Barbería Ejemplo",
      businessDetails: "Solo se atiende con cita previa.",
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: "Atlantic/Canary",
    } as any);
    mockedServiceFindMany.mockResolvedValue([]);
    mockedProfessionalFindMany.mockResolvedValue([]);

    const variables = await buildInboundCallDynamicVariables("biz_123");

    expect(variables.nombre_negocio).toBe("Barbería Ejemplo");
    expect(variables.zona_horaria).toBe("Atlantic/Canary");
  });

  it("usa Europe/Madrid como fallback si el negocio no tiene timezone configurada", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: null,
    } as any);
    mockedServiceFindMany.mockResolvedValue([]);
    mockedProfessionalFindMany.mockResolvedValue([]);

    const variables = await buildInboundCallDynamicVariables("biz_123");

    expect(variables.zona_horaria).toBe("Europe/Madrid");
  });

  it("no revienta y cae a Europe/Madrid si business.timezone no es una zona IANA válida", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      schedule: DEFAULT_BUSINESS_SCHEDULE,
      timezone: "no-es-una-timezone",
    } as any);
    mockedServiceFindMany.mockResolvedValue([]);
    mockedProfessionalFindMany.mockResolvedValue([]);

    const variables = await buildInboundCallDynamicVariables("biz_123");

    expect(variables.zona_horaria).toBe("Europe/Madrid");
  });
});

describe("syncAgentToRetell — voiceGender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedServiceFindMany.mockResolvedValue([]);
    mockedProfessionalFindMany.mockResolvedValue([]);
    mockedAgentFindMany.mockResolvedValue([
      { id: "agent_db_1", retellAgentId: "retell_agent_1", retellLlmId: "retell_llm_1" },
    ] as any);
    mockedUpdateLlm.mockResolvedValue({} as any);
    mockedUpdateAgent.mockResolvedValue({ version: 7, is_published: false } as any);
    mockedCreateAgentVersion.mockResolvedValue({
      version: 7,
      is_published: false,
      response_engine: {
        type: "retell-llm",
        llm_id: "retell_llm_1",
        version: 7,
      },
    } as any);
    mockedPublishAgent.mockResolvedValue(undefined);
    mockedGetAgent.mockImplementation(async (_agentId, version) =>
      version === undefined
        ? ({
            version: 6,
            is_published: true,
            response_engine: {
              type: "retell-llm",
              llm_id: "retell_llm_1",
              version: 6,
            },
          } as any)
        : ({ is_published: true } as any)
    );
    mockedAgentUpdate.mockResolvedValue({} as any);
  });

  it("empuja la voz femenina (por defecto) cuando el negocio no tiene voiceGender guardado", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      name: "Salón de prueba",
      businessDetails: null,
      businessType: "peluqueria",
      agentSettings: null,
      orchestrator: "retell",
      minAdvanceBookingMinutes: null,
      maxAppointmentDurationMinutes: null,
    } as any);

    await syncAgentToRetell("biz_123");

    expect(mockedUpdateAgent).toHaveBeenCalledWith(
      "retell_agent_1",
      expect.objectContaining({ voiceId: RETELL_VOICE_ID_BY_GENDER.femenina })
    );
    expect(mockedAgentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ voiceId: RETELL_VOICE_ID_BY_GENDER.femenina }),
      })
    );
    expect(mockedPublishAgent).toHaveBeenCalledWith(
      "retell_agent_1",
      7,
      "Configuración gestionada por Alhabla"
    );
    expect(mockedGetAgent).toHaveBeenCalledWith("retell_agent_1", 7);
  });

  it("no actualiza un prompt editado a mano al sincronizar solo gestionados", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      name: "Negocio de prueba",
      businessDetails: null,
      businessType: "barberia",
      agentSettings: {},
      orchestrator: "retell",
      minAdvanceBookingMinutes: null,
      maxAppointmentDurationMinutes: null,
    } as any);
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent_manual",
        retellAgentId: "retell_agent_manual",
        retellLlmId: "retell_llm_manual",
        promptManuallyEdited: true,
      },
    ] as any);

    await syncAgentToRetell("biz_manual", prisma, { onlyManagedPrompts: true });

    expect(mockedUpdateLlm).not.toHaveBeenCalled();
    expect(mockedUpdateAgent).not.toHaveBeenCalled();
    expect(mockedAgentUpdate).not.toHaveBeenCalled();
  });

  it("no actualiza agentes inactivos al sincronizar solo activos", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      name: "Negocio de prueba",
      businessDetails: null,
      businessType: "barberia",
      agentSettings: {},
      orchestrator: "retell",
      minAdvanceBookingMinutes: null,
      maxAppointmentDurationMinutes: null,
    } as any);
    mockedAgentFindMany.mockResolvedValue([] as any);

    await syncAgentToRetell("biz_inactivo", prisma, { onlyActive: true });

    expect(mockedAgentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ active: true }),
      })
    );
    expect(mockedUpdateLlm).not.toHaveBeenCalled();
    expect(mockedUpdateAgent).not.toHaveBeenCalled();
    expect(mockedAgentUpdate).not.toHaveBeenCalled();
  });

  it("empuja la voz masculina cuando el negocio la eligió en agentSettings", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      name: "Barbería de prueba",
      businessDetails: null,
      businessType: "barberia",
      agentSettings: {
        version: 1,
        tone: "direct",
        primaryGoal: "bookings",
        responseStyle: "concise",
        escalation: "take_message",
        voiceGender: "masculina",
      },
      orchestrator: "retell",
      minAdvanceBookingMinutes: null,
      maxAppointmentDurationMinutes: null,
    } as any);

    await syncAgentToRetell("biz_456");

    expect(mockedUpdateAgent).toHaveBeenCalledWith(
      "retell_agent_1",
      expect.objectContaining({ voiceId: RETELL_VOICE_ID_BY_GENDER.masculina })
    );
    expect(RETELL_VOICE_ID_BY_GENDER.masculina).toBe("cartesia-Manuel");
  });

  it("empuja retención de 30 días, stt_mode accurate, y boostedKeywords con nombres reales de servicios/profesionales", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      name: "Peluquería de prueba",
      businessDetails: null,
      businessType: "peluqueria",
      agentSettings: null,
      orchestrator: "retell",
      minAdvanceBookingMinutes: null,
      maxAppointmentDurationMinutes: null,
    } as any);
    mockedServiceFindMany.mockResolvedValue([
      { name: "Corte" },
      { name: "Coloración" },
    ] as any);
    mockedProfessionalFindMany.mockResolvedValue([{ name: "Marta" }] as any);

    await syncAgentToRetell("biz_999");

    expect(mockedUpdateAgent).toHaveBeenCalledWith(
      "retell_agent_1",
      expect.objectContaining({
        dataStorageRetentionDays: 30,
        sttMode: "accurate",
        boostedKeywords: ["Corte", "Coloración", "Marta"],
        piiCategories: ["person_name", "phone_number", "email", "address"],
      })
    );
  });

  it("cambia a la cadena compatible con catalán y conserva el idioma en Retell", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      name: "Peluquería catalana",
      businessDetails: null,
      businessType: "peluqueria",
      agentSettings: {
        version: 1,
        tone: "warm",
        primaryGoal: "bookings",
        responseStyle: "concise",
        escalation: "take_message",
        voiceGender: "femenina",
        languages: ["es-ES", "ca-ES", "en-GB", "fr-FR"],
      },
      orchestrator: "retell",
      minAdvanceBookingMinutes: null,
      maxAppointmentDurationMinutes: null,
    } as any);

    await syncAgentToRetell("biz_catalan");

    expect(mockedUpdateAgent).toHaveBeenCalledWith(
      "retell_agent_1",
      expect.objectContaining({
        language: ["es-ES", "en-GB", "fr-FR", "ca-ES"],
        voiceId: "11labs-Hailey-Latin-America-Spanish-localized",
        voiceModel: "eleven_v3",
        fallbackVoiceIds: ["minimax-Camille"],
      })
    );
  });

  it("no toca Retell si el negocio no usa el orquestador retell", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      name: "Negocio Vapi",
      businessDetails: null,
      businessType: "other",
      agentSettings: null,
      orchestrator: "vapi",
      minAdvanceBookingMinutes: null,
      maxAppointmentDurationMinutes: null,
    } as any);

    await syncAgentToRetell("biz_789");

    expect(mockedUpdateAgent).not.toHaveBeenCalled();
    expect(mockedAgentFindMany).not.toHaveBeenCalled();
  });

  it("no sobrescribe el prompt de un agente editado a mano, pero sí sincroniza el resto (hallazgo #27 de la auditoría)", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      name: "Peluquería de prueba",
      businessDetails: null,
      businessType: "peluqueria",
      agentSettings: null,
      orchestrator: "retell",
      minAdvanceBookingMinutes: null,
      maxAppointmentDurationMinutes: null,
    } as any);
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent_db_1",
        retellAgentId: "retell_agent_1",
        retellLlmId: "retell_llm_1",
        promptManuallyEdited: true,
      },
    ] as any);

    await syncAgentToRetell("biz_manual");

    expect(mockedUpdateLlm).not.toHaveBeenCalled();
    // El resto (voz, categorías de análisis, etc.) sigue sincronizándose igual.
    expect(mockedUpdateAgent).toHaveBeenCalledWith("retell_agent_1", expect.any(Object));
    expect(mockedAgentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "agent_db_1" },
        data: {
          retellLlmId: "retell_llm_1",
          voiceId: RETELL_VOICE_ID_BY_GENDER.femenina,
          voiceProvider: "cartesia",
        },
      })
    );
  });

  it("SÍ sobrescribe el prompt de un agente gestionado normalmente (promptManuallyEdited: false)", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      name: "Peluquería de prueba",
      businessDetails: null,
      businessType: "peluqueria",
      agentSettings: null,
      orchestrator: "retell",
      minAdvanceBookingMinutes: null,
      maxAppointmentDurationMinutes: null,
    } as any);
    mockedAgentFindMany.mockResolvedValue([
      {
        id: "agent_db_1",
        retellAgentId: "retell_agent_1",
        retellLlmId: "retell_llm_1",
        promptManuallyEdited: false,
      },
    ] as any);

    await syncAgentToRetell("biz_managed");

    expect(mockedUpdateLlm).toHaveBeenCalledWith("retell_llm_1", expect.objectContaining({ generalPrompt: expect.any(String) }));
  });
});

describe("resolveRetellVoiceProfile", () => {
  it("usa Cartesia y dos fallbacks de proveedores distintos sin catalán", () => {
    expect(resolveRetellVoiceProfile({ ...DEFAULT_AGENT_SETTINGS, voiceGender: "masculina" })).toEqual({
      voiceId: "cartesia-Manuel",
      voiceModel: "sonic-3.5",
      fallbackVoiceIds: ["11labs-Santiago", "minimax-Louis"],
      voiceProvider: "cartesia",
    });
  });

  it("usa ElevenLabs y MiniMax cuando el negocio activa catalán", () => {
    expect(resolveRetellVoiceProfile({
      ...DEFAULT_AGENT_SETTINGS,
      languages: ["es-ES", "ca-ES"],
    })).toEqual({
      voiceId: "11labs-Hailey-Latin-America-Spanish-localized",
      voiceModel: "eleven_v3",
      fallbackVoiceIds: ["minimax-Camille"],
      voiceProvider: "elevenlabs",
    });
  });
});

describe("createBusinessAgent — sincroniza tools de calendario al crear (hallazgo #25 de la auditoría)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedBusinessFindUnique.mockResolvedValue({
      orchestrator: "retell",
      businessType: "peluqueria",
      name: "Peluquería de prueba",
    } as any);
    mockedServiceFindMany.mockResolvedValue([]);
    mockedAgentCreate.mockResolvedValue({ id: "agent_db_1" } as any);
    mockedCreateLlm.mockResolvedValue({ llm_id: "retell_llm_1" } as any);
    mockedCreateAgent.mockResolvedValue({ agent_id: "retell_agent_1", version: 0, is_published: false } as any);
    mockedPublishAgent.mockResolvedValue(undefined);
    mockedGetAgent.mockResolvedValue({ is_published: true } as any);
    mockedAgentUpdate.mockResolvedValue({ id: "agent_db_1" } as any);
  });

  it("llama a syncCalendarToolsToAgents justo después de crear el agente en Retell", async () => {
    await createBusinessAgent({ businessId: "biz_new", name: "Nuevo negocio" });

    expect(mockedSyncCalendarToolsToAgents).toHaveBeenCalledWith("biz_new");
  });

  it("no rompe la creación del agente si falla la sincronización de tools", async () => {
    mockedSyncCalendarToolsToAgents.mockRejectedValue(new Error("Retell down"));

    const result = await createBusinessAgent({ businessId: "biz_new", name: "Nuevo negocio" });

    expect(result).toEqual(expect.objectContaining({ id: "agent_db_1" }));
  });
});

describe("createBusinessAgent — creación dual Telnyx (Fase 2 del plan Telnyx-orquestador)", () => {
  const originalRollout = process.env.VOICE_TELNYX_ROLLOUT;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedBusinessFindUnique.mockResolvedValue({
      orchestrator: "retell",
      businessType: "peluqueria",
      name: "Peluquería de prueba",
    } as any);
    mockedServiceFindMany.mockResolvedValue([]);
    mockedProfessionalFindMany.mockResolvedValue([]);
    mockedAgentCreate.mockResolvedValue({ id: "agent_db_1" } as any);
    mockedCreateLlm.mockResolvedValue({ llm_id: "retell_llm_1" } as any);
    mockedCreateAgent.mockResolvedValue({ agent_id: "retell_agent_1", version: 0, is_published: false } as any);
    mockedPublishAgent.mockResolvedValue(undefined);
    mockedGetAgent.mockResolvedValue({ is_published: true } as any);
    mockedAgentUpdate.mockResolvedValue({ id: "agent_db_1" } as any);
    mockedBusinessUpdate.mockResolvedValue({} as any);
    mockedTelnyxListVoices.mockResolvedValue([
      { id: "Telnyx.Ultra.isabel", language: "es-ES", gender: "Female" },
    ]);
    mockedTelnyxCreateAssistant.mockResolvedValue({
      id: "telnyx_assistant_1",
      name: "alhabla-biz_new-agent_db_1",
      instructions: "i",
    });
  });

  afterEach(() => {
    if (originalRollout === undefined) {
      delete process.env.VOICE_TELNYX_ROLLOUT;
    } else {
      process.env.VOICE_TELNYX_ROLLOUT = originalRollout;
    }
  });

  it("no toca Telnyx cuando VOICE_TELNYX_ROLLOUT está apagado (comportamiento por defecto)", async () => {
    delete process.env.VOICE_TELNYX_ROLLOUT;

    await createBusinessAgent({ businessId: "biz_new", name: "Nuevo negocio" });

    expect(mockedTelnyxCreateAssistant).not.toHaveBeenCalled();
    expect(mockedBusinessUpdate).not.toHaveBeenCalled();
  });

  it("crea también el assistant Telnyx cuando el rollout está activo y el negocio es elegible", async () => {
    process.env.VOICE_TELNYX_ROLLOUT = "development";

    await createBusinessAgent({ businessId: "biz_new", name: "Nuevo negocio" });

    expect(mockedTelnyxCreateAssistant).toHaveBeenCalledTimes(1);
    expect(mockedBusinessUpdate).toHaveBeenCalledWith({
      where: { id: "biz_new" },
      data: { telnyxEligibilityStatus: "eligible", telnyxEligibilityReason: null },
    });
  });

  it("sigue devolviendo el agente ya creado en Retell si Telnyx falla", async () => {
    process.env.VOICE_TELNYX_ROLLOUT = "development";
    mockedTelnyxCreateAssistant.mockRejectedValue(new Error("Telnyx down"));

    const result = await createBusinessAgent({ businessId: "biz_new", name: "Nuevo negocio" });

    expect(result).toEqual(expect.objectContaining({ id: "agent_db_1" }));
    expect(mockedBusinessUpdate).toHaveBeenCalledWith({
      where: { id: "biz_new" },
      data: {
        telnyxEligibilityStatus: "ineligible",
        telnyxEligibilityReason: expect.stringContaining("Telnyx down"),
      },
    });
  });

  it("marca el negocio como no elegible (sin llamar a Telnyx) si no hay voz compatible", async () => {
    process.env.VOICE_TELNYX_ROLLOUT = "all";
    mockedTelnyxListVoices.mockResolvedValue([]);

    await createBusinessAgent({ businessId: "biz_new", name: "Nuevo negocio" });

    expect(mockedTelnyxCreateAssistant).not.toHaveBeenCalled();
    expect(mockedBusinessUpdate).toHaveBeenCalledWith({
      where: { id: "biz_new" },
      data: {
        telnyxEligibilityStatus: "ineligible",
        telnyxEligibilityReason: expect.stringMatching(/voz Telnyx compatible/),
      },
    });
  });
});
