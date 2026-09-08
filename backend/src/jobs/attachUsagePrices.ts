import { prisma } from "../lib/prisma.js";
import { getStripeClient } from "../lib/stripe.js";
import { getPlanByPriceId, getUsagePriceId } from "../modules/billing/catalog.js";

const MIGRATION_MARKER = "2026-09-extra-minutes";
const MAX_BUSINESSES_PER_RUN = 100;

/**
 * Añade el precio de consumo a las suscripciones creadas antes de activar los
 * minutos extra. Se marca el inicio en el siguiente periodo para que ningún
 * cliente reciba un cargo de excedentes sin haber tenido antes aviso.
 *
 * Es un trabajo puntual, invocado tras el despliegue mediante Cloud Tasks. La
 * operación es segura al reintentarse: el item lleva una marca de migración y
 * Stripe recibe una clave de idempotencia estable.
 */
export async function attachUsagePricesJob(): Promise<number> {
  const businesses = await prisma.business.findMany({
    where: {
      stripeSubscriptionId: { not: null },
      stripePriceId: { not: null },
      usageBillingStartsAt: null,
      subscriptionStatus: { in: ["ACTIVE", "TRIALING"] },
      subscriptionCancelAtPeriodEnd: false,
    },
    select: {
      id: true,
      stripeSubscriptionId: true,
      stripePriceId: true,
    },
    take: MAX_BUSINESSES_PER_RUN,
  });

  let attached = 0;
  const stripe = getStripeClient();
  for (const business of businesses) {
    const plan = business.stripePriceId
      ? getPlanByPriceId(business.stripePriceId)
      : undefined;
    if (!plan || !business.stripeSubscriptionId) continue;

    const usagePriceId = getUsagePriceId(plan.id);
    const subscription = await stripe.subscriptions.retrieve(
      business.stripeSubscriptionId
    );
    if (
      !["active", "trialing"].includes(subscription.status) ||
      subscription.cancel_at_period_end
    ) {
      continue;
    }

    const periodEndsAt = new Date(
      Math.max(...subscription.items.data.map((item) => item.current_period_end)) * 1000
    );
    const usageItem = subscription.items.data.find(
      (item) => item.price?.id === usagePriceId
    );

    if (!usageItem) {
      await stripe.subscriptionItems.create(
        {
          subscription: subscription.id,
          price: usagePriceId,
          proration_behavior: "none",
          metadata: { alhabla_usage_migration: MIGRATION_MARKER },
        },
        { idempotencyKey: `alhabla-usage-price-${subscription.id}-${usagePriceId}` }
      );
      attached++;
    }

    // Solo los items que creó esta migración se retrasan al próximo periodo.
    // Un checkout nuevo ya contiene el precio medido y debe empezar a contar
    // desde su propio inicio, no desde el siguiente ciclo.
    if (
      !usageItem ||
      usageItem.metadata?.alhabla_usage_migration === MIGRATION_MARKER
    ) {
      await prisma.business.updateMany({
        where: { id: business.id, usageBillingStartsAt: null },
        data: { usageBillingStartsAt: periodEndsAt },
      });
    }
  }

  console.log(`[Billing] Precios de minutos extra añadidos a ${attached} suscripción(es).`);
  return attached;
}
