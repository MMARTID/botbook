import { describe, it, expect, beforeEach, vi } from "vitest";

// El guardián anti-SSRF resuelve el nombre antes de cada petición; los
// dominios de ejemplo no existen, así que se fija la resolución: pública
// salvo que el nombre lleve «interno».
const mockedLookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup: mockedLookup }));
mockedLookup.mockImplementation(async (nombre: string) =>
  nombre.includes("interno")
    ? [{ address: "10.0.0.5", family: 4 }]
    : [{ address: "17.253.144.10", family: 4 }]
);
import {
  createAccount,
  createCalendarObject,
  deleteCalendarObject,
  fetchCalendarObjects,
  fetchCalendars,
} from "tsdav";
import {
  CaldavCalendarProvider,
  ErrorHttpCaldav,
  fetchSoloPublico,
  fetchVigilado,
} from "../../../../src/adapters/calendar/caldav/CaldavCalendarProvider.js";
import { CalendarBusinessError } from "../../../../src/adapters/calendar/errors.js";
import type {
  ConexionActiva,
  CredencialesActivas,
  NuevoEventoDeCalendario,
} from "../../../../src/adapters/calendar/CalendarProvider.js";

vi.mock("tsdav", async (importOriginal) => {
  const real = await importOriginal<typeof import("tsdav")>();
  return {
    ...real,
    createAccount: vi.fn(),
    fetchCalendars: vi.fn(),
    fetchCalendarObjects: vi.fn(),
    createCalendarObject: vi.fn(),
    deleteCalendarObject: vi.fn(),
  };
});

const mockedCreateAccount = vi.mocked(createAccount);
const mockedFetchCalendars = vi.mocked(fetchCalendars);
const mockedFetchObjects = vi.mocked(fetchCalendarObjects);
const mockedCreateObject = vi.mocked(createCalendarObject);
const mockedDeleteObject = vi.mocked(deleteCalendarObject);

const CUENTA: CredencialesActivas<"caldav"> = {
  credentials: {
    provider: "caldav",
    serverUrl: "https://caldav.icloud.com",
    username: "pelu@icloud.com",
    appPassword: "abcd-efgh-ijkl-mnop",
  },
};
const CALENDARIO = "https://p01-caldav.icloud.com/123/calendars/abc/";
const CONEXION: ConexionActiva<"caldav"> = {
  ...CUENTA,
  provider: "caldav",
  calendarId: CALENDARIO,
};
const EVENTO: NuevoEventoDeCalendario = {
  summary: "Corte — Marta",
  description: "Cliente: Marta",
  startTime: new Date("2026-09-21T10:00:00Z"),
  endTime: new Date("2026-09-21T10:30:00Z"),
  cliente: { nombre: "Marta", telefono: null, email: null },
  recordatorioInmediatoMinutos: 60,
  recordatorioPrevioMinutos: 120,
  zonaHoraria: "Europe/Madrid",
  idempotencyDigest: "abc123",
};

function respuesta(status: number) {
  return { ok: status >= 200 && status < 300, status } as Response;
}

describe("fetchVigilado", () => {
  it("lanza ErrorHttpCaldav con el estado para 401/403/429/5xx", async () => {
    for (const status of [401, 403, 429, 500, 503]) {
      const f = fetchVigilado(async () => respuesta(status));
      await expect(f("https://x/")).rejects.toMatchObject({
        name: "ErrorHttpCaldav",
        status,
        url: "https://x/",
      });
    }
  });

  it("deja pasar 2xx, 207, 404 y 412 (los flujos los interpretan)", async () => {
    for (const status of [200, 201, 204, 207, 404, 412]) {
      const f = fetchVigilado(async () => respuesta(status));
      await expect(f("https://x/")).resolves.toMatchObject({ status });
    }
  });
});

