import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  claveDeCacheDeVoz,
  invalidarCacheDeVoz,
} from "../../src/lib/voiceConfigCache.js";
import { getRedis } from "../../src/lib/redis.js";

vi.mock("../../src/lib/redis.js", () => ({
  getRedis: vi.fn(),
}));

describe("invalidarCacheDeVoz", () => {
  const del = vi.fn();
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    del.mockReset().mockResolvedValue(1);
    vi.mocked(getRedis).mockReturnValue({ del } as never);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("borra la clave voice_config:<negocio> y solo esa", async () => {
    await invalidarCacheDeVoz("biz_1");

    expect(claveDeCacheDeVoz("biz_1")).toBe("voice_config:biz_1");
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith("voice_config:biz_1");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("si el borrado falla no lanza y lo registra con el negocio, firmado [Calendar] por defecto", async () => {
    const fallo = new Error("Redis caído");
    del.mockRejectedValue(fallo);

    await expect(invalidarCacheDeVoz("biz_1")).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "[Calendar] No se pudo invalidar la caché de configuración de voz para biz_1:",
      fallo
    );
  });

  it("firma el log con el prefijo del módulo que la llama", async () => {
    const fallo = new Error("Redis caído");
    del.mockRejectedValue(fallo);

    await invalidarCacheDeVoz("biz_1", "[Phone]");

    expect(consoleError).toHaveBeenCalledWith(
      "[Phone] No se pudo invalidar la caché de configuración de voz para biz_1:",
      fallo
    );
  });

  it("tampoco lanza si Redis no está inicializado", async () => {
    vi.mocked(getRedis).mockImplementation(() => {
      throw new Error("Redis no inicializado");
    });

    await expect(
      invalidarCacheDeVoz("biz_1", "[Booking settings]")
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "[Booking settings] No se pudo invalidar la caché de configuración de voz para biz_1:",
      expect.any(Error)
    );
  });
});
