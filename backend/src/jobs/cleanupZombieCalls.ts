import { Worker, Job } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { Queue } from "bullmq";
import { getRedis, initRedis } from "../lib/redis.js";

const ZOMBIE_CALL_THRESHOLD_MINUTES = 60;

// Exportamos la cola para poder agregarle el job programado
export const zombieQueue = new Queue("zombie-call-cleanup", {
  connection: initRedis() as any,
});

export async function cleanupZombieCallsJob(job: Job) {
  console.log('[Reaper] Buscando llamadas zombie...');

  const threshold = new Date(Date.now() - ZOMBIE_CALL_THRESHOLD_MINUTES * 60 * 1000);

  const zombieCalls = await prisma.call.findMany({
    where: {
      status: 'IN_PROGRESS',
      updatedAt: {
        lt: threshold,
      },
    },
    select: { id: true }
  });

  if (zombieCalls.length === 0) {
    console.log('[Reaper] No se encontraron llamadas zombie.');
    return;
  }

  console.log(`[Reaper] Se encontraron ${zombieCalls.length} llamadas zombie. Marcando como TIMED_OUT...`);

  await prisma.call.updateMany({
    where: {
      id: {
        in: zombieCalls.map((call) => call.id),
      },
    },
    data: {
      status: 'TIMED_OUT',
    },
  });

  console.log('[Reaper] Limpieza completada.');
}

export function scheduleZombieCallCleanup() {
    zombieQueue.add(
        'cleanupZombieCalls',
        {},
        {
            jobId: 'zombie-call-cleanup-scheduler', // ID estable para evitar schedulers duplicados en reinicios
            repeat: {
                every: 15 * 60 * 1000, // Cada 15 mins
            },
            removeOnComplete: true,
            removeOnFail: true,
        }
    );
}

export async function processZombieWorker() {
    const redisConnection = getRedis();
    
    const worker = new Worker(
        "zombie-call-cleanup",
        cleanupZombieCallsJob,
        {
            connection: redisConnection as any,
            concurrency: 1,
        }
    );

    worker.on("failed", (job, err) => {
        console.error(`[Job] Reaper job failed:`, err);
    });

    return worker;
}
