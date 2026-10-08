import { prisma } from "../lib/prisma.js";
import { getStripeClient } from "../lib/stripe.js";
import { getPlanByPriceId } from "../modules/billing/catalog.js";
import { acquireLock, releaseLock } from "../lib/bookingLock.js";
import { usageWarningEmail } from "../lib/emailTemplates.js";
import { alertarMinutos } from "../modules/whatsapp/alertas.js";

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
      const email = business.users[0]?.email;
      if (email) {
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
        // Alerta #5 por WhatsApp además del email (idempotente por periodo).
        await alertarMinutos({
          businessId: input.businessId,
          periodId: period.id,
          consumidos: consumedMinutes,
          incluidos: plan.includedMinutes,
          extraMinuteCents: plan.extraMinuteCents,
        });
        // Se marca después de encolarlo: si Cloud Tasks no acepta el correo,
        // el siguiente intento debe poder avisar al negocio.
        await prisma.billingUsagePeriod.updateMany({
          where: { id: period.id, warningEmailSentAt: null },
          data: { warningEmailSentAt: new Date() },
        });
      }
    }
    // Las llamadas que empiezan en un periodo y terminan en el siguiente se
    // cuentan en el periodo en que empezaron, pero este job ya mira el nuevo
    // cuando llega su call_ended: sus minutos no se informaban nunca. Se
    // reconcilia el periodo anterior antes del actual.
    await reconciliarPeriodoAnterior({
      businessId: input.businessId,
      stripeCustomerId: business.stripeCustomerId,
      inicioDelActual: business.subscriptionCurrentPeriodStart,
      usageBillingStartsAt: business.usageBillingStartsAt,
    });

    await informarConsumo({
      periodId: period.id,
      consumedMinutes,
      stripeCustomerId: business.stripeCustomerId,
    });
  } finally {
    await releaseLock(lockKey, lockToken);
  }
}

const DIA_MS = 24 * 60 * 60 * 1000;
/** Stripe acepta eventos de medidor con fecha de hasta 35 días atrás. */
const VENTANA_DE_RECONCILIACION_MS = 30 * DIA_MS;

/**
 * Informa a Stripe los minutos del periodo anterior que no llegaron a
 * informarse: los de llamadas que lo cruzan o que terminaron justo después
 * del cambio. Van fechados en el último segundo de ese periodo. Stripe deja
 * la factura del periodo que acaba en borrador alrededor de una hora y los
 * incluye en ella; una llamada que cruza el cambio termina minutos después.
 * Si llegaran con la factura ya cerrada, Stripe no los cobraría en el
 * periodo nuevo, donde además consumirían minutos incluidos de otro mes.
 */
async function reconciliarPeriodoAnterior(input: {
  businessId: string;
  stripeCustomerId: string;
  inicioDelActual: Date;
  usageBillingStartsAt: Date | null;
}): Promise<void> {
  const anterior = await prisma.billingUsagePeriod.findFirst({
    where: {
      businessId: input.businessId,
      periodEnd: {
        lte: input.inicioDelActual,
        gt: new Date(Date.now() - VENTANA_DE_RECONCILIACION_MS),
      },
    },
    orderBy: { periodStart: "desc" },
    select: { id: true, periodStart: true, periodEnd: true },
  });
  if (!anterior) return;
  if (input.usageBillingStartsAt && anterior.periodStart < input.usageBillingStartsAt) return;

  // `lt` y no `lte`: una llamada que empieza justo en el cambio es del
  // periodo nuevo, que la cuenta con `gte`.
  const aggregate = await prisma.call.aggregate({
    where: {
      businessId: input.businessId,
      status: { not: "IN_PROGRESS" },
      startedAt: { gte: anterior.periodStart, lt: anterior.periodEnd },
    },
    _sum: { durationSecs: true },
  });
  await informarConsumo({
    periodId: anterior.id,
    consumedMinutes: Math.ceil((aggregate._sum.durationSecs ?? 0) / 60),
    stripeCustomerId: input.stripeCustomerId,
    fecha: new Date(anterior.periodEnd.getTime() - 1000),
  });
}

/**
 * Informa a Stripe la diferencia entre lo consumido y lo ya informado en un
 * periodo. Sin `fecha`, Stripe usa la de ahora (periodo en curso).
 */
async function informarConsumo(input: {
  periodId: string;
  consumedMinutes: number;
  stripeCustomerId: string;
  fecha?: Date;
}): Promise<void> {
  const { periodId, consumedMinutes } = input;
  const timestamp = input.fecha ? Math.floor(input.fecha.getTime() / 1000) : undefined;
  // Puede quedar un informe pendiente si Stripe aceptó el evento pero el
  // proceso cayó antes de confirmar Postgres. Se reintenta primero con el
  // mismo identifier (Stripe lo deduplica) y, después, se informa cualquier
  // minuto que haya terminado mientras tanto.
  while (true) {
    const latestPeriod = await prisma.billingUsagePeriod.findUniqueOrThrow({
      where: { id: periodId },
      select: { reportedMinutes: true },
    });
    const pending = await prisma.billingUsageReport.findFirst({
      where: { periodId, reportedAt: null },
      orderBy: { createdAt: "asc" },
    });
    const report = pending ?? (consumedMinutes > latestPeriod.reportedMinutes
      ? await prisma.billingUsageReport.create({
          data: {
            periodId,
            minutes: consumedMinutes - latestPeriod.reportedMinutes,
            identifier: `alhabla-minutes-${periodId}-${consumedMinutes}`,
          },
        })
      : null);
    if (!report) return;

    try {
      await getStripeClient().billing.meterEvents.create(
        {
          event_name: "alhabla_call_minutes",
          identifier: report.identifier,
          payload: { stripe_customer_id: input.stripeCustomerId, value: String(report.minutes) },
          ...(timestamp !== undefined ? { timestamp } : {}),
        },
        { idempotencyKey: report.identifier }
      );
      await prisma.$transaction([
        prisma.billingUsageReport.update({ where: { id: report.id }, data: { reportedAt: new Date(), lastError: null } }),
        prisma.billingUsagePeriod.update({ where: { id: periodId }, data: { reportedMinutes: { increment: report.minutes } } }),
      ]);
    } catch (error) {
      await prisma.billingUsageReport.update({ where: { id: report.id }, data: { lastError: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }
}
