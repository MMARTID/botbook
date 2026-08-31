import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";

/**
 * Limpia todas las tablas que tocan los tests de integración, en orden
 * seguro para las foreign keys (hijos antes que padres), y vacía el índice
 * de Redis de test. Llamar en un beforeEach para que los tests no dependan
 * del orden ni se contaminen entre sí.
 */
export async function resetDb(): Promise<void> {
  await prisma.$transaction([
    prisma.booking.deleteMany(),
    prisma.order.deleteMany(),
    prisma.transcript.deleteMany(),
    prisma.recording.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.call.deleteMany(),
    prisma.professionalService.deleteMany(),
    prisma.service.deleteMany(),
    prisma.professional.deleteMany(),
    prisma.agent.deleteMany(),
    prisma.stripeWebhookEvent.deleteMany(),
    prisma.onboardingState.deleteMany(),
    prisma.user.deleteMany(),
    prisma.business.deleteMany(),
  ]);

  await getRedis().flushdb();
}
