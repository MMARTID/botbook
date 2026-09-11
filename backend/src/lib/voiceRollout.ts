/**
 * Interruptor de todo el rollout Telnyx (ver PLAN-TELNYX-ORQUESTADOR.md
 * Fase 5). `off` o sin definir deja el comportamiento actual intacto: solo
 * se crea/mantiene el agente Retell. Cualquier otro valor activa el intento
 * de creación dual en `createBusinessAgent()`. La selección fina de
 * cohortes (development/production-test/new/all) es trabajo de la Fase 5,
 * no de este flag por sí solo — hoy es un simple sí/no.
 */
export function isVoiceTelnyxRolloutEnabled(): boolean {
  const value = process.env.VOICE_TELNYX_ROLLOUT;
  return Boolean(value) && value !== "off";
}
