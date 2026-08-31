/**
 * Selección del orquestador de voz por negocio.
 *
 * Política actual (agosto 2026):
 * - Retell.ai es el orquestador por defecto para todos los nuevos negocios.
 *   Ofrece certificación RGPD para operar en Europa desde el inicio.
 * - Vapi se mantendrá para la futura expansión a Latinoamérica; por ahora no se
 *   asigna automáticamente a ningún país.
 *
 * En el registro solo se pregunta si los clientes del negocio están en la
 * Unión Europea (sí/no), no un país concreto. Ese booleano se sigue
 * recogiendo para analytics y para activar la rama Vapi cuando se decida
 * lanzarla fuera de la UE.
 */

export type VoiceOrchestrator = "vapi" | "retell";

export function detectVoiceOrchestrator(_isEuropeanUnion?: boolean): VoiceOrchestrator {
  return "retell";
}
