import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import Fastify from "fastify";
import { prisma } from "../../../src/lib/prisma.js";
import { cifrarJson } from "../../../src/lib/cifradoDeCredenciales.js";
import { executeVoiceTool } from "../../../src/modules/voiceTools/service.js";
import { cancelarReserva } from "../../../src/modules/bookings/cancelacion.js";
import { citasDelPanelRoutes } from "../../../src/modules/bookings/citasDelPanel.js";
import { resetDb } from "../helpers/db.js";

// Caso real del 21-09 → 07-10-2026 (negocio cmu71ux6j…, iCloud): una cita
// reservada por la recepcionista de WhatsApp, movida por el dueño desde la
// agenda del panel y cancelada después por el cliente en el chat. El dueño
// dice que iCloud le RECORDÓ la cita horas después de cancelarla.
//
// Todo es real salvo las fronteras: Postgres/Redis de integración, el
// adaptador CalDAV de verdad (tsdav + fetchSoloPublico + fetchVigilado), el
// calendarService, moverReserva por la ruta del panel y cancelarReserva. Lo
// único falso es iCloud: un servidor CalDAV en memoria colgado de `fetch`
// (sin red), el DNS (caldav.icloud.com resuelve a una IP pública de Apple) y
// WhatsApp.

const CONVERSACION = "e0f3038d-8c54-4669-8474-b5d2dfcb3ced";
const CALL_ID_CHAT = `whatsapp:chat:${CONVERSACION}`;
const ETIQUETA_CHAT = `llamada ${CALL_ID_CHAT}`;
const NEGOCIO_ID = "cmu71ux6j0006s6012cfggjby";
const CALENDARIO =
  "https://caldav.icloud.com/10000000001/calendars/0A1B2C3D-0000-4000-8000-000000000001/";
const RUTA_CALENDARIO = new URL(CALENDARIO).pathname;
/** accionId del «movida» de los logs del 05-10 10:13:13. */
const ACCION_REAL = "6ec88ab0-34e5-481a-99e4-71b6730a793b";
/** externalEventId que guarda hoy producción para cmub4tmbc. */
const EVENTO_EN_PRODUCCION = `${CALENDARIO}alhabla-74ad48456ba8a0e0ba5786d18a9e50ffe2b6dbe8e7a9b50dca1d27e54543576b.ics`;
/** externalEventId que guarda producción para cmub4dk6v (la cita anterior). */
const EVENTO_ANTERIOR_EN_PRODUCCION = `${CALENDARIO}alhabla-e91dc128157be600b411d5ae5bb0d4f01c19651d77d32f658681e1285137d8aa.ics`;
const MOVIL_CLIENTE = "+34600111222";

type PeticionCaldav = {
  metodo: string;
  url: string;
  estado: number;
  /** REPORT: el `<c:time-range>` de la calendar-query, tal cual llega. */
  rango?: string;
};

