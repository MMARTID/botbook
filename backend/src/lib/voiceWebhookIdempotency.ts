import { prisma } from "./prisma.js";
import { isUniqueConstraintError } from "./prismaErrors.js";

/**
 * Un intento que lleva más de esto en `processing` se da por muerto (la
 * instancia que lo tenía se reinició a mitad, que en Cloud Run pasa) y otro
 * intento puede reclamarlo. Holgado a propósito: reclamar demasiado pronto
 * significa procesar el mismo evento dos veces en paralelo.
 */
const LEASE_MS = 5 * 60 * 1000;

/**
 * Reclama un evento de webhook de voz para procesarlo — tabla
 * `VoiceWebhookEvent` (PLAN-TELNYX-ORQUESTADOR.md Fase 3).
 *
 * No es «exactamente una vez», es «una vez con éxito»: un evento solo se
 * ignora si ya terminó BIEN, o si otro intento lo está procesando ahora
 * mismo. Antes la fila se creaba al recibir el evento y se daba por visto
 * para siempre, así que un fallo transitorio (la BD un segundo caída, un
 * timeout de Telnyx) respondía 500, el proveedor reintentaba… y el reintento
 * chocaba con la unicidad y recibía `200 deduped`. El evento se perdía para
 * siempre, con la fila marcada `result: "error"` y nadie mirándola. Afectaba
 * a llamadas, grabaciones y WhatsApp por igual.
 *
 * Sigue sin duplicar nada en el caso que motivó todo esto: dos entregas del
 * mismo evento a la vez, o una entrega repetida de algo ya procesado con
 * éxito, devuelven `false`.
 */
export async function claimVoiceWebhookEvent(
  provider: string,
  eventId: string,
  type: string
): Promise<boolean> {
  const ahora = new Date();
  try {
    await prisma.voiceWebhookEvent.create({
      data: {
        provider,
        eventId,
        type,
        result: "processing",
        claimedAt: ahora,
        attempts: 1,
      },
    });
    return true;
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }

  // Ya existe. Se puede volver a coger solo si el intento anterior falló, o
  // si se quedó colgado en `processing` más allá del lease. La condición va
  // dentro del propio UPDATE: si dos instancias intentan reclamarlo a la vez,
  // la base de datos decide y solo una ve `count === 1`.
  const { count } = await prisma.voiceWebhookEvent.updateMany({
    where: {
      provider,
      eventId,
      OR: [
        { result: "error" },
        { result: null },
        { result: "processing", claimedAt: { lt: new Date(ahora.getTime() - LEASE_MS) } },
        { result: "processing", claimedAt: null },
      ],
    },
    data: {
      result: "processing",
      claimedAt: ahora,
      attempts: { increment: 1 },
      lastError: null,
    },
  });
  return count === 1;
}

/**
 * Deja constancia de cómo terminó de procesarse un evento ya reclamado.
 * Nunca lanza: es solo trazabilidad, no debe poder convertir un webhook ya
 * procesado con éxito en un error de respuesta HTTP.
 *
 * Ojo: `result: "error"` es lo que permite que el siguiente reintento del
 * proveedor vuelva a entrar, así que dejar de llamarla en un camino de fallo
 * equivale a perder el evento.
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
        claimedAt: null,
        result,
        callId: extra?.callId,
        lastError: extra?.lastError,
      },
    })
    .catch(() => {});
}
