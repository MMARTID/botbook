export interface RetellInboundBusiness {
  callsSuspendedAt: Date | null;
  paymentFailureSuspensionAt: Date | null;
  agents: Array<{ retellAgentId: string | null }>;
}

/**
 * Devuelve el agente con el que atender o null si la llamada no se debe
 * atender (impago vencido o sin agente operativo). Con null, el webhook
 * responde `call_inbound.reject: true`: sin ese campo Retell atendería con
 * el agente vinculado al número.
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
