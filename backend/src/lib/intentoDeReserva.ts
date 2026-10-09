import { getRedis } from "./redis.js";
import { errorMessage } from "./logUtils.js";

/**
 * El último book_appointment que falló en una llamada, para que el informe
 * final pueda convertirlo en recado si la recepcionista escala por fallo
 * técnico sin dejar uno (ver recadoPorFalloTecnico en
 * modules/whatsapp/recados.ts). Vive en Redis y no en la BD porque solo hace
 * falta hasta que llega el informe, segundos después de colgar.
 */
export interface IntentoDeReservaFallido {
  clientName: string | null;
  /** Instante de la cita que se intentó reservar (ISO), o null si no se
   * llegó a saber. */
  startDateTime: string | null;
  /** Código con el que respondió book_appointment. */
  code: string | null;
}

// El informe llega en la post-conversación; dos horas cubren de sobra una
// llamada larga más los reintentos de Telnyx.
const INTENTO_TTL_SECONDS = 2 * 60 * 60;

function intentoKey(callControlId: string): string {
  return `intento_reserva_fallido:${callControlId}`;
}

/** Best-effort: si Redis falla, el recado saldrá sin nombre ni hora. */
export async function guardarIntentoDeReservaFallido(
  callControlId: string,
  intento: IntentoDeReservaFallido
): Promise<void> {
  try {
    await getRedis().set(
      intentoKey(callControlId),
      JSON.stringify(intento),
      "EX",
      INTENTO_TTL_SECONDS
    );
  } catch (error) {
    console.error(
      `[VoiceTools] No se pudo guardar el intento de reserva fallido de la llamada ${callControlId} (code ${intento.code ?? "—"}): ${errorMessage(error)}`
    );
  }
}

export async function leerIntentoDeReservaFallido(
  callControlId: string
): Promise<IntentoDeReservaFallido | null> {
  try {
    const raw = await getRedis().get(intentoKey(callControlId));
    return raw ? (JSON.parse(raw) as IntentoDeReservaFallido) : null;
  } catch (error) {
    console.error(
      `[WhatsApp] No se pudo leer el intento de reserva fallido de la llamada ${callControlId}: ${errorMessage(error)}`
    );
    return null;
  }
}
