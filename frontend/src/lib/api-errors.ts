import axios from "axios";

/**
 * Mensaje de error que enseñar a la persona: el `error` del cuerpo cuando es
 * una frase corta escrita para el dueño del negocio (los 4xx del backend,
 * como `OWNER_WHATSAPP_IS_ALHABLA`), o el respaldo en todo lo demás:
 *
 * - Los 5xx. El manejador global de `backend/src/server.ts` responde
 *   «Internal Server Error» y muchas rutas devuelven 500 con textos en inglés
 *   pensados para los logs («Failed to update business»). El respaldo de cada
 *   pantalla ya dice qué no se pudo hacer, y en español.
 * - Los cuerpos con la forma estándar de Fastify (`{ statusCode, error,
 *   message }`: el manejador global, `@fastify/rate-limit`, las rutas que no
 *   existen). Ahí `error` es el nombre del estado HTTP en inglés («Bad
 *   Request», «Too Many Requests»), no un texto para nadie.
 * - Sin respuesta (red caída) o sin `error` de texto (los 400 de Zod traen la
 *   lista de fallos).
 */
export function describeApiError(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const status = error.response?.status;
  if (typeof status === "number" && status >= 500) return fallback;
  const data = error.response?.data;
  if (typeof data?.statusCode === "number") return fallback;
  const message = data?.error;
  return typeof message === "string" && message.length <= 180
    ? message
    : fallback;
}

/** Código de error (`code`) del cuerpo de una respuesta del backend. */
export function apiErrorCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const code = error.response?.data?.code;
  return typeof code === "string" ? code : null;
}

/**
 * ¿El backend ha cortado por el límite de peticiones por minuto? Merece un
 * mensaje propio: decir "no se pudo" cuando lo que pasa es que hay que
 * esperar unos segundos se lee como una avería.
 */
export function esLimiteDePeticiones(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 429;
}
