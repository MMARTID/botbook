import { createHash } from "node:crypto";
import { prisma } from "./prisma.js";
import { telnyxAiAdapter } from "../adapters/telnyx/TelnyxAiAdapter.js";
import {
  buildTelnyxAssistantPayload,
  buildTelnyxVoiceTools,
  resolveTelnyxTranscriptionLanguage,
  type TelnyxWebhookToolInput,
} from "./telnyxAssistantPayload.js";
import { getPublicWebhookBaseUrl } from "./serverUrl.js";
import {
  buildManagedAgentPrompt,
  parseAgentSettings,
} from "./managedAgentPrompt.js";
import { resolveTelnyxEligibility } from "./telnyxEligibility.js";
import { isBusinessType, type BusinessType } from "./businessType.js";
import { buildRetellBeginMessage } from "./agentBootstrap.js";
import { resolveDesiredOrchestrator } from "./voiceOrchestrator.js";
import { repointTelnyxPhoneNumber } from "./voiceRouting.js";
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
      timezone: true,
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
    timezone: business.timezone,
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
      timezone: config.business.timezone,
      instructions: config.systemPrompt,
      greeting: buildRetellBeginMessage(config.business.name),
      language: resolveTelnyxTranscriptionLanguage(config.agentSettings.languages),
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

    // Sin este valor por defecto, cualquier llamada a syncAgentToTelnyx que
    // no pase `tools` explícitamente (guardar horario, crear/editar un
    // servicio o profesional, el reconciliador diario) sobrescribía el
    // assistant real con `tools: []` — dejándolo sin get_catalog/
    // check_availability/book_appointment/find_my_appointment/
    // cancel_appointment pese a que el prompt seguía instruyéndole a
    // usarlas. Hallazgo real 2026-09-14: los 5 assistants de las cuentas de
    // prueba lo sufrieron (probablemente el reconciliador diario) y las 25
    // llamadas reales de telnyxCallBattery.ts fallaron en el 100% de los
    // casos. buildTelnyxCalendarTools (calendar/service.ts) sigue siendo la
    // única llamada que puede pasar `tools` explícito.
    const baseUrl = getPublicWebhookBaseUrl();
    const tools = options?.tools ?? (baseUrl ? buildTelnyxVoiceTools(baseUrl) : undefined);
    if (!tools) {
      console.error(
        `[Agent] No hay URL pública configurada (BASE_URL o ngrok); no se pueden sincronizar tools de Telnyx para ${businessId}`
      );
    }

    for (const agent of agents) {
      if (options?.onlyManagedPrompts && agent.promptManuallyEdited) continue;

      try {
        if (!eligibility.eligible) {
          throw new Error(
            eligibility.reason ?? "Negocio no elegible para Telnyx."
          );
        }
        if (!tools) {
          throw new Error(
            "No hay URL pública configurada (BASE_URL o ngrok); no se pueden sincronizar tools de Telnyx"
          );
        }

        const payload: CreateTelnyxAssistantInput =
          buildTelnyxAssistantPayload({
            businessId,
            agentId: agent.id,
            businessName: config.business.name,
            timezone: config.business.timezone,
            instructions: agent.promptManuallyEdited
              ? agent.systemPrompt
              : config.systemPrompt,
            greeting: buildRetellBeginMessage(config.business.name),
            language: resolveTelnyxTranscriptionLanguage(config.agentSettings.languages),
            voice: eligibility.voiceId!,
            boostedKeywords,
            tools,
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

/**
 * Cambia el orquestador PRIMARY de un negocio cuando cambian sus idiomas o
 * su plan — hasta ahora `resolveTelnyxEligibility` solo se consultaba al
 * crear el agente (agentBootstrap.ts) y nunca más, así que un negocio que
 * activaba catalán DESPUÉS de creado se quedaba con `orchestrator="telnyx"`
 * (Telnyx no soporta catalán) o, al revés, uno que lo desactivaba se quedaba
 * en Retell para siempre pagando de más — decisión explícita del usuario
 * 2026-09-14: Retell es "plan B", solo para catalán en planes Pro/Scale.
 *
 * Se llama desde PATCH /business/me cuando cambian `agentSettings`
 * (businesses/routes.ts) — la selección de catalán para planes que no lo
 * permiten ya se bloquea ahí antes de llegar aquí. Nunca lanza: un fallo no
 * debe poder romper el guardado de ajustes que lo disparó.
 */
export async function reconcileVoiceOrchestrator(businessId: string): Promise<void> {
  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        orchestrator: true,
        agentSettings: true,
        stripePriceId: true,
        plan: true,
        telnyxPhoneNumberId: true,
      },
    });
    if (!business) return;

    const settings = parseAgentSettings(business.agentSettings);
    const policyTarget = resolveDesiredOrchestrator({
      languages: settings.languages,
      stripePriceId: business.stripePriceId,
      plan: business.plan,
    });

    // La política puede pedir Telnyx, pero si la cuenta no tiene voz Telnyx
    // compatible (u otro motivo de telnyxEligibility), Retell sigue siendo
    // el único sitio operativo — mismo criterio que la creación inicial.
    let desired: "telnyx" | "retell" = policyTarget;
    if (policyTarget === "telnyx") {
      const eligibility = await resolveTelnyxEligibility(settings);
      if (!eligibility.eligible) desired = "retell";
    }

    if (desired === business.orchestrator) return;

    if (!business.telnyxPhoneNumberId) {
      // Todavía sin número propio (negocio a medio onboarding): basta con
      // guardar la intención — phone/service.ts lee `orchestrator` en el
      // momento de comprar/importar el número.
      await prisma.business.update({
        where: { id: businessId },
        data: { orchestrator: desired, voiceRoutingTarget: desired },
      });
      console.log(
        `[VoiceOrchestrator] Negocio ${businessId} marcado como "${desired}" (sin número todavía).`
      );
      return;
    }

    const result = await repointTelnyxPhoneNumber(
      businessId,
      business.telnyxPhoneNumberId,
      desired
    );
    if (!result.success) {
      console.error(
        `[VoiceOrchestrator] No se pudo repuntar el número del negocio ${businessId} a "${desired}": ${result.error}`
      );
      return;
    }

    await prisma.business.update({
      where: { id: businessId },
      data: {
        orchestrator: desired,
        voiceRoutingTarget: desired,
        voiceFailoverActive: false,
        voiceFailoverReason: null,
        voiceRoutingChangedAt: new Date(),
      },
    });
    console.log(
      `[VoiceOrchestrator] Negocio ${businessId} cambiado a "${desired}" por idioma/plan.`
    );
  } catch (error) {
    console.error("[VoiceOrchestrator] Fallo reconciliando orquestador:", {
      businessId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
