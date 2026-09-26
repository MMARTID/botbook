import axios from "axios";

/**
 * Mensaje de error que enseñar a la persona: el `error` del cuerpo si es una
 * frase corta (los del backend ya están escritos para el dueño del negocio),
 * o el respaldo cuando no hay nada legible.
 */
export function describeApiError(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const message = error.response?.data?.error;
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
