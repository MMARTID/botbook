/**
 * Fallo que no se arregla reintentando: un destinatario inválido, una
 * plantilla que Meta no ha aprobado, un número que Telnyx rechaza. Cloud
 * Tasks reintenta ante cualquier 5xx, así que estos errores tienen que
 * llegar al endpoint interno marcados como definitivos para responder 200 y
 * sacar la tarea de la cola en vez de repetirla cuatro veces para nada.
 */
export class PermanentJobError extends Error {
  readonly reason: string;

  constructor(message: string, reason = "permanent_failure") {
    super(message);
    this.name = "PermanentJobError";
    this.reason = reason;
  }
}

/** Un 4xx que no sea 408/429 es culpa de la petición, no del momento. */
export function esFalloPermanentePorEstado(status: number | undefined): boolean {
  if (status === undefined) return false;
  if (status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}
