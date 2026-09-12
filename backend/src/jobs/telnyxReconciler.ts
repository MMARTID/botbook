import { prisma } from "../lib/prisma.js";
import { telnyxAiAdapter } from "../adapters/telnyx/TelnyxAiAdapter.js";
import { syncAgentToTelnyx } from "../lib/telnyxAgentSync.js";
import { sendZohoMail } from "../lib/zohoMail.js";
import { errorMessage } from "../lib/logUtils.js";
import { buildTelnyxAssistantName } from "../lib/telnyxAssistantPayload.js";

/**
 * Reconciliador diario Telnyx (PLAN-TELNYX-ORQUESTADOR.md Fase 6:
 * "Reconciliador diario de assistants, números y rutas"). Invocado una vez
 * al día por Cloud Scheduler vía POST /internal/jobs/telnyx-reconciler.
 *
 * Límite conocido y deliberado: `TelnyxAssistant` (TelnyxAiAdapter.ts) solo
 * expone id/name/instructions/greeting — la respuesta real de la API trae
 * mucho más, pero el SDK no lo tipa completo y compararlo campo a campo
 * sería frágil (diferencias de espacios/orden que no son drift real).
 * Este reconciliador NO intenta un diff completo de configuración: se apoya
 * en `syncAgentToTelnyx` (que SÍ reescribe la configuración completa cuando
 * el hash local cambió) para reparar drift de contenido, y añade encima
 * comprobaciones baratas y fiables que `syncAgentToTelnyx` no hace porque
 * nunca consulta el lado remoto:
 *   1. El assistant sigue existiendo en Telnyx (alguien pudo borrarlo a mano
 *      en el dashboard).
 *   2. El `name` remoto sigue siendo el determinista esperado (detecta un
 *      `telnyxAssistantId` guardado que en realidad apunta a otro recurso).
 *   3. El estado de enrutamiento (`orchestrator`/`voiceRoutingTarget`/
 *      `telnyxPhoneNumberId`) de cada negocio en Telnyx es internamente
 *      consistente.
 */
export interface TelnyxReconcilerResult {
  agentsChecked: number;
  agentsResynced: number;
  assistantsMissingOnTelnyx: string[];
  assistantsWithUnexpectedName: string[];
  businessesWithSyncError: string[];
  businessesWithRoutingInconsistency: string[];
}

export async function telnyxReconcilerJob(): Promise<TelnyxReconcilerResult> {
  const result: TelnyxReconcilerResult = {
    agentsChecked: 0,
    agentsResynced: 0,
    assistantsMissingOnTelnyx: [],
    assistantsWithUnexpectedName: [],
    businessesWithSyncError: [],
    businessesWithRoutingInconsistency: [],
  };

  const agentsBefore = await prisma.agent.findMany({
    where: { deletedAt: null, telnyxAssistantId: { not: null } },
    select: {
      id: true,
      businessId: true,
      telnyxAssistantId: true,
      telnyxSyncError: true,
    },
  });
  const agentIdsWithErrorBefore = new Set(
    agentsBefore.filter((agent) => agent.telnyxSyncError).map((agent) => agent.id)
  );

  // Un negocio con varios agentes solo necesita un `syncAgentToTelnyx` — la
  // función ya recorre todos sus agentes internamente.
  const businessIds = [...new Set(agentsBefore.map((agent) => agent.businessId))];
  for (const businessId of businessIds) {
    try {
      await syncAgentToTelnyx(businessId);
    } catch (error) {
      // syncAgentToTelnyx ya no lanza en su uso normal (ver su propio
      // comentario), pero el reconciliador no debe poder abortar el resto
      // de negocios si algún día empieza a hacerlo.
      console.error(
        `[TelnyxReconciler] syncAgentToTelnyx inesperado para ${businessId}: ${errorMessage(error)}`
      );
    }
  }

  // Re-lee tras los syncAgentToTelnyx de arriba — telnyxSyncError pudo
  // quedar limpio si el reintento de hoy funcionó.
  const agentsAfter = await prisma.agent.findMany({
    where: { id: { in: agentsBefore.map((agent) => agent.id) } },
    select: { id: true, businessId: true, telnyxSyncError: true },
  });
  const errorById = new Map(
    agentsAfter.map((agent) => [agent.id, agent.telnyxSyncError])
  );

  result.agentsResynced = [...agentIdsWithErrorBefore].filter(
    (agentId) => !errorById.get(agentId)
  ).length;
  result.businessesWithSyncError = [
    ...new Set(
      agentsAfter.filter((agent) => agent.telnyxSyncError).map((agent) => agent.businessId)
    ),
  ];

  for (const agent of agentsBefore) {
    result.agentsChecked++;

    try {
      const remote = await telnyxAiAdapter.getAssistant(agent.telnyxAssistantId!);
      const expectedName = buildTelnyxAssistantName(agent.businessId, agent.id);
      if (remote.name !== expectedName) {
        result.assistantsWithUnexpectedName.push(
          `${agent.businessId}/${agent.id} (esperado "${expectedName}", remoto "${remote.name}")`
        );
      }
    } catch (error) {
      result.assistantsMissingOnTelnyx.push(
        `${agent.businessId}/${agent.id} (${agent.telnyxAssistantId}): ${errorMessage(error)}`
      );
    }
  }

  const routingBusinesses = await prisma.business.findMany({
    where: { orchestrator: "telnyx" },
    select: {
      id: true,
      voiceRoutingTarget: true,
      voiceFailoverActive: true,
      telnyxPhoneNumberId: true,
    },
  });
  for (const business of routingBusinesses) {
    if (!business.telnyxPhoneNumberId) {
      result.businessesWithRoutingInconsistency.push(
        `${business.id}: orchestrator=telnyx sin telnyxPhoneNumberId`
      );
      continue;
    }
    const expectedTarget = business.voiceFailoverActive ? "retell" : "telnyx";
    if (business.voiceRoutingTarget !== expectedTarget) {
      result.businessesWithRoutingInconsistency.push(
        `${business.id}: voiceRoutingTarget="${business.voiceRoutingTarget}" pero voiceFailoverActive=${business.voiceFailoverActive}`
      );
    }
  }

  await maybeSendAlert(result);
  return result;
}

