import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";
import {
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
  type FilaDeConexionDeCalendario,
} from "../../../src/modules/calendar/conexion.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../../../src/lib/redis.js", () => ({
  getRedis: vi.fn(),
}));

const mockedBusinessUpdate = vi.mocked(prisma.business.update);
const mockedBusinessUpdateMany = vi.mocked(prisma.business.updateMany);
const mockedGetRedis = vi.mocked(getRedis);

/** Fila completa con todo a null; cada test sobrescribe lo que necesita. */
function fila(
  parcial: Partial<FilaDeConexionDeCalendario> = {}
): FilaDeConexionDeCalendario {
  return {
    calendarProvider: null,
    googleRefreshToken: null,
    googleCalendarId: null,
    googleCalendarConnected: null,
    outlookRefreshToken: null,
    outlookCalendarId: null,
    outlookCalendarConnected: null,
    ...parcial,
  };
}

describe("SELECT_CONEXION_DE_CALENDARIO", () => {
  it("cubre exactamente las columnas que lee el resolver", () => {
    expect(Object.keys(SELECT_CONEXION_DE_CALENDARIO).sort()).toEqual(
      Object.keys(fila()).sort()
    );
  });
});

describe("resolverConexionDeCalendario", () => {
  it.each([
    [null, "google"],
    [undefined, "google"],
    ["google", "google"],
    ["outlook", "outlook"],
    ["basura", "google"],
  ])("calendarProvider %s → proveedor %s", (valor, esperado) => {
    expect(
      resolverConexionDeCalendario(fila({ calendarProvider: valor as any }))
        .provider
    ).toBe(esperado);
  });

  it("Google con googleCalendarId null usa 'primary' y conserva el crudo", () => {
    const c = resolverConexionDeCalendario(
      fila({ calendarProvider: "google", googleRefreshToken: "tok_g" })
    );
    expect(c).toEqual({
      provider: "google",
      calendarId: "primary",
      credentials: { provider: "google", refreshToken: "tok_g" },
      calendarIdConfigurado: null,
      marcadaConectada: null,
    });
  });

  it("Google con googleCalendarId '' también cae a 'primary' (|| y no ??)", () => {
    const c = resolverConexionDeCalendario(
      fila({ calendarProvider: "google", googleCalendarId: "" })
    );
    expect(c.calendarId).toBe("primary");
    expect(c.calendarIdConfigurado).toBe("");
  });

  it("Google con calendario propio lo respeta", () => {
    const c = resolverConexionDeCalendario(
      fila({ calendarProvider: "google", googleCalendarId: "secundario" })
    );
    expect(c.calendarId).toBe("secundario");
    expect(c.calendarIdConfigurado).toBe("secundario");
  });

  it("Outlook sin outlookCalendarId deja calendarId null (no hay default)", () => {
    const c = resolverConexionDeCalendario(
      fila({
        calendarProvider: "outlook",
        outlookRefreshToken: "tok_o",
        outlookCalendarConnected: true,
      })
    );
    expect(c).toEqual({
      provider: "outlook",
      calendarId: null,
      credentials: { provider: "outlook", refreshToken: "tok_o" },
      calendarIdConfigurado: null,
      marcadaConectada: true,
    });
  });

  it("lee las columnas del proveedor activo e ignora las del otro", () => {
    const c = resolverConexionDeCalendario(
      fila({
        calendarProvider: "outlook",
        googleRefreshToken: "tok_g",
        googleCalendarId: "cal_g",
        googleCalendarConnected: true,
        outlookRefreshToken: null,
        outlookCalendarId: "cal_o",
        outlookCalendarConnected: false,
      })
    );
    expect(c.credentials).toBeNull();
    expect(c.calendarId).toBe("cal_o");
    expect(c.marcadaConectada).toBe(false);
  });

  it("sin credenciales devuelve credentials null", () => {
    expect(
      resolverConexionDeCalendario(fila({ calendarProvider: "google" }))
        .credentials
    ).toBeNull();
  });

  it("override de provider fuerza el proveedor aunque la fila diga otro", () => {
    const c = resolverConexionDeCalendario(
      fila({
        calendarProvider: "google",
        googleRefreshToken: "tok_g",
        outlookRefreshToken: "tok_o",
        outlookCalendarId: "cal_o",
      }),
      { provider: "outlook" }
    );
    expect(c.provider).toBe("outlook");
    expect(c.credentials).toEqual({
      provider: "outlook",
      refreshToken: "tok_o",
    });
    expect(c.calendarId).toBe("cal_o");
  });

  it("override de calendarId sustituye la columna del negocio", () => {
    const c = resolverConexionDeCalendario(
      fila({ calendarProvider: "google", googleCalendarId: "cal_negocio" }),
      { calendarId: "cal_booking" }
    );
    expect(c.calendarId).toBe("cal_booking");
    expect(c.calendarIdConfigurado).toBe("cal_booking");
  });

  it("override calendarId: null explícito ignora la columna y aplica el default", () => {
    const google = resolverConexionDeCalendario(
      fila({ calendarProvider: "google", googleCalendarId: "cal_negocio" }),
      { calendarId: null }
    );
    expect(google.calendarId).toBe("primary");
    expect(google.calendarIdConfigurado).toBeNull();

    const outlook = resolverConexionDeCalendario(
      fila({ calendarProvider: "outlook", outlookCalendarId: "cal_negocio" }),
      { calendarId: null }
    );
    expect(outlook.calendarId).toBeNull();
  });

  it("override calendarId undefined equivale a no pasarlo", () => {
    const c = resolverConexionDeCalendario(
      fila({ calendarProvider: "google", googleCalendarId: "cal_negocio" }),
      { calendarId: undefined }
    );
    expect(c.calendarId).toBe("cal_negocio");
  });

  it("con business null devuelve una conexión Google vacía", () => {
    expect(resolverConexionDeCalendario(null)).toEqual({
      provider: "google",
      calendarId: "primary",
      credentials: null,
      calendarIdConfigurado: null,
      marcadaConectada: null,
    });
    expect(resolverConexionDeCalendario(undefined).provider).toBe("google");
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
        credentials: { provider: "outlook", refreshToken: "tok" },
      })
    ).toBe("sin_calendario");
  });

  it("con credenciales y calendario → ok", () => {
    expect(
      estadoDeConexion({
        provider: "google",
        calendarId: "primary",
        credentials: { provider: "google", refreshToken: "tok" },
      })
    ).toBe("ok");
  });
});

