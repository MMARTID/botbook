/**
 * Selección del orquestador de voz por negocio.
 *
 * Retell.ai es el orquestador por defecto para todo negocio nuevo. Un
 * negocio puede pasar a "telnyx" más tarde vía el proceso de cutover (ver
 * PLAN-TELNYX-ORQUESTADOR.md), nunca en el registro.
 */

import { getPlanByPriceId } from "../modules/billing/catalog.js";

export type VoiceOrchestrator = "retell" | "telnyx";

export function detectVoiceOrchestrator(_isEuropeanUnion?: boolean): VoiceOrchestrator {
  return "retell";
}

/**
 * Catalán solo es viable hoy vía Retell — Telnyx no lo soporta (STT/TTS sin
 * catalán confirmado, PLAN-TELNYX-ORQUESTADOR.md §3). Decisión explícita del
 * usuario 2026-09-14: Retell queda como "plan B", reservado a las cuentas
 * Pro/Scale que activen catalán — es la única razón para pagar el coste
 * mayor de Retell. Cualquier otra combinación (sin catalán, o catalán
 * intentado en el plan Inicio) usa Telnyx, más barato.
 */
export function planAllowsCatalanOnRetell(
  stripePriceId: string | null | undefined
): boolean {
  if (!stripePriceId) return false;
  const plan = getPlanByPriceId(stripePriceId);
  return plan?.id === "pro" || plan?.id === "scale";
}

/**
 * Orquestador que la política de idioma/plan exige — no considera todavía
 * si Telnyx es elegible por otros motivos (voz disponible, etc.); eso lo
 * añade resolveTelnyxEligibility en el caller (telnyxAgentSync.ts), que sí
 * puede consultar la API de Telnyx de forma asíncrona.
 */
export function resolveDesiredOrchestrator(input: {
  languages: readonly string[];
  stripePriceId: string | null | undefined;
}): VoiceOrchestrator {
  const catalanActive = input.languages.includes("ca-ES");
  if (catalanActive && planAllowsCatalanOnRetell(input.stripePriceId)) {
    return "retell";
  }
  return "telnyx";
}
