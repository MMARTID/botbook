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
  buildTransferInstruction,
  parseAgentSettings,
  TITULO_DEL_BLOQUE_DE_TRANSFERENCIA,
} from "./managedAgentPrompt.js";
import { resolveTelnyxEligibility } from "./telnyxEligibility.js";
import { isBusinessType, type BusinessType } from "./businessType.js";
import { buildRetellBeginMessage } from "./agentBootstrap.js";
import { listaDeEsperaDisponible } from "../modules/whatsapp/service.js";
import { resolverTransferenciaAlDueno } from "./transferenciaAlDueno.js";
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
      hideOwnerNumberFromClients: true,
      // Transferencia al dueño (fase 4): de aquí salen el origen (número de
      // Alhabla), el destino (móvil del dueño) y el modo por defecto.
      customerLineType: true,
      phone: true,
      telnyxPhoneNumber: true,
      ownerWhatsappNumber: true,
      ownerPhoneIsCustomerLine: true,
    },
  });
  if (!business) return null;

  const businessType: BusinessType = isBusinessType(business.businessType)
    ? business.businessType
    : "other";
  const agentSettings = parseAgentSettings(business.agentSettings);
  // La misma resolución decide el bloque del prompt Y la tool: nunca uno
  // sin el otro.
  const transferenciaAlDueno = resolverTransferenciaAlDueno(
    business,
    agentSettings.pasarLlamadas
  );
  const systemPrompt = buildManagedAgentPrompt({
    businessName: business.name,
    businessDetails: business.businessDetails,
    businessType,
    settings: agentSettings,
    timezone: business.timezone,
    minAdvanceBookingMinutes: business.minAdvanceBookingMinutes,
    maxAppointmentDurationMinutes: business.maxAppointmentDurationMinutes,
    listaDeEspera: await listaDeEsperaDisponible(),
    ocultarNumeroDelNegocio: business.hideOwnerNumberFromClients,
    transferenciaAlDueno,
  });

  return {
    business,
    agentSettings,
    systemPrompt,
    transferenciaAlDueno: transferenciaAlDueno.activa
      ? { from: transferenciaAlDueno.origen!, to: transferenciaAlDueno.destino! }
      : null,
    /** El bloque «## Pasar la llamada» suelto, para los prompts editados a
     * mano (ver promptManualConSuRegla). null si la tool no se registra. */
    bloqueDeTransferencia: buildTransferInstruction(transferenciaAlDueno),
  };
}

/**
 * Un prompt editado a mano (PATCH /agents/:id) se manda tal cual, pero la
 * tool `transfer` se registra según los ajustes del negocio, no según el
 * prompt: si el bloque no está, se añade al final para no romper la
 * garantía «nunca la tool sin su regla». Si el dueño ya escribió su propio
 * «## Pasar la llamada», se respeta.
 */
export function promptManualConSuRegla(
  prompt: string,
  bloqueDeTransferencia: string | null
): string {
  if (
    !bloqueDeTransferencia ||
    prompt.includes(TITULO_DEL_BLOQUE_DE_TRANSFERENCIA)
  ) {
    return prompt;
  }
  return `${prompt.trimEnd()}\n\n${bloqueDeTransferencia}`;
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
      transferenciaAlDueno: config.transferenciaAlDueno,
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
        `[Agent] Falta BASE_URL; no se pueden sincronizar tools de Telnyx para ${businessId}`
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
            "Falta BASE_URL; no se pueden sincronizar tools de Telnyx"
          );
        }

        const payload: CreateTelnyxAssistantInput =
          buildTelnyxAssistantPayload({
            businessId,
            agentId: agent.id,
            businessName: config.business.name,
            timezone: config.business.timezone,
            instructions: agent.promptManuallyEdited
              ? promptManualConSuRegla(
                  agent.systemPrompt,
                  config.bloqueDeTransferencia
                )
              : config.systemPrompt,
            greeting: buildRetellBeginMessage(config.business.name),
            language: resolveTelnyxTranscriptionLanguage(config.agentSettings.languages),
            voice: eligibility.voiceId!,
            boostedKeywords,
            tools,
            // Va aparte de `tools` (que solo lleva tools de webhook): así
            // también entra cuando calendar/service.ts pasa las suyas.
            transferenciaAlDueno: config.transferenciaAlDueno,
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
            // La copia del prompt que ve el panel (/agente) es la que
            // ejecuta Telnyx, el primary: con el bloque de transferencia
            // cuando la tool está registrada y sin él cuando no. Los
            // prompts editados a mano no se pisan.
            ...(agent.promptManuallyEdited
              ? {}
              : { systemPrompt: config.systemPrompt }),
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