// iCloud falso. Se cuelga de `fetch` ANTES de importar nada de src/: el
// registro de calendarios crea el CaldavCalendarProvider al cargarse y
// captura el `fetch` global de ese momento.
//
// Por defecto cumple el protocolo: guarda cada objeto en la ruta del PUT.
// Con `renombrarAlGuardar()` imita a un servidor que guarda el objeto con
// otro nombre en el mismo calendario y NO lo dice (sin cabecera Location):
// el DELETE del href calculado responde 404 con el evento vivo en otra ruta.
//
// La REPORT (calendar-query) respeta el `<c:time-range>` como iCloud: solo
// devuelve los objetos cuyo evento se solapa con el rango pedido. Así, si
// quien borra pasara una ventana que no contiene el evento, la búsqueda por
// UID no lo encontraría y el evento quedaría huérfano, como en iCloud.
const icloud = vi.hoisted(() => {
  const host = "caldav.icloud.com";
  const objetos = new Map<string, { ics: string; etag: string }>();
  const peticiones: PeticionCaldav[] = [];
  let etags = 0;
  let renombrar = false;
  let renombrados = 0;
  /** Ruta pedida en el PUT → ruta donde se guardó (solo al renombrar). */
  const guardadoEn = new Map<string, string>();

  function rutaDondeGuardar(ruta: string): string {
    if (!renombrar) return ruta;
    const previa = guardadoEn.get(ruta);
    if (previa) return previa;
    renombrados += 1;
    const carpeta = ruta.slice(0, ruta.lastIndexOf("/") + 1);
    const destino = `${carpeta}RENOMBRADO-${renombrados}.ics`;
    guardadoEn.set(ruta, destino);
    return destino;
  }

  /** `20261009T080000Z` (formato de CalDAV y de tsdav) → Date. */
  function fechaCaldav(texto: string): Date {
    const partes = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(texto);
    if (!partes) throw new Error(`iCloud falso: fecha inesperada «${texto}»`);
    const [, anio, mes, dia, horas, minutos, segundos] = partes.map(Number);
    return new Date(Date.UTC(anio, mes - 1, dia, horas, minutos, segundos));
  }

  /** Atributos start/end del `<c:time-range>` del cuerpo de la REPORT, o
   * null si no lleva (entonces se devuelve todo, como dice RFC 4791). */
  function rangoPedido(cuerpo: string): { start: string; end: string } | null {
    const etiqueta = /<(?:[\w-]+:)?time-range\b([^>]*)>/.exec(cuerpo);
    if (!etiqueta) return null;
    const start = /\bstart="([^"]+)"/.exec(etiqueta[1])?.[1];
    const end = /\bend="([^"]+)"/.exec(etiqueta[1])?.[1];
    if (!start || !end) {
      throw new Error(`iCloud falso: time-range incompleto «${etiqueta[0]}»`);
    }
    return { start, end };
  }

  /** ¿El VEVENT del objeto se solapa con el rango? Los .ics los genera
   * construirIcs, siempre con DTSTART y DTEND en UTC. */
  function seSolapa(ics: string, rango: { start: string; end: string }) {
    const propiedad = (nombre: string) => {
      const valor = new RegExp(
        `^${nombre}(?:;[^:\r\n]*)?:(\\d{8}T\\d{6}Z)\r?$`,
        "m"
      ).exec(ics)?.[1];
      if (!valor) throw new Error(`iCloud falso: objeto sin ${nombre} en UTC`);
      return fechaCaldav(valor);
    };
    return (
      propiedad("DTSTART") < fechaCaldav(rango.end) &&
      propiedad("DTEND") > fechaCaldav(rango.start)
    );
  }

  function multistatus(
    rutaCalendario: string,
    rango: { start: string; end: string } | null
  ): string {
    const respuestas = [...objetos.entries()]
      .filter(([ruta]) => ruta.startsWith(rutaCalendario))
      .filter(([, objeto]) => !rango || seSolapa(objeto.ics, rango))
      .map(
        ([ruta, objeto]) =>
          `<d:response><d:href>${ruta}</d:href><d:propstat><d:prop>` +
          `<d:getetag>${objeto.etag}</d:getetag>` +
          `<c:calendar-data><![CDATA[${objeto.ics}]]></c:calendar-data>` +
          `</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`
      )
      .join("");
    return `<?xml version="1.0" encoding="UTF-8"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${respuestas}</d:multistatus>`;
  }

  function responder(metodo: string, url: URL, init: RequestInit): Response {
    if (url.host !== host) {
      return new Response("host desconocido", { status: 404 });
    }
    const ruta = decodeURIComponent(url.pathname);
    const cabeceras = new Headers(init.headers);
    if (metodo === "PUT") {
      const destino = rutaDondeGuardar(ruta);
      if (cabeceras.get("if-none-match") === "*" && objetos.has(destino)) {
        return new Response(null, { status: 412 });
      }
      etags += 1;
      const etag = `"etag-${etags}"`;
      objetos.set(destino, { ics: String(init.body ?? ""), etag });
      return new Response(null, { status: 201, headers: { ETag: etag } });
    }
    if (metodo === "DELETE") {
      if (!objetos.delete(ruta)) return new Response(null, { status: 404 });
      return new Response(null, { status: 204 });
    }
    if (metodo === "REPORT") {
      // calendar-query: lo guardado en el calendario que se solapa con el
      // time-range pedido.
      const rango = rangoPedido(String(init.body ?? ""));
      return new Response(multistatus(ruta, rango), {
        status: 207,
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      });
    }
    return new Response(null, { status: 405 });
  }

  const fetchFalso = async (
    entrada: string | URL | Request,
    init: RequestInit = {}
  ): Promise<Response> => {
    const url = new URL(
      typeof entrada === "string"
        ? entrada
        : entrada instanceof URL
          ? entrada.toString()
          : entrada.url
    );
    const metodo = (init.method ?? "GET").toUpperCase();
    const respuesta = responder(metodo, url, init);
    const rango =
      metodo === "REPORT" ? rangoPedido(String(init.body ?? "")) : null;
    peticiones.push({
      metodo,
      url: url.toString(),
      estado: respuesta.status,
      ...(rango ? { rango: `${rango.start}–${rango.end}` } : {}),
    });
    return respuesta;
  };
  vi.stubGlobal("fetch", fetchFalso);

  return {
    objetos,
    peticiones,
    /** URLs absolutas de los .ics que quedan en el calendario. */
    hrefs: () => [...objetos.keys()].map((ruta) => `https://${host}${ruta}`),
    ics: (href: string) => objetos.get(new URL(href).pathname)?.ics ?? null,
    renombrarAlGuardar: () => {
      renombrar = true;
    },
    reiniciar: () => {
      objetos.clear();
      peticiones.length = 0;
      etags = 0;
      renombrar = false;
      renombrados = 0;
      guardadoEn.clear();
    },
  };
});

