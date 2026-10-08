import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";
import { comprobarEntornoDeTest } from "./entornoDeTest.js";

/**
 * Limpia todas las tablas que tocan los tests de integración, en orden
 * seguro para las foreign keys (hijos antes que padres), y vacía el índice
 * de Redis de test. Llamar en un beforeEach para que los tests no dependan
 * del orden ni se contaminen entre sí.
 */
export async function resetDb(): Promise<void> {
  // Segunda barrera, por si alguien llama a resetDb sin pasar por setup.ts.
  comprobarEntornoDeTest();
  await prisma.$transaction([
    // Sin FK obligatoria con Call (onDelete: SetNull): borrar llamadas no lo
    // limpia, y un evento ya procesado en un test se daría por duplicado en
    // el siguiente.
    prisma.voiceWebhookEvent.deleteMany(),
    prisma.whatsappOptOut.deleteMany(),
    prisma.inboundMessage.deleteMany(),
    prisma.sentMessage.deleteMany(),
    prisma.whatsappTemplate.deleteMany(),
    prisma.whatsappSender.deleteMany(),
    prisma.ownerPendingAction.deleteMany(),
    prisma.ownerChatFeedback.deleteMany(),
    prisma.professionalAbsence.deleteMany(),
    prisma.clientConversation.deleteMany(),
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
    prisma.calendarConnection.deleteMany(),
    prisma.user.deleteMany(),
    prisma.business.deleteMany(),
  ]);

  await getRedis().flushdb();
}
