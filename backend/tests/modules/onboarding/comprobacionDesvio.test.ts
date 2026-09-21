import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";
import { telnyxAiAdapter } from "../../../src/adapters/telnyx/TelnyxAiAdapter.js";
import {
  COMPROBACION_TTL_SEGUNDOS,
  ComprobacionDeDesvioError,
  DURACION_MAXIMA_DE_LLAMADA_SEGUNDOS,
  LIMITE_DE_COMPROBACIONES_POR_HORA,
  TIMEOUT_DE_LLAMADA_SEGUNDOS,
  VENTANA_DE_ATRIBUCION_SEGUNDOS,
  codificarClientState,
  comprobacionDeDesvioReciente,
  iniciarComprobacionDeDesvio,
  leerClientStateDeComprobacion,
  motivoDeFalloPorColgado,
  obtenerComprobacionDeDesvio,
  registrarLlamadaDeComprobacionRecibida,
  registrarSalienteColgada,
  registrarSalienteContestada,
} from "../../../src/modules/onboarding/comprobacionDesvio.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    onboardingState: { upsert: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("../../../src/lib/redis.js", () => ({ getRedis: vi.fn() }));

vi.mock("../../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: { dialCall: vi.fn() },
}));

/** Redis en memoria con lo justo que usa el módulo (SET EX/NX, GET, DEL,
 * INCR, EXPIRE y los hashes HSET/HSETNX/HGETALL). Los TTL se guardan para
 * poder afirmarlos, no se aplican. */
function redisEnMemoria() {
  const datos = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const ttls = new Map<string, number>();
  const hash = (key: string) => {
    let h = hashes.get(key);
    if (!h) {
      h = new Map();
      hashes.set(key, h);
    }
    return h;
  };
  return {
    datos,
    hashes,
    ttls,
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      const nx = args.includes("NX");
      if (nx && datos.has(key)) return null;
      datos.set(key, value);
      const exIndex = args.indexOf("EX");
      if (exIndex >= 0) ttls.set(key, Number(args[exIndex + 1]));
      return "OK";
    }),
    get: vi.fn(async (key: string) => datos.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      const habia = datos.delete(key) || hashes.delete(key);
      return habia ? 1 : 0;
    }),
    incr: vi.fn(async (key: string) => {
      const siguiente = Number(datos.get(key) ?? 0) + 1;
      datos.set(key, String(siguiente));
      return siguiente;
    }),
    expire: vi.fn(async (key: string, segundos: number) => {
      ttls.set(key, segundos);
      return 1;
    }),
    hset: vi.fn(
      async (key: string, ...args: [Record<string, string>] | string[]) => {
        const h = hash(key);
        if (typeof args[0] === "object") {
          for (const [campo, valor] of Object.entries(args[0])) {
            h.set(campo, String(valor));
          }
          return Object.keys(args[0]).length;
        }
        h.set(String(args[0]), String(args[1]));
        return 1;
      }
    ),
    hsetnx: vi.fn(async (key: string, campo: string, valor: string) => {
      const h = hash(key);
      if (h.has(campo)) return 0;
      h.set(campo, valor);
      return 1;
    }),
    hgetall: vi.fn(async (key: string) =>
      Object.fromEntries(hashes.get(key) ?? new Map())
    ),
  };
}

const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedStateUpsert = vi.mocked(prisma.onboardingState.upsert);
const mockedStateUpdateMany = vi.mocked(prisma.onboardingState.updateMany);
const mockedGetRedis = vi.mocked(getRedis);
const mockedDialCall = vi.mocked(telnyxAiAdapter.dialCall);

const ALHABLA = "+34930453218";
const LINEA = "+34931112233";

function negocio(overrides: Record<string, unknown> = {}) {
  return {
    id: "biz_1",
    phone: LINEA,
    telnyxPhoneNumber: ALHABLA,
    phoneNumberStatus: "active",
    customerLineType: "fijo",
    voiceRoutingTarget: "telnyx",
    ...overrides,
  } as any;
}