// El guardián anti-SSRF resuelve el nombre antes de cada petición: sin red,
// caldav.icloud.com resuelve a una IP pública de Apple.
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "17.253.144.10", family: 4 }]),
}));

// Solo para la petición que mueve la cita: el accionId del caso real, así el
// evento nuevo se llama como se habría llamado en producción.
const uuidFijo = vi.hoisted(() => ({ siguiente: null as string | null }));
vi.mock("node:crypto", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:crypto")>();
  const randomUUID = () => {
    if (uuidFijo.siguiente) {
      const valor = uuidFijo.siguiente;
      uuidFijo.siguiente = null;
      return valor as ReturnType<typeof real.randomUUID>;
    }
    return real.randomUUID();
  };
  return { ...real, default: { ...real, randomUUID }, randomUUID };
});

// Sin cambiar nada: apunta con qué entradas se calcula cada clave de
// idempotencia, para poder recalcular a mano el nombre de cada .ics.
const clavesCalculadas = vi.hoisted(
  () => [] as Array<{ entrada: unknown; clave: string }>
);
vi.mock("../../../src/lib/calendarIdempotency.js", async (importOriginal) => {
  const real =
    await importOriginal<
      typeof import("../../../src/lib/calendarIdempotency.js")
    >();
  return {
    ...real,
    buildCalendarIdempotencyKey: (
      entrada: Parameters<typeof real.buildCalendarIdempotencyKey>[0]
    ) => {
      const clave = real.buildCalendarIdempotencyKey(entrada);
      clavesCalculadas.push({ entrada: { ...entrada }, clave });
      return clave;
    },
  };
});

vi.mock("../../../src/adapters/whatsapp/WhatsAppAdapter.js", () => ({
  whatsappAdapter: {
    isConfigured: vi.fn(() => true),
    sendTemplate: vi.fn(async () => ({ id: "msg-falso" })),
    sendText: vi.fn(async () => ({ id: "msg-falso" })),
    sendInteractiveButtons: vi.fn(async () => ({ id: "msg-falso" })),
    sendContacts: vi.fn(async () => ({ id: "msg-falso" })),
    getConversationWindow: vi.fn(async () => null),
    listTemplates: vi.fn(async () => []),
  },
}));

/** Lunes a sábado de 09:00 a 20:00: el 10-10-2026 de la cita anterior es
 * sábado. */
const HORARIO = {
  version: 1,
  week: {
    monday: { enabled: true, intervals: [{ start: "09:00", end: "20:00" }] },
    tuesday: { enabled: true, intervals: [{ start: "09:00", end: "20:00" }] },
    wednesday: { enabled: true, intervals: [{ start: "09:00", end: "20:00" }] },
    thursday: { enabled: true, intervals: [{ start: "09:00", end: "20:00" }] },
    friday: { enabled: true, intervals: [{ start: "09:00", end: "20:00" }] },
    saturday: { enabled: true, intervals: [{ start: "09:00", end: "20:00" }] },
    sunday: { enabled: false, intervals: [] },
  },
  exceptions: [],
};

function sha256(texto: string): string {
  return createHash("sha256").update(texto).digest("hex");
}

/** Href del .ics que crea el adaptador CalDAV: buildCalendarIdempotencyKey
 * (sha256 de callId, inicio, duración y distintivo separados por U+0000, no
 * por espacios) y hashDeIdempotencia (sha256 otra vez) →
 * `alhabla-<hex>.ics`. */
function hrefEsperado(partes: Array<string | number>): string {
  return `${CALENDARIO}alhabla-${sha256(sha256(partes.join("\0")))}.ics`;
}

function hora(iso: string) {
  vi.setSystemTime(new Date(iso));
}

