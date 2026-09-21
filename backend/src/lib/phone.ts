/** Formato internacional E.164 (+34600123456) — compartido entre la
 * validación de entrada (PATCH /business/me) y el punto que realmente envía
 * el SMS, para que ambos apliquen la misma regla. Sin esto, un número mal
 * formateado que se colara por cualquier otra vía llegaría a Telnyx sin
 * ninguna comprobación. */
export const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

export function isValidE164Phone(phone: string): boolean {
  return E164_PHONE_REGEX.test(phone);
}

/**
 * Número legible para un texto al cliente: un +34 de nueve dígitos sale en
 * grupos de tres («+34 930 454 394»); cualquier otro se devuelve tal cual.
 */
export function formatearTelefonoLegible(e164: string): string {
  const match = /^\+34(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return match ? `+34 ${match[1]} ${match[2]} ${match[3]}` : e164;
}

/**
 * Fijo geográfico (8xx/9xx con segundo dígito 1-8) o móvil (6xx, 71x-79x)
 * de España: lo único que un negocio puede desviar a su número de Alhabla y
 * lo único a lo que «Comprobar desvío» llama pagando Alhabla. Fuera quedan
 * los 800/900 (gratuitos), 80x/90x (tarificación adicional), 70x (números
 * personales), 5xx (nómadas) y cualquier destino internacional.
 */
export function esLineaDeClientesEspanola(e164: string): boolean {
  return /^\+34(?:6\d{8}|7[1-9]\d{7}|[89][1-8]\d{7})$/.test(e164);
}