let redis: ReturnType<typeof redisEnMemoria>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  redis = redisEnMemoria();
  mockedGetRedis.mockReturnValue(redis as any);
  mockedBusinessFindUnique.mockResolvedValue(negocio());
  mockedDialCall.mockResolvedValue({
    callControlId: "call_ctrl_out",
    callLegId: "leg_out",
  });
  mockedStateUpsert.mockResolvedValue({} as any);
  mockedStateUpdateMany.mockResolvedValue({ count: 0 } as any);
  process.env.TELNYX_CALL_CONTROL_APP_ID = "cc_app_1";
});

afterEach(() => {
  delete process.env.TELNYX_CALL_CONTROL_APP_ID;
});

async function iniciarYEsperarError(businessId = "biz_1") {
  try {
    await iniciarComprobacionDeDesvio(businessId);
  } catch (error) {
    return error as ComprobacionDeDesvioError;
  }
  throw new Error("Se esperaba un ComprobacionDeDesvioError");
}

describe("client_state de la comprobación", () => {
  it("codifica en base64 y se lee de vuelta", () => {
    const codificado = codificarClientState({
      businessId: "biz_1",
      checkId: "abc",
    });

    expect(codificado).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(leerClientStateDeComprobacion(codificado)).toEqual({
      tipo: "comprobacion_desvio",
      businessId: "biz_1",
      checkId: "abc",
    });
  });

  it("ignora client_state ajenos, vacíos o corruptos", () => {
    expect(leerClientStateDeComprobacion(undefined)).toBeNull();
    expect(leerClientStateDeComprobacion("")).toBeNull();
    expect(leerClientStateDeComprobacion("no-es-base64!!")).toBeNull();
    expect(
      leerClientStateDeComprobacion(
        Buffer.from(JSON.stringify({ tipo: "otra_cosa" })).toString("base64")
      )
    ).toBeNull();
    expect(
      leerClientStateDeComprobacion(
        Buffer.from(JSON.stringify({ tipo: "comprobacion_desvio" })).toString(
          "base64"
        )
      )
    ).toBeNull();
  });
});

