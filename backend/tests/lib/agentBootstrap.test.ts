import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildInboundCallDynamicVariables,
  syncAgentToRetell,
  createBusinessAgent,
  RETELL_VOICE_ID_BY_GENDER,
} from "../../src/lib/agentBootstrap.js";
import { prisma } from "../../src/lib/prisma.js";
import { retellAdapter } from "../../src/adapters/retell/RetellAdapter.js";
import { calendarService } from "../../src/modules/calendar/service.js";
import { DEFAULT_BUSINESS_SCHEDULE } from "../../src/lib/businessSchedule.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    business: {
      findUnique: vi.fn(),
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

vi.mock("../../src/adapters/retell/RetellAdapter.js", () => ({
  retellAdapter: {
    updateLlm: vi.fn(),
    updateAgent: vi.fn(),
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
const mockedCreateLlm = vi.mocked(retellAdapter.createLlm);
const mockedCreateAgent = vi.mocked(retellAdapter.createAgent);
const mockedSyncCalendarToolsToAgents = vi.mocked(calendarService.syncCalendarToolsToAgents);

describe("buildInboundCallDynamicVariables", () => {
  it("devuelve contexto plano como strings para retell_llm_dynamic_variables", async () => {
    mockedBusinessFindUnique.mockResolvedValue({ schedule: DEFAULT_BUSINESS_SCHEDULE } as any);
    mockedServiceFindMany.mockResolvedValue([
      { id: "svc_1", name: "Corte", durationMinutes: 30 },
    ] as any);
    mockedProfessionalFindMany.mockResolvedValue([
      { id: "pro_1", name: "Ana" },
    ] as any);

    const variables = await buildInboundCallDynamicVariables("biz_123");

    expect(typeof variables.servicios_disponibles).toBe("string");
    expect(typeof variables.empleados).toBe("string");
    expect(typeof variables.horario_semanal).toBe("string");
    expect(variables.servicios_disponibles).toContain("svc_1");
    expect(variables.servicios_disponibles).toContain("Corte");
    expect(variables.servicios_disponibles).toContain("[svc_1] Corte (30 min)");
    expect(variables.empleados).toContain("pro_1");
    expect(variables.empleados).toContain("Ana");
    expect(variables.horario_semanal).toContain("Lunes");
    expect(variables.nombre_negocio).toBe("el negocio");
    expect(variables.zona_horaria).toBe("Europe/Madrid");
  });

  it("da un mensaje de fallback en vez de una lista vacía cuando no hay servicios ni empleados", async () => {
    mockedBusinessFindUnique.mockResolvedValue({ schedule: DEFAULT_BUSINESS_SCHEDULE } as any);
    mockedServiceFindMany.mockResolvedValue([]);
    mockedProfessionalFindMany.mockResolvedValue([]);

    const variables = await buildInboundCallDynamicVariables("biz_123");

    expect(variables.servicios_disponibles).toBe("Este negocio todavía no tiene servicios configurados.");
    expect(variables.empleados).toBe("Este negocio no tiene empleados individuales configurados.");
  });

  it("no revienta si el negocio no existe (findUnique devuelve null)", async () => {
    mockedBusinessFindUnique.mockResolvedValue(null);
    mockedServiceFindMany.mockResolvedValue([]);
    mockedProfessionalFindMany.mockResolvedValue([]);

    const variables = await buildInboundCallDynamicVariables("biz_inexistente");

    expect(variables.horario_semanal).toBe("Horario no configurado todavía.");
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
    mockedUpdateAgent.mockResolvedValue({} as any);
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
    expect(RETELL_VOICE_ID_BY_GENDER.masculina).toBe("13ff5deb-2591-42ad-a356-63a04e524411");
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
        data: { voiceId: RETELL_VOICE_ID_BY_GENDER.femenina },
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
    mockedCreateAgent.mockResolvedValue({ agent_id: "retell_agent_1" } as any);
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
