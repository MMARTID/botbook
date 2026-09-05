import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  llmCreate: vi.fn(),
  llmUpdate: vi.fn(),
  llmRetrieve: vi.fn(),
  llmDelete: vi.fn(),
  agentCreate: vi.fn(),
  agentUpdate: vi.fn(),
  agentRetrieve: vi.fn(),
  agentDelete: vi.fn(),
  agentList: vi.fn(),
  phoneNumberCreate: vi.fn(),
  phoneNumberImport: vi.fn(),
  phoneNumberUpdate: vi.fn(),
  phoneNumberDelete: vi.fn(),
  phoneNumberList: vi.fn(),
  callCreateWebCall: vi.fn(),
  verify: vi.fn((_rawBody: string, _apiKey: string, signature: string) => {
    return signature === "valid-signature";
  }),
}));

vi.mock("retell-sdk", () => {
  return {
    default: class MockRetell {
      static verify = mocks.verify;
      llm = {
        create: mocks.llmCreate,
        update: mocks.llmUpdate,
        retrieve: mocks.llmRetrieve,
        delete: mocks.llmDelete,
      };
      agent = {
        create: mocks.agentCreate,
        update: mocks.agentUpdate,
        retrieve: mocks.agentRetrieve,
        delete: mocks.agentDelete,
        list: mocks.agentList,
      };
      phoneNumber = {
        create: mocks.phoneNumberCreate,
        import: mocks.phoneNumberImport,
        update: mocks.phoneNumberUpdate,
        delete: mocks.phoneNumberDelete,
        list: mocks.phoneNumberList,
      };
      call = {
        createWebCall: mocks.callCreateWebCall,
      };
    },
  };
});

import { RetellAdapter } from "../../../src/adapters/retell/RetellAdapter.js";

