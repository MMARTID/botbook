// Traducción entre el dominio (NuevoEventoDeCalendario, intervalos ocupados,
// eventos próximos) e iCalendar (RFC 5545), que es lo que habla CalDAV.
// Funciones puras sobre ical.js: sin red, sin prisma, testeables a pelo.
import ICAL from "ical.js";
import type {
  CalendarBusyInterval,
  EventoProximo,
  NuevoEventoDeCalendario,
} from "../CalendarProvider.js";

/** UID del VEVENT: determinista si hay clave de idempotencia (así un reintento
 * choca con el mismo objeto y no duplica), aleatorio si no. */
export function uidDeEvento(idempotencyDigest: string | null): string {
  const base = idempotencyDigest ?? crypto.randomUUID();
  return `alhabla-${base}@alhabla.ai`;
}

/** Nombre del fichero .ics dentro del calendario (el href del evento es
 * `${calendarUrl}${nombreDeFichero}`). */
export function nombreDeFichero(uid: string): string {
  return `${uid.replace(/@alhabla\.ai$/, "")}.ics`;
}

/** VCALENDAR con un VEVENT: fechas en UTC (`Z`), alarmas de aviso al dueño
 * y contenido ya calculado por el servicio. No añade ATTENDEE a propósito:
 * en iCloud dispararía invitaciones por correo desde la cuenta del negocio. */
export function construirIcs(evento: NuevoEventoDeCalendario, uid: string) {
  const vcalendar = new ICAL.Component("vcalendar");
  vcalendar.addPropertyWithValue("version", "2.0");
  vcalendar.addPropertyWithValue(
    "prodid",
    "-//Alhabla//Recepcionista de voz//ES"
  );

  const vevent = new ICAL.Component("vevent");
  vevent.addPropertyWithValue("uid", uid);
  vevent.addPropertyWithValue(
    "dtstamp",
    ICAL.Time.fromJSDate(new Date(), true)
  );
  vevent.addPropertyWithValue(
    "dtstart",
    ICAL.Time.fromJSDate(evento.startTime, true)
  );
  vevent.addPropertyWithValue(
    "dtend",
    ICAL.Time.fromJSDate(evento.endTime, true)
  );
  vevent.addPropertyWithValue("summary", evento.summary);
  vevent.addPropertyWithValue("description", evento.description);
  vevent.addPropertyWithValue("transp", "OPAQUE");

  // Mismas dos alarmas que en Google: una "ahora" (aviso de que ha entrado
  // una reserva) y otra antes de la cita; deduplicadas por minutos.
  const minutos = new Set<number>();
  for (const m of [
    evento.recordatorioInmediatoMinutos,
    evento.recordatorioPrevioMinutos,
  ]) {
    if (m !== null && m >= 0) minutos.add(m);
  }
  for (const m of minutos) {
    const valarm = new ICAL.Component("valarm");
    valarm.addPropertyWithValue("action", "DISPLAY");
    valarm.addPropertyWithValue("description", evento.summary);
    valarm.addPropertyWithValue("trigger", ICAL.Duration.fromSeconds(-m * 60));
    vevent.addSubcomponent(valarm);
  }

  vcalendar.addSubcomponent(vevent);
  return vcalendar.toString();
}

type Ocurrencia = {
  start: Date;
  end: Date;
  summary: string;
  location: string | null;
  esDeDiaCompleto: boolean;
  transparente: boolean;
  cancelado: boolean;
};

/** Expande cada VEVENT del ICS en ocurrencias dentro de la ventana. Si el
 * servidor ya expandió las recurrencias (CalDAV `expand`), cada objeto llega
 * sin RRULE y se trata como un evento suelto. Un ICS que no parsea se salta
 * (una entrada corrupta no puede tumbar la consulta de disponibilidad). */
