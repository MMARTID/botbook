export interface RetellInboundBusiness {
  callsSuspendedAt: Date | null;
  paymentFailureSuspensionAt: Date | null;
  agents: Array<{ retellAgentId: string | null }>;
}

/**
 * Retell rechaza el webhook entrante que responde sin override_agent_id. Por
 * eso devolver null es la forma explícita y verificable de suspender una
 * llamada, tanto por impago vencido como cuando no existe agente operativo.
 */
export function selectRetellInboundAgent(
  business: RetellInboundBusiness,
  now = new Date()
): string | null {
  if (
    business.callsSuspendedAt !== null ||
    (business.paymentFailureSuspensionAt !== null &&
      business.paymentFailureSuspensionAt <= now)
  ) {
    return null;
  }

  return business.agents[0]?.retellAgentId ?? null;
}