describe("predicados de conexión (las cuatro semánticas actuales)", () => {
  const casos: Array<{
    token: string | null;
    flag: boolean | null;
    operativa: boolean;
    confirmada: boolean;
    marcada: boolean;
  }> = [
    {
      token: "tok",
      flag: true,
      operativa: true,
      confirmada: true,
      marcada: true,
    },
    {
      token: "tok",
      flag: false,
      operativa: false,
      confirmada: false,
      marcada: false,
    },
    {
      token: "tok",
      flag: null,
      operativa: true,
      confirmada: false,
      marcada: false,
    },
    {
      token: null,
      flag: true,
      operativa: false,
      confirmada: false,
      marcada: true,
    },
    {
      token: null,
      flag: false,
      operativa: false,
      confirmada: false,
      marcada: false,
    },
    {
      token: null,
      flag: null,
      operativa: false,
      confirmada: false,
      marcada: false,
    },
  ];

  it.each(casos)(
    "token=$token flag=$flag → operativa=$operativa confirmada=$confirmada marcada=$marcada",
    ({ token, flag, operativa, confirmada, marcada }) => {
      const c = resolverConexionDeCalendario(
        fila({
          calendarProvider: "google",
          googleRefreshToken: token,
          googleCalendarConnected: flag,
        })
      );
      expect(conexionOperativa(c)).toBe(operativa);
      expect(conexionConfirmada(c)).toBe(confirmada);
      expect(marcadaComoConectada(c)).toBe(marcada);
    }
  );

  it("usaCalendarioExterno: Google basta con el token (calendarId por defecto)", () => {
    const c = resolverConexionDeCalendario(
      fila({ calendarProvider: "google", googleRefreshToken: "tok" })
    );
    expect(usaCalendarioExterno(c)).toBe(true);
  });

  it("usaCalendarioExterno: Outlook exige token y calendario elegido", () => {
    const sinCalendario = resolverConexionDeCalendario(
      fila({ calendarProvider: "outlook", outlookRefreshToken: "tok" })
    );
    expect(usaCalendarioExterno(sinCalendario)).toBe(false);

    const completa = resolverConexionDeCalendario(
      fila({
        calendarProvider: "outlook",
        outlookRefreshToken: "tok",
        outlookCalendarId: "cal_o",
      })
    );
    expect(usaCalendarioExterno(completa)).toBe(true);

    const sinToken = resolverConexionDeCalendario(
      fila({ calendarProvider: "outlook", outlookCalendarId: "cal_o" })
    );
    expect(usaCalendarioExterno(sinToken)).toBe(false);
  });
});