function ocurrencias(
  ics: string,
  ventana: { timeMin: Date; timeMax: Date }
): Ocurrencia[] {
  let vcalendar: ICAL.Component;
  try {
    vcalendar = new ICAL.Component(ICAL.parse(ics));
  } catch {
    return [];
  }
  // Las zonas del propio objeto (iCloud incluye VTIMEZONE junto a cada
  // DTSTART;TZID=...). Sin registrarlas, una hora de pared con TZID se
  // interpretaría como hora local del proceso: en Cloud Run (UTC) las citas
  // de Madrid se desplazarían dos horas.
  for (const vtimezone of vcalendar.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(vtimezone);
    } catch {
      // Zona malformada: ical.js resolverá lo que pueda.
    }
  }
  const salida: Ocurrencia[] = [];
  const fin = (inicio: ICAL.Time, finOpcional: ICAL.Time | null) =>
    finOpcional ?? (inicio.isDate ? inicio.clone().adjust(1, 0, 0, 0) : inicio);
  // Un día completo se ancla a medianoche UTC (como hace el adaptador de
  // Google con `start.date`), no a la medianoche local del proceso.
  const aFecha = (t: ICAL.Time): Date =>
    t.isDate ? new Date(Date.UTC(t.year, t.month - 1, t.day)) : t.toJSDate();
  const datosDe = (evento: ICAL.Event) => {
    const vevent = evento.component;
    return {
      summary: evento.summary ?? "",
      location: evento.location ?? null,
      esDeDiaCompleto: evento.startDate.isDate,
      transparente:
        String(vevent.getFirstPropertyValue("transp") ?? "").toUpperCase() ===
        "TRANSPARENT",
      cancelado:
        String(vevent.getFirstPropertyValue("status") ?? "").toUpperCase() ===
        "CANCELLED",
    };
  };

  // Un objeto puede traer varios VEVENT con el mismo UID: el maestro (con
  // RRULE) y una excepción por cada cita suelta de la serie que el dueño
  // movió o editó (RECURRENCE-ID). Si cada uno se expandiera por su cuenta,
  // la ocurrencia sustituida contaría dos veces: en su hora original (por
  // la serie) y en la nueva (por la excepción), y un hueco libre se
  // rechazaría (#144). Se agrupan por UID y las excepciones se relacionan
  // con su maestro antes de expandir; ical.js entonces devuelve la
  // excepción en lugar de la ocurrencia original.
  const maestros = new Map<string, ICAL.Event>();
  const excepciones: ICAL.Event[] = [];
  const sueltos: ICAL.Event[] = [];
  for (const vevent of vcalendar.getAllSubcomponents("vevent")) {
    let evento: ICAL.Event;
    try {
      evento = new ICAL.Event(vevent);
      if (!evento.startDate) continue;
    } catch {
      continue;
    }
    if (evento.isRecurrenceException()) {
      excepciones.push(evento);
    } else if (evento.isRecurring() && evento.uid) {
      maestros.set(evento.uid, evento);
    } else {
      sueltos.push(evento);
    }
  }
  for (const excepcion of excepciones) {
    const maestro = excepcion.uid ? maestros.get(excepcion.uid) : undefined;
    if (!maestro) {
      // Sin maestro en el objeto (el servidor solo devolvió la excepción):
      // es un evento suelto en su hora nueva.
      sueltos.push(excepcion);
      continue;
    }
    try {
      maestro.relateException(excepcion.component);
    } catch {
      sueltos.push(excepcion);
    }
  }

  for (const evento of maestros.values()) {
    const iterador = evento.iterator();
    let siguiente: ICAL.Time | null;
    while ((siguiente = iterador.next())) {
      // `item` es la excepción cuando la ocurrencia fue sustituida: sus
      // fechas, su estado (una cita suelta borrada llega CANCELLED) y su
      // TRANSP mandan sobre los del maestro.
      const detalle = evento.getOccurrenceDetails(siguiente);
      const start = aFecha(detalle.startDate);
      if (start >= ventana.timeMax) break;
      const end = aFecha(fin(detalle.startDate, detalle.endDate));
      if (end <= ventana.timeMin) continue;
      salida.push({ ...datosDe(detalle.item), start, end });
    }
  }
  for (const evento of sueltos) {
    const start = aFecha(evento.startDate);
    const end = aFecha(fin(evento.startDate, evento.endDate));
    if (start < ventana.timeMax && end > ventana.timeMin) {
      salida.push({ ...datosDe(evento), start, end });
    }
  }
  return salida;
}

/** Intervalos ocupados con la MISMA regla que el adaptador de Google: un
 * evento cancelado no cuenta; uno de día completo cuenta siempre (aunque
 * figure como "libre": "VACACIONES" de todo el día es "ese día no trabajo");
 * uno con hora marcado como libre (TRANSP:TRANSPARENT) no cuenta. */
export function intervalosOcupadosDesdeIcs(
  objetos: Array<{ url: string; data: string }>,
  ventana: { timeMin: Date; timeMax: Date }
): CalendarBusyInterval[] {
  const intervalos: CalendarBusyInterval[] = [];
  for (const objeto of objetos) {
    for (const o of ocurrencias(objeto.data, ventana)) {
      if (o.cancelado) continue;
      if (!o.esDeDiaCompleto && o.transparente) continue;
      if (Number.isNaN(o.start.getTime()) || Number.isNaN(o.end.getTime()))
        continue;
      intervalos.push({
        start: o.start,
        end: o.end,
        externalEventId: objeto.url,
      });
    }
  }
  return intervalos;
}

/** Próximos eventos (no cancelados) ordenados por inicio, para el panel. */
export function eventosProximosDesdeIcs(
  objetos: Array<{ url: string; data: string }>,
  ventana: { timeMin: Date; timeMax: Date },
  maxResults: number
): EventoProximo[] {
  const eventos: Array<EventoProximo & { inicio: Date }> = [];
  for (const objeto of objetos) {
    for (const o of ocurrencias(objeto.data, ventana)) {
      if (o.cancelado) continue;
      eventos.push({
        id: objeto.url,
        summary: o.summary,
        start: o.start.toISOString(),
        end: o.end.toISOString(),
        location: o.location,
        htmlLink: null,
        inicio: o.start,
      });
    }
  }
  return eventos
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
    .slice(0, maxResults)
    .map(({ inicio: _inicio, ...evento }) => evento);
}
