import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildInboundCallDynamicVariables,
  syncAgentToRetell,
  RETELL_VOICE_ID_BY_GENDER,
} from "../../src/lib/agentBootstrap.js";
import { prisma } from "../../src/lib/prisma.js";
import { retellAdapter } from "../../src/adapters/retell/RetellAdapter.js";
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
    },
  },
}));

vi.mock("../../src/adapters/retell/RetellAdapter.js", () => ({
  retellAdapter: {
    updateLlm: vi.fn(),
    updateAgent: vi.fn(),
  },
}));

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedServiceFindMany = vi.mocked(prisma.service.findMany);
const mockedProfessionalFindMany = vi.mocked(prisma.professional.findMany);
const mockedAgentFindMany = vi.mocked(prisma.agent.findMany);
const mockedAgentUpdate = vi.mocked(prisma.agent.update);
const mockedUpdateLlm = vi.mocked(retellAdapter.updateLlm);
const mockedUpdateAgent = vi.mocked(retellAdapter.updateAgent);

describe("buildInboundCallDynamicVariables", () => {
  it("devuelve las tres variables como string, listas para retell_llm_dynamic_variables", async () => {
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
    expect(variables.empleados).toContain("pro_1");
    expect(variables.empleados).toContain("Ana");
    expect(variables.horario_semanal).toContain("Lunes");
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

  it("incluye el teléfono de quien llama cuando se conoce, o 'desconocido' si no", async () => {
    mockedBusinessFindUnique.mockResolvedValue({ schedule: DEFAULT_BUSINESS_SCHEDULE } as any);
    mockedServiceFindMany.mockResolvedValue([]);
    mockedProfessionalFindMany.mockResolvedValue([]);

    const withNumber = await buildInboundCallDynamicVariables("biz_123", "692138456");
    expect(withNumber.telefono_de_quien_llama).toBe("692138456");

    const withoutNumber = await buildInboundCallDynamicVariables("biz_123");
    expect(withoutNumber.telefono_de_quien_llama).toBe("desconocido");
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
});
