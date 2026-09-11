/**
 * Mismo criterio de suspensión que retellInbound.ts (impago vencido o sin
 * agente operativo), aplicado al assistant Telnyx en vez del agente Retell
 * — ver PLAN-TELNYX-ORQUESTADOR.md § "Enrutamiento de llamadas y tools".
 */
export interface TelnyxInboundBusiness {
  callsSuspendedAt: Date | null;
  paymentFailureSuspensionAt: Date | null;
  agents: Array<{ id: string; telnyxAssistantId: string | null }>;
}

export function selectTelnyxInboundAgent(
  business: TelnyxInboundBusiness,
  now = new Date()
): { id: string; telnyxAssistantId: string } | null {
  if (
    business.callsSuspendedAt !== null ||
    (business.paymentFailureSuspensionAt !== null &&
      business.paymentFailureSuspensionAt <= now)
  ) {
    return null;
  }

  const agent = business.agents[0];
  if (!agent?.telnyxAssistantId) return null;
  return { id: agent.id, telnyxAssistantId: agent.telnyxAssistantId };
}
