import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { prisma } from "../../lib/prisma.js";
import { getStripeClient } from "../../lib/stripe.js";
import { provisionPhoneNumber } from "../phone/service.js";
import {
  getPlanByPriceId,
  getPriceId,
  getUsagePriceId,
  type PlanId,
} from "./catalog.js";
import { enqueueEmailJob } from "../../lib/cloudTasks.js";
import {
  paymentApprovedEmail,
  paymentFailedEmail,
  subscriptionCancellationInstructionsEmail,
} from "../../lib/emailTemplates.js";
import { acquireLock, releaseLock } from "../../lib/bookingLock.js";

const CHECKOUT_TRIAL_DAYS = 7;
const PAYMENT_FAILURE_SUSPENSION_DAYS = 7;
const CHECKOUT_LOCK_TTL_MS = 120_000;
const CHECKOUT_LOCK_ACQUIRE_BUDGET_MS = 5_000;

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
  const starts = subscription.items.data.map(
    (item) => item.current_period_start
  );
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

  const callsFilter: {
    businessId: string;
    startedAt?: { gte: Date; lte: Date };
    status?: { not: "IN_PROGRESS" };
  } = { businessId };
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
    { idempotencyKey: `business-customer-${businessId}` }
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
  const lockKey = `billing_checkout:${input.businessId}`;
  const lockToken = await acquireLock(
    lockKey,
    CHECKOUT_LOCK_TTL_MS,
    CHECKOUT_LOCK_ACQUIRE_BUDGET_MS
  );
  if (!lockToken) {
    // Ante Redis degradado o una petición concurrente preferimos que el
    // cliente reintente a abrir dos Checkouts que puedan cobrarse ambos.
    throw new Error("Checkout session is already being prepared; please retry");
  }

  try {
  const existingBusiness = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: { subscriptionStatus: true },
  });
  if (
    existingBusiness?.subscriptionStatus === "ACTIVE" ||
    existingBusiness?.subscriptionStatus === "TRIALING"
  ) {
    throw new Error("This business already has an active subscription");
  }

  const stripe = getStripeClient();
  const customerId = await getOrCreateCustomer(input.businessId, input.userId);

  // Antes de completar el primer checkout, abrirlo en dos pestañas (o
  // pulsar "suscribirme" dos veces seguidas) creaba dos sesiones
  // independientes, ambas completables — cada una genera su propia
  // suscripción y su propio cobro en Stripe, mientras Postgres solo puede
  // conservar un stripeSubscriptionId (hallazgo #10 de la auditoría). Si ya
  // hay una sesión de suscripción abierta para este cliente, se reutiliza
  // en vez de crear otra. Una sesión abierta solo se reutiliza si es para
  // el mismo plan; si el cliente cambia de plan, se caduca la anterior para
  // que no pueda completar por accidente dos suscripciones distintas.
  const openSessions = await stripe.checkout.sessions.list({
    customer: customerId,
    status: "open",
    limit: 10,
  });
  const subscriptionSessions = openSessions.data.filter(
    (existing) => existing.mode === "subscription"
  );
  const reusableSession = subscriptionSessions.find(
    (existing) => existing.metadata?.planId === input.planId
  );
  if (reusableSession?.client_secret) {
    return { clientSecret: reusableSession.client_secret };
  }

  await Promise.all(
    subscriptionSessions.map((existing) =>
      stripe.checkout.sessions.expire(existing.id)
    )
  );

  const priceId = getPriceId(input.planId);
  const usagePriceId = getUsagePriceId(input.planId);
  const frontendUrl = (
    process.env.FRONTEND_URL || "http://localhost:3001"
  ).replace(/\/$/, "");
  const integrationIdentifier = `alhabla-subscription-${randomBytes(4).toString("hex")}`;

  const session = await stripe.checkout.sessions.create({
    ui_mode: "embedded_page",
    mode: "subscription",
    customer: customerId,
    client_reference_id: input.businessId,
    line_items: [{ price: priceId, quantity: 1 }, { price: usagePriceId }],
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
  } finally {
    await releaseLock(lockKey, lockToken);
  }
}