describe("iniciarComprobacionDeDesvio", () => {
  it("origina la llamada desde el número de Alhabla a la línea de clientes y guarda la comprobación", async () => {
    const check = await iniciarComprobacionDeDesvio("biz_1");

    expect(check).toMatchObject({
      businessId: "biz_1",
      linea: LINEA,
      callControlId: "call_ctrl_out",
      contestada: false,
      resultado: null,
      resueltaAt: null,
    });
    expect(check.id).toMatch(/^[0-9a-f]{32}$/);

    expect(mockedDialCall).toHaveBeenCalledTimes(1);
    const dial = mockedDialCall.mock.calls[0][0];
    expect(dial).toMatchObject({
      connectionId: "cc_app_1",
      from: ALHABLA,
      to: LINEA,
      timeoutSecs: TIMEOUT_DE_LLAMADA_SEGUNDOS,
      timeLimitSecs: DURACION_MAXIMA_DE_LLAMADA_SEGUNDOS,
    });
    expect(leerClientStateDeComprobacion(dial.clientState)).toEqual({
      tipo: "comprobacion_desvio",
      businessId: "biz_1",
      checkId: check.id,
    });

    // Comprobación con TTL, turno del negocio reservado, puntero a la última
    // y contador por hora.
    expect(redis.ttls.get(`desvio:check:${check.id}`)).toBe(
      COMPROBACION_TTL_SEGUNDOS
    );
    expect(redis.datos.get("desvio:check:negocio:biz_1")).toBe(check.id);
    expect(redis.datos.get("desvio:check:ultima:biz_1")).toBe(check.id);
    expect(redis.ttls.get("desvio:check:ultima:biz_1")).toBe(
      COMPROBACION_TTL_SEGUNDOS
    );
    expect(redis.datos.get("desvio:check:limite:biz_1")).toBe("1");
    expect(redis.ttls.get("desvio:check:limite:biz_1")).toBe(3600);
    await expect(comprobacionDeDesvioReciente("biz_1")).resolves.toBe(check.id);
  });

  it("guarda la comprobación ANTES de marcar: con desvío «todas» la entrante puede llegar antes de que dial() devuelva", async () => {
    let comprobacionAlMarcar: unknown = null;
    mockedDialCall.mockImplementation(async () => {
      const id = redis.datos.get("desvio:check:ultima:biz_1");
      comprobacionAlMarcar = id
        ? await obtenerComprobacionDeDesvio(id, "biz_1")
        : null;
      return { callControlId: "call_ctrl_out", callLegId: "leg_out" };
    });

    const check = await iniciarComprobacionDeDesvio("biz_1");

    expect(comprobacionAlMarcar).toMatchObject({
      id: check.id,
      linea: LINEA,
      callControlId: null,
      resultado: null,
    });
    // Y al volver dial() queda anotado el call_control_id.
    await expect(
      obtenerComprobacionDeDesvio(check.id, "biz_1")
    ).resolves.toMatchObject({ callControlId: "call_ctrl_out" });
  });

  it("si la entrante llega mientras dial() está en vuelo, el ok no se pierde al anotar el call_control_id", async () => {
    mockedDialCall.mockImplementation(async () => {
      await registrarLlamadaDeComprobacionRecibida("biz_1");
      return { callControlId: "call_ctrl_out", callLegId: "leg_out" };
    });

    const check = await iniciarComprobacionDeDesvio("biz_1");

    await expect(
      obtenerComprobacionDeDesvio(check.id, "biz_1")
    ).resolves.toMatchObject({
      callControlId: "call_ctrl_out",
      resultado: { estado: "ok" },
    });
  });

  it("402 sin número de Alhabla activo", async () => {
    mockedBusinessFindUnique.mockResolvedValue(
      negocio({ phoneNumberStatus: "purchased" })
    );
    let error = await iniciarYEsperarError();
    expect(error).toBeInstanceOf(ComprobacionDeDesvioError);
    expect(error.codigo).toBe("sin_numero");
    expect(error.status).toBe(402);

    mockedBusinessFindUnique.mockResolvedValue(
      negocio({ telnyxPhoneNumber: null })
    );
    error = await iniciarYEsperarError();
    expect(error.codigo).toBe("sin_numero");
    expect(mockedDialCall).not.toHaveBeenCalled();
  });

  it("409 si la línea de clientes es el placeholder del registro, el propio número de Alhabla o el negocio usa Alhabla como principal", async () => {
    mockedBusinessFindUnique.mockResolvedValue(
      negocio({ phone: "TEMP-1234-abcd" })
    );
    let error = await iniciarYEsperarError();
    expect(error.codigo).toBe("linea_de_clientes_invalida");
    expect(error.status).toBe(409);

    mockedBusinessFindUnique.mockResolvedValue(negocio({ phone: ALHABLA }));
    error = await iniciarYEsperarError();
    expect(error.codigo).toBe("linea_de_clientes_invalida");

    mockedBusinessFindUnique.mockResolvedValue(
      negocio({ customerLineType: "alhabla" })
    );
    error = await iniciarYEsperarError();
    expect(error.codigo).toBe("linea_de_clientes_invalida");
    expect(mockedDialCall).not.toHaveBeenCalled();
  });

  it("409 linea_no_admitida si la línea no es un fijo ni un móvil español: la llamada la paga Alhabla", async () => {
    for (const linea of [
      "+34806123456", // tarificación adicional
      "+34900123456", // gratuito, no es una línea de clientes
      "+34700123456", // número personal
      "+34512345678", // nómada
      "+447911123456", // internacional
    ]) {
      mockedBusinessFindUnique.mockResolvedValue(negocio({ phone: linea }));
      const error = await iniciarYEsperarError();
      expect(error.codigo, linea).toBe("linea_no_admitida");
      expect(error.status).toBe(409);
    }
    expect(mockedDialCall).not.toHaveBeenCalled();
    expect(redis.datos.size).toBe(0);

    // Móvil y fijo geográfico sí.
    mockedBusinessFindUnique.mockResolvedValue(
      negocio({ phone: "+34612345678" })
    );
    await iniciarComprobacionDeDesvio("biz_1");
    expect(mockedDialCall).toHaveBeenCalledTimes(1);
  });

  it("503 si el número está en failover a Retell: la llamada desviada no volvería por nuestro webhook", async () => {
    mockedBusinessFindUnique.mockResolvedValue(
      negocio({ voiceRoutingTarget: "retell" })
    );

    const error = await iniciarYEsperarError();

    expect(error.codigo).toBe("telefonia_no_configurada");
    expect(error.status).toBe(503);
    expect(mockedDialCall).not.toHaveBeenCalled();
    expect(redis.datos.size).toBe(0);
  });

  it("503 sin TELNYX_CALL_CONTROL_APP_ID, sin reservar nada", async () => {
    delete process.env.TELNYX_CALL_CONTROL_APP_ID;

    const error = await iniciarYEsperarError();

    expect(error.codigo).toBe("telefonia_no_configurada");
    expect(error.status).toBe(503);
    expect(redis.datos.size).toBe(0);
  });

  it("no pasa de tres comprobaciones por hora y negocio", async () => {
    for (let i = 0; i < LIMITE_DE_COMPROBACIONES_POR_HORA; i++) {
      const check = await iniciarComprobacionDeDesvio("biz_1");
      // Cada una termina antes de la siguiente.
      await registrarSalienteColgada(check.id, "timeout");
    }
    expect(mockedDialCall).toHaveBeenCalledTimes(3);

    const error = await iniciarYEsperarError();

    expect(error.codigo).toBe("limite_alcanzado");
    expect(error.status).toBe(429);
    expect(mockedDialCall).toHaveBeenCalledTimes(3);
    // El turno del negocio queda libre para cuando pase la hora.
    expect(redis.datos.has("desvio:check:negocio:biz_1")).toBe(false);
  });

  it("409 si ya hay una comprobación en marcha para el negocio", async () => {
    await iniciarComprobacionDeDesvio("biz_1");

    const error = await iniciarYEsperarError();

    expect(error.codigo).toBe("comprobacion_en_curso");
    expect(error.status).toBe(409);
    expect(mockedDialCall).toHaveBeenCalledTimes(1);
  });

  it("el límite es por negocio: otro negocio no se ve afectado", async () => {
    redis.datos.set("desvio:check:limite:biz_1", "3");
    mockedBusinessFindUnique.mockResolvedValue(negocio({ id: "biz_2" }));

    const check = await iniciarComprobacionDeDesvio("biz_2");

    expect(check.businessId).toBe("biz_2");
    expect(mockedDialCall).toHaveBeenCalledTimes(1);
  });

  it("502 si Telnyx no puede originar la llamada, y libera el turno sin contarla", async () => {
    mockedDialCall.mockRejectedValue(new Error("D38 sin outbound profile"));

    const error = await iniciarYEsperarError();

    expect(error.codigo).toBe("no_se_pudo_llamar");
    expect(error.status).toBe(502);
    expect(redis.datos.has("desvio:check:negocio:biz_1")).toBe(false);
    expect(redis.datos.has("desvio:check:limite:biz_1")).toBe(false);
    // La comprobación que no llegó a salir no queda en Redis: ninguna
    // entrante posterior se le atribuiría.
    expect(redis.datos.has("desvio:check:ultima:biz_1")).toBe(false);
    expect(redis.hashes.size).toBe(0);
    await expect(comprobacionDeDesvioReciente("biz_1")).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("D38 sin outbound profile")
    );
  });
});

