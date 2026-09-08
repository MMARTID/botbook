import { describe, it, expect, vi, beforeEach } from "vitest";

const { MockedRedis } = vi.hoisted(() => ({
  MockedRedis: vi.fn(function RedisMock(this: any) {
    this.on = vi.fn();
    return this;
  }),
}));

vi.mock("ioredis", () => ({
  default: MockedRedis,
}));

describe("initRedis (hallazgo #31 de la auditoría)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("acota los reintentos y el tiempo de espera de cada comando, en vez de esperar indefinidamente", async () => {
    const { initRedis } = await import("../../src/lib/redis.js");

    initRedis();

    expect(MockedRedis).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        // null (el valor anterior) dejaba que un comando esperase sin
        // límite mientras el cliente reconectaba — un try/catch alrededor
        // nunca llegaba a ejecutarse durante una caída real de Redis.
        maxRetriesPerRequest: 1,
        // Cubre el caso complementario: Redis conectado pero colgado.
        commandTimeout: 3000,
      })
    );
  });
});