export async function createCustomerPortalSession(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { stripeCustomerId: true },
  });

  if (!business?.stripeCustomerId) {
    throw new Error("This business does not have a Stripe customer yet");
  }

  const frontendUrl = (
    process.env.FRONTEND_URL || "http://localhost:3001"
  ).replace(/\/$/, "");
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
    throw new Error(
      "Checkout Session does not belong to the authenticated business"
    );
  }

  if (session.status !== "complete") {
    return getBillingSummary(input.businessId);
  }

  const customerId = stripeId(session.customer);
  const subscription = session.subscription;

  if (!customerId || !subscription) {
    throw new Error(
      "Completed Checkout Session is missing its customer or subscription"
    );
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
  // Esperado (await), no fire-and-forget: en Cloud Run el proceso solo tiene
  // CPU garantizada mientras dura la petición — sin esperarlo, puede quedar
  // sin CPU justo después de responder y dejar la cuenta pagada pero sin
  // número operativo, sin que nada vuelva a intentarlo (hallazgo #11 de la
  // auditoría). provisionPhoneNumber ya captura sus propios errores y
  // devuelve {success:false}, nunca lanza, así que no hace falta un
  // try/catch aquí.
  const provisionResult = await provisionPhoneNumber(input.businessId);
  if (!provisionResult.success) {
    console.error(
      `[Billing] Phone provisioning failed during reconcile for business ${input.businessId}: ${provisionResult.error ?? "unknown error"}`
    );
  }

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
        ...(input.subscriptionId
          ? [{ stripeSubscriptionId: input.subscriptionId }]
          : []),
      ],
    },
    select: { id: true },
  });

  return business?.id ?? null;
}

/**
 * eventCreatedAt: timestamp del evento de Stripe que trae esta suscripción
 * (event.created), no de la propia suscripción. Stripe no garantiza el
 * orden de entrega de los webhooks — un evento antiguo (ej. la suscripción
 * seguía ACTIVE) puede llegar DESPUÉS de uno más reciente (ya CANCELED) si
 * el primer intento de entrega se retrasó o falló. Sin comparar contra el
 * último evento ya aplicado, ese desorden resucita un estado obsoleto
 * (hallazgo #29 de la auditoría). Se omite (undefined) desde el camino de
 * reconciliación manual (reconcileCheckoutSession), que lee el estado en
 * vivo de la API de Stripe, no un evento en cola — ahí siempre es el más
 * reciente posible por definición.
 */
async function syncSubscription(
  subscription: Stripe.Subscription,
  eventCreatedAt?: Date
) {
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

  const basePriceId = subscription.items.data
    .map((item) => item.price?.id)
    .find((priceId): priceId is string => Boolean(priceId && getPlanByPriceId(priceId)));
  const plan = basePriceId ? getPlanByPriceId(basePriceId) : undefined;
  const period = subscriptionPeriod(subscription);

  const data = {
    ...(plan ? { plan: plan.databasePlan } : {}),
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: basePriceId ?? null,
    subscriptionStatus: subscriptionStatus(subscription.status),
    subscriptionCurrentPeriodStart: period.start,
    subscriptionCurrentPeriodEnd: period.end,
    subscriptionTrialEnd: unixTimestampToDate(subscription.trial_end),
    subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
    ...(!subscription.cancel_at_period_end
      ? { cancellationNoticeSentAt: null }
      : {}),
    ...(eventCreatedAt ? { subscriptionEventCreatedAt: eventCreatedAt } : {}),
  };

  // La condición y la escritura deben ser una única sentencia. Un
  // findUnique seguido de update deja una ventana para que dos webhooks
  // distintos lean el mismo timestamp y el más antiguo escriba el último.
  // PostgreSQL vuelve a comprobar el WHERE al obtener el lock de la fila.
  if (eventCreatedAt) {
    const updated = await prisma.business.updateMany({
      where: {
        id: businessId,
        OR: [
          { subscriptionEventCreatedAt: null },
          { subscriptionEventCreatedAt: { lte: eventCreatedAt } },
        ],
      },
      data,
    });
    if (updated.count === 0) {
      console.warn(
        `[Billing] Evento de suscripción descartado para business ${businessId}: hay uno más reciente ya aplicado`
      );
      return null;
    }
  } else {
    await prisma.business.update({
      where: { id: businessId },
      data,
    });
  }

  return businessId;
}

