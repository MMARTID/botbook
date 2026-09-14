/**
 * Selección del orquestador de voz por negocio.
 *
 * Retell.ai es el orquestador por defecto para todo negocio nuevo. Un
 * negocio puede pasar a "telnyx" más tarde vía el proceso de cutover (ver
 * PLAN-TELNYX-ORQUESTADOR.md), nunca en el registro.
 */

import { planAllows, resolvePlanId } from "./planFeatures.js";

export type VoiceOrchestrator = "retell" | "telnyx";

export function detectVoiceOrchestrator(_isEuropeanUnion?: boolean): VoiceOrchestrator {
  return "retell";
}

/** Lo que hace falta de un negocio para resolver su plan comercial. */
export type PlanDelNegocio = { stripePriceId?: string | null; plan?: string | null };

/**
 * Catalán solo es viable hoy vía Retell — Telnyx no lo soporta (STT/TTS sin
 * catalán confirmado, PLAN-TELNYX-ORQUESTADOR.md §3). Decisión explícita del
 * usuario 2026-09-14: Retell queda como "plan B", reservado a las cuentas
 * Pro/Scale que activen catalán — es la única razón para pagar el coste
 * mayor de Retell. Cualquier otra combinación (sin catalán, o catalán
 * heredado en el plan Inicio) usa Telnyx, más barato.
 *
 * El plan se resuelve con `planFeatures.ts`, la única fuente de verdad del
 * gating (PR #49): elegir idiomas es la feature `voz_idioma`, y quien puede
 * elegir idiomas puede pagar Retell por el catalán. Así este módulo no
 * vuelve a comparar precios de Stripe por su cuenta y respeta también la
 * columna legacy `plan` de los negocios sin suscripción sincronizada.
 */
export function planAllowsCatalanOnRetell(negocio: PlanDelNegocio): boolean {
  return planAllows(resolvePlanId(negocio), "voz_idioma");
}

/**
 * Orquestador que la política de idioma/plan exige — no considera todavía
 * si Telnyx es elegible por otros motivos (voz disponible, etc.); eso lo
 * añade resolveTelnyxEligibility en el caller (telnyxAgentSync.ts), que sí
 * puede consultar la API de Telnyx de forma asíncrona.
 */
export function resolveDesiredOrchestrator(
  input: PlanDelNegocio & { languages: readonly string[] }
): VoiceOrchestrator {
  const catalanActive = input.languages.includes("ca-ES");
  if (catalanActive && planAllowsCatalanOnRetell(input)) {
    return "retell";
  }
  return "telnyx";
}
