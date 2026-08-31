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
    maxRetriesPerRequest: null,
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