/** «MÉTODO url [rango] → estado»: el rango solo en las REPORT. */
function describirPeticion(p: PeticionCaldav): string {
  const rango = p.rango ? ` [${p.rango}]` : "";
  return `${p.metodo} ${p.url}${rango} → ${p.estado}`;
}

let marca = 0;
/** Peticiones al iCloud falso desde la última llamada. */
function peticionesNuevas(): PeticionCaldav[] {
  const nuevas = icloud.peticiones.slice(marca);
  marca = icloud.peticiones.length;
  return nuevas;
}

let marcaDeClaves = 0;
/** Claves de idempotencia calculadas desde la última llamada, con el .ics
 * que les corresponde (`alhabla-<sha256(clave)>.ics`). */
function clavesNuevas() {
  const nuevas = clavesCalculadas.slice(marcaDeClaves);
  marcaDeClaves = clavesCalculadas.length;
  return nuevas.map(({ entrada, clave }) => ({
    entrada,
    ics: `alhabla-${sha256(clave)}.ics`,
  }));
}

let marcaDeErrores = 0;
/** console.error desde la última llamada (los best-effort de calendario
 * dejan ahí sus fallos). */
function erroresNuevos(): string[] {
  const llamadas = vi.mocked(console.error).mock.calls;
  const nuevos = llamadas.slice(marcaDeErrores);
  marcaDeErrores = llamadas.length;
  return nuevos.map((argumentos) => argumentos.map(String).join(" "));
}

let marcaDeAvisos = 0;
/** console.warn desde la última llamada (un evento que no estaba donde
 * decíamos, o que estaba en otra dirección, deja rastro ahí). */
function avisosNuevos(): string[] {
  const llamadas = vi.mocked(console.warn).mock.calls;
  const nuevos = llamadas.slice(marcaDeAvisos);
  marcaDeAvisos = llamadas.length;
  return nuevos.map((argumentos) => argumentos.map(String).join(" "));
}

function alarmas(ics: string | null): string[] {
  return (ics ?? "")
    .split(/\r?\n/)
    .filter((linea) => linea.startsWith("TRIGGER"));
}

async function citaPorCall(callId: string) {
  return prisma.booking.findUniqueOrThrow({
    where: { callId },
    select: {
      id: true,
      programedAt: true,
      durationMinutes: true,
      isCancelled: true,
      cancelledBy: true,
      externalEventId: true,
      externalCalendarProvider: true,
      externalCalendarId: true,
    },
  });
}

async function panel() {
  const fastify = Fastify();
  fastify.decorate("authenticate", async (request: any) => {
    request.user = { businessId: NEGOCIO_ID };
  });
  await fastify.register(citasDelPanelRoutes);
  return fastify;
}

