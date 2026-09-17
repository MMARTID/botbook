import { prisma } from "../lib/prisma.js";

// 20 minutos, no 60: el agente cuelga solo a los 10 (maxCallDurationMs), así
// que una llamada que sigue "en curso" pasados 20 es un zombi seguro. Con el
// umbral anterior podía quedarse viva hasta 75 minutos y el heurístico de
// vinculación de reservas llegaba a elegirla como "la llamada actual".
const ZOMBIE_CALL_THRESHOLD_MINUTES = 20;

/**
 * Marca como TIMED_OUT las llamadas que llevan más de 20 minutos en
 * IN_PROGRESS sin actualizarse (el proveedor de voz nunca mandó el evento de
 * fin de llamada). Invocado cada 15 min por Cloud Scheduler vía
 * POST /internal/jobs/cleanup-zombie-calls.
 */
export async function cleanupZombieCallsJob(): Promise<void> {
  console.log("[Reaper] Buscando llamadas zombie...");

  const threshold = new Date(Date.now() - ZOMBIE_CALL_THRESHOLD_MINUTES * 60 * 1000);

  const zombieCalls = await prisma.call.findMany({
    where: {
      status: "IN_PROGRESS",
      updatedAt: { lt: threshold },
    },
    select: { id: true },
  });

  if (zombieCalls.length === 0) {
    console.log("[Reaper] No se encontraron llamadas zombie.");
    return;
  }

  console.log(`[Reaper] Se encontraron ${zombieCalls.length} llamadas zombie. Marcando como TIMED_OUT...`);

  // El predicado se repite aquí a propósito: entre el findMany y este update
  // puede llegar el webhook call_ended y dejar la llamada en COMPLETED con su
  // duración real. Sin volver a exigir IN_PROGRESS, el barrido la degradaría a
  // TIMED_OUT y perderíamos una llamada buena del historial.
  const { count } = await prisma.call.updateMany({
    where: {
      id: { in: zombieCalls.map((call) => call.id) },
      status: "IN_PROGRESS",
      updatedAt: { lt: threshold },
    },
    data: { status: "TIMED_OUT" },
  });

  console.log(`[Reaper] ${count} llamadas marcadas como TIMED_OUT.`);

  console.log("[Reaper] Limpieza completada.");
}
