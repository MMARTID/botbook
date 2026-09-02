import Fastify from "fastify";
import { prisma } from "./lib/prisma.js";
import { initRedis } from "./lib/redis.js";
import { initStorage } from "./lib/storage.js";
import { processRecordingWorker } from "./jobs/processRecording.js";
import { processRetryFailedBookingWorker } from "./jobs/retryFailedBooking.js";
import {
  processZombieWorker,
  scheduleZombieCallCleanup,
} from "./jobs/cleanupZombieCalls.js";

// Entry point separado del servidor HTTP (server.ts): solo procesa jobs de
// BullMQ (grabaciones, limpieza de llamadas zombie). Pensado para correr
// como su propio servicio (p. ej. Cloud Run con min-instances >= 1 y CPU
// siempre asignada), sin recibir tráfico público real.
const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

async function start() {
  console.log("[Worker] Initializing external services...");
  initRedis();
  initStorage();

  console.log("[Worker] Initializing job workers...");
  const recordingWorker = await processRecordingWorker();
  const retryBookingWorker = await processRetryFailedBookingWorker();
  const zombieWorker = await processZombieWorker();
  scheduleZombieCallCleanup();

  // Cloud Run exige que el contenedor escuche en $PORT aunque este
  // servicio no reciba tráfico público — health check mínimo.
  const fastify = Fastify({ logger: true });
  fastify.get("/", async () => ({ status: "ok" }));

  await fastify.listen({ port: PORT, host: HOST });
  console.log(`[Worker] Health check escuchando en http://${HOST}:${PORT}`);

  const shutdown = async (signal: string) => {
    console.log(`[Worker] ${signal} recibido, cerrando workers...`);
    await recordingWorker.close();
    await retryBookingWorker.close();
    await zombieWorker.close();
    await fastify.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((error) => {
  console.error("[Worker] Fatal error:", error);
  process.exit(1);
});