describe("cita de WhatsApp movida desde el panel y cancelada por el cliente (iCloud falso)", () => {
  /** Lo que pasa en cada paso; se imprime al terminar, también si falla. */
  const informe: string[] = [];
  /** Avisos de cada paso, para las comprobaciones (anotar los consume). */
  let avisosDelPaso: string[] = [];
  const anotar = (titulo: string, extra: Record<string, unknown> = {}) => {
    avisosDelPaso = avisosNuevos();
    informe.push(
      `\n== ${titulo}\n` +
        JSON.stringify(
          {
            ...extra,
            clavesDeIdempotencia: clavesNuevas(),
            errores: erroresNuevos(),
            avisos: avisosDelPaso,
            peticiones: peticionesNuevas().map(describirPeticion),
            objetosEnIcloud: icloud.hrefs(),
          },
          null,
          2
        )
    );
  };

  beforeEach(async () => {
    // Solo Date: Redis, Prisma y los timeouts siguen con el reloj real.
    vi.useFakeTimers({ toFake: ["Date"] });
    hora("2026-09-21T10:40:00Z");
    await resetDb();
    icloud.reiniciar();
    marca = 0;
    clavesCalculadas.length = 0;
    marcaDeClaves = 0;
    // Espías sin silenciar: errores y avisos se siguen viendo en la salida.
    vi.spyOn(console, "error");
    marcaDeErrores = 0;
    vi.spyOn(console, "warn");
    marcaDeAvisos = 0;
    informe.length = 0;
    avisosDelPaso = [];

    await prisma.business.create({
      data: {
        id: NEGOCIO_ID,
        name: "Salón del caso real",
        phone: "+34910000001",
        timezone: "Europe/Madrid",
        schedule: HORARIO as unknown as object,
        bookingCapacity: 1,
        subscriptionStatus: "ACTIVE",
        calendarProvider: "caldav",
        calendarConnections: {
          create: {
            provider: "caldav",
            calendarId: CALENDARIO,
            credentials: cifrarJson({
              provider: "caldav",
              serverUrl: "https://caldav.icloud.com",
              username: "dueno@icloud.com",
              appPassword: "aaaa-bbbb-cccc-dddd",
            }),
            connected: true,
            accountEmail: "dueno@icloud.com",
          },
        },
      },
    });
    await prisma.professional.create({
      data: { businessId: NEGOCIO_ID, name: "Profesional 1", active: true },
    });
    // Las dos conversaciones de chat del cliente, con los ids de producción.
    await prisma.call.create({
      data: {
        id: "cmub4bo9s002js601gun25q49",
        businessId: NEGOCIO_ID,
        callId: "whatsapp:chat:conversacion-de-las-10-44",
        voiceProvider: "whatsapp",
        fromNumber: MOVIL_CLIENTE,
        status: "IN_PROGRESS",
      },
    });
    await prisma.call.create({
      data: {
        id: "cmub4scu7004ms6017964787o",
        businessId: NEGOCIO_ID,
        callId: CALL_ID_CHAT,
        voiceProvider: "whatsapp",
        fromNumber: MOVIL_CLIENTE,
        status: "IN_PROGRESS",
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(console.error).mockRestore();
    vi.mocked(console.warn).mockRestore();
    console.log(`[Test] Cronología contra el iCloud falso:${informe.join("")}`);
  });

  it("al mover queda guardado el evento nuevo y borrado el viejo; al cancelar no queda ningún .ics", async () => {
    // 21-09 10:44 — primera cita del cliente (cmub4dk6v): sábado 10-10 a
    // las 09:00, 90 min, por el chat anterior.
    hora("2026-09-21T10:45:00Z");
    const primera = await executeVoiceTool({
      businessId: NEGOCIO_ID,
      toolName: "book_appointment",
      callId: "whatsapp:chat:conversacion-de-las-10-44",
      callLabel: "llamada whatsapp:chat:conversacion-de-las-10-44",
      params: {
        clientName: "Cliente del caso",
        startDateTime: "2026-10-10T09:00:00+02:00",
        durationMinutes: 90,
        smsConsent: true,
      },
    });
    expect(primera.result?.success).toBe(true);
    const anterior = await citaPorCall("cmub4bo9s002js601gun25q49");
    anotar("21-09 10:45 reserva cmub4dk6v (chat anterior)", {
      externalEventId: anterior.externalEventId,
    });
    // Mismo nombre que guarda producción: la reproducción es fiel.
    expect(anterior.externalEventId).toBe(EVENTO_ANTERIOR_EN_PRODUCCION);

    // 21-09 10:58:25 — cambio de cita por chat: cancelar + reservar.
    hora("2026-09-21T10:58:25Z");
    expect(
      await cancelarReserva({
        bookingId: anterior.id,
        businessId: NEGOCIO_ID,
        cancelledBy: "client_chat",
        etiqueta: ETIQUETA_CHAT,
      })
    ).toEqual({ resultado: "cancelada" });
    anotar("21-09 10:58:25 cancela cmub4dk6v (client_chat)");

    // 21-09 10:58:28 — la cita del caso (cmub4tmbc), 100 min. La hora
    // original no se conoce (hoy está movida): se supone el viernes 09-10 a
    // las 10:00.
    hora("2026-09-21T10:58:28Z");
    const reserva = await executeVoiceTool({
      businessId: NEGOCIO_ID,
      toolName: "book_appointment",
      callId: CALL_ID_CHAT,
      callLabel: ETIQUETA_CHAT,
      params: {
        clientName: "Cliente del caso",
        startDateTime: "2026-10-09T10:00:00+02:00",
        durationMinutes: 100,
        smsConsent: true,
      },
    });
    expect(reserva.result?.success).toBe(true);
    const original = await citaPorCall("cmub4scu7004ms6017964787o");
    const eventoOriginal = original.externalEventId;
    anotar("21-09 10:58:28 reserva cmub4tmbc (chat e0f3038d)", {
      externalEventId: eventoOriginal,
    });
    expect(eventoOriginal).toBe(
      hrefEsperado([
        "cmub4scu7004ms6017964787o",
        "2026-10-09T10:00:00+02:00",
        100,
      ])
    );
    expect(original.externalCalendarProvider).toBe("caldav");
    expect(original.externalCalendarId).toBe(CALENDARIO);
    expect(icloud.hrefs()).toEqual([eventoOriginal]);

    // 05-10 10:12–10:13 — el dueño arrastra la cita en la agenda del panel
    // al miércoles 07-10 a las 10:45: dos comprobaciones y el movimiento.
    const fastify = await panel();
    const mover = (body: object) =>
      fastify.inject({
        method: "POST",
        url: `/business/me/bookings/${original.id}/mover`,
        payload: body,
      });
    hora("2026-10-05T10:12:14Z");
    const comprobacion1 = await mover({
      fechaHora: "2026-10-07T10:45",
      soloComprobar: true,
    });
    hora("2026-10-05T10:13:08Z");
    const comprobacion2 = await mover({
      fechaHora: "2026-10-07T10:45",
      soloComprobar: true,
    });
    anotar("05-10 10:12:14 y 10:13:08 POST /mover soloComprobar", {
      respuestas: [comprobacion1.statusCode, comprobacion2.statusCode],
    });
    expect(comprobacion1.statusCode).toBe(200);
    expect(comprobacion2.statusCode).toBe(200);

    hora("2026-10-05T10:13:11Z");
    uuidFijo.siguiente = ACCION_REAL;
    const movida = await mover({ fechaHora: "2026-10-07T10:45" });
    const trasMover = await citaPorCall("cmub4scu7004ms6017964787o");
    const formulaMover = hrefEsperado([
      `panel:${ACCION_REAL}`,
      "2026-10-07T08:45:00.000Z",
      100,
      ACCION_REAL,
    ]);
    anotar("05-10 10:13:11 POST /mover (accionId real)", {
      respuesta: movida.statusCode,
      mensaje: movida.json().mensaje ?? movida.json().error,
      programedAt: trasMover.programedAt.toISOString(),
      externalEventIdAntes: eventoOriginal,
      externalEventIdDespues: trasMover.externalEventId,
      formulaMover,
      coincideConProduccion74ad:
        trasMover.externalEventId === EVENTO_EN_PRODUCCION,
      alarmasDelEventoGuardado: alarmas(
        trasMover.externalEventId ? icloud.ics(trasMover.externalEventId) : null
      ),
    });
    expect(movida.statusCode).toBe(200);
    expect(trasMover.programedAt.toISOString()).toBe(
      "2026-10-07T08:45:00.000Z"
    );
    // Lo correcto: la cita apunta al evento nuevo, que existe, y el viejo ya
    // no está en iCloud.
    expect(trasMover.externalEventId).not.toBe(eventoOriginal);
    expect(trasMover.externalEventId).not.toBeNull();
    expect(icloud.hrefs()).toEqual([trasMover.externalEventId]);
    // El evento creado al mover es el 74ad… que guarda producción: la cita
    // del caso SÍ quedó apuntando al evento nuevo.
    expect(trasMover.externalEventId).toBe(formulaMover);
    expect(trasMover.externalEventId).toBe(EVENTO_EN_PRODUCCION);

    // 06-10 09:14:40 — el cliente cancela por el chat.
    hora("2026-10-06T09:14:40Z");
    const cancelacion = await cancelarReserva({
      bookingId: original.id,
      businessId: NEGOCIO_ID,
      cancelledBy: "client_chat",
      etiqueta: ETIQUETA_CHAT,
    });
    const final = await citaPorCall("cmub4scu7004ms6017964787o");
    anotar("06-10 09:14:40 cancela cmub4tmbc (client_chat)", {
      resultado: cancelacion.resultado,
      isCancelled: final.isCancelled,
      cancelledBy: final.cancelledBy,
      externalEventId: final.externalEventId,
    });
    expect(cancelacion).toEqual({ resultado: "cancelada" });
    expect(final.isCancelled).toBe(true);
    // Lo que el dueño no debería volver a ver: ningún evento en iCloud.
    expect(icloud.hrefs()).toEqual([]);
    await fastify.close();
  });

  // La causa que sí deja huérfanos: un servidor que guarda el objeto con otro
  // nombre sin decirlo. Antes, el DELETE del href calculado respondía 404,
  // el adaptador lo daba por bueno sin dejar rastro y el evento seguía vivo
  // (y avisando al dueño) en la otra ruta. Ahora lo busca por UID en la hora
  // de la cita, lo borra donde esté y lo registra.
  it("variante: iCloud guarda cada evento en otra ruta sin Location; al mover y al cancelar se borra donde esté y queda registrado", async () => {
    icloud.renombrarAlGuardar();
    const fastify = await panel();

    // 21-09 10:58:28 — la cita del caso, reservada por el chat.
    hora("2026-09-21T10:58:28Z");
    const reserva = await executeVoiceTool({
      businessId: NEGOCIO_ID,
      toolName: "book_appointment",
      callId: CALL_ID_CHAT,
      callLabel: ETIQUETA_CHAT,
      params: {
        clientName: "Cliente del caso",
        startDateTime: "2026-10-09T10:00:00+02:00",
        durationMinutes: 100,
        smsConsent: true,
      },
    });
    expect(reserva.result?.success).toBe(true);
    const original = await citaPorCall("cmub4scu7004ms6017964787o");
    const eventoOriginal = original.externalEventId;
    const rutaRealOriginal = `https://caldav.icloud.com${RUTA_CALENDARIO}RENOMBRADO-1.ics`;
    anotar("21-09 10:58:28 reserva (iCloud renombra)", {
      externalEventId: eventoOriginal,
    });
    // Lo guardado y lo que hay en iCloud no coinciden: es el escenario.
    expect(eventoOriginal).toBe(
      hrefEsperado([
        "cmub4scu7004ms6017964787o",
        "2026-10-09T10:00:00+02:00",
        100,
      ])
    );
    expect(icloud.hrefs()).toEqual([rutaRealOriginal]);

    // 05-10 10:13:11 — el dueño la mueve desde el panel.
    hora("2026-10-05T10:13:11Z");
    uuidFijo.siguiente = ACCION_REAL;
    const movida = await fastify.inject({
      method: "POST",
      url: `/business/me/bookings/${original.id}/mover`,
      payload: { fechaHora: "2026-10-07T10:45" },
    });
    const trasMover = await citaPorCall("cmub4scu7004ms6017964787o");
    const rutaRealMovida = `https://caldav.icloud.com${RUTA_CALENDARIO}RENOMBRADO-2.ics`;
    const peticionesAlMover = icloud.peticiones
      .slice(marca)
      .map(describirPeticion);
    anotar("05-10 10:13:11 POST /mover (iCloud renombra)", {
      respuesta: movida.statusCode,
      externalEventIdDespues: trasMover.externalEventId,
    });
    expect(movida.statusCode).toBe(200);
    expect(trasMover.externalEventId).toBe(EVENTO_EN_PRODUCCION);
    // El evento viejo se borró en su ruta real, buscado por UID en la hora
    // ANTERIOR de la cita (09-10 08:00–09:40Z, con un día de margen a cada
    // lado); solo queda el nuevo. El iCloud falso respeta el time-range: con
    // la hora nueva (07-10) la búsqueda no lo habría encontrado.
    expect(icloud.hrefs()).toEqual([rutaRealMovida]);
    expect(peticionesAlMover).toEqual(
      expect.arrayContaining([
        `DELETE ${eventoOriginal} → 404`,
        `REPORT ${CALENDARIO} [20261008T080000Z–20261010T094000Z] → 207`,
        `DELETE ${rutaRealOriginal} → 204`,
      ])
    );
    expect(avisosDelPaso).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          new RegExp(
            `borrado el evento ${eventoOriginal} de la cita ${original.id} del negocio ${NEGOCIO_ID} \\(caldav\\) en otra dirección: el evento estaba en ${rutaRealOriginal}`
          )
        ),
      ])
    );

    // 06-10 09:14:40 — el cliente cancela por el chat.
    hora("2026-10-06T09:14:40Z");
    const cancelacion = await cancelarReserva({
      bookingId: original.id,
      businessId: NEGOCIO_ID,
      cancelledBy: "client_chat",
      etiqueta: ETIQUETA_CHAT,
    });
    const peticionesAlCancelar = icloud.peticiones
      .slice(marca)
      .map(describirPeticion);
    anotar("06-10 09:14:40 cancela (iCloud renombra)", {
      resultado: cancelacion.resultado,
    });
    expect(cancelacion).toEqual({ resultado: "cancelada" });
    expect(icloud.hrefs()).toEqual([]);
    // Buscado en la hora de la cita al cancelar (07-10 08:45–10:25Z, ±1 día).
    expect(peticionesAlCancelar).toEqual([
      `DELETE ${EVENTO_EN_PRODUCCION} → 404`,
      `REPORT ${CALENDARIO} [20261006T084500Z–20261008T102500Z] → 207`,
      `DELETE ${rutaRealMovida} → 204`,
    ]);
    expect(avisosDelPaso).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          new RegExp(
            `borrado el evento ${EVENTO_EN_PRODUCCION} de la cita ${original.id} del negocio ${NEGOCIO_ID} \\(caldav\\) en otra dirección: el evento estaba en ${rutaRealMovida}`
          )
        ),
      ])
    );
    expect(erroresNuevos()).toEqual([]);
    await fastify.close();
  });

  // Carrera de la cancelación con una reactivación. El dueño cancela desde el
  // panel y, justo después de la sentencia que cancela, el cliente cambia de
  // hora en la misma conversación: book_appointment crea otro evento y
  // reactiva la fila apuntándola a él (el upsert no filtra por isCancelled).
  // Hay que borrar el evento del momento de cancelar. Si cancelarReserva
  // releyera la cita después de cancelar, vería el evento de la cita
  // reactivada y lo borraría: una cita activa sin evento en el calendario.
  it("cancelar justo antes de que el cliente cambie de hora en la misma conversación: se borra el evento cancelado y el de la cita reactivada sigue en iCloud", async () => {
    hora("2026-09-21T10:58:28Z");
    const reserva = await executeVoiceTool({
      businessId: NEGOCIO_ID,
      toolName: "book_appointment",
      callId: CALL_ID_CHAT,
      callLabel: ETIQUETA_CHAT,
      params: {
        clientName: "Cliente del caso",
        startDateTime: "2026-10-09T10:00:00+02:00",
        durationMinutes: 100,
        smsConsent: true,
      },
    });
    expect(reserva.result?.success).toBe(true);
    const original = await citaPorCall("cmub4scu7004ms6017964787o");
    const eventoCancelado = original.externalEventId;
    expect(eventoCancelado).not.toBeNull();
    expect(icloud.hrefs()).toEqual([eventoCancelado]);
    anotar("21-09 10:58:28 reserva a las 10:00", {
      externalEventId: eventoCancelado,
    });

    // La reactivación entra justo después de la sentencia que cancela y
    // antes de que cancelarReserva siga con el calendario.
    hora("2026-10-06T09:14:40Z");
    const updateReal = prisma.booking.update;
    let reactivacion: Awaited<ReturnType<typeof executeVoiceTool>> | null =
      null;
    const espia = vi.spyOn(prisma.booking, "update");
    espia.mockImplementationOnce(((
      argumentos: Parameters<typeof prisma.booking.update>[0]
    ) =>
      (async () => {
        const cancelada = await updateReal.call(prisma.booking, argumentos);
        reactivacion = await executeVoiceTool({
          businessId: NEGOCIO_ID,
          toolName: "book_appointment",
          callId: CALL_ID_CHAT,
          callLabel: ETIQUETA_CHAT,
          params: {
            clientName: "Cliente del caso",
            startDateTime: "2026-10-09T13:00:00+02:00",
            durationMinutes: 100,
            smsConsent: true,
          },
        });
        return cancelada;
      })()) as never);

    const cancelacion = await cancelarReserva({
      bookingId: original.id,
      businessId: NEGOCIO_ID,
      cancelledBy: "owner_panel",
      etiqueta: "panel",
    });
    espia.mockRestore();
    const final = await citaPorCall("cmub4scu7004ms6017964787o");
    anotar("06-10 09:14:40 el dueño cancela y el cliente cambia a las 13:00", {
      resultado: cancelacion.resultado,
      reactivacion,
      isCancelled: final.isCancelled,
      programedAt: final.programedAt.toISOString(),
      externalEventId: final.externalEventId,
    });

    expect(cancelacion).toEqual({ resultado: "cancelada" });
    expect(
      (reactivacion as Awaited<ReturnType<typeof executeVoiceTool>> | null)
        ?.result?.success
    ).toBe(true);
    // La cita reactivada: activa, a las 13:00 y con su evento nuevo…
    expect(final.isCancelled).toBe(false);
    expect(final.programedAt.toISOString()).toBe("2026-10-09T11:00:00.000Z");
    expect(final.externalEventId).not.toBeNull();
    expect(final.externalEventId).not.toBe(eventoCancelado);
    // …que sigue en iCloud. El de las 10:00, el cancelado, ya no está.
    expect(icloud.hrefs()).toEqual([final.externalEventId]);
    const borrados = icloud.peticiones
      .filter((p) => p.metodo === "DELETE")
      .map((p) => `${p.url} → ${p.estado}`);
    expect(borrados).toEqual([`${eventoCancelado} → 204`]);
    expect(erroresNuevos()).toEqual([]);
  });
});
