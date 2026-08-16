import Retell from "retell-sdk";
import type { LlmResponse } from "retell-sdk/resources/llm.js";
import type { AgentResponse } from "retell-sdk/resources/agent.js";

export interface RetellTool {
  name: string;
  description: string;
  url: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  speak_during_execution?: boolean;
  speak_after_execution?: boolean;
  timeout_ms?: number;
}

export interface CreateRetellLlmInput {
  generalPrompt: string;
  beginMessage: string;
  tools?: RetellTool[];
  model?: "gpt-4.1" | "gpt-4.1-mini" | "gpt-4.1-nano";
  modelTemperature?: number;
}

export interface CreateRetellAgentInput {
  name: string;
  voiceId: string;
  llmId: string;
  language?: string;
  webhookUrl?: string;
  timezone?: string;
}

export interface RetellPhoneNumber {
  phone_number_id: string;
  phone_number: string;
  nickname?: string;
  inbound_agent_id?: string;
}

/**
 * RetellAdapter - Single source of truth for all Retell.ai API interactions.
 */
export class RetellAdapter {
  private client: Retell;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.RETELL_API_KEY || "";
    this.client = new Retell({
      apiKey: this.apiKey,
    });
  }

  private ensureApiKey() {
    if (!this.apiKey) {
      throw new Error("RETELL_API_KEY not set in environment");
    }
  }

  /**
   * Create a new Retell LLM Response Engine.
   */
  async createLlm(input: CreateRetellLlmInput): Promise<LlmResponse> {
    this.ensureApiKey();

    const generalTools: any[] = (input.tools || []).map((tool) => ({
      type: "custom" as const,
      name: tool.name,
      description: tool.description,
      url: tool.url,
      method: tool.method || "POST",
      parameters: tool.parameters,
      speak_during_execution: tool.speak_during_execution ?? true,
      speak_after_execution: tool.speak_after_execution ?? true,
      timeout_ms: tool.timeout_ms ?? 20000,
      args_at_root: true,
    }));

    const response = await this.client.llm.create({
      general_prompt: input.generalPrompt,
      begin_message: input.beginMessage,
      general_tools: generalTools,
      model: input.model || "gpt-4.1",
      model_temperature: input.modelTemperature ?? 0.3,
      start_speaker: "agent",
      tool_call_strict_mode: true,
    });

    return response;
  }

  /**
   * Update an existing Retell LLM Response Engine.
   */
  async updateLlm(
    llmId: string,
    input: Partial<CreateRetellLlmInput>
  ): Promise<LlmResponse> {
    this.ensureApiKey();

    const updatePayload: any = {};
    if (input.generalPrompt !== undefined) {
      updatePayload.general_prompt = input.generalPrompt;
    }
    if (input.beginMessage !== undefined) {
      updatePayload.begin_message = input.beginMessage;
    }
    if (input.tools !== undefined) {
      updatePayload.general_tools = input.tools.map((tool) => ({
        type: "custom" as const,
        name: tool.name,
        description: tool.description,
        url: tool.url,
        method: tool.method || "POST",
        parameters: tool.parameters,
        speak_during_execution: tool.speak_during_execution ?? true,
        speak_after_execution: tool.speak_after_execution ?? true,
        timeout_ms: tool.timeout_ms ?? 20000,
        args_at_root: true,
      }));
    }
    if (input.model !== undefined) {
      updatePayload.model = input.model;
    }
    if (input.modelTemperature !== undefined) {
      updatePayload.model_temperature = input.modelTemperature;
    }

    const response = await this.client.llm.update(llmId, updatePayload);
    return response;
  }

  /**
   * Retrieve a Retell LLM by ID.
   */
  async getLlm(llmId: string): Promise<LlmResponse> {
    this.ensureApiKey();
    return this.client.llm.retrieve(llmId);
  }

  /**
   * Delete a Retell LLM by ID.
   */
  async deleteLlm(llmId: string): Promise<void> {
    this.ensureApiKey();
    await this.client.llm.delete(llmId);
  }

  /**
   * Create a new Retell agent attached to an LLM.
   */
  async createAgent(input: CreateRetellAgentInput): Promise<AgentResponse> {
    this.ensureApiKey();

    const response = await this.client.agent.create({
      agent_name: input.name,
      voice_id: input.voiceId,
      response_engine: {
        type: "retell-llm",
        llm_id: input.llmId,
      },
      language: (input.language || "es-ES") as any,
      webhook_url: input.webhookUrl,
      timezone: input.timezone || "Europe/Madrid",
    });

    return response;
  }

  /**
   * Update an existing Retell agent.
   */
  async updateAgent(
    agentId: string,
    input: Partial<CreateRetellAgentInput> & { llmId?: string }
  ): Promise<AgentResponse> {
    this.ensureApiKey();

    const updatePayload: any = {};
    if (input.name !== undefined) {
      updatePayload.agent_name = input.name;
    }
    if (input.voiceId !== undefined) {
      updatePayload.voice_id = input.voiceId;
    }
    if (input.llmId !== undefined) {
      updatePayload.response_engine = {
        type: "retell-llm",
        llm_id: input.llmId,
      };
    }
    if (input.language !== undefined) {
      updatePayload.language = input.language;
    }
    if (input.webhookUrl !== undefined) {
      updatePayload.webhook_url = input.webhookUrl;
    }
    if (input.timezone !== undefined) {
      updatePayload.timezone = input.timezone;
    }

    return this.client.agent.update(agentId, updatePayload);
  }

  /**
   * Retrieve a Retell agent by ID.
   */
  async getAgent(agentId: string): Promise<AgentResponse> {
    this.ensureApiKey();
    return this.client.agent.retrieve(agentId);
  }

  /**
   * Delete a Retell agent by ID.
   */
  async deleteAgent(agentId: string): Promise<void> {
    this.ensureApiKey();
    await this.client.agent.delete(agentId);
  }

  /**
   * Create/purchase a phone number in Retell and assign it to an inbound agent.
   */
  async createPhoneNumber(input: {
    phoneNumber: string;
    nickname?: string;
    inboundAgentId?: string;
  }): Promise<RetellPhoneNumber> {
    this.ensureApiKey();

    const response = (await this.client.phoneNumber.create({
      phone_number: input.phoneNumber,
      nickname: input.nickname,
      inbound_agents: input.inboundAgentId
        ? [{ agent_id: input.inboundAgentId, weight: 1 }]
        : undefined,
    })) as any;

    return {
      phone_number_id: response.phone_number_id,
      phone_number: response.phone_number,
      nickname: response.nickname,
      inbound_agent_id: response.inbound_agent_id,
    };
  }

  /**
   * Update a phone number (e.g. change inbound agent).
   */
  async updatePhoneNumber(
    phoneNumberId: string,
    input: { inboundAgentId?: string; nickname?: string }
  ): Promise<RetellPhoneNumber> {
    this.ensureApiKey();

    const response = (await this.client.phoneNumber.update(phoneNumberId, {
      inbound_agents: input.inboundAgentId
        ? [{ agent_id: input.inboundAgentId, weight: 1 }]
        : undefined,
      nickname: input.nickname,
    })) as any;

    return {
      phone_number_id: response.phone_number_id,
      phone_number: response.phone_number,
      nickname: response.nickname,
      inbound_agent_id: response.inbound_agent_id,
    };
  }

  /**
   * Delete/release a phone number from Retell.
   */
  async deletePhoneNumber(phoneNumberId: string): Promise<void> {
    this.ensureApiKey();
    await this.client.phoneNumber.delete(phoneNumberId);
  }

  /**
   * List phone numbers in the Retell org.
   */
  async listPhoneNumbers(): Promise<RetellPhoneNumber[]> {
    this.ensureApiKey();
    const response = (await this.client.phoneNumber.list()) as any;
    const items = response.items || [];
    return items.map((item: any) => ({
      phone_number_id: item.phone_number_id,
      phone_number: item.phone_number,
      nickname: item.nickname,
      inbound_agent_id: item.inbound_agent_id,
    }));
  }

  /**
   * Validate Retell webhook signature.
   * Retell signs the raw body with the API key using HMAC-SHA256.
   */
  async validateWebhookSignature(
    rawBody: string,
    signature: string
  ): Promise<boolean> {
    this.ensureApiKey();
    if (!signature) {
      return false;
    }
    return Retell.verify(rawBody, this.apiKey, signature);
  }

  /**
   * Lightweight health check: verifies that the Retell API is reachable.
   */
  async checkHealth(): Promise<void> {
    this.ensureApiKey();
    await this.client.agent.list({ limit: 1 } as any);
  }
}

// Export singleton instance
export const retellAdapter = new RetellAdapter();
