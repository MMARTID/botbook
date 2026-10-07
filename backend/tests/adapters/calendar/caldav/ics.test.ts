import { describe, it, expect } from "vitest";
import {
  construirIcs,
  eventosProximosDesdeIcs,
  intervalosOcupadosDesdeIcs,
  nombreDeFichero,
  uidDeEvento,
  uidDesdeNombreDeFichero,
  uidsDesdeIcs,
} from "../../../../src/adapters/calendar/caldav/ics.js";
import type { NuevoEventoDeCalendario } from "../../../../src/adapters/calendar/CalendarProvider.js";

const VENTANA = {
  timeMin: new Date("2026-09-21T00:00:00Z"),
  timeMax: new Date("2026-09-28T00:00:00Z"),
};

function ics(vevent: string) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    vevent,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

const EVENTO: NuevoEventoDeCalendario = {
  summary: "Corte + Barba — Marta; López",
  description:
    "Cliente: Marta López\nTeléfono: +34600111222\n\nCita generada por el asistente virtual de Alhabla.",
  startTime: new Date("2026-09-21T10:00:00Z"),
  endTime: new Date("2026-09-21T10:30:00Z"),
  cliente: {
    nombre: "Marta López",
    telefono: "+34600111222",
    email: "marta@example.com",
  },
  recordatorioInmediatoMinutos: 4320,
  recordatorioPrevioMinutos: 120,
  zonaHoraria: "Europe/Madrid",
  idempotencyDigest: "abc123",
};

describe("uidDeEvento / nombreDeFichero", () => {
  it("con digest el UID es determinista y el fichero deriva de él", () => {
    expect(uidDeEvento("abc123")).toBe("alhabla-abc123@alhabla.ai");
    expect(nombreDeFichero("alhabla-abc123@alhabla.ai")).toBe(
      "alhabla-abc123.ics"
    );
  });

  it("sin digest el UID es aleatorio (dos llamadas no coinciden)", () => {
    expect(uidDeEvento(null)).not.toBe(uidDeEvento(null));
    expect(uidDeEvento(null)).toMatch(/^alhabla-[0-9a-f-]{36}@alhabla\.ai$/);
  });
});

describe("uidDesdeNombreDeFichero", () => {
  const DIGEST =
    "74ad48456ba8a0e0ba5786d18a9e50ffe2b6dbe8e7a9b50dca1d27e54543576b";

  it("es la inversa de nombreDeFichero, con URL absoluta, ruta o nombre suelto", () => {
    const uid = uidDeEvento(DIGEST);
    const fichero = nombreDeFichero(uid);
    expect(uidDesdeNombreDeFichero(fichero)).toBe(uid);
    expect(
      uidDesdeNombreDeFichero(
        `https://caldav.icloud.com/171/calendars/092B/${fichero}`
      )
    ).toBe(`alhabla-${DIGEST}@alhabla.ai`);
    expect(uidDesdeNombreDeFichero(`/171/calendars/092B/${fichero}`)).toBe(uid);
    // También con el UUID aleatorio de un evento sin clave de idempotencia.
    const aleatorio = uidDeEvento(null);
    expect(uidDesdeNombreDeFichero(nombreDeFichero(aleatorio))).toBe(aleatorio);
  });

  it("null si el nombre no es de un evento de Alhabla (nunca se busca un evento ajeno)", () => {
    for (const href of [
      "https://caldav.icloud.com/171/calendars/092B/0F3C9A2E-1B.ics",
      "https://caldav.icloud.com/171/calendars/092B/alhabla-.ics",
      "https://caldav.icloud.com/171/calendars/092B/alhabla-abc.txt",
      "https://caldav.icloud.com/171/calendars/092B/alhabla-xyz.ics",
      "https://caldav.icloud.com/171/calendars/092B/",
      "u",
      "",
    ]) {
      expect(uidDesdeNombreDeFichero(href)).toBeNull();
    }
  });
});

