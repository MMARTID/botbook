import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";
import {
  actualizarCalendarioDeConexion,
  conCallbackDeRotacion,
  conexionConfirmada,
  conexionOperativa,
  estadoDeConexion,
  guardarConexionDeCalendario,
  marcadaComoConectada,
  marcarCalendarioDesconectado,
  origenDeCalendario,
  persistirCredencialesRotadas,
  resolverConexionDeCalendario,
  SELECT_CONEXION_DE_CALENDARIO,
  usaCalendarioExterno,
} from "../../../src/modules/calendar/conexion.js";
import {
  filaDeConexion,
  negocioConConexiones,
} from "../../helpers/conexionDeCalendario.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    calendarConnection: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../../src/lib/redis.js", () => ({
  getRedis: vi.fn(),
}));

const mockedBusinessUpdate = vi.mocked(prisma.business.update);
const mockedBusinessUpdateMany = vi.mocked(prisma.business.updateMany);
const mockedConnectionUpdateMany = vi.mocked(
  prisma.calendarConnection.updateMany
);
const mockedTransaction = vi.mocked(prisma.$transaction);
const mockedGetRedis = vi.mocked(getRedis);

describe("SELECT_CONEXION_DE_CALENDARIO", () => {
  it("lee id, proveedor activo y la relación con las columnas que usa el resolver", () => {
    expect(Object.keys(SELECT_CONEXION_DE_CALENDARIO).sort()).toEqual([
      "calendarConnections",
      "calendarProvider",
      "id",
    ]);
    expect(
      Object.keys(
        SELECT_CONEXION_DE_CALENDARIO.calendarConnections.select
      ).sort()
    ).toEqual([
      "accountEmail",
      "calendarId",
      "connected",
      "credentials",
      "disconnectedAt",
      "lastError",
      "provider",
    ]);
  });
});

