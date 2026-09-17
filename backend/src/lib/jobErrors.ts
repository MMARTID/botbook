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

/**
 * Un 4xx suele ser culpa de la petición y no mejora repitiéndola. Quedan
 * fuera los que sí pueden arreglarse solos:
 * - 408/429: tiempo agotado o límite de ritmo.
 * - 401/403: casi siempre un token caducado o revocado; el siguiente intento
 *   renueva credenciales. Tirar aquí el correo de "tu pago ha fallado"
 *   porque Zoho devolvió un 401 sería mucho peor que reintentarlo.
 */
export function esFalloPermanentePorEstado(status: number | undefined): boolean {
  if (status === undefined) return false;
  if (status === 401 || status === 403 || status === 408 || status === 429) {
    return false;
  }
  return status >= 400 && status < 500;
}
