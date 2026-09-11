import { prisma } from "./prisma.js";

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Reclama un evento de webhook de voz para procesarlo exactamente una vez —
 * tabla `VoiceWebhookEvent` (PLAN-TELNYX-ORQUESTADOR.md Fase 3). Si el
 * proveedor reintenta la entrega del mismo evento, la segunda llamada choca
 * con la unicidad `(provider, eventId)` y devuelve `false` sin tocar nada
 * más — así una llamada colgada dos veces (retry de red del proveedor) no
 * duplica grabaciones, transcripciones ni trabajos de Cloud Tasks.
 */
export async function claimVoiceWebhookEvent(
  provider: string,
  eventId: string,
  type: string
): Promise<boolean> {
  try {
    await prisma.voiceWebhookEvent.create({
      data: { provider, eventId, type },
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) return false;
    throw error;
  }
}

/**
 * Deja constancia de cómo terminó de procesarse un evento ya reclamado.
 * Nunca lanza: es solo trazabilidad, no debe poder convertir un webhook ya
 * procesado con éxito en un error de respuesta HTTP.
 */
export async function completeVoiceWebhookEvent(
  provider: string,
  eventId: string,
  result: "success" | "error",
  extra?: { callId?: string; lastError?: string }
): Promise<void> {
  await prisma.voiceWebhookEvent
    .update({
      where: { provider_eventId: { provider, eventId } },
      data: {
        processedAt: new Date(),
        result,
        callId: extra?.callId,
        lastError: extra?.lastError,
      },
    })
    .catch(() => {});
}