describe("resolverConexionDeCalendario", () => {
  it("proveedor activo: 'outlook' ⇒ outlook; null, 'google' o basura ⇒ google", () => {
    expect(
      resolverConexionDeCalendario(negocioConConexiones("outlook")).provider
    ).toBe("outlook");
    expect(
      resolverConexionDeCalendario(negocioConConexiones(null)).provider
    ).toBe("google");
    expect(
      resolverConexionDeCalendario(negocioConConexiones("google")).provider
    ).toBe("google");
    expect(
      resolverConexionDeCalendario(negocioConConexiones("basura")).provider
    ).toBe("google");
  });

  it("Google sin calendarId en la fila usa 'primary' y conserva el crudo", () => {
    const c = resolverConexionDeCalendario(
      negocioConConexiones("google", [
        filaDeConexion("google", { calendarId: null }),
      ])
    );
    expect(c.calendarId).toBe("primary");
    expect(c.calendarIdConfigurado).toBeNull();
    expect(c.credentials).toEqual({
      provider: "google",
      refreshToken: "google_refresh_token",
    });
    expect(c.marcadaConectada).toBe(true);
    expect(c.businessId).toBe("biz_1");
  });

  it("Google con calendarId '' también cae a 'primary' (|| y no ??)", () => {
    const c = resolverConexionDeCalendario(
      negocioConConexiones("google", [
        filaDeConexion("google", { calendarId: "" }),
      ])
    );
    expect(c.calendarId).toBe("primary");
    expect(c.calendarIdConfigurado).toBe("");
  });

  it("Google con calendario propio lo respeta", () => {
    const c = resolverConexionDeCalendario(
      negocioConConexiones("google", [
        filaDeConexion("google", { calendarId: "cal_propio" }),
      ])
    );
    expect(c.calendarId).toBe("cal_propio");
  });

  it("Outlook sin calendarId deja calendarId null (no hay default)", () => {
    const c = resolverConexionDeCalendario(
      negocioConConexiones("outlook", [
        filaDeConexion("outlook", { calendarId: null }),
      ])
    );
    expect(c.provider).toBe("outlook");
    expect(c.calendarId).toBeNull();
    expect(c.calendarIdConfigurado).toBeNull();
    expect(c.credentials).toEqual({
      provider: "outlook",
      refreshToken: "outlook_refresh_token",
    });
  });

  it("lee la fila del proveedor activo e ignora la del otro", () => {
    const negocio = negocioConConexiones("outlook", [
      filaDeConexion("google", { refreshToken: "g", calendarId: "cal_g" }),
      filaDeConexion("outlook", {
        refreshToken: "o",
        calendarId: "cal_o",
        connected: false,
      }),
    ]);
    const c = resolverConexionDeCalendario(negocio);
    expect(c.provider).toBe("outlook");
    expect(c.calendarId).toBe("cal_o");
    expect(c.credentials).toEqual({ provider: "outlook", refreshToken: "o" });
    expect(c.marcadaConectada).toBe(false);
  });

  it("sin fila para el proveedor: credenciales null y marcadaConectada null", () => {
    const c = resolverConexionDeCalendario(
      negocioConConexiones("google", [filaDeConexion("outlook")])
    );
    expect(c.credentials).toBeNull();
    expect(c.marcadaConectada).toBeNull();
    expect(c.calendarId).toBe("primary");
  });

  it("fila con credenciales null (revocadas) ⇒ credentials null, flag intacto", () => {
    const c = resolverConexionDeCalendario(
      negocioConConexiones("google", [
        filaDeConexion("google", { refreshToken: null, connected: false }),
      ])
    );
    expect(c.credentials).toBeNull();
    expect(c.marcadaConectada).toBe(false);
  });

  it("credenciales con forma inválida o de otro proveedor se tratan como ausentes y se loguean", () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const corrupta = resolverConexionDeCalendario(
      negocioConConexiones("google", [
        { ...filaDeConexion("google"), credentials: { refreshToken: 42 } },
      ])
    );
    expect(corrupta.credentials).toBeNull();
    const ajena = resolverConexionDeCalendario(
      negocioConConexiones("google", [
        {
          ...filaDeConexion("google"),
          credentials: { provider: "outlook", refreshToken: "o" },
        },
      ])
    );
    expect(ajena.credentials).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy.mock.calls[0][0]).toContain("[Calendar]");
    errorSpy.mockRestore();
  });

  it("negocio sin calendarConnections (caché de voz anterior a la tabla) ⇒ sin credenciales", () => {
    const c = resolverConexionDeCalendario({
      id: "biz_1",
      calendarProvider: "google",
    });
    expect(c.credentials).toBeNull();
    expect(c.marcadaConectada).toBeNull();
  });

  it("override de provider fuerza el proveedor aunque el activo sea otro", () => {
    const negocio = negocioConConexiones("google", [
      filaDeConexion("google", { refreshToken: "g" }),
      filaDeConexion("outlook", { refreshToken: "o", calendarId: "cal_o" }),
    ]);
    const c = resolverConexionDeCalendario(negocio, { provider: "outlook" });
    expect(c.provider).toBe("outlook");
    expect(c.calendarId).toBe("cal_o");
    expect(c.credentials).toEqual({ provider: "outlook", refreshToken: "o" });
  });

  it("override de calendarId sustituye el de la fila", () => {
    const c = resolverConexionDeCalendario(
      negocioConConexiones("google", [
        filaDeConexion("google", { calendarId: "cal_negocio" }),
      ]),
      { calendarId: "cal_reserva" }
    );
    expect(c.calendarId).toBe("cal_reserva");
    expect(c.calendarIdConfigurado).toBe("cal_reserva");
  });

  it("override calendarId: null explícito ignora la fila y aplica el default", () => {
    const c = resolverConexionDeCalendario(
      negocioConConexiones("google", [
        filaDeConexion("google", { calendarId: "cal_negocio" }),
      ]),
      { calendarId: null }
    );
    expect(c.calendarId).toBe("primary");
    expect(c.calendarIdConfigurado).toBeNull();
  });

  it("override calendarId undefined equivale a no pasarlo", () => {
    const c = resolverConexionDeCalendario(
      negocioConConexiones("google", [
        filaDeConexion("google", { calendarId: "cal_negocio" }),
      ]),
      { calendarId: undefined }
    );
    expect(c.calendarId).toBe("cal_negocio");
  });

  it("con business null devuelve una conexión Google vacía sin businessId", () => {
    const c = resolverConexionDeCalendario(null);
    expect(c).toEqual({
      provider: "google",
      calendarId: "primary",
      credentials: null,
      businessId: null,
      calendarIdConfigurado: null,
      marcadaConectada: null,
    });
  });
});

