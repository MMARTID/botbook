import { createHash } from "node:crypto";
import { prisma } from "./prisma.js";
import { telnyxAiAdapter } from "../adapters/telnyx/TelnyxAiAdapter.js";
import {
  buildTelnyxAssistantPayload,
  type TelnyxWebhookToolInput,
} from "./telnyxAssistantPayload.js";
import {
  buildManagedAgentPrompt,
  parseAgentSettings,
} from "./managedAgentPrompt.js";
import { resolveTelnyxEligibility } from "./telnyxEligibility.js";
import { isBusinessType, type BusinessType } from "./businessType.js";
import { buildRetellBeginMessage } from "./agentBootstrap.js";
import type { CreateTelnyxAssistantInput } from "../adapters/telnyx/TelnyxAiAdapter.js";

/** Idéntico en forma al hash que usará `syncAgentToRetell` cuando el
 * reconciliador de la Fase 2/6 lo necesite — determinista mientras el propio
 * builder del payload no cambie el orden de sus claves. */
function hashConfig(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Prompt/greeting/idioma de un negocio, para no repetir la misma consulta y
 * transformación en createTelnyxAssistantForAgent y syncAgentToTelnyx.
 */
async function loadManagedAssistantConfig(
  businessId: string,
  prismaClient: typeof prisma
) {
  const business = await prismaClient.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      businessDetails: true,
      businessType: true,
      agentSettings: true,
      minAdvanceBookingMinutes: true,
      maxAppointmentDurationMinutes: true,
    },
  });
  if (!business) return null;

  const businessType: BusinessType = isBusinessType(business.businessType)
    ? business.businessType
    : "other";
  const agentSettings = parseAgentSettings(business.agentSettings);
  const systemPrompt = buildManagedAgentPrompt({
    businessName: business.name,
    businessDetails: business.businessDetails,
    businessType,
    settings: agentSettings,
    minAdvanceBookingMinutes: business.minAdvanceBookingMinutes,
    maxAppointmentDurationMinutes: business.maxAppointmentDurationMinutes,
  });

  return { business, agentSettings, systemPrompt };
}

/**
 * Crea el assistant Telnyx de un `Agent` recién creado, si el negocio es
 * elegible (idioma/voz). Nunca lanza: un fallo aquí no debe impedir que
 * `createBusinessAgent()` devuelva el agente ya creado en Retell. Se llama
 * solo desde ahí — para negocios existentes usa `syncAgentToTelnyx`.
 */
export async function createTelnyxAssistantForAgent(args: {
  agentId: string;
  businessId: string;
  prismaClient?: typeof prisma;
}): Promise<{ eligible: boolean; reason: string | null }> {
  const client = args.prismaClient ?? prisma;

  try {
    const config = await loadManagedAssistantConfig(args.businessId, client);
    if (!config) return { eligible: false, reason: "Negocio no encontrado." };

    const eligibility = await resolveTelnyxEligibility(config.agentSettings);
    if (!eligibility.eligible) {
      return { eligible: false, reason: eligibility.reason };
    }

    const payload = buildTelnyxAssistantPayload({
      businessId: args.businessId,
      agentId: args.agentId,
      businessName: config.business.name,
      instructions: config.systemPrompt,
      greeting: buildRetellBeginMessage(config.business.name),
      language: "es",
      voice: eligibility.voiceId!,
    });

    const assistant = await telnyxAiAdapter.createAssistant(payload);
    await client.agent.update({
      where: { id: args.agentId },
      data: {
        telnyxAssistantId: assistant.id,
        telnyxConfigHash: hashConfig(payload),
        telnyxSyncedAt: new Date(),
        telnyxSyncError: null,
      },
    });
    return { eligible: true, reason: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Agent] No se pudo crear el assistant Telnyx:", {
      agentId: args.agentId,
      businessId: args.businessId,
      message,
    });
    return { eligible: false, reason: message };
  }
}

/**
 * Reconstruye la configuración gestionada de Telnyx y la sincroniza con los
 * agentes que ya tienen `telnyxAssistantId` — espejo de `syncAgentToRetell`,
 * pero SIN lanzar nunca: Telnyx todavía no es primary para ningún negocio
 * real y un fallo aquí no debe tumbar el flujo (reservas, ajustes) que
 * dispara esta sincronización. El estado queda en `telnyxSyncError` para
 * que el panel lo muestre (plan §6).
 */
export async function syncAgentToTelnyx(
  businessId: string,
  prismaClient: typeof prisma = prisma,
  options?: {
    onlyManagedPrompts?: boolean;
    onlyActive?: boolean;
    tools?: TelnyxWebhookToolInput[];
  }
): Promise<void> {
  try {
    const config = await loadManagedAssistantConfig(businessId, prismaClient);
    if (!config) return;

    const agents = await prismaClient.agent.findMany({
      where: {
        businessId,
        deletedAt: null,
        telnyxAssistantId: { not: null },
        ...(options?.onlyActive ? { active: true } : {}),
      },
    });
    if (agents.length === 0) return;

    const services = await prismaClient.service.findMany({
      where: { businessId, active: true, deletedAt: null },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    const professionals = await prismaClient.professional.findMany({
      where: { businessId, active: true, deletedAt: null },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    const boostedKeywords = [
      ...services.map((service) => service.name),
      ...professionals.map((professional) => professional.name),
    ];

    const eligibility = await resolveTelnyxEligibility(config.agentSettings);

    for (const agent of agents) {
      if (options?.onlyManagedPrompts && agent.promptManuallyEdited) continue;

      try {
        if (!eligibility.eligible) {
          throw new Error(
            eligibility.reason ?? "Negocio no elegible para Telnyx."
          );
        }

        const payload: CreateTelnyxAssistantInput =
          buildTelnyxAssistantPayload({
            businessId,
            agentId: agent.id,
            businessName: config.business.name,
            instructions: agent.promptManuallyEdited
              ? agent.systemPrompt
              : config.systemPrompt,
            greeting: buildRetellBeginMessage(config.business.name),
            language: "es",
            voice: eligibility.voiceId!,
            boostedKeywords,
            tools: options?.tools,
          });

        const configHash = hashConfig(payload);
        if (agent.telnyxConfigHash !== configHash) {
          await telnyxAiAdapter.updateAssistant(
            agent.telnyxAssistantId!,
            payload
          );
        }
        await prismaClient.agent.update({
          where: { id: agent.id },
          data: {
            telnyxConfigHash: configHash,
            telnyxSyncedAt: new Date(),
            telnyxSyncError: null,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[Agent] No se pudo sincronizar el agente con Telnyx:", {
          agentId: agent.id,
          businessId,
          message,
        });
        await prismaClient.agent
          .update({ where: { id: agent.id }, data: { telnyxSyncError: message } })
          .catch(() => {});
      }
    }
  } catch (error) {
    console.error("[Agent] Fallo inesperado sincronizando Telnyx (no afecta a Retell):", {
      businessId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
