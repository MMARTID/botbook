import { prisma } from "./prisma.js";
// VAPI: inactivo. Se mantiene el adaptador y esta rama de creación intactos
// por si se retoma la expansión a Latinoamérica, pero ningún negocio nuevo
// lo usa — detectVoiceOrchestrator() siempre devuelve "retell".
import { vapiAdapter } from "../adapters/vapi/VapiAdapter.js";
import { retellAdapter, type RetellEnumAnalysisField } from "../adapters/retell/RetellAdapter.js";
import { getPublicWebhookBaseUrl } from "./serverUrl.js";
import type { VapiCreateAssistantRequest } from "../adapters/vapi/types.js";
import { BUSINESS_TYPE_LABELS, isBusinessType, type BusinessType } from "./businessType.js";

/**
 * Campo de post_call_analysis_data para clasificar el resultado de la llamada:
 * Retell lo extrae con su propio LLM tras cada llamada, sin coste ni llamada
 * extra a un tercero, y lo entrega en
 * call_analysis.custom_analysis_data.call_outcome del evento call_analyzed.
 */
export const CALL_OUTCOME_ANALYSIS_FIELD: RetellEnumAnalysisField = {
  name: "call_outcome",
  type: "enum",
  choices: ["RESOLVED", "FRUSTRATED", "NO_ANSWER", "ESCALATED", "LEAD_CAPTURED"],
  description:
    "Clasifica el resultado de la llamada en una sola categoría: " +
    "RESOLVED si se resolvió la petición del cliente o se completó una reserva; " +
    "FRUSTRATED si el cliente mostró enfado, frustración o insatisfacción notable; " +
    "NO_ANSWER si la llamada terminó sin una resolución clara o el cliente colgó sin más; " +
    "ESCALATED si la llamada se transfirió a una persona o a otro departamento; " +
    "LEAD_CAPTURED si se recogió un contacto o interés comercial sin llegar a resolver la petición.",
};

export type AgentTemplateConfig = {
  name: string;
  voiceId: string;
  voiceProvider: string;
  voiceModel?: string;
  language: string;
  systemPrompt: string;
  llmProvider: string;
  llmModel: string;
  llmTemperature: number;
  sttProvider: string;
  sttModel: string;
  firstMessage: string;
  firstMessageMode: "assistant-speaks-first" | "assistant-waits-for-user";
};

export const DEFAULT_AGENT_CONFIG: AgentTemplateConfig = {
  name: "Asistente virtual",
  voiceId: "538a8872-3799-4df5-b373-b78493b766c6",
  voiceProvider: "cartesia",
  voiceModel: "sonic-3.5",
  language: "es",
  systemPrompt: "Eres un asistente virtual básico. Responde de forma breve y directa: máximo 1-2 frases por turno. Evita listas, puntos suspensivos y explicaciones largas.",
  llmProvider: "groq",
  llmModel: "openai/gpt-oss-20b",
  llmTemperature: 0.3,
  sttProvider: "deepgram",
  sttModel: "nova-2",
  firstMessage: "Hola, soy la recepcionista virtual. ¿En qué te ayudo?",
  firstMessageMode: "assistant-speaks-first",
};

export const DEFAULT_RETELL_AGENT_CONFIG = {
  voiceId: "retell-Cimo",
  model: "gpt-4.1" as const,
  modelTemperature: 0.3,
  language: "es-ES" as const,
  timezone: "Europe/Madrid",
};

/**
 * Devuelve un nombre legible para el agente basado en el tipo de negocio.
 * Facilita identificarlo en el dashboard de Retell/Vapi mientras no haya API de carpetas.
 */
export function buildAgentDisplayName(businessName: string, businessType: BusinessType) {
  const typeLabel = BUSINESS_TYPE_LABELS[businessType] ?? BUSINESS_TYPE_LABELS.other;
  return `${businessName} · ${typeLabel}`;
}

/**
 * Resuelve la configuración de plantilla para un tipo de negocio.
 * De momento todos los tipos comparten la misma configuración base;
 * aquí se podrá personalizar systemPrompt, TTS, LLM y STT por nicho.
 */
export function getAgentTemplateForBusinessType(
  businessType: BusinessType,
  baseName: string
): AgentTemplateConfig {
  return getDefaultAgentConfig({ name: baseName });
}

export function getDefaultAgentConfig(
  overrides: Partial<AgentTemplateConfig> = {}
): AgentTemplateConfig {
  return {
    ...DEFAULT_AGENT_CONFIG,
    ...overrides,
  };
}

