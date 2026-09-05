import { prisma } from "./prisma.js";
// VAPI: inactivo. Se mantiene el adaptador y esta rama de creación intactos
// por si se retoma la expansión a Latinoamérica, pero ningún negocio nuevo
// lo usa — detectVoiceOrchestrator() siempre devuelve "retell".
import { vapiAdapter } from "../adapters/vapi/VapiAdapter.js";
import {
  retellAdapter,
  type RetellEnumAnalysisField,
  type RetellBooleanAnalysisField,
  type RetellAnalysisField,
  type CreateRetellLlmInput,
} from "../adapters/retell/RetellAdapter.js";
import { getPublicWebhookBaseUrl } from "./serverUrl.js";
import type { VapiCreateAssistantRequest } from "../adapters/vapi/types.js";
import { BUSINESS_TYPE_LABELS, isBusinessType, type BusinessType } from "./businessType.js";
import {
  buildManagedAgentPrompt,
  parseAgentSettings,
  DEFAULT_AGENT_SETTINGS,
  type AgentSettings,
} from "./managedAgentPrompt.js";
import { formatScheduleForPrompt } from "./businessSchedule.js";

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

export const ESCALATION_REASON_FIELD: RetellEnumAnalysisField = {
  name: "escalation_reason",
  type: "enum",
  choices: ["CLIENTE_LO_PIDIO", "FALLO_TECNICO", "FUERA_DE_HORARIO", "CONSULTA_COMPLEJA", "NO_APLICA"],
  description:
    "Motivo principal por el que la llamada terminó escalada, con una reserva sin completar, o sin " +
    "resolución clara: CLIENTE_LO_PIDIO si el cliente pidió hablar con una persona; FALLO_TECNICO si alguna " +
    "herramienta (calendario, disponibilidad) falló o no respondió; FUERA_DE_HORARIO si lo solicitado caía " +
    "fuera del horario del negocio; CONSULTA_COMPLEJA si la petición excedía lo que el asistente puede " +
    "resolver; NO_APLICA si la llamada no tuvo ningún problema de este tipo.",
  conditional_prompt:
    "Solo evalúa este campo si call_outcome es ESCALATED, o si alguna reserva no se pudo completar durante la llamada.",
};

export const TOOL_FAILURE_FIELD: RetellBooleanAnalysisField = {
  name: "tool_failure_detected",
  type: "boolean",
  description:
    "true si alguna herramienta (check_business_hours, check_availability o book_appointment) falló, dio " +
    "error o no pudo completarse durante la llamada, aunque la llamada terminara bien igualmente.",
};

/**
 * Campo enum de post_call_analysis_data cuyas opciones se generan a partir de
 * los servicios reales del negocio en el momento de sincronizar — sin
 * taxonomía hardcodeada por vertical, se adapta sola a cada negocio.
 */
export function buildRequestedServiceAnalysisField(serviceNames: string[]): RetellEnumAnalysisField {
  return {
    name: "requested_service_type",
    type: "enum",
    choices: [...serviceNames, "OTRO", "NO_APLICA"],
    description:
      "Categoriza el servicio que el cliente pidió o mencionó durante la llamada, si alguno. Usa NO_APLICA " +
      "si no se mencionó ningún servicio concreto.",
  };
}

const MAX_ANALYSIS_CHOICES = 40;

/**
 * Conjunto completo de post_call_analysis_data que se envía a Retell. Un
 * negocio sin servicios activos (recién creado) no lleva requested_service_type.
 */
export function buildPostCallAnalysisData(serviceNames: string[]): RetellAnalysisField[] {
  const fields: RetellAnalysisField[] = [CALL_OUTCOME_ANALYSIS_FIELD, ESCALATION_REASON_FIELD, TOOL_FAILURE_FIELD];
  if (serviceNames.length > 0) {
    fields.push(buildRequestedServiceAnalysisField(serviceNames.slice(0, MAX_ANALYSIS_CHOICES)));
  }
  return fields;
}