describe("estadoDeConexion", () => {
  it("sin credenciales → sin_credenciales (antes que sin_calendario)", () => {
    expect(
      estadoDeConexion({
        provider: "outlook",
        calendarId: null,
        credentials: null,
      })
    ).toBe("sin_credenciales");
  });

  it("con credenciales y sin calendario → sin_calendario", () => {
    expect(
      estadoDeConexion({
        provider: "outlook",
        calendarId: null,
        credentials: { provider: "outlook", refreshToken: "o" },
      })
    ).toBe("sin_calendario");
  });

  it("con credenciales y calendario → ok", () => {
    expect(
      estadoDeConexion({
        provider: "google",
        calendarId: "primary",
        credentials: { provider: "google", refreshToken: "g" },
      })
    ).toBe("ok");
  });
});

describe("predicados de conexión (las cuatro semánticas actuales)", () => {
  const con = (
    opciones: { refreshToken?: string | null; connected?: boolean },
    sinFila = false
  ) =>
    resolverConexionDeCalendario(
      negocioConConexiones(
        "google",
        sinFila ? [] : [filaDeConexion("google", opciones)]
      )
    );

  it("conexionOperativa: credenciales y flag !== false", () => {
    expect(conexionOperativa(con({ connected: true }))).toBe(true);
    expect(conexionOperativa(con({ connected: false }))).toBe(false);
    expect(
      conexionOperativa(con({ refreshToken: null, connected: true }))
    ).toBe(false);
    // Sin fila: flag null pero tampoco hay credenciales.
    expect(conexionOperativa(con({}, true))).toBe(false);
  });

  it("conexionConfirmada: credenciales y flag === true", () => {
    expect(conexionConfirmada(con({ connected: true }))).toBe(true);
    expect(conexionConfirmada(con({ connected: false }))).toBe(false);
    expect(
      conexionConfirmada(con({ refreshToken: null, connected: true }))
    ).toBe(false);
    expect(conexionConfirmada(con({}, true))).toBe(false);
  });

  it("marcadaComoConectada: solo el flag, sin mirar credenciales", () => {
    expect(
      marcadaComoConectada(con({ refreshToken: null, connected: true }))
    ).toBe(true);
    expect(marcadaComoConectada(con({ connected: false }))).toBe(false);
    expect(marcadaComoConectada(con({}, true))).toBe(false);
  });

  it("usaCalendarioExterno: Google basta con credenciales (calendarId por defecto)", () => {
    expect(usaCalendarioExterno(con({ connected: false }))).toBe(true);
    expect(usaCalendarioExterno(con({ refreshToken: null }))).toBe(false);
  });

  it("usaCalendarioExterno: Outlook exige credenciales y calendario elegido", () => {
    const conCalendario = resolverConexionDeCalendario(
      negocioConConexiones("outlook", [
        filaDeConexion("outlook", { calendarId: "cal_o" }),
      ])
    );
    const sinCalendario = resolverConexionDeCalendario(
      negocioConConexiones("outlook", [
        filaDeConexion("outlook", { calendarId: null }),
      ])
    );
    expect(usaCalendarioExterno(conCalendario)).toBe(true);
    expect(usaCalendarioExterno(sinCalendario)).toBe(false);
  });
});

describe("origenDeCalendario", () => {
  it("Google devuelve el calendario efectivo aunque no haya credenciales", () => {
    expect(
      origenDeCalendario(
        resolverConexionDeCalendario(negocioConConexiones("google"))
      )
    ).toEqual({ provider: "google", calendarId: "primary" });
  });

  it("Outlook con calendario elegido lo devuelve", () => {
    expect(
      origenDeCalendario(
        resolverConexionDeCalendario(
          negocioConConexiones("outlook", [
            filaDeConexion("outlook", { calendarId: "cal_o" }),
          ])
        )
      )
    ).toEqual({ provider: "outlook", calendarId: "cal_o" });
  });

  it("Outlook sin calendario elegido → null", () => {
    expect(
      origenDeCalendario(
        resolverConexionDeCalendario(
          negocioConConexiones("outlook", [
            filaDeConexion("outlook", { calendarId: null }),
          ])
        )
      )
    ).toBeNull();
  });
});

