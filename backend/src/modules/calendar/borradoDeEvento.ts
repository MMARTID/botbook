// Rastro de cada borrado de un evento externo. Borrar es best-effort (nuestra
// BD manda), pero no puede ser mudo: un calendario que responde 404 al borrar
// puede tener el evento vivo en otra dirección, y el dueño recibiría los
// avisos de una cita cancelada sin que quedara nada en los logs (cita
// cmub4tmbc, iCloud, octubre de 2026). Nunca lleva datos del cliente.
import type {
  ResultadoDeBorrado,
  VentanaDelEvento,
} from "../../adapters/calendar/CalendarProvider.js";

/** La misma que usan la disponibilidad y la lista de espera para una cita
 * sin duración guardada. */
const DURACION_POR_DEFECTO_MINUTOS = 30;

/** Hora del evento de una cita, para que el adaptador pueda buscarlo si no
 * está en su dirección. */
export function ventanaDeLaCita(
  inicio: Date,
  duracionMinutos: number | null | undefined
): VentanaDelEvento {
  const minutos = duracionMinutos || DURACION_POR_DEFECTO_MINUTOS;
  return { inicio, fin: new Date(inicio.getTime() + minutos * 60_000) };
}

/**
 * Registra lo que pasó al borrar un evento: log si se borró donde decíamos,
 * warn si estaba en otra dirección y warn ruidoso si el calendario dijo que
 * no estaba (o lo borró el dueño, o sigue vivo en otra parte).
 */
export function registrarBorradoDeEvento(input: {
  /** Módulo entre corchetes: "[Booking]", "[Gestor]", "[VoiceTools]"… */
  prefijo: string;
  /** Quién borra: «llamada …», «mover_cita <accionId>», «panel»… */
  etiqueta: string;
  businessId: string;
  /** null/ausente cuando el evento no llegó a tener cita guardada. */
  bookingId?: string | null;
  proveedor: string;
  eventId: string;
  resultado: ResultadoDeBorrado;
}): void {
  const { prefijo, etiqueta, resultado } = input;
  const cita = input.bookingId ? ` de la cita ${input.bookingId}` : "";
  const evento = `el evento ${input.eventId}${cita} del negocio ${input.businessId} (${input.proveedor})`;
  if (resultado.resultado === "no_estaba") {
    console.warn(
      `${prefijo} ${etiqueta}: el calendario respondió ${resultado.estado} al borrar ${evento}: o lo borró el dueño o sigue vivo en otra dirección`
    );
    return;
  }
  if (resultado.eventIdReal && resultado.eventIdReal !== input.eventId) {
    console.warn(
      `${prefijo} ${etiqueta}: borrado ${evento} en otra dirección: el evento estaba en ${resultado.eventIdReal}`
    );
    return;
  }
  console.log(`${prefijo} ${etiqueta}: borrado ${evento}`);
}
