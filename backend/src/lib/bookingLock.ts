import { getRedis } from "./redis.js";
import { errorMessage } from "./logUtils.js";

// Sin este lock, dos reservas simultáneas para el mismo negocio (dos
// llamadas a la vez, o una llamada en vivo y el job de reintento en segundo
// plano) pueden comprobar disponibilidad para el mismo hueco ANTES de que
// ninguna haya guardado su reserva — ambas la ven libre, ambas crean el
// evento en el calendario y ambas confirman, superando la capacidad
// configurada (o duplicando la cita del mismo profesional). Serializa por
// negocio, no por hueco: un negocio pequeño no tiene concurrencia real más
// allá de "dos clientes llamando a la vez", así que basta con no dejar
// avanzar dos reservas del mismo negocio al mismo tiempo por su sección
// crítica (disponibilidad + creación del evento + upsert local).
//
// Vive en lib/, no en modules/voiceTools/, para que jobs/retryFailedBooking.ts
// pueda reutilizarlo sin crear un import circular con lib/cloudTasks.ts
// (que a su vez importa jobs/retryFailedBooking.ts).
const BOOKING_LOCK_TTL_MS = 15_000;
const BOOKING_LOCK_ACQUIRE_RETRY_DELAY_MS = 300;
const BOOKING_LOCK_ACQUIRE_MAX_ATTEMPTS = 15; // ~4.5s de espera máxima, dentro del timeout de 20s de la tool

function getBookingLockRedisKey(businessId: string): string {
  return `booking_lock:${businessId}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Intenta adquirir el lock de reserva de un negocio, reintentando con una
 * espera corta en vez de rendirse al primer intento — la sección crítica que
 * protege suele durar bastante menos que su TTL, así que casi siempre basta
 * esperar un instante a que la otra reserva termine. Devuelve un token
 * propio de esta adquisición (para no liberar por error el lock de otra) o
 * null si no se consiguió dentro del presupuesto de reintentos. */
export async function acquireBookingLock(
  businessId: string
): Promise<string | null> {
  const redis = getRedis();
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const key = getBookingLockRedisKey(businessId);

  for (
    let attempt = 0;
    attempt < BOOKING_LOCK_ACQUIRE_MAX_ATTEMPTS;
    attempt++
  ) {
    try {
      const acquired = await redis.set(
        key,
        token,
        "PX",
        BOOKING_LOCK_TTL_MS,
        "NX"
      );
      if (acquired) {
        return token;
      }
    } catch (err) {
      console.error(
        `[BookingLock] Error adquiriendo el lock de reserva de ${businessId}: ${errorMessage(err)}`
      );
      return null;
    }
    await sleep(BOOKING_LOCK_ACQUIRE_RETRY_DELAY_MS);
  }

  return null;
}

/** Libera el lock solo si sigue siendo el nuestro (comparar-y-borrar vía
 * script Lua) — evita borrar el lock de otra reserva si el nuestro ya
 * expiró por TTL mientras tanto (Cloud Run especialmente lento, calendario
 * caído, etc.). */
export async function releaseBookingLock(
  businessId: string,
  token: string
): Promise<void> {
  const redis = getRedis();
  const key = getBookingLockRedisKey(businessId);
  try {
    await redis.eval(
      `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`,
      1,
      key,
      token
    );
  } catch (err) {
    console.error(
      `[BookingLock] Error liberando el lock de reserva de ${businessId}: ${errorMessage(err)}`
    );
  }
}