describe("marcarCalendarioDesconectado", () => {
  let del: ReturnType<typeof vi.fn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    del = vi.fn().mockResolvedValue(1);
    mockedGetRedis.mockReturnValue({ del } as any);
    mockedBusinessUpdate.mockResolvedValue({} as any);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  function dataDelUpdate() {
    return mockedBusinessUpdate.mock.calls[0][0].data as Record<string, any>;
  }

  it("modo revocar en Google: fila sin credenciales + espejo sin refresh token, invalid_grant", async () => {
    await marcarCalendarioDesconectado("biz_1", "google", { modo: "revocar" });

    expect(mockedBusinessUpdate).toHaveBeenCalledTimes(1);
    expect(mockedBusinessUpdate.mock.calls[0][0].where).toEqual({
      id: "biz_1",
    });
    expect(dataDelUpdate()).toEqual({
      googleCalendarConnected: false,
      googleCalendarDisconnectedAt: expect.any(Date),
      googleCalendarLastError: "invalid_grant",
      googleRefreshToken: null,
      calendarConnections: {
        updateMany: {
          where: { provider: "google" },
          data: {
            connected: false,
            disconnectedAt: expect.any(Date),
            lastError: "invalid_grant",
            credentials: Prisma.DbNull,
          },
        },
      },
    });
    expect(del).toHaveBeenCalledWith("voice_config:biz_1");
  });

  it("modo panel en Google conserva las credenciales y guarda el motivo", async () => {
    await marcarCalendarioDesconectado("biz_1", "google", {
      modo: "panel",
      motivo: "token caducado",
    });

    const data = dataDelUpdate();
    expect(data).not.toHaveProperty("googleRefreshToken");
    expect(data.googleCalendarLastError).toBe("token caducado");
    expect(data.calendarConnections.updateMany.data).toEqual({
      connected: false,
      disconnectedAt: expect.any(Date),
      lastError: "token caducado",
    });
  });

  it("modo revocar en Outlook toca solo las columnas outlook* y la fila outlook", async () => {
    await marcarCalendarioDesconectado("biz_1", "outlook", {
      modo: "revocar",
    });

    const data = dataDelUpdate();
    expect(Object.keys(data).sort()).toEqual([
      "calendarConnections",
      "outlookCalendarConnected",
      "outlookCalendarDisconnectedAt",
      "outlookCalendarLastError",
      "outlookRefreshToken",
    ]);
    expect(data.outlookRefreshToken).toBeNull();
    expect(data.calendarConnections.updateMany.where).toEqual({
      provider: "outlook",
    });
    expect(data.calendarConnections.updateMany.data.credentials).toBe(
      Prisma.DbNull
    );
  });

  it("modo panel en Outlook conserva el refresh token", async () => {
    await marcarCalendarioDesconectado("biz_1", "outlook", {
      modo: "panel",
      motivo: "x",
    });
    const data = dataDelUpdate();
    expect(data).not.toHaveProperty("outlookRefreshToken");
    expect(data.calendarConnections.updateMany.data).not.toHaveProperty(
      "credentials"
    );
  });

  it("no lanza si la BD falla y aun así invalida la caché de voz", async () => {
    const fallo = new Error("postgres caído");
    mockedBusinessUpdate.mockRejectedValue(fallo);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      marcarCalendarioDesconectado(
        "biz_1",
        "google",
        { modo: "revocar" },
        { prefijo: "[VoiceTools]" }
      )
    ).resolves.toBeUndefined();

    expect(del).toHaveBeenCalledWith("voice_config:biz_1");
    // Best-effort no es silencioso: el log lleva prefijo, proveedor, negocio,
    // modo y el error completo (no solo su message), para poder buscarlo.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [mensaje, errorLogueado] = errorSpy.mock.calls[0];
    expect(mensaje).toContain("[VoiceTools]");
    expect(mensaje).toContain("FALLO AL MARCAR CALENDARIO DESCONECTADO");
    expect(mensaje).toContain("Google Calendar");
    expect(mensaje).toContain("biz_1");
    expect(mensaje).toContain("modo=revocar");
    expect(errorLogueado).toBe(fallo);
    errorSpy.mockRestore();
  });

  it("deja constancia (warn) de cada desconexión aunque la BD responda", async () => {
    await marcarCalendarioDesconectado("biz_1", "outlook", {
      modo: "panel",
      motivo: "token caducado",
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [mensaje] = warnSpy.mock.calls[0];
    expect(mensaje).toContain("[Calendar]");
    expect(mensaje).toContain("Outlook Calendar");
    expect(mensaje).toContain("biz_1");
    expect(mensaje).toContain("modo=panel");
    expect(mensaje).toContain("motivo=token caducado");
  });

  it("no lanza si Redis falla", async () => {
    del.mockRejectedValue(new Error("redis caído"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(
      marcarCalendarioDesconectado("biz_1", "google", { modo: "revocar" })
    ).resolves.toBeUndefined();
    expect(mockedBusinessUpdate).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

describe("guardarConexionDeCalendario", () => {
  let del: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    del = vi.fn().mockResolvedValue(1);
    mockedGetRedis.mockReturnValue({ del } as any);
    mockedBusinessUpdate.mockResolvedValue({ id: "biz_1" } as any);
  });

  const where = (provider: "google" | "outlook") => ({
    businessId_provider: { businessId: "biz_1", provider },
  });

  it("selectGoogleCalendar: cambia el calendario sin tocar credenciales (fila + espejo en una query)", async () => {
    const business = await guardarConexionDeCalendario("biz_1", {
      provider: "google",
      calendarId: "secundario_id",
      conectado: true,
    });

    expect(business).toEqual({ id: "biz_1" });
    expect(mockedBusinessUpdate).toHaveBeenCalledTimes(1);
    expect(mockedBusinessUpdate).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: {
        calendarProvider: "google",
        googleCalendarId: "secundario_id",
        googleCalendarConnected: true,
        googleCalendarDisconnectedAt: null,
        googleCalendarLastError: null,
        calendarConnections: {
          upsert: {
            where: where("google"),
            create: {
              provider: "google",
              calendarId: "secundario_id",
              connected: true,
              accountEmail: null,
            },
            update: {
              calendarId: "secundario_id",
              connected: true,
              disconnectedAt: null,
              lastError: null,
            },
          },
        },
      },
    });
    expect(del).toHaveBeenCalledWith("voice_config:biz_1");
  });

  it("handleCallback: Google con refresh token y calendario 'primary'", async () => {
    await guardarConexionDeCalendario("biz_1", {
      provider: "google",
      refreshToken: "rt_nuevo",
      calendarId: "primary",
      conectado: true,
    });

    const data = mockedBusinessUpdate.mock.calls[0][0].data as any;
    expect(data.googleRefreshToken).toBe("rt_nuevo");
    expect(data.googleCalendarId).toBe("primary");
    expect(data.calendarConnections.upsert.create).toEqual({
      provider: "google",
      calendarId: "primary",
      credentials: { provider: "google", refreshToken: "rt_nuevo" },
      connected: true,
      accountEmail: null,
    });
    expect(data.calendarConnections.upsert.update).toEqual({
      calendarId: "primary",
      credentials: { provider: "google", refreshToken: "rt_nuevo" },
      connected: true,
      disconnectedAt: null,
      lastError: null,
    });
  });

  it("handleMicrosoftCallback: Outlook con email, credenciales, sin conectar y SIN calendarId", async () => {
    await guardarConexionDeCalendario("biz_1", {
      provider: "outlook",
      refreshToken: "rt_o",
      conectado: false,
      userEmail: "barber@outlook.com",
    });

    const data = mockedBusinessUpdate.mock.calls[0][0].data as any;
    expect(data).toEqual({
      calendarProvider: "outlook",
      outlookRefreshToken: "rt_o",
      outlookCalendarConnected: false,
      outlookCalendarDisconnectedAt: null,
      outlookCalendarLastError: null,
      outlookUserEmail: "barber@outlook.com",
      calendarConnections: {
        upsert: {
          where: where("outlook"),
          create: {
            provider: "outlook",
            calendarId: null,
            credentials: { provider: "outlook", refreshToken: "rt_o" },
            connected: false,
            accountEmail: "barber@outlook.com",
          },
          update: {
            credentials: { provider: "outlook", refreshToken: "rt_o" },
            connected: false,
            disconnectedAt: null,
            lastError: null,
            accountEmail: "barber@outlook.com",
          },
        },
      },
    });
  });

  it("handleMicrosoftCallback: userEmail null se escribe como null (no se omite)", async () => {
    await guardarConexionDeCalendario("biz_1", {
      provider: "outlook",
      refreshToken: "rt_o",
      conectado: false,
      userEmail: null,
    });
    const data = mockedBusinessUpdate.mock.calls[0][0].data as any;
    expect(data.outlookUserEmail).toBeNull();
    expect(data.calendarConnections.upsert.update.accountEmail).toBeNull();
  });

  it("connectMicrosoftCalendar: Outlook con calendario, sin credenciales ni email", async () => {
    await guardarConexionDeCalendario("biz_1", {
      provider: "outlook",
      calendarId: "cal_o",
      conectado: true,
    });
    const data = mockedBusinessUpdate.mock.calls[0][0].data as any;
    expect(data).not.toHaveProperty("outlookRefreshToken");
    expect(data).not.toHaveProperty("outlookUserEmail");
    expect(data.outlookCalendarId).toBe("cal_o");
    expect(data.calendarConnections.upsert.update).toEqual({
      calendarId: "cal_o",
      connected: true,
      disconnectedAt: null,
      lastError: null,
    });
  });

  it("propaga el fallo de BD (no es best-effort) sin invalidar la caché", async () => {
    mockedBusinessUpdate.mockRejectedValue(new Error("postgres caído"));
    await expect(
      guardarConexionDeCalendario("biz_1", {
        provider: "google",
        calendarId: "x",
        conectado: true,
      })
    ).rejects.toThrow("postgres caído");
    expect(del).not.toHaveBeenCalled();
  });
});

describe("actualizarCalendarioDeConexion (PATCH /business/me)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedBusinessUpdate.mockResolvedValue({} as any);
  });

  it("cambia solo el calendario de la fila y su espejo, sin tocar estado ni credenciales", async () => {
    await actualizarCalendarioDeConexion("biz_1", "outlook", "cal_nuevo");
    expect(mockedBusinessUpdate).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: {
        outlookCalendarId: "cal_nuevo",
        calendarConnections: {
          updateMany: {
            where: { provider: "outlook" },
            data: { calendarId: "cal_nuevo" },
          },
        },
      },
    });
  });

  it("admite null (volver al calendario por defecto)", async () => {
    await actualizarCalendarioDeConexion("biz_1", "google", null);
    const data = mockedBusinessUpdate.mock.calls[0][0].data as any;
    expect(data.googleCalendarId).toBeNull();
    expect(data.calendarConnections.updateMany.data).toEqual({
      calendarId: null,
    });
  });
});

