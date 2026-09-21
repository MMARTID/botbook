/**
 * Utilidades de teléfono compartidas por el alta y por Ajustes. El backend
 * solo acepta E.164; aquí se perdona lo que escribe un dueño de peluquería
 * («600 123 456», «0034…») y se convierte antes de enviarlo.
 */

/** La misma expresión que valida el backend (`E164_PHONE_REGEX`). */
export const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

/**
 * Convierte lo que escribe la persona a E.164 o devuelve `null` si no puede.
 * - «600 123 456» / «600123456» → «+34600123456» (9 dígitos sin prefijo = España)
 * - «+34 600 123 456» → «+34600123456»
 * - «0034600123456» y «34600123456» → «+34600123456»
 * - «+33 6 12 34 56 78» → «+33612345678»
 * - «12345» → `null`
 */
export function normalizarMovil(entrada: string): string | null {
  const compacto = entrada.replace(/[\s.\-()]/g, "");
  if (compacto === "") return null;

  let candidato: string;
  if (compacto.startsWith("+")) {
    candidato = compacto;
  } else if (compacto.startsWith("00")) {
    candidato = `+${compacto.slice(2)}`;
  } else if (/^\d{9}$/.test(compacto)) {
    candidato = `+34${compacto}`;
  } else if (/^34\d{9}$/.test(compacto)) {
    candidato = `+${compacto}`;
  } else {
    candidato = compacto;
  }

  return E164_PHONE_REGEX.test(candidato) ? candidato : null;
}

/** Un fijo español (8xx / 9xx) no tiene WhatsApp: seguramente es el del local. */
export function esFijoEspanol(e164: string): boolean {
  return /^\+34[89]\d{8}$/.test(e164);
}

/** Un móvil español (6xx / 7xx). */
export function esMovilEspanol(e164: string): boolean {
  return /^\+34[67]\d{8}$/.test(e164);
}

/**
 * Tipo de línea de clientes que se propone en el alta a partir del teléfono
 * que trae Google Places (PLAN-TELEFONIA-UX.md § 5, fase 1): un fijo español
 * es «el fijo del local» y un móvil español, «un móvil de trabajo». Con
 * cualquier otra cosa (sin teléfono, extranjero) no se propone nada y el
 * dueño elige.
 */
export function inferirTipoDeLinea(
  telefono: string | null | undefined
): "fijo" | "movil_trabajo" | null {
  if (!telefono) return null;
  const normalizado = normalizarMovil(telefono);
  if (!normalizado) return null;
  if (esFijoEspanol(normalizado)) return "fijo";
  if (esMovilEspanol(normalizado)) return "movil_trabajo";
  return null;
}

/**
 * Presenta un E.164 para leerlo: «+34 930 453 218». Fuera de España se agrupa
 * de tres en tres tras el prefijo, que es lo más legible sin conocer el plan
 * de numeración de cada país.
 */
export function formatearMovil(e164: string): string {
  const europeo = e164.match(/^\+(\d{2})(\d{9})$/);
  if (europeo) {
    const [, prefijo, digitos] = europeo;
    return `+${prefijo} ${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6, 9)}`;
  }
  if (!e164.startsWith("+")) return e164;
  const cuerpo = e164.slice(1);
  const prefijo = cuerpo.slice(0, 2);
  const resto = cuerpo.slice(2).replace(/(\d{3})(?=\d)/g, "$1 ");
  return `+${prefijo} ${resto}`.trim();
}

/**
 * Qué hacer con `Business.customerLineType` cuando el dueño cambia la línea
 * de clientes desde Ajustes. La tarjeta de desvío enseña los códigos según
 * ese tipo, así que un fijo que pasa a ser un móvil (o al revés) no puede
 * quedarse con el tipo antiguo.
 *
 * - `undefined`: no hay que tocarlo (mismo tipo, sin tipo aún, «alhabla»,
 *   o un número del que no sabemos nada, como uno extranjero).
 * - `"fijo"`: el número nuevo es un fijo español y antes era un móvil.
 * - `null`: el número nuevo es un móvil español y antes era un fijo; hay
 *   que volver a preguntar si es de trabajo o personal.
 */
export function tipoDeLineaTrasCambiarTelefono(
  actual: "fijo" | "movil_trabajo" | "movil_personal" | "alhabla" | null,
  nuevoTelefono: string
): "fijo" | null | undefined {
  if (actual === null || actual === "alhabla") return undefined;
  const inferido = inferirTipoDeLinea(nuevoTelefono);
  if (inferido === null) return undefined;
  if (inferido === "fijo") return actual === "fijo" ? undefined : "fijo";
  return actual === "fijo" ? null : undefined;
}
