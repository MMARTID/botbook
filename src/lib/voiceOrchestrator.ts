/**
 * Selección del orquestador de voz por negocio.
 *
 * Política actual (agosto 2026):
 * - Retell.ai es el orquestador por defecto para todos los nuevos negocios.
 *   Ofrece certificación RGPD para operar en Europa desde el inicio.
 * - Vapi se mantendrá para la futura expansión a Latinoamérica; por ahora no se
 *   asigna automáticamente a ningún país.
 *
 * El país se sigue recogiendo en el registro para analytics y para activar la
 * rama Vapi cuando se defina la lista de países no europeos.
 */

export type VoiceOrchestrator = "vapi" | "retell";

export function detectVoiceOrchestrator(_countryCode?: string): VoiceOrchestrator {
  return "retell";
}
