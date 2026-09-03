import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { prisma } from "../../lib/prisma.js";
import { getStripeClient } from "../../lib/stripe.js";
import { provisionPhoneNumber } from "../phone/service.js";
import { getBillingPlan, getPlanByPriceId, getPriceId, type PlanId } from "./catalog.js";
import { enqueueEmailJob } from "../../lib/cloudTasks.js";
import { paymentApprovedEmail, paymentFailedEmail } from "../../lib/emailTemplates.js";

const CHECKOUT_TRIAL_DAYS = 7;

function unixTimestampToDate(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

function stripeId(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function enqueueEmail(input: {
  fromAlias: "welcome" | "support";
  toAddress: string;
  subject: string;
  html: string;
}) {
  try {
    await enqueueEmailJob(input);
  } catch (error) {
    console.error(
      `[Billing] No se pudo encolar el email "${input.subject}" a ${input.toAddress}:`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

function subscriptionStatus(status: Stripe.Subscription.Status) {
  return status.toUpperCase() as
    | "INCOMPLETE"
    | "INCOMPLETE_EXPIRED"
    | "TRIALING"
    | "ACTIVE"
    | "PAST_DUE"
    | "CANCELED"
    | "UNPAID"
    | "PAUSED";
}

function subscriptionPeriod(subscription: Stripe.Subscription) {
  const starts = subscription.items.data.map((item) => item.current_period_start);
  const ends = subscription.items.data.map((item) => item.current_period_end);

  return {
    start: starts.length > 0 ? new Date(Math.min(...starts) * 1000) : null,
    end: ends.length > 0 ? new Date(Math.max(...ends) * 1000) : null,
  };
}

export async function getBillingSummary(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      plan: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripePriceId: true,
      subscriptionStatus: true,
      subscriptionCurrentPeriodStart: true,
      subscriptionCurrentPeriodEnd: true,
      subscriptionTrialEnd: true,
      subscriptionCancelAtPeriodEnd: true,
    },
  });

  if (!business) {
    return null;
  }

  const plan = business.stripePriceId
    ? getPlanByPriceId(business.stripePriceId)
    : undefined;

  const periodStart = business.subscriptionCurrentPeriodStart;
  const periodEnd = business.subscriptionCurrentPeriodEnd;

  const callsFilter: { businessId: string; startedAt?: { gte: Date; lte: Date }; status?: { not: "IN_PROGRESS" } } = { businessId };
  if (periodStart && periodEnd) {
    callsFilter.startedAt = { gte: periodStart, lte: periodEnd };
  }
  // Solo llamadas finalizadas para no contar llamadas en curso.
  callsFilter.status = { not: "IN_PROGRESS" };

  const aggregation = await prisma.call.aggregate({
    where: callsFilter,
    _sum: { durationSecs: true },
  });

  const consumedSeconds = aggregation._sum.durationSecs ?? 0;
  const consumedMinutes = Math.ceil(consumedSeconds / 60);

  return {
    planId: plan?.id ?? null,
    legacyPlan: business.plan,
    customerConfigured: Boolean(business.stripeCustomerId),
    subscriptionId: business.stripeSubscriptionId,
    priceId: business.stripePriceId,
    status: business.subscriptionStatus,
    currentPeriodStart: business.subscriptionCurrentPeriodStart,
    currentPeriodEnd: business.subscriptionCurrentPeriodEnd,
    trialEnd: business.subscriptionTrialEnd,
    cancelAtPeriodEnd: business.subscriptionCancelAtPeriodEnd,
    includedMinutes: plan?.includedMinutes ?? null,
    extraMinuteCents: plan?.extraMinuteCents ?? null,
    consumedMinutes,
  };
}

async function getOrCreateCustomer(businessId: string, userId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      users: {
        where: { id: userId },
        select: { email: true },
        take: 1,
      },
    },
  });

  if (!business) {
    throw new Error("Business not found");
  }

  if (business.stripeCustomerId) {
    return business.stripeCustomerId;
  }

  const stripe = getStripeClient();
  const customer = await stripe.customers.create(
    {
      name: business.name,
      email: business.users[0]?.email,
      metadata: { businessId },
    },
    { idempotencyKey: `business-customer-${businessId}` },
  );

  await prisma.business.update({
    where: { id: businessId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

export async function createCheckoutSession(input: {
  businessId: string;
  userId: string;
  planId: PlanId;
}) {
  const existingBusiness = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: { subscriptionStatus: true },
  });
  if (existingBusiness?.subscriptionStatus === "ACTIVE" || existingBusiness?.subscriptionStatus === "TRIALING") {
    throw new Error("This business already has an active subscription");
  }

  const stripe = getStripeClient();
  const customerId = await getOrCreateCustomer(input.businessId, input.userId);
  const priceId = getPriceId(input.planId);
  const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3001").replace(/\/$/, "");
  const integrationIdentifier = `alhabla-subscription-${randomBytes(4).toString("hex")}`;

  const session = await stripe.checkout.sessions.create({
    ui_mode: "embedded_page",
    mode: "subscription",
    customer: customerId,
    client_reference_id: input.businessId,
    line_items: [{ price: priceId, quantity: 1 }],
    payment_method_collection: "always",
    allow_promotion_codes: true,
    tax_id_collection: { enabled: true },
    customer_update: { address: "auto", name: "auto" },
    return_url: `${frontendUrl}/checkout/resultado?session_id={CHECKOUT_SESSION_ID}`,
    integration_identifier: integrationIdentifier,
    metadata: {
      businessId: input.businessId,
      planId: input.planId,
    },
    subscription_data: {
      trial_period_days: CHECKOUT_TRIAL_DAYS,
      metadata: {
        businessId: input.businessId,
        planId: input.planId,
      },
    },
  });

  if (!session.client_secret) {
    throw new Error("Stripe did not return a Checkout client secret");
  }

  return { clientSecret: session.client_secret };
}

export async function createCustomerPortalSession(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { stripeCustomerId: true },
  });

  if (!business?.stripeCustomerId) {
    throw new Error("This business does not have a Stripe customer yet");
  }

  const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3001").replace(/\/$/, "");
  return getStripeClient().billingPortal.sessions.create({
    customer: business.stripeCustomerId,
    return_url: `${frontendUrl}/ajustes/facturacion`,
  });
}

