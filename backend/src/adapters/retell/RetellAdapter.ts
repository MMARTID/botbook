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
  /** false (por defecto en nuestras tools) hace que Retell mande {name, call, args} en vez de los argumentos sueltos en la raíz. */
  args_at_root?: boolean;
}

export interface CreateRetellLlmInput {
  generalPrompt: string;
  beginMessage: string;
  tools?: RetellTool[];
  model?: "gpt-4.1" | "gpt-4.1-mini" | "gpt-4.1-nano" | "gpt-5.6-luna";
  modelTemperature?: number;
}

/** Campo enum de post_call_analysis_data — Retell lo extrae con su propio LLM
 * tras cada llamada y lo entrega en call_analysis.custom_analysis_data[name]. */
export interface RetellEnumAnalysisField {
  name: string;
  description: string;
  choices: string[];
  type: "enum";
  required?: boolean;
  /** Instrucción opcional para que Retell solo rellene el campo cuando aplique
   * (p. ej. un motivo de escalada que solo tiene sentido si hubo escalada). */
  conditional_prompt?: string;
}

/** Campo booleano de post_call_analysis_data — mismo mecanismo que el enum,
 * pero Retell devuelve true/false en vez de una de varias categorías. */
export interface RetellBooleanAnalysisField {
  name: string;
  description: string;
  type: "boolean";
  required?: boolean;
  conditional_prompt?: string;
}

export type RetellAnalysisField = RetellEnumAnalysisField | RetellBooleanAnalysisField;

export type RetellPiiCategory =
  | "person_name"
  | "address"
  | "email"
  | "phone_number"
  | "ssn"
  | "passport"
  | "driver_license"
  | "credit_card"
  | "bank_account"
  | "password"
  | "pin"
  | "medical_id"
  | "date_of_birth"
  | "customer_account_number";

