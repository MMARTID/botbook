/**
 * Selección del orquestador de voz por negocio.
 *
 * Retell.ai es el orquestador por defecto para todo negocio nuevo. Un
 * negocio puede pasar a "telnyx" más tarde vía el proceso de cutover (ver
 * PLAN-TELNYX-ORQUESTADOR.md), nunca en el registro.
 */

export type VoiceOrchestrator = "retell" | "telnyx";

export function detectVoiceOrchestrator(_isEuropeanUnion?: boolean): VoiceOrchestrator {
  return "retell";
}