describe("fetchSoloPublico", () => {
  function respuestaConLocation(status: number, location: string) {
    return {
      ok: false,
      status,
      headers: new Headers({ location }),
    } as unknown as Response;
  }

  it("no deja salir una petición hacia la red interna", async () => {
    const base = vi.fn(async () => respuesta(200));
    const f = fetchSoloPublico(base as unknown as typeof fetch);

    await expect(f("https://10.0.0.5:6379/")).rejects.toMatchObject({
      name: "ErrorDestinoNoPermitido",
    });
    expect(base).not.toHaveBeenCalled();
  });

  it("tampoco por http, aunque el destino sea público", async () => {
    const base = vi.fn(async () => respuesta(200));
    const f = fetchSoloPublico(base as unknown as typeof fetch);

    await expect(f("http://caldav.icloud.com/")).rejects.toMatchObject({
      name: "ErrorDestinoNoPermitido",
    });
    expect(base).not.toHaveBeenCalled();
  });

  // iCloud redirige en /.well-known/caldav, así que los redirects se siguen…
  it("sigue a mano una redirección hacia otro destino público", async () => {
    const base = vi
      .fn()
      .mockResolvedValueOnce(
        respuestaConLocation(301, "https://p01-caldav.icloud.com/")
      )
      .mockResolvedValueOnce(respuesta(207));
    const f = fetchSoloPublico(base as unknown as typeof fetch);

    await expect(f("https://caldav.icloud.com/.well-known/caldav")).resolves.toMatchObject({
      status: 207,
    });
    expect(base.mock.calls[1]![0]).toBe("https://p01-caldav.icloud.com/");
    // Nunca se delega el seguimiento de redirects al propio fetch.
    expect(base.mock.calls[0]![1]).toMatchObject({ redirect: "manual" });
  });

  // …pero un servidor legítimo que rebote hacia dentro no cuela.
  it("corta una redirección que apunta a la red interna", async () => {
    const base = vi
      .fn()
      .mockResolvedValueOnce(respuestaConLocation(302, "https://169.254.169.254/"));
    const f = fetchSoloPublico(base as unknown as typeof fetch);

    await expect(f("https://caldav.ejemplo.com/")).rejects.toMatchObject({
      name: "ErrorDestinoNoPermitido",
    });
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("corta una cadena de redirecciones interminable", async () => {
    const base = vi.fn(async () =>
      respuestaConLocation(302, "https://otro.ejemplo.com/")
    );
    const f = fetchSoloPublico(base as unknown as typeof fetch);

    await expect(f("https://caldav.ejemplo.com/")).rejects.toThrow(/redirecciones/);
  });
});

describe("CaldavCalendarProvider", () => {
  const adaptador = new CaldavCalendarProvider({
    fetch: async () => respuesta(200),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockedCreateAccount.mockResolvedValue({
      serverUrl: "https://caldav.icloud.com",
      accountType: "caldav",
      homeUrl: "https://p01-caldav.icloud.com/123/calendars/",
    });
  });

  describe("listarCalendarios", () => {
    it("descubre la cuenta con Basic auth y devuelve solo calendarios de eventos", async () => {
      mockedFetchCalendars.mockResolvedValue([
        { url: CALENDARIO, displayName: "Peluquería", components: ["VEVENT"] },
        {
          url: "https://x/recordatorios/",
          displayName: "Recordatorios",
          components: ["VTODO"],
        },
        { url: "https://x/sin-nombre/", displayName: "", components: [] },
      ] as any);

      const lista = await adaptador.listarCalendarios(CUENTA);

      expect(lista).toEqual([
        { id: CALENDARIO, name: "Peluquería", primary: false },
        { id: "https://x/sin-nombre/", name: "Sin nombre", primary: false },
      ]);
      const args = mockedCreateAccount.mock.calls[0][0] as any;
      expect(args.account).toEqual({
        serverUrl: "https://caldav.icloud.com",
        accountType: "caldav",
      });
      expect(args.headers.authorization).toMatch(/^Basic /);
      expect(
        Buffer.from(args.headers.authorization.slice(6), "base64").toString()
      ).toBe("pelu@icloud.com:abcd-efgh-ijkl-mnop");
      expect(args.fetchOptions.signal).toBeInstanceOf(AbortSignal);
    });

    it("401 del servidor → CALDAV_CALENDAR_RECONNECT_REQUIRED con provider", async () => {
      mockedCreateAccount.mockRejectedValue(
        new ErrorHttpCaldav(401, "https://caldav.icloud.com/")
      );
      await expect(adaptador.listarCalendarios(CUENTA)).rejects.toMatchObject({
        name: "CalendarBusinessError",
        code: "CALDAV_CALENDAR_RECONNECT_REQUIRED",
        provider: "caldav",
      });
    });

    it("429 → CALENDAR_RATE_LIMITED; 503 y timeout → CALENDAR_TIMEOUT; otro → BOOK_APPOINTMENT_FAILED", async () => {
      mockedCreateAccount.mockRejectedValue(new ErrorHttpCaldav(429, "u"));
      await expect(adaptador.listarCalendarios(CUENTA)).rejects.toMatchObject({
        code: "CALENDAR_RATE_LIMITED",
      });

      mockedCreateAccount.mockRejectedValue(new ErrorHttpCaldav(503, "u"));
      await expect(adaptador.listarCalendarios(CUENTA)).rejects.toMatchObject({
        code: "CALENDAR_TIMEOUT",
      });

      const timeout = new Error("aborted");
      timeout.name = "TimeoutError";
      mockedCreateAccount.mockRejectedValue(timeout);
      await expect(adaptador.listarCalendarios(CUENTA)).rejects.toMatchObject({
        code: "CALENDAR_TIMEOUT",
      });

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      mockedCreateAccount.mockRejectedValue(
        new Error("cannot find principalUrl")
      );
      await expect(adaptador.listarCalendarios(CUENTA)).rejects.toMatchObject({
        code: "BOOK_APPOINTMENT_FAILED",
      });
      errorSpy.mockRestore();
    });
  });

  describe("listarOcupacion", () => {
    it("consulta la ventana con expand y traduce los objetos a intervalos", async () => {
      mockedFetchObjects.mockResolvedValue([
        {
          url: `${CALENDARIO}a.ics`,
          etag: "1",
          data: "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART:20260922T090000Z\r\nDTEND:20260922T093000Z\r\nEND:VEVENT\r\nEND:VCALENDAR",
        },
        { url: `${CALENDARIO}vacio.ics`, etag: "2", data: "" },
      ] as any);
      const ventana = {
        timeMin: new Date("2026-09-21T00:00:00Z"),
        timeMax: new Date("2026-09-28T00:00:00Z"),
      };

      const intervalos = await adaptador.listarOcupacion(CONEXION, ventana);

      expect(intervalos).toEqual([
        {
          start: new Date("2026-09-22T09:00:00Z"),
          end: new Date("2026-09-22T09:30:00Z"),
          externalEventId: `${CALENDARIO}a.ics`,
        },
      ]);
      const args = mockedFetchObjects.mock.calls[0][0] as any;
      expect(args.calendar).toEqual({ url: CALENDARIO });
      expect(args.timeRange).toEqual({
        start: "2026-09-21T00:00:00.000Z",
        end: "2026-09-28T00:00:00.000Z",
      });
      expect(args.expand).toBe(true);
      expect(args.headers.authorization).toMatch(/^Basic /);
    });

    it("deja pasar el error crudo (el servicio degrada a disponibilidad desconocida)", async () => {
      mockedFetchObjects.mockRejectedValue(new ErrorHttpCaldav(401, "u"));
      await expect(
        adaptador.listarOcupacion(CONEXION, {
          timeMin: new Date(),
          timeMax: new Date(),
        })
      ).rejects.toBeInstanceOf(ErrorHttpCaldav);
    });
  });

  describe("crearEvento", () => {
    it("hace PUT idempotente (If-None-Match: *) con UID derivado del digest y devuelve el href", async () => {
      mockedCreateObject.mockResolvedValue(respuesta(201));

      const creado = await adaptador.crearEvento(CONEXION, EVENTO);

      expect(creado).toEqual({
        id: `${CALENDARIO}alhabla-abc123.ics`,
        htmlLink: null,
      });
      const args = mockedCreateObject.mock.calls[0][0] as any;
      expect(args.calendar).toEqual({ url: CALENDARIO });
      expect(args.filename).toBe("alhabla-abc123.ics");
      expect(args.headers["If-None-Match"]).toBe("*");
      expect(args.headers.authorization).toMatch(/^Basic /);
      expect(args.iCalString).toContain("UID:alhabla-abc123@alhabla.ai");
      expect(args.iCalString).toContain("DTSTART:20260921T100000Z");
    });

    it("412 (ya existía por un reintento) cuenta como creado con el mismo href", async () => {
      mockedCreateObject.mockResolvedValue(respuesta(412));
      await expect(adaptador.crearEvento(CONEXION, EVENTO)).resolves.toEqual({
        id: `${CALENDARIO}alhabla-abc123.ics`,
        htmlLink: null,
      });
    });

    it("401 → RECONNECT; 507 → CALENDAR_TIMEOUT; 400 → BOOK_APPOINTMENT_FAILED", async () => {
      mockedCreateObject.mockRejectedValue(new ErrorHttpCaldav(401, "u"));
      await expect(
        adaptador.crearEvento(CONEXION, EVENTO)
      ).rejects.toMatchObject({ code: "CALDAV_CALENDAR_RECONNECT_REQUIRED" });

      mockedCreateObject.mockRejectedValue(new ErrorHttpCaldav(507, "u"));
      await expect(
        adaptador.crearEvento(CONEXION, EVENTO)
      ).rejects.toMatchObject({ code: "CALENDAR_TIMEOUT" });

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      mockedCreateObject.mockResolvedValue(respuesta(400));
      await expect(
        adaptador.crearEvento(CONEXION, EVENTO)
      ).rejects.toMatchObject({ code: "BOOK_APPOINTMENT_FAILED" });
      errorSpy.mockRestore();
    });
  });

  describe("borrarEvento", () => {
    it("borra por href sin If-Match; 404 y 410 cuentan como borrado", async () => {
      mockedDeleteObject.mockResolvedValue(respuesta(204));
      await expect(
        adaptador.borrarEvento(CONEXION, `${CALENDARIO}a.ics`)
      ).resolves.toBeUndefined();
      const args = mockedDeleteObject.mock.calls[0][0] as any;
      expect(args.calendarObject).toEqual({
        url: `${CALENDARIO}a.ics`,
        etag: "",
      });

      mockedDeleteObject.mockResolvedValue(respuesta(404));
      await expect(
        adaptador.borrarEvento(CONEXION, "u")
      ).resolves.toBeUndefined();
      mockedDeleteObject.mockResolvedValue(respuesta(410));
      await expect(
        adaptador.borrarEvento(CONEXION, "u")
      ).resolves.toBeUndefined();
    });

    it("403 → RECONNECT; 409 → CANCEL_APPOINTMENT_FAILED", async () => {
      mockedDeleteObject.mockRejectedValue(new ErrorHttpCaldav(403, "u"));
      await expect(adaptador.borrarEvento(CONEXION, "u")).rejects.toMatchObject(
        { code: "CALDAV_CALENDAR_RECONNECT_REQUIRED" }
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      mockedDeleteObject.mockResolvedValue(respuesta(409));
      await expect(adaptador.borrarEvento(CONEXION, "u")).rejects.toMatchObject(
        { code: "CANCEL_APPOINTMENT_FAILED" }
      );
      errorSpy.mockRestore();
    });
  });

  describe("listarProximosEventos", () => {
    it("consulta 30 días desde ahora y respeta maxResults", async () => {
      mockedFetchObjects.mockResolvedValue([
        {
          url: "b",
          etag: "1",
          data: "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:b\r\nDTSTART:20991002T090000Z\r\nDTEND:20991002T093000Z\r\nSUMMARY:B\r\nEND:VEVENT\r\nEND:VCALENDAR",
        },
        {
          url: "a",
          etag: "2",
          data: "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART:20991001T090000Z\r\nDTEND:20991001T093000Z\r\nSUMMARY:A\r\nEND:VEVENT\r\nEND:VCALENDAR",
        },
      ] as any);
      vi.useFakeTimers({ now: new Date("2099-09-30T00:00:00Z") });
      try {
        const eventos = await adaptador.listarProximosEventos(CONEXION, 1);
        expect(eventos.map((e) => e.summary)).toEqual(["A"]);
        const args = mockedFetchObjects.mock.calls[0][0] as any;
        expect(args.timeRange).toEqual({
          start: "2099-09-30T00:00:00.000Z",
          end: "2099-10-30T00:00:00.000Z",
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("los errores que ya son CalendarBusinessError se propagan tal cual", async () => {
    const propio = new CalendarBusinessError("CALENDAR_TIMEOUT", "x");
    mockedCreateAccount.mockRejectedValue(propio);
    await expect(adaptador.listarCalendarios(CUENTA)).rejects.toBe(propio);
  });
});