describe("origenDeCalendario", () => {
  it("Google devuelve el calendario efectivo aunque no haya token", () => {
    expect(
      origenDeCalendario(
        resolverConexionDeCalendario(fila({ calendarProvider: "google" }))
      )
    ).toEqual({ provider: "google", calendarId: "primary" });
  });

  it("Outlook con calendario elegido lo devuelve", () => {
    expect(
      origenDeCalendario(
        resolverConexionDeCalendario(
          fila({ calendarProvider: "outlook", outlookCalendarId: "cal_o" })
        )
      )
    ).toEqual({ provider: "outlook", calendarId: "cal_o" });
  });

  it("Outlook sin calendario elegido → null", () => {
    expect(
      origenDeCalendario(
        resolverConexionDeCalendario(fila({ calendarProvider: "outlook" }))
      )
    ).toBeNull();
  });
});

describe("marcarCalendarioDesconectado", () => {
  let del: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    del = vi.fn().mockResolvedValue(1);
    mockedGetRedis.mockReturnValue({ del } as any);
    mockedBusinessUpdate.mockResolvedValue({ id: "biz_1" } as any);
  });

  it("modo revocar en Google anula el refresh token y marca invalid_grant", async () => {
    await marcarCalendarioDesconectado("biz_1", "google", { modo: "revocar" });

    expect(mockedBusinessUpdate).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: {
        googleCalendarConnected: false,
        googleRefreshToken: null,
        googleCalendarLastError: "invalid_grant",
        googleCalendarDisconnectedAt: expect.any(Date),
      },
    });
    expect(del).toHaveBeenCalledWith("voice_config:biz_1");
  });

  it("modo panel en Google conserva el refresh token y guarda el motivo", async () => {
    await marcarCalendarioDesconectado("biz_1", "google", {
      modo: "panel",
      motivo: "La conexión con Google ya no es válida.",
    });

    expect(mockedBusinessUpdate).toHaveBeenCalledTimes(1);
    const { data } = mockedBusinessUpdate.mock.calls[0][0] as any;
    expect(data).not.toHaveProperty("googleRefreshToken");
    expect(data).not.toHaveProperty("outlookRefreshToken");
    expect(data.googleCalendarConnected).toBe(false);
    expect(data.googleCalendarLastError).toBe(
      "La conexión con Google ya no es válida."
    );
    expect(data.googleCalendarDisconnectedAt).toBeInstanceOf(Date);
    expect(del).toHaveBeenCalledWith("voice_config:biz_1");
  });

  it("modo revocar en Outlook toca solo las columnas outlook*", async () => {
    await marcarCalendarioDesconectado("biz_1", "outlook", {
      modo: "revocar",
    });

    expect(mockedBusinessUpdate).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: {
        outlookCalendarConnected: false,
        outlookRefreshToken: null,
        outlookCalendarLastError: "invalid_grant",
        outlookCalendarDisconnectedAt: expect.any(Date),
      },
    });
    const { data } = mockedBusinessUpdate.mock.calls[0][0] as any;
    expect(data).not.toHaveProperty("googleCalendarConnected");
  });

  it("modo panel en Outlook conserva el refresh token", async () => {
    await marcarCalendarioDesconectado("biz_1", "outlook", {
      modo: "panel",
      motivo: "Outlook caído",
    });

    const { data } = mockedBusinessUpdate.mock.calls[0][0] as any;
    expect(data).not.toHaveProperty("outlookRefreshToken");
    expect(data.outlookCalendarConnected).toBe(false);
    expect(data.outlookCalendarLastError).toBe("Outlook caído");
  });

  it("no lanza si la BD falla y aun así invalida la caché de voz", async () => {
    mockedBusinessUpdate.mockRejectedValue(new Error("postgres caído"));
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
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[VoiceTools]"),
      "postgres caído"
    );
    errorSpy.mockRestore();
  });

  it("no lanza si Redis falla", async () => {
    mockedGetRedis.mockReturnValue({
      del: vi.fn().mockRejectedValue(new Error("redis caído")),
    } as any);
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

  it("selectGoogleCalendar: produce EXACTAMENTE el data histórico (sin refresh token)", async () => {
    const business = await guardarConexionDeCalendario("biz_1", {
      provider: "google",
      calendarId: "secundario_id",
      conectado: true,
    });

    expect(mockedBusinessUpdate).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: {
        calendarProvider: "google",
        googleCalendarId: "secundario_id",
        googleCalendarConnected: true,
        googleCalendarDisconnectedAt: null,
        googleCalendarLastError: null,
      },
    });
    expect(del).toHaveBeenCalledWith("voice_config:biz_1");
    expect(business).toEqual({ id: "biz_1" });
  });

  it("handleCallback: Google con refresh token y calendario 'primary'", async () => {
    await guardarConexionDeCalendario("biz_1", {
      provider: "google",
      refreshToken: "rt_google",
      calendarId: "primary",
      conectado: true,
    });

    expect(mockedBusinessUpdate).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: {
        calendarProvider: "google",
        googleRefreshToken: "rt_google",
        googleCalendarId: "primary",
        googleCalendarConnected: true,
        googleCalendarDisconnectedAt: null,
        googleCalendarLastError: null,
      },
    });
  });

  it("handleMicrosoftCallback: Outlook con email y SIN outlookCalendarId", async () => {
    await guardarConexionDeCalendario("biz_1", {
      provider: "outlook",
      refreshToken: "rt_outlook",
      conectado: false,
      userEmail: "dueno@negocio.es",
    });

    expect(mockedBusinessUpdate).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: {
        calendarProvider: "outlook",
        outlookRefreshToken: "rt_outlook",
        outlookCalendarConnected: false,
        outlookCalendarDisconnectedAt: null,
        outlookCalendarLastError: null,
        outlookUserEmail: "dueno@negocio.es",
      },
    });
    const { data } = mockedBusinessUpdate.mock.calls[0][0] as any;
    expect(data).not.toHaveProperty("outlookCalendarId");
  });

  it("handleMicrosoftCallback: userEmail null se escribe como null (no se omite)", async () => {
    await guardarConexionDeCalendario("biz_1", {
      provider: "outlook",
      refreshToken: "rt_outlook",
      conectado: false,
      userEmail: null,
    });

    const { data } = mockedBusinessUpdate.mock.calls[0][0] as any;
    expect(data).toHaveProperty("outlookUserEmail", null);
  });

  it("connectMicrosoftCalendar: Outlook con calendario, sin token ni email", async () => {
    await guardarConexionDeCalendario("biz_1", {
      provider: "outlook",
      calendarId: "cal_o",
      conectado: true,
    });

    expect(mockedBusinessUpdate).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: {
        calendarProvider: "outlook",
        outlookCalendarId: "cal_o",
        outlookCalendarConnected: true,
        outlookCalendarDisconnectedAt: null,
        outlookCalendarLastError: null,
      },
    });
  });

  it("propaga el fallo de BD (no es best-effort) sin invalidar la caché", async () => {
    mockedBusinessUpdate.mockRejectedValue(new Error("postgres caído"));

    await expect(
      guardarConexionDeCalendario("biz_1", {
        provider: "google",
        calendarId: "primary",
        conectado: true,
      })
    ).rejects.toThrow("postgres caído");
    expect(del).not.toHaveBeenCalled();
  });
});

