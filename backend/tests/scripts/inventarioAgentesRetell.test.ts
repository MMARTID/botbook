import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { retellAdapter } from "../../src/adapters/retell/RetellAdapter.js";
import {
  describirEntorno,
  idsProtegidosPorEntorno,
  inventariarAgentesRetell,
} from "../../scripts/inventarioAgentesRetell.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { agent: { findMany: vi.fn() }, $disconnect: vi.fn() },
}));
vi.mock("../../src/adapters/retell/RetellAdapter.js", () => ({
  retellAdapter: { listAgents: vi.fn(), getAgent: vi.fn(), listLlms: vi.fn() },
}));

const mockedFindMany = vi.mocked(prisma.agent.findMany);
const mockedListAgents = vi.mocked(retellAdapter.listAgents);
const mockedGetAgent = vi.mocked(retellAdapter.getAgent);

// Limpieza de la cuenta de Retell (17-09-2026): todo agente que no sea la
// demo de la landing ni el respaldo de un negocio con Telnyx es de pruebas.
describe("inventarioAgentesRetell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAgent.mockImplementation((async (id: string) => ({
      agent_id: id,
      response_engine: { type: "retell-llm", llm_id: `llm_de_${id}` },
    })) as any);
  });

  it("clasifica demo, negocio con Telnyx, negocio sin Telnyx y desconocido", async () => {
    mockedListAgents.mockResolvedValue([
      { agent_id: "agent_demo", agent_name: "Demo peluquería" },
      { agent_id: "agent_vivo", agent_name: "alhabla-negocio-vivo" },
      { agent_id: "agent_viejo", agent_name: "alhabla-negocio-viejo" },
      { agent_id: "agent_suelto", agent_name: "prueba 3" },
    ]);
    mockedFindMany.mockResolvedValue([
      { retellAgentId: "agent_vivo", retellLlmId: "llm_vivo", telnyxAssistantId: "assistant-1", business: { id: "b1", name: "Vivo" } },
      { retellAgentId: "agent_viejo", retellLlmId: "llm_viejo", telnyxAssistantId: null, business: { id: "b2", name: "Viejo" } },
    ] as any);

    const inventario = await inventariarAgentesRetell({ protegidos: new Set(["agent_demo"]) });

    expect(Object.fromEntries(inventario.map((a) => [a.agentId, a.clase]))).toEqual({
      agent_demo: "demo",
      agent_vivo: "negocio-con-telnyx",
      agent_viejo: "negocio-sin-telnyx",
      agent_suelto: "desconocido",
    });
    // El LLM de los que la BD conoce sale de la BD; el resto se pide a Retell.
    expect(inventario.find((a) => a.agentId === "agent_vivo")?.llmId).toBe("llm_vivo");
    expect(inventario.find((a) => a.agentId === "agent_suelto")?.llmId).toBe("llm_de_agent_suelto");
    expect(mockedGetAgent).toHaveBeenCalledTimes(2);
  });

  // Dev y producción comparten la cuenta de Retell: los agentes del otro
  // entorno llegan aquí sin fila en la BD. Llamarlos "huérfanos" y ofrecerlos
  // para borrar es lo que borró los agentes de seis negocios de desarrollo.
  it("un agente que no está en esta BD es 'desconocido', nunca un huérfano borrable", async () => {
    mockedListAgents.mockResolvedValue([
      { agent_id: "agent_de_produccion", agent_name: "alhabla-negocio-real" },
    ] as any);
    mockedFindMany.mockResolvedValue([] as any);

    const inventario = await inventariarAgentesRetell({ protegidos: new Set() });

    expect(inventario).toHaveLength(1);
    expect(inventario[0].clase).toBe("desconocido");
    expect(inventario[0].negocio).toBeNull();
  });

  it("describirEntorno dice contra qué base de datos se está cruzando, sin la contraseña", () => {
    const descripcion = describirEntorno({
      DATABASE_URL: "postgresql://postgres:supersecreto@postgres:5432/botbook",
    });
    expect(descripcion).toContain("botbook");
    expect(descripcion).toContain("postgres:5432");
    expect(descripcion).not.toContain("supersecreto");
  });

  it("describirEntorno saca el host real de una conexión por socket de Cloud SQL", () => {
    const descripcion = describirEntorno({
      DATABASE_URL:
        "postgresql://user:pass@localhost/alhabla?host=/cloudsql/proyecto:europe-west1:alhabla-db",
    });
    expect(descripcion).toContain("alhabla");
    expect(descripcion).toContain("/cloudsql/proyecto:europe-west1:alhabla-db");
    expect(descripcion).not.toContain("pass");
  });

  it("describirEntorno no revienta sin DATABASE_URL ni con una basura", () => {
    expect(describirEntorno({})).toBe("DATABASE_URL sin definir");
    expect(describirEntorno({ DATABASE_URL: "no-soy-una-url" })).toContain("no es una URL válida");
  });

  it("un id de la demo se protege aunque la BD no lo conozca", () => {
    const protegidos = idsProtegidosPorEntorno({
      RETELL_DEMO_AGENT_ID: "agent_a",
      RETELL_DEMO_PELUQUERIA_AGENT_ID: "agent_b",
      RETELL_DEMO_MAX_DURATION_SECONDS: "60",
      RETELL_API_KEY: "clave",
    });
    expect([...protegidos].sort()).toEqual(["agent_a", "agent_b"]);
  });
});
