import { CalendarCheck, CalendarClock, Check, Phone, type LucideIcon } from "lucide-react";
import { escalationReasonChip, etiquetaDeReserva } from "./format";
import { claveDeDia, etiquetaDeDia, horaDelNegocio } from "./fechas-negocio";
import type { Call, TranscriptMessage } from "./types";

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

/**
 * La columna «Resultado» del historial de escritorio: la misma etiqueta que
 * el móvil y, si no hay ninguna, cómo acabó la conversación según su
 * clasificación; «Consulta» solo cuando se resolvió sin cita.
 */
export function resultadoDeLlamada(
  call: Pick<Call, "booking" | "escalationReason" | "recado" | "outcome">
): { texto: string; tono: TonoDeEtiqueta; icono?: LucideIcon } {
  const etiqueta = etiquetaDeLlamada(call);
  if (etiqueta) return etiqueta;
  if (call.outcome === "NO_ANSWER") return { texto: "Sin respuesta", tono: "neutro" };
  if (call.outcome === "FRUSTRATED") return { texto: "Sin resolver", tono: "aviso" };
  if (call.outcome === "ESCALATED") return { texto: "Escalada", tono: "aviso" };
  if (call.outcome === "LEAD_CAPTURED") return { texto: "Cliente potencial", tono: "neutro" };
  return { texto: "Consulta", tono: "neutro" };
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

/** `Transcript.messages` es JSON libre: solo valen los objetos de una lista.
 * null si no es una lista (entonces se enseña el texto completo). */
export function parseTranscriptMessages(value: unknown): TranscriptMessage[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is TranscriptMessage => typeof item === "object" && item !== null);
}

/**
 * Por qué se cayó una cita que el cliente pidió (Lead `pending_booking`),
 * dicho para el negocio: si fue algo que puede arreglar (el calendario) o un
 * tropiezo puntual.
 */
export function motivoDeCitaPendiente(failureCode: string | null): string {
  if (failureCode?.includes("RECONNECT_REQUIRED")) {
    return "La conexión con tu agenda estaba caducada en ese momento.";
  }
  if (failureCode === "BOOKING_LOCK_TIMEOUT") {
    return "Había otra reserva en curso para la misma hora.";
  }
  return "No se pudo guardar en la agenda durante la llamada.";
}
