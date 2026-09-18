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
  for (const vevent of vcalendar.getAllSubcomponents("vevent")) {
    let evento: ICAL.Event;
    try {
      evento = new ICAL.Event(vevent);
      if (!evento.startDate) continue;
    } catch {
      continue;
    }
    const comun = {
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
    const fin = (inicio: ICAL.Time, finOpcional: ICAL.Time | null) =>
      finOpcional ??
      (inicio.isDate ? inicio.clone().adjust(1, 0, 0, 0) : inicio);
    // Un día completo se ancla a medianoche UTC (como hace el adaptador de
    // Google con `start.date`), no a la medianoche local del proceso.
    const aFecha = (t: ICAL.Time): Date =>
      t.isDate ? new Date(Date.UTC(t.year, t.month - 1, t.day)) : t.toJSDate();

    if (evento.isRecurring()) {
      const iterador = evento.iterator();
      let siguiente: ICAL.Time | null;
      while ((siguiente = iterador.next())) {
        const detalle = evento.getOccurrenceDetails(siguiente);
        const start = aFecha(detalle.startDate);
        if (start >= ventana.timeMax) break;
        const end = aFecha(fin(detalle.startDate, detalle.endDate));
        if (end <= ventana.timeMin) continue;
        salida.push({ ...comun, start, end });
      }
    } else {
      const start = aFecha(evento.startDate);
      const end = aFecha(fin(evento.startDate, evento.endDate));
      if (start < ventana.timeMax && end > ventana.timeMin) {
        salida.push({ ...comun, start, end });
      }
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