export interface CreateRetellAgentInput {
  name: string;
  voiceId: string;
  llmId: string;
  language?: string;
  webhookUrl?: string;
  timezone?: string;
  postCallAnalysisData?: RetellAnalysisField[];
  interruptionSensitivity?: number;
  dataStorageRetentionDays?: number;
  sttMode?: "fast" | "accurate";
  boostedKeywords?: string[];
  piiCategories?: RetellPiiCategory[];
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
/** Modelo que interpreta al cliente simulado. Se fija por versión de catálogo
 * para que dos ejecuciones de la misma versión sean comparables. */
export type RetellSimulationModel =
  | "gpt-4.1"
  | "gpt-4.1-mini"
  | "gpt-5"
  | "gpt-5-mini"
  | "gpt-5-nano";

/** Respuesta falsa de una tool durante una simulación. Sin un mock que
 * coincida, Retell deja pasar la llamada a la tool real (y con ella al
 * calendario del negocio), así que toda tool alcanzable necesita el suyo. */
export interface RetellToolMock {
  toolName: string;
  /** Objeto que recibirá el LLM; se serializa a JSON en el payload. */
  output: unknown;
  /** Si se indica, el mock solo aplica a las llamadas cuyos argumentos
   * contengan estos valores (subconjunto). Sin esto, aplica a todas. */
  matchArgs?: Record<string, unknown>;
}

export interface CreateRetellTestCaseInput {
  name: string;
  llmId: string;
  /** Guion del cliente simulado: identidad, objetivo, personalidad, desarrollo. */
  userPrompt: string;
  /** Criterios de aprobado, en lenguaje natural verificable. */
  metrics: string[];
  dynamicVariables?: Record<string, string>;
  toolMocks?: RetellToolMock[];
  llmModel?: RetellSimulationModel;
}

export interface RetellTestCaseDefinition {
  testCaseDefinitionId: string;
  name: string;
}

export interface RetellBatchTest {
  testCaseBatchJobId: string;
  status: "in_progress" | "complete";
  totalCount: number;
  passCount: number;
  failCount: number;
  errorCount: number;
}

export interface RetellTestRun {
  testCaseJobId: string;
  testCaseDefinitionId: string;
  /** `error` es un fallo de ejecución del propio test, no una regresión
   * conversacional — no debe leerse como "el agente lo hizo mal". */
  status: "pending" | "in_progress" | "pass" | "fail" | "error";
  resultExplanation: string | null;
  name: string | null;
}

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
      args_at_root: tool.args_at_root ?? true,
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
        args_at_root: tool.args_at_root ?? true,
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
      post_call_analysis_data: input.postCallAnalysisData,
      interruption_sensitivity: input.interruptionSensitivity,
      data_storage_retention_days: input.dataStorageRetentionDays,
      stt_mode: input.sttMode,
      boosted_keywords: input.boostedKeywords,
      ...(input.piiCategories
        ? { pii_config: { categories: input.piiCategories, mode: "post_call" as const } }
        : {}),
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
    if (input.postCallAnalysisData !== undefined) {
      updatePayload.post_call_analysis_data = input.postCallAnalysisData;
    }
    if (input.interruptionSensitivity !== undefined) {
      updatePayload.interruption_sensitivity = input.interruptionSensitivity;
    }
    if (input.dataStorageRetentionDays !== undefined) {
      updatePayload.data_storage_retention_days = input.dataStorageRetentionDays;
    }
    if (input.sttMode !== undefined) {
      updatePayload.stt_mode = input.sttMode;
    }
    if (input.boostedKeywords !== undefined) {
      updatePayload.boosted_keywords = input.boostedKeywords;
    }
    if (input.piiCategories !== undefined) {
      updatePayload.pii_config = { categories: input.piiCategories, mode: "post_call" };
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
    inboundWebhookUrl?: string;
  }): Promise<RetellPhoneNumber> {
    this.ensureApiKey();

    const response = (await this.client.phoneNumber.create({
      phone_number: input.phoneNumber,
      nickname: input.nickname,
      inbound_agents: input.inboundAgentId
        ? [{ agent_id: input.inboundAgentId, weight: 1 }]
        : undefined,
      inbound_webhook_url: input.inboundWebhookUrl,
    })) as any;

    return {
      phone_number_id: response.phone_number_id,
      phone_number: response.phone_number,
      nickname: response.nickname,
      inbound_agent_id: response.inbound_agent_id,
    };
  }

  /**
   * Import a phone number bought on our own carrier account (e.g. Telnyx,
   * Twilio) via SIP trunk and assign it to an inbound agent. This is
   * different from createPhoneNumber, which has Retell buy a NEW number from
   * its own Twilio/Telnyx inventory (US/CA only) — import is the correct
   * endpoint for a number we already own ourselves.
   */
  async importPhoneNumber(input: {
    phoneNumber: string;
    terminationUri: string;
    sipTrunkAuthUsername?: string;
    sipTrunkAuthPassword?: string;
    nickname?: string;
    inboundAgentId?: string;
    inboundWebhookUrl?: string;
  }): Promise<RetellPhoneNumber> {
    this.ensureApiKey();

    const response = (await this.client.phoneNumber.import({
      phone_number: input.phoneNumber,
      termination_uri: input.terminationUri,
      sip_trunk_auth_username: input.sipTrunkAuthUsername,
      sip_trunk_auth_password: input.sipTrunkAuthPassword,
      nickname: input.nickname,
      inbound_agents: input.inboundAgentId
        ? [{ agent_id: input.inboundAgentId, weight: 1 }]
        : undefined,
      inbound_webhook_url: input.inboundWebhookUrl,
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
    input: { inboundAgentId?: string; nickname?: string; inboundWebhookUrl?: string }
  ): Promise<RetellPhoneNumber> {
    this.ensureApiKey();

    const response = (await this.client.phoneNumber.update(phoneNumberId, {
      inbound_agents: input.inboundAgentId
        ? [{ agent_id: input.inboundAgentId, weight: 1 }]
        : undefined,
      nickname: input.nickname,
      inbound_webhook_url: input.inboundWebhookUrl,
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

  /**
   * Create a web call (browser-based) for the public landing demo.
   * Returns the access token the Retell web client needs to join.
   */
  async createWebCall(input: {
    agentId: string;
    maxDurationMs?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ callId: string; accessToken: string }> {
    this.ensureApiKey();

    // Number.isFinite() en vez de una comprobación de verdad simple: un
    // maxDurationMs de NaN (por una env var mal configurada aguas arriba) es
    // falsy en JS, así que `input.maxDurationMs ? ... : ...` lo descartaría en
    // silencio y la llamada quedaría sin tope real de duración.
    const hasValidMaxDuration =
      typeof input.maxDurationMs === "number" &&
      Number.isFinite(input.maxDurationMs) &&
      input.maxDurationMs > 0;

    const response = await this.client.call.createWebCall({
      agent_id: input.agentId,
      ...(hasValidMaxDuration
        ? { agent_override: { agent: { max_call_duration_ms: input.maxDurationMs } } }
        : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });

    return { callId: response.call_id, accessToken: response.access_token };
  }

  // ---------------------------------------------------------------------
  // Simulation Testing — batería de regresión conversacional. Enfrenta el
  // LLM del agente con otro LLM que hace de cliente; no consume minutos de
  // teléfono ni toca los números de Telnyx. Las tools se interceptan con
  // tool_mocks para no llamar a Google/Outlook Calendar de verdad.
  // ---------------------------------------------------------------------

  /**
   * Crea una definición de caso de simulación contra un Retell LLM.
   */
  async createTestCaseDefinition(
    input: CreateRetellTestCaseInput
  ): Promise<RetellTestCaseDefinition> {
    this.ensureApiKey();

    const response = (await this.client.tests.createTestCaseDefinition(
      buildTestCaseDefinitionPayload(input)
    )) as any;

    return normalizeTestCaseDefinition(response);
  }

  /**
   * Actualiza una definición existente. Se usa cuando el catálogo local
   * cambia (guion, mocks o métricas) para no duplicar definiciones en Retell.
   */
  async updateTestCaseDefinition(
    testCaseDefinitionId: string,
    input: CreateRetellTestCaseInput
  ): Promise<RetellTestCaseDefinition> {
    this.ensureApiKey();

    const response = (await this.client.tests.updateTestCaseDefinition(
      testCaseDefinitionId,
      buildTestCaseDefinitionPayload(input)
    )) as any;

    return normalizeTestCaseDefinition(response);
  }

  /**
   * Lista las definiciones ya creadas para un LLM concreto, paginando hasta
   * agotarlas — el sync las necesita todas para decidir si crea o actualiza.
   */
  async listTestCaseDefinitions(
    llmId: string
  ): Promise<RetellTestCaseDefinition[]> {
    this.ensureApiKey();

    const items: RetellTestCaseDefinition[] = [];
    let paginationKey: string | undefined;

    do {
      const response = (await this.client.tests.listTestCaseDefinitions({
        type: "retell-llm",
        llm_id: llmId,
        limit: 100,
        ...(paginationKey ? { pagination_key: paginationKey } : {}),
      })) as any;

      for (const item of response.items || []) {
        items.push(normalizeTestCaseDefinition(item));
      }

      paginationKey = response.has_more ? response.pagination_key : undefined;
    } while (paginationKey);

    return items;
  }

  /**
   * Lanza un batch con varias definiciones contra un LLM. Devuelve el job,
   * que arranca en `in_progress` — hay que sondearlo con getBatchTest.
   */
  async createBatchTest(input: {
    llmId: string;
    testCaseDefinitionIds: string[];
  }): Promise<RetellBatchTest> {
    this.ensureApiKey();

    const response = (await this.client.tests.createBatchTest({
      response_engine: { type: "retell-llm", llm_id: input.llmId },
      test_case_definition_ids: input.testCaseDefinitionIds,
    })) as any;

    return normalizeBatchTest(response);
  }

  async getBatchTest(testCaseBatchJobId: string): Promise<RetellBatchTest> {
    this.ensureApiKey();

    const response = (await this.client.tests.getBatchTest(
      testCaseBatchJobId
    )) as any;

    return normalizeBatchTest(response);
  }

  /**
   * Ejecuciones individuales de un batch — los contadores agregados del batch
   * no dicen qué caso falló, esto sí (incluye la explicación del evaluador).
   */
  async listTestRuns(testCaseBatchJobId: string): Promise<RetellTestRun[]> {
    this.ensureApiKey();

    const runs: RetellTestRun[] = [];
    let paginationKey: string | undefined;

    do {
      const response = (await this.client.tests.listTestRuns(
        testCaseBatchJobId,
        {
          limit: 100,
          ...(paginationKey ? { pagination_key: paginationKey } : {}),
        }
      )) as any;

      for (const item of response.items || []) {
        runs.push({
          testCaseJobId: item.test_case_job_id,
          testCaseDefinitionId: item.test_case_definition_id,
          status: item.status,
          resultExplanation: item.result_explanation ?? null,
          name: item.test_case_definition_snapshot?.name ?? null,
        });
      }

      paginationKey = response.has_more ? response.pagination_key : undefined;
    } while (paginationKey);

    return runs;
  }
}

function buildTestCaseDefinitionPayload(input: CreateRetellTestCaseInput) {
  return {
    name: input.name,
    user_prompt: input.userPrompt,
    metrics: input.metrics,
    response_engine: { type: "retell-llm" as const, llm_id: input.llmId },
    ...(input.dynamicVariables
      ? { dynamic_variables: input.dynamicVariables }
      : {}),
    ...(input.toolMocks
      ? {
          tool_mocks: input.toolMocks.map((mock) => ({
            tool_name: mock.toolName,
            // El output viaja como string JSON: es la misma forma que
            // devuelve la tool real al LLM (el body de la respuesta del
            // webhook, no el envoltorio {success, result} interno).
            output: JSON.stringify(mock.output),
            input_match_rule: mock.matchArgs
              ? { type: "partial_match" as const, args: mock.matchArgs }
              : { type: "any" as const },
          })),
        }
      : {}),
    ...(input.llmModel ? { llm_model: input.llmModel } : {}),
  };
}

function normalizeTestCaseDefinition(response: any): RetellTestCaseDefinition {
  return {
    testCaseDefinitionId: response.test_case_definition_id,
    name: response.name,
  };
}

function normalizeBatchTest(response: any): RetellBatchTest {
  return {
    testCaseBatchJobId: response.test_case_batch_job_id,
    status: response.status,
    totalCount: response.total_count ?? 0,
    passCount: response.pass_count ?? 0,
    failCount: response.fail_count ?? 0,
    errorCount: response.error_count ?? 0,
  };
}

// Export singleton instance
export const retellAdapter = new RetellAdapter();
