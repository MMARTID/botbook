import { describe, it, expect, vi, beforeEach } from "vitest";
import { acquireBookingLock, releaseBookingLock } from "../../src/lib/bookingLock.js";
import { getRedis } from "../../src/lib/redis.js";

vi.mock("../../src/lib/redis.js", () => ({
  getRedis: vi.fn(),
}));

const mockedGetRedis = vi.mocked(getRedis);

describe("acquireBookingLock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adquiere el lock a la primera si está libre (SET NX devuelve OK)", async () => {
    const set = vi.fn().mockResolvedValue("OK");
    mockedGetRedis.mockReturnValue({ set } as any);

    const token = await acquireBookingLock("biz_1");

    expect(token).not.toBeNull();
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("booking_lock:biz_1", expect.any(String), "PX", 45_000, "NX");
  });

  it("reintenta si el lock está ocupado y lo consigue cuando se libera", async () => {
    vi.useFakeTimers();
    try {
      const set = vi
        .fn()
        .mockResolvedValueOnce(null) // ocupado
        .mockResolvedValueOnce(null) // sigue ocupado
        .mockResolvedValueOnce("OK"); // libre
      mockedGetRedis.mockReturnValue({ set } as any);

      const promise = acquireBookingLock("biz_1");
      await vi.runAllTimersAsync();
      const token = await promise;

      expect(token).not.toBeNull();
      expect(set).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("se rinde y devuelve null si el lock nunca se libera dentro del presupuesto de tiempo (6s / 300ms ≈ 20 intentos)", async () => {
    vi.useFakeTimers();
    try {
      const set = vi.fn().mockResolvedValue(null);
      mockedGetRedis.mockReturnValue({ set } as any);

      const promise = acquireBookingLock("biz_1");
      await vi.runAllTimersAsync();
      const token = await promise;

      expect(token).toBeNull();
      // Basado en un plazo de reloj (6000ms / 300ms de espera entre
      // intentos), no en un nº de intentos fijo — con timers falsos que
      // avanzan instantáneamente, el nº exacto de intentos que caben antes
      // de que Date.now() supere el plazo puede variar en ±1 según en qué
      // punto del bucle se evalúe; solo importa que se rinda dentro de un
      // rango razonable, no un conteo exacto.
      expect(set.mock.calls.length).toBeGreaterThanOrEqual(15);
      expect(set.mock.calls.length).toBeLessThanOrEqual(25);
    } finally {
      vi.useRealTimers();
    }
  });

  it("dos tokens de adquisiciones distintas nunca son iguales (para no liberar el lock de otro por error)", async () => {
    const set = vi.fn().mockResolvedValue("OK");
    mockedGetRedis.mockReturnValue({ set } as any);

    const tokenA = await acquireBookingLock("biz_1");
    const tokenB = await acquireBookingLock("biz_1");

    expect(tokenA).not.toBe(tokenB);
  });

  it("devuelve null sin reintentar si Redis falla (no cuelga la reserva esperando algo que no va a responder)", async () => {
    const set = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    mockedGetRedis.mockReturnValue({ set } as any);

    const token = await acquireBookingLock("biz_1");

    expect(token).toBeNull();
    expect(set).toHaveBeenCalledTimes(1);
  });
});

describe("releaseBookingLock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("llama a EVAL con la key y el token para borrar solo si coincide (compare-and-delete)", async () => {
    const evalFn = vi.fn().mockResolvedValue(1);
    mockedGetRedis.mockReturnValue({ eval: evalFn } as any);

    await releaseBookingLock("biz_1", "token-abc");

    expect(evalFn).toHaveBeenCalledWith(expect.any(String), 1, "booking_lock:biz_1", "token-abc");
  });

  it("no lanza si Redis falla al liberar (no debe romper la respuesta ya construida)", async () => {
    const evalFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    mockedGetRedis.mockReturnValue({ eval: evalFn } as any);

    await expect(releaseBookingLock("biz_1", "token-abc")).resolves.toBeUndefined();
  });
});
