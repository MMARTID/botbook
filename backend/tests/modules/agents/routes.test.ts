import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { agentsRoutes } from "../../../src/modules/agents/routes.js";
import { prisma } from "../../../src/lib/prisma.js";
import { retellAdapter } from "../../../src/adapters/retell/RetellAdapter.js";
import { getPublicWebhookBaseUrl } from "../../../src/lib/serverUrl.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    agent: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
    service: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("../../../src/adapters/retell/RetellAdapter.js", () => ({
  retellAdapter: {
    updateLlm: vi.fn(),
    updateAgent: vi.fn(),
    publishAgent: vi.fn(),
    getAgent: vi.fn(),
    deleteAgent: vi.fn(),
    deleteLlm: vi.fn(),
  },
}));

vi.mock("../../../src/adapters/vapi/VapiAdapter.js", () => ({
  vapiAdapter: {
    updateAssistant: vi.fn(),
    deleteAssistant: vi.fn(),
  },
}));

vi.mock("../../../src/lib/serverUrl.js", () => ({
  getPublicWebhookBaseUrl: vi.fn(),
}));

const mockedAgentFindUnique = vi.mocked(prisma.agent.findUnique);
const mockedAgentUpdate = vi.mocked(prisma.agent.update);
const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedUpdateLlm = vi.mocked(retellAdapter.updateLlm);
const mockedUpdateAgent = vi.mocked(retellAdapter.updateAgent);
const mockedPublishAgent = vi.mocked(retellAdapter.publishAgent);
const mockedGetAgent = vi.mocked(retellAdapter.getAgent);
const mockedGetPublicWebhookBaseUrl = vi.mocked(getPublicWebhookBaseUrl);

describe("PATCH /agents/:id — conserva la voz elegida (hallazgo #26 de la auditoría)", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    fastify = Fastify();
    fastify.decorate("authenticate", async (request: any) => {
      request.user = { businessId: "biz_1" };
    });
    await fastify.register(agentsRoutes);

    mockedBusinessFindUnique.mockResolvedValue({ orchestrator: "retell" } as any);
    mockedGetPublicWebhookBaseUrl.mockReturnValue("https://api.example.com");
    mockedUpdateLlm.mockResolvedValue({} as any);
    mockedUpdateAgent.mockResolvedValue({ version: 12, is_published: false } as any);
    mockedPublishAgent.mockResolvedValue(undefined);
    mockedGetAgent.mockResolvedValue({ is_published: true } as any);
  });

  it("no resetea la voz masculina a la femenina por defecto al editar solo el saludo", async () => {
    const MASCULINE_VOICE_ID = "13ff5deb-2591-42ad-a356-63a04e524411";
    mockedAgentFindUnique.mockResolvedValue({
      id: "agent_1",
      businessId: "biz_1",
      name: "Asistente",
      systemPrompt: "prompt actual",
      voiceId: MASCULINE_VOICE_ID,
      retellAgentId: "retell_agent_1",
      retellLlmId: "retell_llm_1",
    } as any);
    mockedAgentUpdate.mockResolvedValue({ id: "agent_1" } as any);

    const response = await fastify.inject({
      method: "PATCH",
      url: "/agents/agent_1",
      // Solo se edita el saludo — el negocio nunca tocó la voz en este PATCH.
      payload: { firstMessage: "Hola, gracias por llamar" },
    });

    expect(response.statusCode).toBe(200);
    expect(mockedUpdateAgent).toHaveBeenCalledWith(
      "retell_agent_1",
      expect.objectContaining({ voiceId: MASCULINE_VOICE_ID })
    );
    expect(mockedPublishAgent).toHaveBeenCalledWith(
      "retell_agent_1",
      12,
      "Configuración gestionada por Alhabla"
    );
  });

  it("sí cambia la voz cuando el PATCH la indica explícitamente", async () => {
    const FEMININE_VOICE_ID = "538a8872-3799-4df5-b373-b78493b766c6";
    const MASCULINE_VOICE_ID = "13ff5deb-2591-42ad-a356-63a04e524411";
    mockedAgentFindUnique.mockResolvedValue({
      id: "agent_1",
      businessId: "biz_1",
      name: "Asistente",
      systemPrompt: "prompt actual",
      voiceId: FEMININE_VOICE_ID,
      retellAgentId: "retell_agent_1",
      retellLlmId: "retell_llm_1",
    } as any);
    mockedAgentUpdate.mockResolvedValue({ id: "agent_1" } as any);

    const response = await fastify.inject({
      method: "PATCH",
      url: "/agents/agent_1",
      payload: { voiceId: MASCULINE_VOICE_ID },
    });

    expect(response.statusCode).toBe(200);
    expect(mockedUpdateAgent).toHaveBeenCalledWith(
      "retell_agent_1",
      expect.objectContaining({ voiceId: MASCULINE_VOICE_ID })
    );
  });

  it("fuerza una cadena compatible y coherente al editar una voz con catalán activo", async () => {
    mockedBusinessFindUnique.mockResolvedValue({
      orchestrator: "retell",
      agentSettings: {
        version: 1,
        tone: "warm",
        primaryGoal: "bookings",
        responseStyle: "concise",
        escalation: "take_message",
        voiceGender: "femenina",
        languages: ["es-ES", "ca-ES"],
      },
    } as any);
    mockedAgentFindUnique.mockResolvedValue({
      id: "agent_1",
      businessId: "biz_1",
      name: "Asistente",
      systemPrompt: "prompt actual",
      voiceId: "cartesia-Isabel",
      retellAgentId: "retell_agent_1",
      retellLlmId: "retell_llm_1",
    } as any);
    mockedAgentUpdate.mockResolvedValue({ id: "agent_1" } as any);

    const response = await fastify.inject({
      method: "PATCH",
      url: "/agents/agent_1",
      // Cartesia no es compatible con ca-ES en Retell: el backend debe
      // ignorar este valor y mantener el perfil seguro del negocio.
      payload: { voiceId: "cartesia-Isabel" },
    });

    expect(response.statusCode).toBe(200);
    expect(mockedAgentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          voiceId: "11labs-Hailey-Latin-America-Spanish-localized",
          voiceProvider: "elevenlabs",
        }),
      })
    );
    expect(mockedUpdateAgent).toHaveBeenCalledWith(
      "retell_agent_1",
      expect.objectContaining({
        voiceId: "11labs-Hailey-Latin-America-Spanish-localized",
        voiceModel: "eleven_v3",
        fallbackVoiceIds: ["minimax-Camille"],
        language: ["es-ES", "ca-ES"],
      })
    );
  });
});