async function sendCancellationInstructions(input: {
  businessId: string;
  serviceEndsAt: Date | null;
}) {
  // La transición puede llegar más de una vez; se reclama el aviso en la
  // misma sentencia que comprueba que aún no se ha enviado.
  const claimed = await prisma.business.updateMany({
    where: { id: input.businessId, cancellationNoticeSentAt: null },
    data: { cancellationNoticeSentAt: new Date() },
  });
  if (claimed.count === 0) return;

  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: { name: true, users: { select: { email: true }, take: 1 } },
  });
  const email = business?.users[0]?.email;
  if (!business || !email) return;

  const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3001").replace(/\/$/, "");
  const { subject, html } = subscriptionCancellationInstructionsEmail({
    businessName: business.name,
    serviceEndsAt: input.serviceEndsAt,
    manageBillingUrl: `${frontendUrl}/ajustes/facturacion`,
  });
  await enqueueEmail({ fromAlias: "support", toAddress: email, subject, html });
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

        // Esperado (await), no fire-and-forget — mismo motivo que en
        // reconcileCheckoutSession: en Cloud Run, no esperarlo puede dejar
        // esta tarea sin CPU justo tras responder al webhook, con la cuenta
        // pagada pero sin número operativo y sin nada que vuelva a
        // intentarlo (hallazgo #11 de la auditoría).
        const provisionResult = await provisionPhoneNumber(businessId);
        if (!provisionResult.success) {
          console.error(
            `[Billing] Phone provisioning failed for business ${businessId}:`,
            provisionResult.error ?? "unknown error"
          );
        }

        const customerEmail = session.customer_details?.email;
        const planId = session.metadata?.planId;
        if (customerEmail && planId) {
          const business = await prisma.business.findUnique({
            where: { id: businessId },
            select: { name: true },
          });
          if (business) {
            const planName = planId.charAt(0).toUpperCase() + planId.slice(1);
            const { subject, html } = paymentApprovedEmail({
              businessName: business.name,
              planName,
            });
            await enqueueEmail({
              fromAlias: "welcome",
              toAddress: customerEmail,
              subject,
              html,
            });
          }
        }
      }
      return businessId;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const businessId = await syncSubscription(
        subscription,
        new Date(event.created * 1000)
      );
      if (
        businessId &&
        event.type === "customer.subscription.updated" &&
        subscription.cancel_at_period_end &&
        subscription.status !== "canceled"
      ) {
        await sendCancellationInstructions({
          businessId,
          serviceEndsAt: subscriptionPeriod(subscription).end,
        });
      }
      return businessId;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const businessId = await resolveBusinessId({
        customerId: stripeId((event.data.object as Stripe.Invoice).customer),
      });
      // Solo el pago de la factura que abrió el plazo puede reactivar las
      // llamadas. Un invoice.paid anterior no debe borrar un impago reciente.
      if (businessId) {
        await prisma.business.updateMany({
          where: { id: businessId, paymentFailureInvoiceId: invoice.id },
          data: {
            paymentFailureInvoiceId: null,
            paymentFailureNotifiedAt: null,
            paymentFailureSuspensionAt: null,
            callsSuspendedAt: null,
          },
        });
      }
      return businessId;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const businessId = await resolveBusinessId({
        customerId: stripeId(invoice.customer),
      });

      if (businessId) {
        const suspensionAt = new Date(
          Date.now() + PAYMENT_FAILURE_SUSPENSION_DAYS * 24 * 60 * 60 * 1000
        );
        const claim = await prisma.business.updateMany({
          where: { id: businessId, paymentFailureSuspensionAt: null },
          data: {
            paymentFailureInvoiceId: invoice.id,
            paymentFailureNotifiedAt: new Date(),
            paymentFailureSuspensionAt: suspensionAt,
          },
        });
        if (claim.count === 0) return businessId;

        const business = await prisma.business.findUnique({
          where: { id: businessId },
          select: { name: true, users: { select: { email: true }, take: 1 } },
        });
        const email = invoice.customer_email ?? business?.users[0]?.email;
        if (business && email) {
          const frontendUrl = (
            process.env.FRONTEND_URL || "http://localhost:3001"
          ).replace(/\/$/, "");
          const { subject, html } = paymentFailedEmail({
            businessName: business.name,
            suspensionAt,
            manageBillingUrl:
              invoice.hosted_invoice_url ??
              `${frontendUrl}/ajustes/facturacion`,
          });
          await enqueueEmail({
            fromAlias: "support",
            toAddress: email,
            subject,
            html,
          });
        }
      }

      return businessId;
    }
    default:
      return null;
  }
}

