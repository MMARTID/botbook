import { prisma } from "../lib/prisma.js";
import { enqueueUsageReportJob } from "../lib/cloudTasks.js";
import { errorMessage } from "../lib/logUtils.js";

const BUSINESSES_PER_BATCH = 100;

/** Sufijo por hora: identifica la tanda para que dos entregas del mismo tick
 * no creen dos tareas por negocio, pero la siguiente hora sí pueda reintentar. */
function claveDeReintento(): string {
  return new Date().toISOString().slice(0, 13);
}

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

    // Una tarea por negocio en vez de procesarlos en serie dentro de esta
    // petición: cada uno habla con Stripe (cientos de ms), así que con unos
    // cuantos cientos de negocios este job se acercaba al plazo de la tarea y
    // Cloud Tasks lo reintentaba entero. El endpoint /jobs/report-usage ya es
    // idempotente por `identifier`, así que encolar es seguro.
    for (const business of businesses) {
      try {
        await enqueueUsageReportJob(
          { businessId: business.id },
          `retry-usage-${business.id}-${claveDeReintento()}`
        );
      } catch (error) {
        failures++;
        console.error(
          `[Billing] No se pudo encolar la recuperación del consumo del negocio ${business.id}: ${errorMessage(error)}`
        );
      }
    }

    if (businesses.length < BUSINESSES_PER_BATCH) break;
    cursor = businesses[businesses.length - 1].id;
  }

  if (failures > 0) {
    // Lanzar reintenta el LOTE ENTERO, incluidos los negocios que sí se
    // encolaron. Como cada negocio tiene ya su propia tarea con reintentos
    // propios, aquí basta con dejar constancia.
    console.error(
      `[Billing] No se pudo encolar la recuperación del consumo de ${failures} negocio(s); se reintentará en la próxima pasada`
    );
  }
}
