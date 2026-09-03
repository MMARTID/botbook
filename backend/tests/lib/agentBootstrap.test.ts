import { describe, it, expect, vi } from "vitest";
import { buildInboundCallDynamicVariables } from "../../src/lib/agentBootstrap.js";
import { prisma } from "../../src/lib/prisma.js";
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
  },
}));

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedServiceFindMany = vi.mocked(prisma.service.findMany);
const mockedProfessionalFindMany = vi.mocked(prisma.professional.findMany);

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
});
