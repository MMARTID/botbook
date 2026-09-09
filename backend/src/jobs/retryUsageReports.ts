import { prisma } from "../lib/prisma.js";
import { processUsageReportJob } from "./processUsageReport.js";
import { errorMessage } from "../lib/logUtils.js";

const BUSINESSES_PER_BATCH = 100;

/**
 * Recupera informes que no pudieron encolarse al terminar una llamada. No
 * depende de los webhooks de Retell: vuelve a calcular el consumo del periodo
 * actual y processUsageReportJob solo remite a Stripe la diferencia pendiente.
 */
export async function retryUsageReportsJob(): Promise<void> {
  let failures = 0;
  let cursor: string | undefined;

  while (true) {
    const businesses = await prisma.business.findMany({
      where: {
        stripeCustomerId: { not: null },
        stripePriceId: { not: null },
        subscriptionCurrentPeriodStart: { not: null },
        subscriptionCurrentPeriodEnd: { not: null },
        subscriptionStatus: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: BUSINESSES_PER_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (businesses.length === 0) break;

    for (const business of businesses) {
      try {
        await processUsageReportJob({ businessId: business.id });
      } catch (error) {
        failures++;
        console.error(
          `[Billing] No se pudo recuperar el consumo del negocio ${business.id}: ${errorMessage(error)}`
        );
      }
    }

    if (businesses.length < BUSINESSES_PER_BATCH) break;
    cursor = businesses[businesses.length - 1].id;
  }

  if (failures > 0) {
    throw new Error(`No se pudo recuperar el consumo de ${failures} negocio(s)`);
  }
}
