import Redis from "ioredis";

type RedisClient = Redis;

const globalForRedis = globalThis as unknown as {
  redis: RedisClient | undefined;
};

let redis: RedisClient;

export function initRedis(): RedisClient {
  if (globalForRedis.redis) {
    return globalForRedis.redis;
  }

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  redis = new Redis(redisUrl, {
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    // maxRetriesPerRequest: null (el valor anterior) deja que un comando
    // espere indefinidamente mientras el cliente reconecta — durante una
    // caída de Redis, un simple `await redis.get(...)` podía colgarse sin
    // límite. Todo el código que usa Redis en este proyecto (voice_config,
    // booking_lock, etc.) está escrito asumiendo que un try/catch alrededor
    // basta para caer a Postgres o a un comportamiento sin caché — pero ese
    // catch nunca llegaba a ejecutarse si el propio await no terminaba
    // nunca, y una tool call de Retell solo tiene 20s de presupuesto total
    // (hallazgo #31 de la auditoría). commandTimeout cubre el caso
    // complementario: un Redis conectado pero colgado/degradado, que sin
    // esto podía hacer esperar indefinidamente aun sin estar reconectando.
    maxRetriesPerRequest: 1,
    commandTimeout: 3000,
  });

  redis.on("error", (err) => console.error("[Redis] Error:", err));
  redis.on("connect", () => console.log("[Redis] Connected"));

  if (process.env.NODE_ENV !== "production") {
    globalForRedis.redis = redis;
  }

  return redis;
}

export function getRedis(): RedisClient {
  if (!redis) {
    throw new Error("Redis not initialized. Call initRedis() first.");
  }
  return redis;
}