/**
 * Reclama el procesamiento de un evento de Stripe de forma atómica antes de
 * ejecutar sus efectos (aprovisionar teléfono, enviar emails, sincronizar
 * suscripción). Antes, dos entregas simultáneas del MISMO evento (Stripe sí
 * reintenta si la primera respuesta tarda) podían ambas leer processedAt
 * vacío, completar el upsert y ejecutar los efectos dos veces — emails
 * duplicados, dos intentos de aprovisionamiento de teléfono en paralelo
 * (hallazgo #28 de la auditoría). pg_advisory_xact_lock serializa cualquier
 * otra entrega del mismo event.id mientras dura esta transacción, sin
 * bloquear eventos DISTINTOS entre sí.
 */
export async function handleStripeEvent(event: Stripe.Event) {
  const claimed = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${event.id}))`;

      const existingEvent = await tx.stripeWebhookEvent.findUnique({
        where: { id: event.id },
        select: { processedAt: true, processingStartedAt: true },
      });
      if (existingEvent?.processedAt) {
        return { duplicate: true as const };
      }

      // Un webhook simultáneo recibe 2xx sin repetir los efectos. Si el
      // proceso que lo reclamó se cae, Stripe volverá a entregarlo; tras
      // cinco minutos se puede reclamar otra vez para no dejarlo bloqueado.
      const claimExpiry = new Date(Date.now() - 5 * 60 * 1000);
      if (
        existingEvent?.processingStartedAt &&
        existingEvent.processingStartedAt > claimExpiry
      ) {
        return { duplicate: true as const };
      }

      await tx.stripeWebhookEvent.upsert({
        where: { id: event.id },
        create: {
          id: event.id,
          type: event.type,
          processingStartedAt: new Date(),
        },
        update: {
          type: event.type,
          lastError: null,
          processingStartedAt: new Date(),
        },
      });
      return { duplicate: false as const };
    },
    { timeout: 10_000, maxWait: 10_000 }
  );

  if (claimed.duplicate) {
    return { duplicate: true };
  }

  try {
    // Las llamadas a Stripe, Telnyx y al correo se ejecutan fuera de la
    // transacción: el lock de la base solo reclama el evento y no queda
    // abierto mientras esperamos una red externa.
    const businessId = await processStripeEvent(event);
    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: {
        businessId,
        processedAt: new Date(),
        processingStartedAt: null,
        lastError: null,
      },
    });
  } catch (error) {
    await prisma.stripeWebhookEvent.update({
      where: { id: event.id },
      data: {
        processingStartedAt: null,
        lastError: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }

  return { duplicate: false };
}
