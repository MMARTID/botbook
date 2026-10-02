import { CalendarCheck, CalendarClock, Check, Phone, type LucideIcon } from "lucide-react";
import { escalationReasonChip, etiquetaDeReserva } from "./format";
import { claveDeDia, etiquetaDeDia, horaDelNegocio } from "./fechas-negocio";
import type { Call } from "./types";

export type TonoDeEtiqueta = "morado" | "neutro" | "aviso" | "exito";

/**
 * La etiqueta de una llamada en las listas del móvil: lo que el negocio
 * tiene que saber de un vistazo. Un recado sin atender va primero porque es
 * lo único que pide hacer algo; luego la cita y, si no la hubo, el motivo.
 */
export function etiquetaDeLlamada(
  call: Pick<Call, "booking" | "escalationReason" | "recado">
): { texto: string; tono: TonoDeEtiqueta; icono?: LucideIcon } | null {
  if (call.recado && !call.recado.atendidoAt) {
    return { texto: "Por devolver", tono: "aviso", icono: Phone };
  }
  const reserva = etiquetaDeReserva(call.booking);
  if (reserva === "creada") return { texto: "Reserva creada", tono: "morado", icono: CalendarCheck };
  if (reserva === "modificada") return { texto: "Reserva modificada", tono: "neutro", icono: CalendarClock };
  if (call.recado?.atendidoAt) return { texto: "Devuelta", tono: "exito", icono: Check };
  const motivo = escalationReasonChip(call.escalationReason);
  return motivo ? { texto: motivo, tono: "aviso" } : null;
}

/** El número al que devolver la llamada: el que dejó en el recado si dio
 * otro, si no el de la llamada. */
export function telefonoParaDevolver(call: Pick<Call, "fromNumber" | "recado">) {
  return call.recado?.telefono ?? call.fromNumber ?? null;
}

/** «09:03», «Ayer 20:12» o «29 sep 11:30», en la zona del negocio. */
export function momentoCorto(iso: string, timeZone: string, hoy: string) {
  const clave = claveDeDia(iso, timeZone);
  const hora = horaDelNegocio(iso, timeZone);
  if (clave === hoy) return hora;
  const etiqueta = etiquetaDeDia(clave, hoy);
  if (etiqueta === "Ayer" || etiqueta === "Mañana") return `${etiqueta} ${hora}`;
  const fecha = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone }).format(new Date(iso));
  return `${fecha.replace(".", "")} ${hora}`;
}

/** Enlace `tel:` que marca bien desde el móvil: los 9 dígitos españoles
 * llevan el +34 delante para que funcione también con SIM extranjera. */
export function enlaceTel(telefono: string) {
  const limpio = telefono.replace(/[^\d+]/g, "");
  return `tel:${/^\d{9}$/.test(limpio) ? `+34${limpio}` : limpio}`;
}
