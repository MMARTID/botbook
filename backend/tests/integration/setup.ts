import { config } from "dotenv";
import { initRedis } from "../../src/lib/redis.js";

// Carga DATABASE_URL/REDIS_URL de .env.test — Postgres/Redis reales de
// docker-compose (perfil dev), no contenedores nuevos: una base de datos
// separada (alhabla_test) y un índice de Redis separado (/1).
config({ path: ".env.test" });

// voiceTools/service.ts (y otros) usan getRedis(), que exige que
// initRedis() se haya llamado antes en el proceso.
initRedis();
