/**
 * El asistente de alta crea el equipo con nombres provisionales («Profesional
 * 1», «Profesional 2»…) que el negocio muchas veces no llega a cambiar. Ese
 * nombre sirve para el panel y para el dueño, pero no para el cliente: una
 * recepcionista que dice «tu cita es con Profesional 1» suena a máquina. Por
 * eso todo lo que va al cliente (resultados de tools, SMS, WhatsApp) pasa el
 * nombre por aquí y, si es provisional, calla el nombre.
 */
export const PATRON_NOMBRE_PROVISIONAL = /^profesional\s*\d+$/i;

export function esNombreProvisional(
  nombre: string | null | undefined
): boolean {
  return (
    typeof nombre === "string" && PATRON_NOMBRE_PROVISIONAL.test(nombre.trim())
  );
}

/** El nombre tal cual si es real; `null` si es el provisional del alta. */
export function nombreParaElCliente(
  nombre: string | null | undefined
): string | null {
  if (!nombre) return null;
  return esNombreProvisional(nombre) ? null : nombre;
}