export function buildAgentPersistencePayload(args: {
  businessId: string;
  name: string;
  config?: Partial<AgentTemplateConfig>;
}) {
  const config = getDefaultAgentConfig(args.config);

  return {
    businessId: args.businessId,
    name: args.name || config.name,
    voice: config.voiceId,
    voiceId: config.voiceId,
    voiceProvider: config.voiceProvider,
    language: config.language,
    systemPrompt: config.systemPrompt,
    llmProvider: config.llmProvider,
    llmModel: config.llmModel,
    llmTemperature: config.llmTemperature,
    sttProvider: config.sttProvider,
    sttModel: config.sttModel,
    firstMessage: config.firstMessage,
    firstMessageMode: config.firstMessageMode,
  };
}

export function buildSafeVapiAssistantName(name: string) {
  const normalized = name.trim().replace(/\s+/g, " ");

  if (normalized.length <= 40) {
    return normalized;
  }

  const sanitized = normalized
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim();

  const compactWords = sanitized
    .split(" ")
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");

  if (compactWords.length <= 40 && compactWords.length > 0) {
    return compactWords;
  }

  const hash = Buffer.from(normalized).toString("base64url").slice(0, 6);
  const prefix = normalized.slice(0, 33).trimEnd();
  return `${prefix}-${hash}`.slice(0, 40);
}

export function buildVapiAssistantPayload(input: {
  name: string;
  systemPrompt: string;
  voiceId: string;
  voiceProvider?: string;
  voiceModel?: string;
  llmProvider?: string;
  llmModel: string;
  llmTemperature?: number;
  sttProvider?: string;
  sttModel: string;
  firstMessage?: string;
  firstMessageMode?: "assistant-speaks-first" | "assistant-waits-for-user";
  files?: string[];
  integrations?: Record<string, any>;
}) {
  const voiceProvider = (input.voiceProvider || "vapi") as string;
  const llmProvider = (input.llmProvider || "openai") as string;
  const sttProvider = (input.sttProvider || "deepgram") as string;

  const voice: {
    provider: string;
    voiceId: string;
    model?: string;
  } = {
    provider: voiceProvider,
    voiceId: input.voiceId,
  };

  if (input.voiceModel) {
    voice.model = input.voiceModel;
  } else if (voiceProvider === "hume") {
    voice.model = "octave";
  }

  const model = {
    provider: llmProvider,
    model: input.llmModel,
    messages: [{ role: "system" as const, content: input.systemPrompt }],
    temperature: input.llmTemperature ?? 0.5,
  };

  const transcriber = {
    provider: sttProvider,
    model: input.sttModel,
    language: "es",
    confidenceThreshold: 0.4,
    fallbackPlan: {
      autoFallback: {
        enabled: true,
      },
      transcribers: [
        {
          model: "nova-3",
          language: "es",
          provider: "deepgram",
          confidenceThreshold: 0.3,
        },
      ],
    },
  };

  const webhookUrl =
    process.env.VAPI_WEBHOOK_URL ||
    "https://9f03-83-46-8-136.ngrok-free.app/webhooks/vapi";

  const assistantName = buildSafeVapiAssistantName(input.name);

  const payload: VapiCreateAssistantRequest = {
    name: assistantName,
    backgroundSound: "office",
    model,
    voice,
    transcriber,
    firstMessage:
      input.firstMessage || "Hola, soy tu asistente. ¿En qué puedo ayudarte?",
    firstMessageMode: input.firstMessageMode || "assistant-speaks-first",
    startSpeakingPlan: {
      smartEndpointingPlan: {
        provider: "vapi",
      },
    },
    server: {
      url: webhookUrl,
      timeoutSeconds: 20,
    },
  };

  if (input.files && input.files.length > 0) {
    (payload as unknown as { files?: Array<{ url: string }> }).files = input.files.map((url) => ({ url }));
  }

  if (input.integrations && Object.keys(input.integrations).length > 0) {
    (payload as unknown as { integrations?: Record<string, any> }).integrations = input.integrations;
  }

  return payload;
}

export function buildRetellLlmPayload(input: {
  name: string;
  systemPrompt: string;
  firstMessage?: string;
  tools?: any[];
}) {
  const payload: {
    generalPrompt: string;
    beginMessage: string;
    model: "gpt-4.1";
    modelTemperature: number;
    tools?: any[];
  } = {
    generalPrompt: input.systemPrompt,
    beginMessage: input.firstMessage || DEFAULT_AGENT_CONFIG.firstMessage,
    model: DEFAULT_RETELL_AGENT_CONFIG.model,
    modelTemperature: DEFAULT_RETELL_AGENT_CONFIG.modelTemperature,
  };

  if (input.tools !== undefined) {
    payload.tools = input.tools;
  }

  return payload;
}

export function buildRetellAgentPayload(input: {
  name: string;
  llmId: string;
  webhookUrl?: string;
}) {
  return {
    name: buildSafeVapiAssistantName(input.name),
    voiceId: DEFAULT_RETELL_AGENT_CONFIG.voiceId,
    llmId: input.llmId,
    language: DEFAULT_RETELL_AGENT_CONFIG.language,
    webhookUrl: input.webhookUrl,
    timezone: DEFAULT_RETELL_AGENT_CONFIG.timezone,
    postCallAnalysisData: [CALL_OUTCOME_ANALYSIS_FIELD],
  };
}

