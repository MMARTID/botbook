import Telnyx from "telnyx";

let client: Telnyx | null = null;

/** Un webhook de voz tiene ~20s de presupuesto total, así que ninguna
 * llamada suelta a Telnyx puede pasar de aquí. */
const TELNYX_TIMEOUT_MS = 10_000;

export function getTelnyxClient(): Telnyx {
  if (client) {
    return client;
  }

  const apiKey = process.env.TELNYX_API_KEY;

  if (!apiKey) {
    throw new Error("TELNYX_API_KEY is not configured");
  }

  // maxRetries: 0 a propósito. El SDK reintenta por su cuenta ante 408, 409,
  // 429 y cualquier 5xx, y no manda cabecera de idempotencia: un POST de
  // compra de número que crea el pedido y luego devuelve 502 se repetiría
  // hasta tres veces, comprando (y facturando) tres números para un solo
  // negocio. Quien necesite reintentar una operación idempotente lo hace de
  // forma explícita. timeout acota además cuánto puede ocupar una instancia
  // de Cloud Run esperando a Telnyx.
  client = new Telnyx({ apiKey, maxRetries: 0, timeout: TELNYX_TIMEOUT_MS });
  console.log("[Telnyx] Client initialized");

  return client;
}