describe("persistirCredencialesRotadas", () => {
  const viejas = { provider: "outlook", refreshToken: "rt_viejo" } as const;
  const nuevas = { provider: "outlook", refreshToken: "rt_nuevo" } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedTransaction.mockResolvedValue([] as any);
    mockedConnectionUpdateMany.mockReturnValue("q_conexion" as any);
    mockedBusinessUpdateMany.mockReturnValue("q_espejo" as any);
  });

  it("con businessId escribe por id en la fila y en el espejo, en una transacción", async () => {
    await persistirCredencialesRotadas(viejas, nuevas, "biz_1");

    expect(mockedConnectionUpdateMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1", provider: "outlook" },
      data: { credentials: { provider: "outlook", refreshToken: "rt_nuevo" } },
    });
    expect(mockedBusinessUpdateMany).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: { outlookRefreshToken: "rt_nuevo" },
    });
    expect(mockedTransaction).toHaveBeenCalledWith(["q_conexion", "q_espejo"]);
  });

  it("sin businessId busca por VALOR del token viejo (wrappers deprecated)", async () => {
    await persistirCredencialesRotadas(viejas, nuevas);

    expect(mockedConnectionUpdateMany).toHaveBeenCalledWith({
      where: {
        provider: "outlook",
        credentials: { path: ["refreshToken"], equals: "rt_viejo" },
      },
      data: { credentials: { provider: "outlook", refreshToken: "rt_nuevo" } },
    });
    expect(mockedBusinessUpdateMany).toHaveBeenCalledWith({
      where: { outlookRefreshToken: "rt_viejo" },
      data: { outlookRefreshToken: "rt_nuevo" },
    });
  });

  it("no escribe si el token es el mismo", async () => {
    await persistirCredencialesRotadas(viejas, viejas, "biz_1");
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("no escribe para Google (no rota el refresh token)", async () => {
    await persistirCredencialesRotadas(
      { provider: "google", refreshToken: "a" },
      { provider: "google", refreshToken: "b" },
      "biz_1"
    );
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("no lanza si la BD falla (el token viejo sigue sirviendo)", async () => {
    mockedTransaction.mockRejectedValue(new Error("postgres caído"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(
      persistirCredencialesRotadas(viejas, nuevas, "biz_1")
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("biz_1");
    errorSpy.mockRestore();
  });
});

describe("conCallbackDeRotacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedTransaction.mockResolvedValue([] as any);
  });

  it("devuelve las credenciales tal cual y un callback que persiste la rotación por id", async () => {
    const credenciales = {
      provider: "outlook",
      refreshToken: "rt_viejo",
    } as const;
    const activas = conCallbackDeRotacion(credenciales, "biz_1");
    expect(activas.credentials).toBe(credenciales);

    await activas.alRotarCredenciales!({
      provider: "outlook",
      refreshToken: "rt_nuevo",
    });
    expect(mockedConnectionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: "biz_1", provider: "outlook" },
      })
    );
  });
});
