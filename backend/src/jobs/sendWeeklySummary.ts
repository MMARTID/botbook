import { prisma } from "../lib/prisma.js";
import { enqueueEmailJob } from "../lib/cloudTasks.js";
import { weeklySummaryEmail } from "../lib/emailTemplates.js";
import { planAllows, resolvePlanId } from "../lib/planFeatures.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Resumen semanal por email (feature de Pro/Scale). Lo dispara Cloud
 * Scheduler los lunes por la mañana contra /internal/jobs/send-weekly-summaries;
 * recorre los negocios con suscripción viva cuyo plan incluye la feature y
 * les envía la actividad de los últimos 7 días. Un negocio sin ninguna
 * actividad esa semana no recibe email — un resumen a ceros solo enseña que
 * el producto no se usó.
 */
export async function sendWeeklySummaryJob(): Promise<{
  sent: number;
  skipped: number;
}> {
  const weekEnd = new Date();
  const weekStart = new Date(weekEnd.getTime() - WEEK_MS);

  const businesses = await prisma.business.findMany({
    where: {
      active: true,
      subscriptionStatus: { in: ["ACTIVE", "TRIALING"] },
    },
    select: {
      id: true,
      name: true,
      plan: true,
      stripePriceId: true,
      users: { select: { email: true }, take: 1 },
    },
  });

  const frontendUrl = (
    process.env.FRONTEND_URL || "http://localhost:3001"
  ).replace(/\/$/, "");

  let sent = 0;
  let skipped = 0;

  for (const business of businesses) {
    const email = business.users[0]?.email;
    if (!email || !planAllows(resolvePlanId(business), "resumen_semanal")) {
      skipped += 1;
      continue;
    }

    try {
      const [callAggregation, bookingCount, leadCount] = await Promise.all([
        prisma.call.aggregate({
          where: {
            businessId: business.id,
            status: { not: "IN_PROGRESS" },
            startedAt: { gte: weekStart, lt: weekEnd },
          },
          _count: { _all: true },
          _sum: { durationSecs: true },
        }),
        prisma.booking.count({
          where: {
            call: { businessId: business.id },
            createdAt: { gte: weekStart, lt: weekEnd },
            isCancelled: false,
          },
        }),
        prisma.lead.count({
          where: {
            call: { businessId: business.id },
            createdAt: { gte: weekStart, lt: weekEnd },
            isLead: true,
          },
        }),
      ]);

      const callCount = callAggregation._count._all;
      if (callCount === 0 && bookingCount === 0) {
        skipped += 1;
        continue;
      }

      const { subject, html } = weeklySummaryEmail({
        businessName: business.name,
        weekStart,
        weekEnd,
        callCount,
        totalMinutes: Math.ceil((callAggregation._sum.durationSecs ?? 0) / 60),
        bookingCount,
        leadCount,
        panelUrl: `${frontendUrl}/`,
      });

      await enqueueEmailJob({
        fromAlias: "support",
        toAddress: email,
        subject,
        html,
      });
      sent += 1;
    } catch (error) {
      // Un negocio con datos rotos no debe tumbar el resumen del resto.
      console.error(
        `[Job] Resumen semanal de ${business.id} falló:`,
        error instanceof Error ? error.message : String(error)
      );
      skipped += 1;
    }
  }

  console.log(
    `[Job] Resumen semanal: ${sent} enviados, ${skipped} omitidos de ${businesses.length} negocios`
  );
  return { sent, skipped };
}