export async function createBusinessAgent(args: {
  businessId: string;
  name: string;
  businessType?: BusinessType;
  configOverrides?: Partial<AgentTemplateConfig>;
  prismaClient?: typeof prisma;
}) {
  const client = args.prismaClient ?? prisma;

  const business = await client.business.findUnique({
    where: { id: args.businessId },
    select: { orchestrator: true, businessType: true, name: true },
  });

  const businessType = args.businessType ?? (isBusinessType(business?.businessType) ? business?.businessType : "other");
  const orchestrator = business?.orchestrator || "retell";
  const displayName = buildAgentDisplayName(args.name, businessType);

  const config = getAgentTemplateForBusinessType(businessType, displayName);

  const agent = await client.agent.create({
    data: buildAgentPersistencePayload({
      businessId: args.businessId,
      name: displayName,
      config,
    }),
  });

  if (orchestrator === "retell") {
    try {
      const baseUrl = getPublicWebhookBaseUrl();
      const webhookUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/webhooks/retell` : undefined;

      const retellLlm = await retellAdapter.createLlm(
        buildRetellLlmPayload({
          name: config.name,
          systemPrompt: config.systemPrompt,
          firstMessage: config.firstMessage,
          tools: [],
        })
      );

      const retellAgent = await retellAdapter.createAgent(
        buildRetellAgentPayload({
          name: config.name,
          llmId: retellLlm.llm_id,
          webhookUrl,
        })
      );

      const syncedAgent = await client.agent.update({
        where: { id: agent.id },
        data: {
          retellAgentId: retellAgent.agent_id,
          retellLlmId: retellLlm.llm_id,
          voiceId: DEFAULT_RETELL_AGENT_CONFIG.voiceId,
        },
      });

      return syncedAgent;
    } catch (error) {
      console.error("[Agent] Failed to sync to Retell:", {
        agentId: agent.id,
        businessId: args.businessId,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    return agent;
  }

  try {
    const assistantPayload = buildVapiAssistantPayload({
      name: config.name,
      systemPrompt: config.systemPrompt,
      voiceId: config.voiceId,
      voiceProvider: config.voiceProvider,
      voiceModel: config.voiceModel,
      llmProvider: config.llmProvider,
      llmModel: config.llmModel,
      llmTemperature: config.llmTemperature,
      sttProvider: config.sttProvider,
      sttModel: config.sttModel,
      firstMessage: config.firstMessage,
      firstMessageMode: config.firstMessageMode,
    });

    const vapiAssistant = await vapiAdapter.createAssistant(assistantPayload);

    const syncedAgent = await client.agent.update({
      where: { id: agent.id },
      data: { vapiAssistantId: vapiAssistant.id },
    });

    return syncedAgent;
  } catch (error) {
    console.error("[Agent] Failed to sync to Vapi:", {
      agentId: agent.id,
      businessId: args.businessId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  return agent;
}

/**
 * Actualiza el nombre del agente existente para reflejar el tipo de negocio.
 * Se usa cuando el usuario confirma/selecciona el nicho tras el registro.
 * Nota: Retell no expone API pública para mover agentes entre carpetas,
 * por lo que el tipo se refleja en el nombre del agente.
 */
export async function syncAgentNameWithBusinessType(args: {
  businessId: string;
  businessType: BusinessType;
  businessName?: string;
  prismaClient?: typeof prisma;
}) {
  const client = args.prismaClient ?? prisma;

  const business = await client.business.findUnique({
    where: { id: args.businessId },
    select: { name: true, orchestrator: true },
  });

  if (!business) return;

  const agents = await client.agent.findMany({
    where: { businessId: args.businessId },
    orderBy: { createdAt: "asc" },
    take: 1,
  });

  const agent = agents[0];
  if (!agent) return;

  const displayName = buildAgentDisplayName(
    args.businessName ?? business.name,
    args.businessType
  );

  await client.agent.update({
    where: { id: agent.id },
    data: { name: displayName },
  });

  if (business.orchestrator === "retell" && agent.retellAgentId) {
    try {
      await retellAdapter.updateAgent(agent.retellAgentId, { name: displayName });
    } catch (error) {
      console.error("[Agent] Failed to update Retell agent name:", {
        agentId: agent.id,
        retellAgentId: agent.retellAgentId,
        businessId: args.businessId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (business.orchestrator === "vapi" && agent.vapiAssistantId) {
    try {
      await vapiAdapter.updateAssistant(agent.vapiAssistantId, {
        name: buildSafeVapiAssistantName(displayName),
      });
    } catch (error) {
      console.error("[Agent] Failed to update Vapi assistant name:", {
        agentId: agent.id,
        vapiAssistantId: agent.vapiAssistantId,
        businessId: args.businessId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
