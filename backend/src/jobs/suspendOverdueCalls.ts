import { prisma } from "../lib/prisma.js";

/**
 * Deja constancia de las cuentas cuyo plazo de impago ha vencido. El webhook
 * entrante también compara la fecha límite directamente, de modo que una
 * llamada se rechaza aunque este job se retrase.
 */
export async function suspendOverdueCallsJob(now = new Date()): Promise<number> {
  const result = await prisma.business.updateMany({
    where: {
      paymentFailureSuspensionAt: { lte: now },
      callsSuspendedAt: null,
    },
    data: { callsSuspendedAt: now },
  });

  if (result.count > 0) {
    console.log(`[Billing] Se suspendieron las llamadas de ${result.count} negocio(s) por impago.`);
  }

  return result.count;
}
