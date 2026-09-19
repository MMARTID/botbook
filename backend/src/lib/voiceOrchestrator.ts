/**
 * Selección del orquestador de voz por negocio.
 *
 * Esta función devuelve "retell" siempre, pero NO es el valor con el que se
 * queda el negocio: con VOICE_TELNYX_ROLLOUT activo (dev y producción van a
 * "all"), createBusinessAgent lo auto-promociona a "telnyx" en cuanto su
 * assistant existe de verdad (agentBootstrap.ts, "Auto-promoción a
 * Telnyx-primary", 2026-09-13). El cutover manual
 * (scripts/cutoverToTelnyx.ts, PLAN-TELNYX-ORQUESTADOR.md) solo cubre los
 * negocios anteriores a eso. Hoy Telnyx es el primary de todos: Retell se
 * mantiene sincronizado como fallback caliente, no como orquestador real.
 */

export type VoiceOrchestrator = "retell" | "telnyx";

export function detectVoiceOrchestrator(_isEuropeanUnion?: boolean): VoiceOrchestrator {
  return "retell";
}
