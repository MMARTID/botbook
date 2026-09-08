import { getRedis } from "./redis.js";
import { errorMessage } from "./logUtils.js";

const DEFAULT_LOCK_ACQUIRE_RETRY_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Primitiva genérica de lock distribuido sobre Redis (SET NX con
 * expiración) — reintenta con una espera corta contra un PLAZO DE RELOJ
 * real (no un nº fijo de intentos): con commandTimeout=3000 en el cliente
 * de Redis (ver redis.ts), un intento individual de `redis.set` puede
 * tardar hasta 3s si Redis está lento pero no caído, así que contar
 * intentos fijos asumiendo respuestas casi instantáneas podía alargar la
 * espera total muy por encima de lo previsto con Redis degradado. Devuelve
 * un token propio de esta adquisición (para poder liberar solo el lock
 * propio, nunca el de otro poseedor) o null si no se consiguió dentro del
 * presupuesto. */
export async function acquireLock(
  key: string,
  ttlMs: number,
  acquireBudgetMs: number
): Promise<string | null> {
  const redis = getRedis();
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + acquireBudgetMs;

  // El plazo se comprueba DESPUÉS de cada intento, no antes — así
  // acquireBudgetMs=0 sigue intentando una vez (nunca cero intentos) pero
  // no malgasta un sleep final antes de rendirse, dando un "solo un
  // intento, sin reintentos" limpio para llamadas que no quieren esperar
  // (ver provisionPhoneNumber en phone/service.ts, que necesita fallar
  // rápido y dejar que la otra ejecución concurrente termine de resolverlo).
  for (;;) {
    try {
      const acquired = await redis.set(key, token, "PX", ttlMs, "NX");
      if (acquired) {
        return token;
      }
    } catch (err) {
      console.error(
        `[Lock] Error adquiriendo el lock ${key}: ${errorMessage(err)}`
      );
      return null;
    }
    if (Date.now() >= deadline) {
      return null;
    }
    await sleep(DEFAULT_LOCK_ACQUIRE_RETRY_DELAY_MS);
  }
}

/** Libera el lock solo si sigue siendo el nuestro (comparar-y-borrar vía
 * script Lua) — evita borrar el lock de OTRO poseedor si el nuestro ya
 * expiró por TTL mientras tanto (Cloud Run especialmente lento, un
 * proveedor externo caído, etc.) y, mientras tanto, un tercero ya adquirió
 * el mismo lock. Un simple `del` incondicional (el diseño original de
 * phone/service.ts) no distingue esto: si el TTL expiraba antes de que el
 * poseedor original terminara, su propio `finally` podía borrar el lock de
 * quien lo hubiera adquirido después, dejando la sección crítica sin
 * protección real. */
export async function releaseLock(key: string, token: string): Promise<void> {
  const redis = getRedis();
  try {
    await redis.eval(
      `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`,
      1,
      key,
      token
    );
  } catch (err) {
    console.error(
      `[Lock] Error liberando el lock ${key}: ${errorMessage(err)}`
    );
  }
}

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

// La sección crítica que este lock protege puede incluir, para un negocio
// con Outlook, hasta 4 llamadas de red secuenciales capadas cada una a
// GRAPH_REQUEST_TIMEOUT_MS=8000 (refreshMicrosoftAccessToken +
// listMicrosoftBusyIntervals en fetchExternalBusyIntervals, y otra vez
// refreshMicrosoftAccessToken + createMicrosoftCalendarEvent dentro de
// bookAppointment) — hasta ~32s en el peor caso. Un TTL de 15s (el valor
// original) podía expirar a mitad de esa sección, dejando el lock libre
// para que una segunda reserva concurrente entrara y recreara exactamente
// la doble reserva que este lock existe para impedir (hallazgo de la
// revisión posterior a la auditoría). 45s deja margen de sobra.
const BOOKING_LOCK_TTL_MS = 45_000;
const BOOKING_LOCK_ACQUIRE_BUDGET_MS = 6_000;

function getBookingLockRedisKey(businessId: string): string {
  return `booking_lock:${businessId}`;
}

export async function acquireBookingLock(
  businessId: string
): Promise<string | null> {
  return acquireLock(
    getBookingLockRedisKey(businessId),
    BOOKING_LOCK_TTL_MS,
    BOOKING_LOCK_ACQUIRE_BUDGET_MS
  );
}

export async function releaseBookingLock(
  businessId: string,
  token: string
): Promise<void> {
  return releaseLock(getBookingLockRedisKey(businessId), token);
}