export async function buildPostCallAnalysisDataForBusiness(
  businessId: string,
  prismaClient: typeof prisma = prisma
): Promise<RetellAnalysisField[]> {
  const services = await prismaClient.service.findMany({
    where: { businessId, active: true },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  return buildPostCallAnalysisData(services.map((service) => service.name));
}

const MAX_LISTED_ITEMS = 40;

function formatServicesForDynamicVariable(
  services: { id: string; name: string; durationMinutes: number }[]
): string {
  if (services.length === 0) return "Este negocio todavía no tiene servicios configurados.";
  return services
    .slice(0, MAX_LISTED_ITEMS)
    .map((service) => `- id: ${service.id} | nombre: "${service.name}" | duración: ${service.durationMinutes} min`)
    .join("\n");
}

function formatProfessionalsForDynamicVariable(professionals: { id: string; name: string }[]): string {
  if (professionals.length === 0) return "Este negocio no tiene empleados individuales configurados.";
  return professionals
    .slice(0, MAX_LISTED_ITEMS)
    .map((professional) => `- id: ${professional.id} | nombre: "${professional.name}"`)
    .join("\n");
}

/**
 * Variables dinámicas de Retell para una llamada entrante — se llama desde
 * POST /webhooks/retell/inbound, no desde el momento de sincronizar el
 * prompt. Los valores deben ser string (restricción de la API de Retell), y
 * las claves tienen que coincidir exactamente con los {{...}} del prompt
 * generado por buildManagedAgentPrompt en managedAgentPrompt.ts.
 */
export async function buildInboundCallDynamicVariables(
  businessId: string,
  prismaClient: typeof prisma = prisma
): Promise<Record<string, string>> {
  const [business, services, professionals] = await Promise.all([
    prismaClient.business.findUnique({
      where: { id: businessId },
      select: { schedule: true },
    }),
    prismaClient.service.findMany({
      where: { businessId, active: true },
      select: { id: true, name: true, durationMinutes: true },
      orderBy: { name: "asc" },
    }),
    prismaClient.professional.findMany({
      where: { businessId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    servicios_disponibles: formatServicesForDynamicVariable(services),
    empleados: formatProfessionalsForDynamicVariable(professionals),
    horario_semanal: formatScheduleForPrompt(business?.schedule ?? {}),
  };
}

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
  voiceId: "custom_voice_4d8c043e79b567a286898349d2",
  model: "gpt-5.6-luna" as const,
  modelTemperature: 0.3,
  language: "es-ES" as const,
  timezone: "Europe/Madrid",
  // El default de Retell es 1 (máxima sensibilidad) — cualquier palabra suelta del
  // cliente ("ah", "vale") corta al agente a mitad de frase, confirmado con una
  // llamada real el 2026-09-05. 0.5 deja que el cliente interrumpa de verdad sin
  // que una muletilla corte la respuesta.
  interruptionSensitivity: 0.5,
  // RGPD: sin esto Retell retiene grabaciones/transcripciones para siempre.
  // Decisión explícita del usuario, 2026-09-05: 30 días.
  dataStorageRetentionDays: 30,
  // El default de Retell ("fast") prioriza latencia sobre precisión — para un
  // sistema donde una reserva depende de transcribir bien un nombre o una
  // fecha, "accurate" es la prioridad correcta. Decisión explícita del
  // usuario, 2026-09-05.
  sttMode: "accurate" as const,
};

/**
 * Voice ID de Retell por género elegido en AgentSettings.voiceGender. La
 * femenina es la voz por defecto histórica (DEFAULT_RETELL_AGENT_CONFIG); la
 * masculina es la alternativa añadida en 2026-09.
 */
export const RETELL_VOICE_ID_BY_GENDER: Record<AgentSettings["voiceGender"], string> = {
  femenina: DEFAULT_RETELL_AGENT_CONFIG.voiceId,
  masculina: "13ff5deb-2591-42ad-a356-63a04e524411",
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
 * Resuelve la configuración de plantilla para un tipo de negocio. El
 * systemPrompt ya incluye las instrucciones de nicho (NICHE_INSTRUCTIONS en
 * managedAgentPrompt.ts) desde el momento de creación — es efímero de todos
 * modos, porque PATCH /business/me lo reconstruye en cuanto el negocio guarda
 * ajustes o tipo de negocio (ver syncAgentToRetell). El horario y el
 * catálogo de servicios/empleados ya no viven en este texto: son variables
 * dinámicas de Retell que rellena POST /webhooks/retell/inbound en cada
 * llamada — ver managedAgentPrompt.ts. TTS/LLM/STT siguen siendo iguales
 * para todos los nichos.
 */
export function getAgentTemplateForBusinessType(
  businessType: BusinessType,
  baseName: string,
  businessName: string
): AgentTemplateConfig {
  return getDefaultAgentConfig({
    name: baseName,
    systemPrompt: buildManagedAgentPrompt({
      businessName,
      businessType,
      settings: DEFAULT_AGENT_SETTINGS,
    }),
  });
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
    model: CreateRetellLlmInput["model"];
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
  postCallAnalysisData?: RetellAnalysisField[];
}) {
  return {
    name: buildSafeVapiAssistantName(input.name),
    voiceId: DEFAULT_RETELL_AGENT_CONFIG.voiceId,
    llmId: input.llmId,
    language: DEFAULT_RETELL_AGENT_CONFIG.language,
    webhookUrl: input.webhookUrl,
    timezone: DEFAULT_RETELL_AGENT_CONFIG.timezone,
    postCallAnalysisData: input.postCallAnalysisData ?? [CALL_OUTCOME_ANALYSIS_FIELD],
    interruptionSensitivity: DEFAULT_RETELL_AGENT_CONFIG.interruptionSensitivity,
    dataStorageRetentionDays: DEFAULT_RETELL_AGENT_CONFIG.dataStorageRetentionDays,
    sttMode: DEFAULT_RETELL_AGENT_CONFIG.sttMode,
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

  const config = getAgentTemplateForBusinessType(businessType, displayName, args.name);

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

      const postCallAnalysisData = await buildPostCallAnalysisDataForBusiness(args.businessId, client);
      const retellAgent = await retellAdapter.createAgent(
        buildRetellAgentPayload({
          name: config.name,
          llmId: retellLlm.llm_id,
          webhookUrl,
          postCallAnalysisData,
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

/**
 * Reconstruye el prompt gestionado y el post_call_analysis_data de un
 * negocio a partir de su configuración actual (nicho, horario, ajustes,
 * restricciones, servicios y profesionales activos) y los sincroniza con
 * Retell. Es el único punto que debe llamarse cuando cambia cualquier dato
 * que afecte al prompt gestionado. No toca agentes cuyo systemPrompt se editó
 * a mano vía PATCH /agents/:id — ese endpoint no llama a esta función a
 * propósito, para no pisar un prompt escrito manualmente por el negocio.
 */
export async function syncAgentToRetell(
  businessId: string,
  prismaClient: typeof prisma = prisma
): Promise<void> {
  const business = await prismaClient.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      businessDetails: true,
      businessType: true,
      agentSettings: true,
      orchestrator: true,
      minAdvanceBookingMinutes: true,
      maxAppointmentDurationMinutes: true,
    },
  });

  if (!business || business.orchestrator !== "retell") return;

  const agents = await prismaClient.agent.findMany({
    where: { businessId, retellAgentId: { not: null }, retellLlmId: { not: null } },
  });
  if (agents.length === 0) return;

  // El horario y el catálogo de servicios/empleados ya no van en el
  // systemPrompt (son variables dinámicas de Retell, ver
  // POST /webhooks/retell/inbound) — los servicios se siguen consultando
  // aquí solo para las categorías de postCallAnalysisData y para boostear
  // la transcripción con los nombres reales del negocio.
  const services = await prismaClient.service.findMany({
    where: { businessId, active: true },
    select: { name: true },
    orderBy: { name: "asc" },
  });

  const professionals = await prismaClient.professional.findMany({
    where: { businessId, active: true },
    select: { name: true },
    orderBy: { name: "asc" },
  });

  const businessType = isBusinessType(business.businessType) ? business.businessType : "other";

  const systemPrompt = buildManagedAgentPrompt({
    businessName: business.name,
    businessDetails: business.businessDetails,
    businessType,
    settings: business.agentSettings,
    minAdvanceBookingMinutes: business.minAdvanceBookingMinutes,
    maxAppointmentDurationMinutes: business.maxAppointmentDurationMinutes,
  });

  const postCallAnalysisData = buildPostCallAnalysisData(services.map((service) => service.name));
  // Sesga la transcripción hacia los nombres reales del negocio (servicios y
  // profesionales) — reduce errores tipo "corte" transcrito como "corta".
  const boostedKeywords = [
    ...services.map((service) => service.name),
    ...professionals.map((professional) => professional.name),
  ];
  const { voiceGender } = parseAgentSettings(business.agentSettings);
  const voiceId = RETELL_VOICE_ID_BY_GENDER[voiceGender];

  for (const agent of agents) {
    try {
      await retellAdapter.updateLlm(agent.retellLlmId!, { generalPrompt: systemPrompt });
      await retellAdapter.updateAgent(agent.retellAgentId!, {
        postCallAnalysisData,
        voiceId,
        interruptionSensitivity: DEFAULT_RETELL_AGENT_CONFIG.interruptionSensitivity,
        dataStorageRetentionDays: DEFAULT_RETELL_AGENT_CONFIG.dataStorageRetentionDays,
        sttMode: DEFAULT_RETELL_AGENT_CONFIG.sttMode,
        boostedKeywords,
      });
      await prismaClient.agent.update({
        where: { id: agent.id },
        data: { systemPrompt, voiceId },
      });
    } catch (error) {
      console.error("[Agent] Failed to sync agent to Retell:", {
        agentId: agent.id,
        businessId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
