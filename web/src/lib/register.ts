import { appUrl } from "./app-url";
import { isPlanId } from "./billing-navigation";
import { normalizeBusinessType } from "./business-type";

/**
 * Lo que la web pasa a la app tras crear la cuenta (PLAN-APP-DOMINIO.md § 3):
 * el pase de un solo uso y lo que el visitante eligió antes (plan, sector).
 * Va en la query porque el localStorage de alhabla.ai no se ve desde
 * app.alhabla.ai.
 */
export function buildAppEntryUrl(input: { pase: string; plan: string | null; niche: string | null }) {
  const params = new URLSearchParams();
  params.set("pase", input.pase);
  if (isPlanId(input.plan)) params.set("plan", input.plan);
  if (input.niche) params.set("sector", normalizeBusinessType(input.niche));
  return appUrl(`/auth/entrar?${params.toString()}`);
}

export function describeRegisterError(error: unknown): string {
  // Reenviar el mensaje del backend solo tiene sentido en los errores de
  // negocio (400): esos vienen redactados en español. El registro está
  // limitado a 5 intentos por minuto, así que el 429 es un caso real, y
  // tanto ese como los 5xx llegan en inglés de Fastify ("Too Many
  // Requests", "Internal Server Error") — texto inútil en la pantalla de
  // crear cuenta.
  const responseError = error as {
    response?: { status?: number; data?: { error?: string | Array<{ message?: string }> } };
  };
  const status = responseError.response?.status;
  const apiError = responseError.response?.data?.error;
  if (status === 429) return "Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.";
  if (status !== undefined && status >= 500) {
    return "No hemos podido crear la cuenta ahora mismo. Inténtalo de nuevo en unos minutos.";
  }
  if (typeof apiError === "string") return apiError;
  if (Array.isArray(apiError) && apiError[0]?.message) return apiError[0].message;
  return "Error al registrar la cuenta.";
}

