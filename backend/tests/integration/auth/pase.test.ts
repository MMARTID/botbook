import { describe, it, expect, beforeEach } from "vitest";
import { getRedis } from "../../../src/lib/redis.js";
import { canjearPase, crearPase } from "../../../src/modules/auth/pase.js";

// Contra Redis real: un solo uso (getdel), caducidad y aislamiento entre
// pases. Lo que la web de marketing y la app se pasan entre dominios.
describe("pase de un solo uso (integración)", () => {
  beforeEach(async () => {
    await getRedis().flushdb();
  });

  it("se canjea una sola vez y devuelve exactamente el usuario con el que se creó", async () => {
    const pase = await crearPase({ id: "user_1", businessId: "biz_1" });
    expect(pase).toMatch(/^[0-9a-f]{64}$/);
    const otro = await crearPase({ id: "user_2", businessId: "biz_2" });
    expect(otro).not.toBe(pase);

    expect(await canjearPase(pase!)).toEqual({
      id: "user_1",
      businessId: "biz_1",
    });
    expect(await canjearPase(pase!)).toBeNull();
    expect(await canjearPase(otro!)).toEqual({
      id: "user_2",
      businessId: "biz_2",
    });
    expect(await getRedis().keys("auth:pase:*")).toEqual([]);
  });

  it("caduca a los 60 s y no admite códigos inventados", async () => {
    const pase = await crearPase({ id: "user_1", businessId: "biz_1" });
    const ttl = await getRedis().ttl(`auth:pase:${pase}`);
    expect(ttl).toBeGreaterThan(50);
    expect(ttl).toBeLessThanOrEqual(60);
    expect(await canjearPase("f".repeat(64))).toBeNull();
    expect(await canjearPase("no-es-un-pase")).toBeNull();
  });
});