describe("RetellAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RETELL_API_KEY = "retell_test_key";
  });

  describe("createLlm", () => {
    it("crea un LLM de Retell con tools personalizadas", async () => {
      mocks.llmCreate.mockResolvedValue({
        llm_id: "llm_123",
        general_prompt: "Eres un asistente",
      });

      const adapter = new RetellAdapter();
      const result = await adapter.createLlm({
        generalPrompt: "Eres un asistente",
        beginMessage: "Hola",
        tools: [
          {
            name: "check_business_hours",
            description: "Comprueba horario",
            url: "https://example.com/webhooks/retell/tools/check_business_hours",
            parameters: {
              type: "object",
              properties: {},
              required: [],
            },
          },
        ],
      });

      expect(result.llm_id).toBe("llm_123");
      expect(mocks.llmCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          general_prompt: "Eres un asistente",
          begin_message: "Hola",
          general_tools: expect.arrayContaining([
            expect.objectContaining({
              type: "custom",
              name: "check_business_hours",
              url: "https://example.com/webhooks/retell/tools/check_business_hours",
              args_at_root: true,
            }),
          ]),
        })
      );
    });

    it("respeta args_at_root: false cuando la tool lo especifica", async () => {
      mocks.llmCreate.mockResolvedValue({ llm_id: "llm_123" });

      const adapter = new RetellAdapter();
      await adapter.createLlm({
        generalPrompt: "Eres un asistente",
        beginMessage: "Hola",
        tools: [
          {
            name: "book_appointment",
            description: "Agenda una cita",
            url: "https://example.com/webhooks/retell/tools/agent_123/book_appointment",
            args_at_root: false,
            parameters: { type: "object", properties: {}, required: [] },
          },
        ],
      });

      expect(mocks.llmCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          general_tools: expect.arrayContaining([
            expect.objectContaining({ name: "book_appointment", args_at_root: false }),
          ]),
        })
      );
    });
  });

  describe("updateLlm", () => {
    it("respeta args_at_root: false al actualizar las tools", async () => {
      mocks.llmUpdate.mockResolvedValue({ llm_id: "llm_123" });

      const adapter = new RetellAdapter();
      await adapter.updateLlm("llm_123", {
        tools: [
          {
            name: "check_business_hours",
            description: "Comprueba horario",
            url: "https://example.com/webhooks/retell/tools/agent_123/check_business_hours",
            args_at_root: false,
            parameters: { type: "object", properties: {}, required: [] },
          },
        ],
      });

      expect(mocks.llmUpdate).toHaveBeenCalledWith(
        "llm_123",
        expect.objectContaining({
          general_tools: expect.arrayContaining([
            expect.objectContaining({ name: "check_business_hours", args_at_root: false }),
          ]),
        })
      );
    });

    it("por defecto manda args_at_root: true si la tool no lo especifica", async () => {
      mocks.llmUpdate.mockResolvedValue({ llm_id: "llm_123" });

      const adapter = new RetellAdapter();
      await adapter.updateLlm("llm_123", {
        tools: [
          {
            name: "end_call",
            description: "Termina la llamada",
            url: "https://example.com/webhooks/retell/tools/agent_123/end_call",
            parameters: { type: "object", properties: {}, required: [] },
          },
        ],
      });

      expect(mocks.llmUpdate).toHaveBeenCalledWith(
        "llm_123",
        expect.objectContaining({
          general_tools: expect.arrayContaining([
            expect.objectContaining({ name: "end_call", args_at_root: true }),
          ]),
        })
      );
    });
  });

  describe("createAgent", () => {
    it("crea un agente de Retell vinculado a un LLM", async () => {
      mocks.agentCreate.mockResolvedValue({
        agent_id: "agent_123",
        agent_name: "Asistente Test",
      });

      const adapter = new RetellAdapter();
      const result = await adapter.createAgent({
        name: "Asistente Test",
        voiceId: "11labs-Bella",
        llmId: "llm_123",
      });

      expect(result.agent_id).toBe("agent_123");
      expect(mocks.agentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_name: "Asistente Test",
          voice_id: "11labs-Bella",
          response_engine: { type: "retell-llm", llm_id: "llm_123" },
          language: "es-ES",
          timezone: "Europe/Madrid",
        })
      );
    });

    it("incluye post_call_analysis_data cuando se especifica", async () => {
      mocks.agentCreate.mockResolvedValue({ agent_id: "agent_123" });

      const adapter = new RetellAdapter();
      await adapter.createAgent({
        name: "Asistente Test",
        voiceId: "11labs-Bella",
        llmId: "llm_123",
        postCallAnalysisData: [
          {
            name: "call_outcome",
            type: "enum",
            choices: ["RESOLVED", "FRUSTRATED"],
            description: "Clasifica el resultado de la llamada.",
          },
        ],
      });

      expect(mocks.agentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          post_call_analysis_data: [
            expect.objectContaining({ name: "call_outcome", type: "enum" }),
          ],
        })
      );
    });

    it("incluye interruption_sensitivity cuando se especifica", async () => {
      mocks.agentCreate.mockResolvedValue({ agent_id: "agent_123" });

      const adapter = new RetellAdapter();
      await adapter.createAgent({
        name: "Asistente Test",
        voiceId: "11labs-Bella",
        llmId: "llm_123",
        interruptionSensitivity: 0.5,
      });

      expect(mocks.agentCreate).toHaveBeenCalledWith(
        expect.objectContaining({ interruption_sensitivity: 0.5 })
      );
    });
  });

  describe("updateAgent", () => {
    it("actualiza post_call_analysis_data cuando se especifica", async () => {
      mocks.agentUpdate.mockResolvedValue({ agent_id: "agent_123" });

      const adapter = new RetellAdapter();
      await adapter.updateAgent("agent_123", {
        postCallAnalysisData: [
          {
            name: "call_outcome",
            type: "enum",
            choices: ["RESOLVED", "FRUSTRATED"],
            description: "Clasifica el resultado de la llamada.",
          },
        ],
      });

      expect(mocks.agentUpdate).toHaveBeenCalledWith(
        "agent_123",
        expect.objectContaining({
          post_call_analysis_data: [
            expect.objectContaining({ name: "call_outcome", type: "enum" }),
          ],
        })
      );
    });

    it("no toca post_call_analysis_data si no se especifica", async () => {
      mocks.agentUpdate.mockResolvedValue({ agent_id: "agent_123" });

      const adapter = new RetellAdapter();
      await adapter.updateAgent("agent_123", { name: "Nuevo nombre" });

      const sentPayload = mocks.agentUpdate.mock.calls[0][1];
      expect(sentPayload).not.toHaveProperty("post_call_analysis_data");
    });

    it("actualiza interruption_sensitivity cuando se especifica", async () => {
      mocks.agentUpdate.mockResolvedValue({ agent_id: "agent_123" });

      const adapter = new RetellAdapter();
      await adapter.updateAgent("agent_123", { interruptionSensitivity: 0.5 });

      expect(mocks.agentUpdate).toHaveBeenCalledWith(
        "agent_123",
        expect.objectContaining({ interruption_sensitivity: 0.5 })
      );
    });

    it("no toca interruption_sensitivity si no se especifica", async () => {
      mocks.agentUpdate.mockResolvedValue({ agent_id: "agent_123" });

      const adapter = new RetellAdapter();
      await adapter.updateAgent("agent_123", { name: "Nuevo nombre" });

      const sentPayload = mocks.agentUpdate.mock.calls[0][1];
      expect(sentPayload).not.toHaveProperty("interruption_sensitivity");
    });
  });

  describe("createPhoneNumber", () => {
    it("le pide a Retell que compre un número nuevo de su propio inventario y lo vincule a un agente", async () => {
      mocks.phoneNumberCreate.mockResolvedValue({
        phone_number_id: "phone_123",
        phone_number: "+34910000001",
        inbound_agent_id: "agent_123",
      });

      const adapter = new RetellAdapter();
      const result = await adapter.createPhoneNumber({
        phoneNumber: "+34910000001",
        nickname: "Peluquería Test",
        inboundAgentId: "agent_123",
      });

      expect(result.phone_number_id).toBe("phone_123");
      expect(mocks.phoneNumberCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          phone_number: "+34910000001",
          nickname: "Peluquería Test",
          inbound_agents: [{ agent_id: "agent_123", weight: 1 }],
        })
      );
    });
  });

  describe("importPhoneNumber", () => {
    it("importa un número ya comprado en nuestra propia cuenta de operador vía SIP trunk y lo vincula a un agente", async () => {
      mocks.phoneNumberImport.mockResolvedValue({
        phone_number: "+34886020712",
        inbound_agent_id: "agent_123",
      });

      const adapter = new RetellAdapter();
      const result = await adapter.importPhoneNumber({
        phoneNumber: "+34886020712",
        terminationUri: "alhabla-inbound.sip.telnyx.com",
        sipTrunkAuthUsername: "alhablaadmin",
        sipTrunkAuthPassword: "secret",
        nickname: "Peluquería Test",
        inboundAgentId: "agent_123",
      });

      expect(result.phone_number).toBe("+34886020712");
      expect(mocks.phoneNumberImport).toHaveBeenCalledWith(
        expect.objectContaining({
          phone_number: "+34886020712",
          termination_uri: "alhabla-inbound.sip.telnyx.com",
          sip_trunk_auth_username: "alhablaadmin",
          sip_trunk_auth_password: "secret",
          nickname: "Peluquería Test",
          inbound_agents: [{ agent_id: "agent_123", weight: 1 }],
        })
      );
    });
  });

  describe("validateWebhookSignature", () => {
    it("valida firmas correctas usando Retell.verify", async () => {
      const adapter = new RetellAdapter();
      const result = await adapter.validateWebhookSignature(
        '{"event_type":"call_started"}',
        "valid-signature"
      );
      expect(result).toBe(true);
    });

    it("rechaza firmas ausentes", async () => {
      const adapter = new RetellAdapter();
      const result = await adapter.validateWebhookSignature("body", "");
      expect(result).toBe(false);
    });
  });

  describe("checkHealth", () => {
    it("lista agentes para verificar conectividad", async () => {
      mocks.agentList.mockResolvedValue({ items: [] });

      const adapter = new RetellAdapter();
      await expect(adapter.checkHealth()).resolves.toBeUndefined();
      expect(mocks.agentList).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }));
    });
  });

  describe("createWebCall", () => {
    it("crea la llamada web con el agente de demo y el límite de duración", async () => {
      mocks.callCreateWebCall.mockResolvedValue({
        call_id: "call_123",
        access_token: "token_123",
      });

      const adapter = new RetellAdapter();
      const result = await adapter.createWebCall({
        agentId: "agent_demo",
        maxDurationMs: 60000,
        metadata: { source: "landing-demo" },
      });

      expect(result).toEqual({ callId: "call_123", accessToken: "token_123" });
      expect(mocks.callCreateWebCall).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: "agent_demo",
          agent_override: { agent: { max_call_duration_ms: 60000 } },
          metadata: { source: "landing-demo" },
        })
      );
    });

    it("omite el override si no se indica duración máxima", async () => {
      mocks.callCreateWebCall.mockResolvedValue({
        call_id: "call_123",
        access_token: "token_123",
      });

      const adapter = new RetellAdapter();
      await adapter.createWebCall({ agentId: "agent_demo" });

      expect(mocks.callCreateWebCall).toHaveBeenCalledWith({ agent_id: "agent_demo" });
    });

    // Regresión: NaN es falsy en JS, así que un `maxDurationMs` inválido que
    // llegara hasta aquí (p. ej. desde una RETELL_DEMO_MAX_DURATION_SECONDS
    // mal configurada) pasaba la comprobación `input.maxDurationMs ? ... : ...`
    // como "no indicado" y la llamada de demo se creaba SIN tope de duración,
    // en vez de fallar de forma visible.
    it("no envía el override si maxDurationMs es NaN, cero o negativo", async () => {
      mocks.callCreateWebCall.mockResolvedValue({
        call_id: "call_123",
        access_token: "token_123",
      });

      const adapter = new RetellAdapter();

      await adapter.createWebCall({ agentId: "agent_demo", maxDurationMs: NaN });
      await adapter.createWebCall({ agentId: "agent_demo", maxDurationMs: 0 });
      await adapter.createWebCall({ agentId: "agent_demo", maxDurationMs: -1000 });

      for (const call of mocks.callCreateWebCall.mock.calls) {
        expect(call[0]).toEqual({ agent_id: "agent_demo" });
      }
    });
  });
});