describe("uidsDesdeIcs", () => {
  it("devuelve los UID de los VEVENT sin repetir (maestro y excepción comparten UID)", () => {
    const serie = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:alhabla-abc@alhabla.ai",
      "DTSTART:20260922T090000Z",
      "RRULE:FREQ=DAILY;COUNT=3",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:alhabla-abc@alhabla.ai",
      "RECURRENCE-ID:20260923T090000Z",
      "DTSTART:20260923T100000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(uidsDesdeIcs(serie)).toEqual(["alhabla-abc@alhabla.ai"]);
    expect(
      uidsDesdeIcs(construirIcs(EVENTO, "alhabla-abc123@alhabla.ai"))
    ).toEqual(["alhabla-abc123@alhabla.ai"]);
  });

  it("un ICS sin UID o que no parsea no tiene UIDs", () => {
    expect(uidsDesdeIcs(ics("DTSTART:20260922T090000Z"))).toEqual([]);
    expect(uidsDesdeIcs("esto no es iCalendar")).toEqual([]);
  });

  it("varios VCALENDAR seguidos en un mismo objeto: no lanza y no devuelve UIDs (borrarlo por uno borraría los otros)", () => {
    const nuestro = ics(
      "UID:alhabla-abc@alhabla.ai\r\nDTSTART:20261009T080000Z\r\nDTEND:20261009T094000Z"
    );
    const ajeno = ics(
      "UID:cumple-de-la-abuela@icloud.com\r\nDTSTART:20261009T090000Z\r\nDTEND:20261009T100000Z"
    );
    // Antes lanzaba «Cannot read properties of undefined (reading
    // 'length')» al recorrer los VEVENT, fuera del try del parseo.
    expect(uidsDesdeIcs(`${nuestro}\r\n${ajeno}`)).toEqual([]);
    expect(uidsDesdeIcs(`${nuestro}\r\n${nuestro}\r\n${ajeno}`)).toEqual([]);
  });
});

