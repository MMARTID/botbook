import { prisma } from "../lib/prisma.js";
import { getStripeClient } from "../lib/stripe.js";
import { getPlanByPriceId } from "../modules/billing/catalog.js";
import { acquireLock, releaseLock } from "../lib/bookingLock.js";
import { usageWarningEmail } from "../lib/emailTemplates.js";

/** Registra en Stripe los minutos acumulados. Los precios de Stripe contienen
 * el tramo gratuito de cada plan, por lo que se informa TODO el consumo y
 * Stripe cobra únicamente el excedente. */
export async function processUsageReportJob(input: { businessId: string }): Promise<void> {
  const lockKey = `billing_usage:${input.businessId}`;
  const lockToken = await acquireLock(lockKey, 90_000, 0);
  if (!lockToken) return;

  try {
    const business = await prisma.business.findUnique({
      where: { id: input.businessId },
      select: {
        stripeCustomerId: true,
        stripePriceId: true,
        subscriptionCurrentPeriodStart: true,
        subscriptionCurrentPeriodEnd: true,
        usageBillingStartsAt: true,
        name: true,
        users: { select: { email: true }, take: 1 },
      },
    });
    if (!business?.stripeCustomerId || !business.stripePriceId || !business.subscriptionCurrentPeriodStart || !business.subscriptionCurrentPeriodEnd) return;
    if (business.usageBillingStartsAt && business.subscriptionCurrentPeriodStart < business.usageBillingStartsAt) return;

    const plan = getPlanByPriceId(business.stripePriceId);
    if (!plan) return;
    const aggregate = await prisma.call.aggregate({
      where: {
        businessId: input.businessId,
        status: { not: "IN_PROGRESS" },
        startedAt: { gte: business.subscriptionCurrentPeriodStart, lte: business.subscriptionCurrentPeriodEnd },
      },
      _sum: { durationSecs: true },
    });
    const consumedMinutes = Math.ceil((aggregate._sum.durationSecs ?? 0) / 60);

    const period = await prisma.billingUsagePeriod.upsert({
      where: { businessId_periodStart: { businessId: input.businessId, periodStart: business.subscriptionCurrentPeriodStart } },
      create: { businessId: input.businessId, periodStart: business.subscriptionCurrentPeriodStart, periodEnd: business.subscriptionCurrentPeriodEnd },
      update: { periodEnd: business.subscriptionCurrentPeriodEnd },
    });
    if (consumedMinutes >= Math.ceil(plan.includedMinutes * 0.8) && !period.warningEmailSentAt) {
      const claimed = await prisma.billingUsagePeriod.updateMany({
        where: { id: period.id, warningEmailSentAt: null },
        data: { warningEmailSentAt: new Date() },
      });
      const email = business.users[0]?.email;
      if (claimed.count && email) {
        const { subject, html } = usageWarningEmail({
          businessName: business.name,
          planName: plan.id,
          consumedMinutes,
          includedMinutes: plan.includedMinutes,
          extraMinuteCents: plan.extraMinuteCents,
          periodEndsAt: business.subscriptionCurrentPeriodEnd,
        });
        const { enqueueEmailJob } = await import("../lib/cloudTasks.js");
        await enqueueEmailJob({ fromAlias: "support", toAddress: email, subject, html });
      }
    }
    const pending = await prisma.billingUsageReport.findFirst({ where: { periodId: period.id, reportedAt: null }, orderBy: { createdAt: "asc" } });
    const report = pending ?? (consumedMinutes > period.reportedMinutes
      ? await prisma.billingUsageReport.create({
          data: {
            periodId: period.id,
            minutes: consumedMinutes - period.reportedMinutes,
            identifier: `alhabla-minutes-${period.id}-${consumedMinutes}`,
          },
        })
      : null);
    if (!report) return;

    try {
      await getStripeClient().billing.meterEvents.create(
        {
          event_name: "alhabla_call_minutes",
          identifier: report.identifier,
          payload: { stripe_customer_id: business.stripeCustomerId, value: String(report.minutes) },
        },
        { idempotencyKey: report.identifier }
      );
      await prisma.$transaction([
        prisma.billingUsageReport.update({ where: { id: report.id }, data: { reportedAt: new Date(), lastError: null } }),
        prisma.billingUsagePeriod.update({ where: { id: period.id }, data: { reportedMinutes: { increment: report.minutes } } }),
      ]);
    } catch (error) {
      await prisma.billingUsageReport.update({ where: { id: report.id }, data: { lastError: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  } finally {
    await releaseLock(lockKey, lockToken);
  }
}