describe("obtenerComprobacionDeDesvio", () => {
  it("devuelve la comprobación del propio negocio y null para un id ajeno, inexistente o mal formado", async () => {
    const check = await iniciarComprobacionDeDesvio("biz_1");

    await expect(
      obtenerComprobacionDeDesvio(check.id, "biz_1")
    ).resolves.toEqual(check);
    await expect(
      obtenerComprobacionDeDesvio(check.id, "biz_otro")
    ).resolves.toBeNull();
    await expect(
      obtenerComprobacionDeDesvio("f".repeat(32), "biz_1")
    ).resolves.toBeNull();
    await expect(
      obtenerComprobacionDeDesvio("../desvio:check:negocio:biz_1", "biz_1")
    ).resolves.toBeNull();
    expect(redis.get).not.toHaveBeenCalledWith(expect.stringContaining("../"));
  });
});

describe("resolución por los webhooks", () => {
  it("la entrada por el número de Alhabla marca ok, libera el turno y deja constancia en OnboardingState", async () => {
    const check = await iniciarComprobacionDeDesvio("biz_1");

    const resuelta = await registrarLlamadaDeComprobacionRecibida("biz_1");

    expect(resuelta?.id).toBe(check.id);
    expect(resuelta?.resultado).toEqual({ estado: "ok" });
    expect(resuelta?.resueltaAt).toEqual(expect.any(String));
    expect(redis.datos.has("desvio:check:negocio:biz_1")).toBe(false);
    // El puntero a la última comprobación se queda hasta caducar.
    expect(redis.datos.get("desvio:check:ultima:biz_1")).toBe(check.id);
    await expect(
      obtenerComprobacionDeDesvio(check.id, "biz_1")
    ).resolves.toMatchObject({ resultado: { estado: "ok" } });

    expect(mockedStateUpsert).toHaveBeenCalledWith({
      where: { businessId: "biz_1" },
      create: {
        businessId: "biz_1",
        forwardingCheckedAt: expect.any(Date),
        forwardingConfirmedAt: expect.any(Date),
      },
      update: { forwardingCheckedAt: expect.any(Date) },
    });
    // forwardingConfirmedAt solo si todavía no estaba («el usuario dice»
    // no se pisa con una fecha posterior).
    expect(mockedStateUpdateMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1", forwardingConfirmedAt: null },
      data: { forwardingConfirmedAt: expect.any(Date) },
    });
  });

  it("sin comprobación viva devuelve null pero anota igualmente el desvío como comprobado", async () => {
    const resuelta = await registrarLlamadaDeComprobacionRecibida("biz_1");

    expect(resuelta).toBeNull();
    expect(mockedStateUpsert).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("sin comprobación viva")
    );
  });

  it("la saliente colgada sin haber entrado nada es un fallo con motivo", async () => {
    const check = await iniciarComprobacionDeDesvio("biz_1");

    const resuelta = await registrarSalienteColgada(check.id, "timeout");

    expect(resuelta?.resultado).toEqual({
      estado: "fallo",
      motivo: "sin_desvio",
    });
    expect(redis.datos.has("desvio:check:negocio:biz_1")).toBe(false);
  });

  it("si alguien cogió la saliente, el fallo es «la has cogido» sea cual sea el hangup_cause", async () => {
    const check = await iniciarComprobacionDeDesvio("biz_1");

    await expect(registrarSalienteContestada(check.id)).resolves.toMatchObject({
      contestada: true,
      resultado: null,
    });
    const resuelta = await registrarSalienteColgada(
      check.id,
      "normal_clearing"
    );

    expect(resuelta?.resultado).toEqual({
      estado: "fallo",
      motivo: "la_has_cogido",
    });
  });

  it("un ok ya registrado no lo pisa el colgado posterior de la saliente", async () => {
    const check = await iniciarComprobacionDeDesvio("biz_1");
    await registrarLlamadaDeComprobacionRecibida("biz_1");

    const resuelta = await registrarSalienteColgada(check.id, "call_rejected");

    expect(resuelta?.resultado).toEqual({ estado: "ok" });
  });

  it("un ok tardío sí pisa un fallo previo: la entrada por Alhabla es la prueba definitiva", async () => {
    const check = await iniciarComprobacionDeDesvio("biz_1");
    // El colgado de la saliente (timeout a los 35 s) se procesa antes que
    // la entrante desviada (otra instancia): el fallo no puede ser la
    // última palabra.
    await expect(
      registrarSalienteColgada(check.id, "timeout")
    ).resolves.toMatchObject({
      resultado: { estado: "fallo", motivo: "sin_desvio" },
    });
    expect(redis.datos.has("desvio:check:negocio:biz_1")).toBe(false);

    const resuelta = await registrarLlamadaDeComprobacionRecibida("biz_1");

    expect(resuelta?.id).toBe(check.id);
    expect(resuelta?.resultado).toEqual({ estado: "ok" });
    await expect(
      obtenerComprobacionDeDesvio(check.id, "biz_1")
    ).resolves.toMatchObject({ resultado: { estado: "ok" } });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("pisa el fallo anterior")
    );
  });

  it("si el ok se escribe entre la lectura y la escritura del colgado, el colgado no lo pisa (HSETNX)", async () => {
    const check = await iniciarComprobacionDeDesvio("biz_1");
    // El colgado lee la comprobación sin resolver; antes de que escriba,
    // la entrante la marca ok.
    const hgetallOriginal = redis.hgetall.getMockImplementation()!;
    redis.hgetall.mockImplementationOnce(async (key: string) => {
      const antes = await hgetallOriginal(key);
      await registrarLlamadaDeComprobacionRecibida("biz_1");
      return antes;
    });

    const resuelta = await registrarSalienteColgada(check.id, "timeout");

    expect(resuelta?.resultado).toEqual({ estado: "ok" });
    await expect(
      obtenerComprobacionDeDesvio(check.id, "biz_1")
    ).resolves.toMatchObject({ resultado: { estado: "ok" } });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("ya resuelta por la entrada desviada")
    );
  });

  it("comprobacionDeDesvioReciente solo mira la ventana de atribución, resuelta o no", async () => {
    vi.useFakeTimers();
    try {
      const check = await iniciarComprobacionDeDesvio("biz_1");
      await registrarSalienteColgada(check.id, "timeout");

      // Recién fallida: una entrante presentada por la propia línea sigue
      // siendo la comprobación.
      await expect(comprobacionDeDesvioReciente("biz_1")).resolves.toBe(
        check.id
      );

      vi.advanceTimersByTime((VENTANA_DE_ATRIBUCION_SEGUNDOS + 1) * 1000);
      await expect(comprobacionDeDesvioReciente("biz_1")).resolves.toBeNull();
      // Pero la entrada desde el número de Alhabla no tiene ambigüedad y
      // vale mientras la comprobación exista.
      const resuelta = await registrarLlamadaDeComprobacionRecibida("biz_1");
      expect(resuelta?.resultado).toEqual({ estado: "ok" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("los webhooks de una comprobación caducada no rompen nada", async () => {
    await expect(
      registrarSalienteContestada("f".repeat(32))
    ).resolves.toBeNull();
    await expect(
      registrarSalienteColgada("f".repeat(32), "timeout")
    ).resolves.toBeNull();
  });
});

describe("motivoDeFalloPorColgado", () => {
  it("traduce el hangup_cause de Telnyx", () => {
    expect(
      motivoDeFalloPorColgado({ contestada: true, hangupCause: "timeout" })
    ).toBe("la_has_cogido");
    expect(
      motivoDeFalloPorColgado({ contestada: false, hangupCause: "user_busy" })
    ).toBe("comunicando");
    expect(
      motivoDeFalloPorColgado({
        contestada: false,
        hangupCause: "call_rejected",
      })
    ).toBe("comunicando");
    expect(
      motivoDeFalloPorColgado({ contestada: false, hangupCause: "timeout" })
    ).toBe("sin_desvio");
    expect(
      motivoDeFalloPorColgado({ contestada: false, hangupCause: "no_answer" })
    ).toBe("sin_desvio");
    expect(
      motivoDeFalloPorColgado({ contestada: false, hangupCause: "not_found" })
    ).toBe("desconocido");
    expect(
      motivoDeFalloPorColgado({ contestada: false, hangupCause: undefined })
    ).toBe("desconocido");
  });
});
