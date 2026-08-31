import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDemoAgentId } from "../../../src/modules/demo/routes.js";

const DEMO_ENV_VARS = [
  "RETELL_DEMO_AGENT_ID",
  "RETELL_DEMO_PELUQUERIA_AGENT_ID",
  "RETELL_DEMO_CENTRO_ESTETICA_AGENT_ID",
  "RETELL_DEMO_SALON_UÑAS_AGENT_ID",
  "RETELL_DEMO_BARBERIA_AGENT_ID",
  "RETELL_DEMO_FISIOTERAPIA_AGENT_ID",
] as const;

describe("getDemoAgentId", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of DEMO_ENV_VARS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of DEMO_ENV_VARS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it("devuelve el agente del nicho cuando está configurado", () => {
    process.env.RETELL_DEMO_AGENT_ID = "agent_general";
    process.env.RETELL_DEMO_PELUQUERIA_AGENT_ID = "agent_peluqueria";

    expect(getDemoAgentId("peluqueria")).toBe("agent_peluqueria");
  });

  it("cae al agente genérico si el nicho no tiene agente propio", () => {
    process.env.RETELL_DEMO_AGENT_ID = "agent_general";

    expect(getDemoAgentId("barberia")).toBe("agent_general");
  });

  it("usa el agente genérico cuando no se indica nicho", () => {
    process.env.RETELL_DEMO_AGENT_ID = "agent_general";
    process.env.RETELL_DEMO_FISIOTERAPIA_AGENT_ID = "agent_fisio";

    expect(getDemoAgentId()).toBe("agent_general");
  });

  it("mapea el salón de uñas a su variable con Ñ", () => {
    process.env.RETELL_DEMO_SALON_UÑAS_AGENT_ID = "agent_unas";

    expect(getDemoAgentId("salon-de-unas")).toBe("agent_unas");
  });

  it("devuelve null si no hay ningún agente configurado", () => {
    expect(getDemoAgentId("peluqueria")).toBeNull();
    expect(getDemoAgentId()).toBeNull();
  });
});