describe("construirIcs", () => {
  const texto = construirIcs(EVENTO, "alhabla-abc123@alhabla.ai");

  it("genera un VEVENT con UID, fechas en UTC y opaco", () => {
    expect(texto).toContain("BEGIN:VCALENDAR");
    expect(texto).toContain("UID:alhabla-abc123@alhabla.ai");
    expect(texto).toContain("DTSTART:20260921T100000Z");
    expect(texto).toContain("DTEND:20260921T103000Z");
    expect(texto).toContain("TRANSP:OPAQUE");
    expect(texto).toContain("PRODID:-//Alhabla//");
  });

  it("escapa comas, puntos y coma y saltos de línea (RFC 5545)", () => {
    expect(texto).toContain("SUMMARY:Corte + Barba — Marta\\; López");
    expect(texto).toContain("DESCRIPTION:Cliente: Marta López\\nTeléfono:");
  });

  it("añade las dos alarmas (aviso inmediato y previo), deduplicadas", () => {
    expect(texto.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(texto).toContain("TRIGGER:-P3D");
    expect(texto).toContain("TRIGGER:-PT2H");
    const igual = construirIcs(
      { ...EVENTO, recordatorioInmediatoMinutos: 120 },
      "u@alhabla.ai"
    );
    expect(igual.match(/BEGIN:VALARM/g)).toHaveLength(1);
    const sinInmediato = construirIcs(
      { ...EVENTO, recordatorioInmediatoMinutos: null },
      "u@alhabla.ai"
    );
    expect(sinInmediato.match(/BEGIN:VALARM/g)).toHaveLength(1);
  });

  it("no añade ATTENDEE aunque haya email (evitaría invitaciones desde iCloud)", () => {
    expect(texto).not.toContain("ATTENDEE");
    expect(texto).not.toContain("marta@example.com");
  });

  it("el ICS generado vuelve a parsearse como un intervalo ocupado", () => {
    const intervalos = intervalosOcupadosDesdeIcs(
      [{ url: "https://x/cal/alhabla-abc123.ics", data: texto }],
      VENTANA
    );
    expect(intervalos).toEqual([
      {
        start: new Date("2026-09-21T10:00:00Z"),
        end: new Date("2026-09-21T10:30:00Z"),
        externalEventId: "https://x/cal/alhabla-abc123.ics",
      },
    ]);
  });
});

describe("intervalosOcupadosDesdeIcs (misma regla que Google)", () => {
  it("evento con hora → ocupado, con el href como externalEventId", () => {
    const r = intervalosOcupadosDesdeIcs(
      [
        {
          url: "https://x/cal/a.ics",
          data: ics(
            "UID:a\r\nDTSTART:20260922T090000Z\r\nDTEND:20260922T093000Z"
          ),
        },
      ],
      VENTANA
    );
    expect(r).toEqual([
      {
        start: new Date("2026-09-22T09:00:00Z"),
        end: new Date("2026-09-22T09:30:00Z"),
        externalEventId: "https://x/cal/a.ics",
      },
    ]);
  });

  it("evento de día completo cuenta como ocupado AUNQUE sea TRANSPARENT (VACACIONES)", () => {
    const r = intervalosOcupadosDesdeIcs(
      [
        {
          url: "https://x/cal/v.ics",
          data: ics(
            "UID:v\r\nDTSTART;VALUE=DATE:20260923\r\nDTEND;VALUE=DATE:20260924\r\nTRANSP:TRANSPARENT\r\nSUMMARY:VACACIONES"
          ),
        },
      ],
      VENTANA
    );
    expect(r).toHaveLength(1);
    expect(r[0].start.toISOString()).toBe("2026-09-23T00:00:00.000Z");
    expect(r[0].end.toISOString()).toBe("2026-09-24T00:00:00.000Z");
  });

  it("evento de día completo sin DTEND dura un día", () => {
    const r = intervalosOcupadosDesdeIcs(
      [{ url: "u", data: ics("UID:d\r\nDTSTART;VALUE=DATE:20260923") }],
      VENTANA
    );
    expect(r[0].end.toISOString()).toBe("2026-09-24T00:00:00.000Z");
  });

  it("evento con hora marcado como libre (TRANSPARENT) no cuenta", () => {
    const r = intervalosOcupadosDesdeIcs(
      [
        {
          url: "u",
          data: ics(
            "UID:t\r\nDTSTART:20260922T090000Z\r\nDTEND:20260922T093000Z\r\nTRANSP:TRANSPARENT"
          ),
        },
      ],
      VENTANA
    );
    expect(r).toEqual([]);
  });

  it("evento cancelado no cuenta", () => {
    const r = intervalosOcupadosDesdeIcs(
      [
        {
          url: "u",
          data: ics(
            "UID:c\r\nDTSTART:20260922T090000Z\r\nDTEND:20260922T093000Z\r\nSTATUS:CANCELLED"
          ),
        },
      ],
      VENTANA
    );
    expect(r).toEqual([]);
  });

  it("expande una RRULE dentro de la ventana y descarta lo de fuera", () => {
    // Semanal desde el 14: en la ventana 21-28 caen el 21 y el 28 no (fin exclusivo).
    const r = intervalosOcupadosDesdeIcs(
      [
        {
          url: "u",
          data: ics(
            "UID:r\r\nDTSTART:20260914T090000Z\r\nDTEND:20260914T100000Z\r\nRRULE:FREQ=WEEKLY;COUNT=10"
          ),
        },
      ],
      VENTANA
    );
    expect(r.map((i) => i.start.toISOString())).toEqual([
      "2026-09-21T09:00:00.000Z",
    ]);
  });

  // #144: mover una sola cita de una serie desde el iPhone deja en el mismo
  // objeto el maestro (RRULE) + una excepción (RECURRENCE-ID). Sin
  // relacionarlas, la ocurrencia sustituida contaba dos veces.
  function serieConExcepcion(excepcion: string) {
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:serie",
      "DTSTART:20260914T090000Z",
      "DTEND:20260914T100000Z",
      "RRULE:FREQ=WEEKLY;COUNT=10",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:serie",
      "RECURRENCE-ID:20260921T090000Z",
      excepcion,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
  }

  it("una cita suelta de una serie movida a otra hora (RECURRENCE-ID) cuenta solo en la hora nueva", () => {
    const r = intervalosOcupadosDesdeIcs(
      [
        {
          url: "u",
          data: serieConExcepcion(
            "DTSTART:20260923T160000Z\r\nDTEND:20260923T170000Z"
          ),
        },
      ],
      VENTANA
    );
    expect(r.map((i) => i.start.toISOString())).toEqual([
      "2026-09-23T16:00:00.000Z",
    ]);
  });

  it("una cita suelta de una serie borrada (excepción CANCELLED) no cuenta ni en su hora original", () => {
    const r = intervalosOcupadosDesdeIcs(
      [
        {
          url: "u",
          data: serieConExcepcion(
            "DTSTART:20260921T090000Z\r\nDTEND:20260921T100000Z\r\nSTATUS:CANCELLED"
          ),
        },
      ],
      VENTANA
    );
    expect(r).toEqual([]);
  });

  it("una excepción sin su maestro en el objeto cuenta como evento suelto en su hora nueva", () => {
    const r = intervalosOcupadosDesdeIcs(
      [
        {
          url: "u",
          data: ics(
            "UID:serie\r\nRECURRENCE-ID:20260921T090000Z\r\nDTSTART:20260923T160000Z\r\nDTEND:20260923T170000Z"
          ),
        },
      ],
      VENTANA
    );
    expect(r.map((i) => i.start.toISOString())).toEqual([
      "2026-09-23T16:00:00.000Z",
    ]);
  });

  it("hora de pared con TZID + VTIMEZONE (como manda iCloud) se convierte al instante correcto", () => {
    const conZona = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VTIMEZONE",
      "TZID:Europe/Madrid",
      "BEGIN:DAYLIGHT",
      "TZOFFSETFROM:+0100",
      "TZOFFSETTO:+0200",
      "DTSTART:19810329T020000",
      "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
      "END:DAYLIGHT",
      "BEGIN:STANDARD",
      "TZOFFSETFROM:+0200",
      "TZOFFSETTO:+0100",
      "DTSTART:19961027T030000",
      "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
      "END:STANDARD",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "UID:z",
      "DTSTART;TZID=Europe/Madrid:20260922T110000",
      "DTEND;TZID=Europe/Madrid:20260922T113000",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const r = intervalosOcupadosDesdeIcs(
      [{ url: "z", data: conZona }],
      VENTANA
    );
    // 11:00 en Madrid (verano, +02:00) son las 09:00Z, sea cual sea la zona
    // del proceso (Cloud Run corre en UTC).
    expect(r[0].start.toISOString()).toBe("2026-09-22T09:00:00.000Z");
    expect(r[0].end.toISOString()).toBe("2026-09-22T09:30:00.000Z");
  });

  it("un objeto que no es iCalendar válido se ignora sin tumbar el resto", () => {
    const r = intervalosOcupadosDesdeIcs(
      [
        { url: "roto", data: "esto no es un ics" },
        {
          url: "ok",
          data: ics(
            "UID:a\r\nDTSTART:20260922T090000Z\r\nDTEND:20260922T093000Z"
          ),
        },
      ],
      VENTANA
    );
    expect(r).toHaveLength(1);
    expect(r[0].externalEventId).toBe("ok");
  });

  it("un evento fuera de la ventana no cuenta", () => {
    const r = intervalosOcupadosDesdeIcs(
      [
        {
          url: "u",
          data: ics(
            "UID:f\r\nDTSTART:20261001T090000Z\r\nDTEND:20261001T093000Z"
          ),
        },
      ],
      VENTANA
    );
    expect(r).toEqual([]);
  });
});

describe("eventosProximosDesdeIcs", () => {
  it("ordena por inicio, recorta a maxResults y omite cancelados", () => {
    const r = eventosProximosDesdeIcs(
      [
        {
          url: "b",
          data: ics(
            "UID:b\r\nDTSTART:20260923T090000Z\r\nDTEND:20260923T093000Z\r\nSUMMARY:Segundo\r\nLOCATION:Sala 2"
          ),
        },
        {
          url: "a",
          data: ics(
            "UID:a\r\nDTSTART:20260922T090000Z\r\nDTEND:20260922T093000Z\r\nSUMMARY:Primero"
          ),
        },
        {
          url: "c",
          data: ics(
            "UID:c\r\nDTSTART:20260922T100000Z\r\nDTEND:20260922T103000Z\r\nSTATUS:CANCELLED"
          ),
        },
        {
          url: "d",
          data: ics(
            "UID:d\r\nDTSTART:20260924T090000Z\r\nDTEND:20260924T093000Z\r\nSUMMARY:Tercero"
          ),
        },
      ],
      VENTANA,
      2
    );
    expect(r).toEqual([
      {
        id: "a",
        summary: "Primero",
        start: "2026-09-22T09:00:00.000Z",
        end: "2026-09-22T09:30:00.000Z",
        location: null,
        htmlLink: null,
      },
      {
        id: "b",
        summary: "Segundo",
        start: "2026-09-23T09:00:00.000Z",
        end: "2026-09-23T09:30:00.000Z",
        location: "Sala 2",
        htmlLink: null,
      },
    ]);
  });
});