describe("persistirCredencialesRotadas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedBusinessUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("actualiza por VALOR del token viejo cuando Outlook rota el token", async () => {
    await persistirCredencialesRotadas(
      { provider: "outlook", refreshToken: "viejo" },
      { provider: "outlook", refreshToken: "nuevo" }
    );

    expect(mockedBusinessUpdateMany).toHaveBeenCalledWith({
      where: { outlookRefreshToken: "viejo" },
      data: { outlookRefreshToken: "nuevo" },
    });
  });

  it("no escribe si el token es el mismo", async () => {
    await persistirCredencialesRotadas(
      { provider: "outlook", refreshToken: "mismo" },
      { provider: "outlook", refreshToken: "mismo" }
    );
    expect(mockedBusinessUpdateMany).not.toHaveBeenCalled();
  });

  it("no escribe para Google (no rota el refresh token)", async () => {
    await persistirCredencialesRotadas(
      { provider: "google", refreshToken: "viejo" },
      { provider: "google", refreshToken: "nuevo" }
    );
    expect(mockedBusinessUpdateMany).not.toHaveBeenCalled();
  });

  it("no lanza si la BD falla (el token viejo sigue sirviendo)", async () => {
    mockedBusinessUpdateMany.mockRejectedValue(new Error("postgres caído"));
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      persistirCredencialesRotadas(
        { provider: "outlook", refreshToken: "viejo" },
        { provider: "outlook", refreshToken: "nuevo" }
      )
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Calendar]"),
      "postgres caído"
    );
    errorSpy.mockRestore();
  });
});

describe("conCallbackDeRotacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedBusinessUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("devuelve las credenciales tal cual y un callback que persiste la rotación", async () => {
    const cuenta = conCallbackDeRotacion({
      provider: "outlook",
      refreshToken: "viejo",
    });

    expect(cuenta.credentials).toEqual({
      provider: "outlook",
      refreshToken: "viejo",
    });
    await cuenta.alRotarCredenciales?.({
      provider: "outlook",
      refreshToken: "nuevo",
    });
    expect(mockedBusinessUpdateMany).toHaveBeenCalledWith({
      where: { outlookRefreshToken: "viejo" },
      data: { outlookRefreshToken: "nuevo" },
    });
  });
});