export async function reconcileCheckoutSession(input: {
  businessId: string;
  sessionId: string;
}) {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(input.sessionId, {
    expand: ["subscription"],
  });

  if (
    session.client_reference_id !== input.businessId ||
    session.metadata?.businessId !== input.businessId
  ) {
    throw new Error("Checkout Session does not belong to the authenticated business");
  }

  if (session.status !== "complete") {
    return getBillingSummary(input.businessId);
  }

  const customerId = stripeId(session.customer);
  const subscription = session.subscription;

  if (!customerId || !subscription) {
    throw new Error("Completed Checkout Session is missing its customer or subscription");
  }

  await prisma.business.update({
    where: { id: input.businessId },
    data: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: stripeId(subscription),
    },
  });

  if (typeof subscription !== "string") {
    await syncSubscription(subscription);
  } else {
    await syncSubscription(await stripe.subscriptions.retrieve(subscription));
  }

  // Fallback: trigger phone provisioning from the reconcile path as well,
  // since in local development Stripe webhooks may not reach the backend.
  provisionPhoneNumber(input.businessId).catch((err) => {
    console.error(
      `[Billing] Phone provisioning failed during reconcile for business ${input.businessId}:`
    );
  });

  return getBillingSummary(input.businessId);
}

async function resolveBusinessId(input: {
  metadata?: Stripe.Metadata | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}) {
  if (input.metadata?.businessId) {
    return input.metadata.businessId;
  }

  const business = await prisma.business.findFirst({
    where: {
      OR: [
        ...(input.customerId ? [{ stripeCustomerId: input.customerId }] : []),
        ...(input.subscriptionId ? [{ stripeSubscriptionId: input.subscriptionId }] : []),
      ],
    },
    select: { id: true },
  });

  return business?.id ?? null;
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const customerId = stripeId(subscription.customer);
  const businessId = await resolveBusinessId({
    metadata: subscription.metadata,
    customerId,
    subscriptionId: subscription.id,
  });

  if (!businessId || !customerId) {
    // Stripe CLI fixtures and unrelated Dashboard subscriptions do not belong
    // to an Alhabla tenant. Acknowledge them without mutating local state.
    return null;
  }

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const plan = priceId ? getPlanByPriceId(priceId) : undefined;
  const period = subscriptionPeriod(subscription);

  await prisma.business.update({
    where: { id: businessId },
    data: {
      ...(plan ? { plan: plan.databasePlan } : {}),
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      subscriptionStatus: subscriptionStatus(subscription.status),
      subscriptionCurrentPeriodStart: period.start,
      subscriptionCurrentPeriodEnd: period.end,
      subscriptionTrialEnd: unixTimestampToDate(subscription.trial_end),
      subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  return businessId;
}

async function processStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const businessId = await resolveBusinessId({
        metadata: session.metadata,
        customerId: stripeId(session.customer),
        subscriptionId: stripeId(session.subscription),
      });

      if (businessId) {
        await prisma.business.update({
          where: { id: businessId },
          data: {
            stripeCustomerId: stripeId(session.customer),
            stripeSubscriptionId: stripeId(session.subscription),
          },
        });

        // Trigger phone number provisioning asynchronously after successful payment.
        // We do not await this to avoid delaying the Stripe webhook response.
        provisionPhoneNumber(businessId).catch((err) => {
          console.error(
            `[Billing] Async phone provisioning failed for business ${businessId}:`,
            err instanceof Error ? err.message : String(err)
          );
        });

        const customerEmail = session.customer_details?.email;
        const planId = session.metadata?.planId;
        if (customerEmail && planId) {
          const business = await prisma.business.findUnique({
            where: { id: businessId },
            select: { name: true },
          });
          if (business) {
            const planName = planId.charAt(0).toUpperCase() + planId.slice(1);
            const { subject, html } = paymentApprovedEmail({ businessName: business.name, planName });
            await enqueueEmail({ fromAlias: "welcome", toAddress: customerEmail, subject, html });
          }
        }
      }
      return businessId;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return syncSubscription(event.data.object as Stripe.Subscription);
    case "invoice.paid":
      return resolveBusinessId({ customerId: stripeId((event.data.object as Stripe.Invoice).customer) });
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const businessId = await resolveBusinessId({ customerId: stripeId(invoice.customer) });

      if (businessId && invoice.customer_email) {
        const business = await prisma.business.findUnique({
          where: { id: businessId },
          select: { name: true },
        });
        if (business) {
          const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3001").replace(/\/$/, "");
          const { subject, html } = paymentFailedEmail({
            businessName: business.name,
            manageBillingUrl: invoice.hosted_invoice_url ?? `${frontendUrl}/ajustes/facturacion`,
          });
          await enqueueEmail({ fromAlias: "support", toAddress: invoice.customer_email, subject, html });
        }
      }

      return businessId;
    }
    default:
      return null;
  }
}

export async function handleStripeEvent(event: Stripe.Event) {
  const existingEvent = await prisma.stripeWebhookEvent.findUnique({
    where: { id: event.id },
    select: { processedAt: true },
  });
  if (existingEvent?.processedAt) {
    return { duplicate: true };
  }

  await prisma.stripeWebhookEvent.upsert({
    where: { id: event.id },
    create: { id: event.id, type: event.type },
    update: { type: event.type, lastError: null },
  });

  try {
    const businessId = await processStripeEvent(event);
    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: { businessId, processedAt: new Date(), lastError: null },
    });
    return { duplicate: false };
  } catch (error) {
    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: { lastError: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}