function hasFindings(result: TelnyxReconcilerResult): boolean {
  return (
    result.assistantsMissingOnTelnyx.length > 0 ||
    result.assistantsWithUnexpectedName.length > 0 ||
    result.businessesWithSyncError.length > 0 ||
    result.businessesWithRoutingInconsistency.length > 0
  );
}

/**
 * Un único correo diario si hay algo que revisar — nunca si todo está
 * limpio, para no acostumbrar a ignorar la bandeja. Reutiliza `sendZohoMail`
 * (ya usado para email transaccional) en vez de montar un canal de alertas
 * nuevo; requiere `TELNYX_ALERT_EMAIL` configurado o no envía nada (falla
 * cerrado en logs, no lanza — un fallo de alertas no debe tumbar el job).
 */
async function maybeSendAlert(result: TelnyxReconcilerResult): Promise<void> {
  if (!hasFindings(result)) {
    console.log(
      `[TelnyxReconciler] ${result.agentsChecked} agente(s) revisados, sin hallazgos.`
    );
    return;
  }

  console.warn("[TelnyxReconciler] Hallazgos:", result);

  const alertEmail = process.env.TELNYX_ALERT_EMAIL;
  if (!alertEmail) {
    console.warn(
      "[TelnyxReconciler] TELNYX_ALERT_EMAIL no configurado — hallazgos solo en logs."
    );
    return;
  }

  const rows = [
    section("Assistants inexistentes en Telnyx", result.assistantsMissingOnTelnyx),
    section("Assistants con nombre inesperado", result.assistantsWithUnexpectedName),
    section("Negocios con error de sincronización", result.businessesWithSyncError),
    section(
      "Negocios con enrutamiento inconsistente",
      result.businessesWithRoutingInconsistency
    ),
  ]
    .filter(Boolean)
    .join("");

  try {
    await sendZohoMail({
      fromAddress: "support@alhabla.ai",
      toAddress: alertEmail,
      subject: `[Alhabla] Reconciliador Telnyx: ${result.agentsChecked} agentes, hallazgos pendientes`,
      html: `<h2>Reconciliador Telnyx</h2><p>${result.agentsChecked} agente(s) revisados.</p>${rows}`,
    });
  } catch (error) {
    console.error(
      `[TelnyxReconciler] No se pudo enviar el correo de alerta: ${errorMessage(error)}`
    );
  }
}

function section(title: string, items: string[]): string {
  if (items.length === 0) return "";
  const list = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<h3>${title} (${items.length})</h3><ul>${list}</ul>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
