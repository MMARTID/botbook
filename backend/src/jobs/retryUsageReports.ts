import { prisma } from "../lib/prisma.js";
import { processUsageReportJob } from "./processUsageReport.js";
import { errorMessage } from "../lib/logUtils.js";

const MAX_BUSINESSES_PER_RUN = 100;

/**
 * Recupera informes que no pudieron encolarse al terminar una llamada. No
 * depende de los webhooks de Retell: vuelve a calcular el consumo del periodo
 * actual y processUsageReportJob solo remite a Stripe la diferencia pendiente.
 */
export async function retryUsageReportsJob(): Promise<void> {
  const businesses = await prisma.business.findMany({
    where: {
      stripeCustomerId: { not: null },
      stripePriceId: { not: null },
      subscriptionCurrentPeriodStart: { not: null },
      subscriptionCurrentPeriodEnd: { not: null },
      subscriptionStatus: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
    },
    select: { id: true },
    take: MAX_BUSINESSES_PER_RUN,
  });

  const failures: string[] = [];
  for (const business of businesses) {
    try {
      await processUsageReportJob({ businessId: business.id });
    } catch (error) {
      failures.push(business.id);
      console.error(
        `[Billing] No se pudo recuperar el consumo del negocio ${business.id}: ${errorMessage(error)}`
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(`No se pudo recuperar el consumo de ${failures.length} negocio(s)`);
  }
}
