import { prisma } from "../../lib/prisma.js";
import { SIN_CALLS_DEL_GESTOR } from "../../lib/citasDelDueno.js";

export type CallAnalytics = {
  days: number;
  totals: {
    calls: number;
    minutes: number;
    averageDurationSecs: number;
    bookings: number;
    cancelledBookings: number;
    waitlistLeads: number;
  };
  outcomes: Array<{ outcome: string; count: number }>;
  sentiments: Array<{ sentiment: string; count: number }>;
  /** Llamadas por hora local del negocio (0–23). Solo horas con actividad. */
  byHour: Array<{ hour: number; count: number }>;
  /** Llamadas por día de la semana local (1 = lunes … 7 = domingo). */
  byWeekday: Array<{ weekday: number; count: number }>;
  /** El cruce de los dos anteriores, para el mapa de calor del escritorio.
   * Solo celdas con actividad. */
  byWeekdayHour: Array<{ weekday: number; hour: number; count: number }>;
  topServices: Array<{ service: string; count: number }>;
};

const MAX_CALLS_FOR_TIME_BUCKETS = 5000;

/**
 * Analítica de llamadas de los últimos `days` días, calculada sobre lo que
 * los webhooks ya persisten en Call/Booking/Lead — sin ingesta nueva. Los
 * buckets horarios se calculan en la zona del negocio con Intl (no en UTC):
 * "a qué hora llaman" solo tiene sentido en hora local.
 */
export async function getCallAnalytics(
  businessId: string,
  days: number
): Promise<CallAnalytics> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const finishedCallsFilter = {
    businessId,
    status: { not: "IN_PROGRESS" as const },
    startedAt: { gte: since },
    // Las citas que apunta el dueño con el Gestor no son llamadas.
    ...SIN_CALLS_DEL_GESTOR,
  };

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  });
  const timezone = business?.timezone || "Europe/Madrid";

  const [
    aggregation,
    outcomeGroups,
    sentimentGroups,
    serviceGroups,
    callTimes,
    bookings,
    cancelledBookings,
    waitlistLeads,
  ] = await Promise.all([
    prisma.call.aggregate({
      where: finishedCallsFilter,
      _count: { _all: true },
      _sum: { durationSecs: true },
      _avg: { durationSecs: true },
    }),
    prisma.call.groupBy({
      by: ["outcome"],
      where: { ...finishedCallsFilter, outcome: { not: null } },
      _count: { _all: true },
    }),
    prisma.call.groupBy({
      by: ["sentiment"],
      where: { ...finishedCallsFilter, sentiment: { not: null } },
      _count: { _all: true },
    }),
    prisma.call.groupBy({
      by: ["requestedService"],
      where: { ...finishedCallsFilter, requestedService: { not: null } },
      _count: { _all: true },
    }),
    prisma.call.findMany({
      where: finishedCallsFilter,
      select: { startedAt: true },
      take: MAX_CALLS_FOR_TIME_BUCKETS,
      orderBy: { startedAt: "desc" },
    }),
    prisma.booking.count({
      where: {
        call: { businessId, ...SIN_CALLS_DEL_GESTOR },
        createdAt: { gte: since },
        isCancelled: false,
      },
    }),
    prisma.booking.count({
      where: {
        call: { businessId, ...SIN_CALLS_DEL_GESTOR },
        createdAt: { gte: since },
        isCancelled: true,
      },
    }),
    prisma.lead.count({
      where: {
        call: { businessId },
        createdAt: { gte: since },
        type: "availability_watch",
      },
    }),
  ]);

  const hourFormatter = new Intl.DateTimeFormat("es-ES", {
    hour: "numeric",
    hour12: false,
    timeZone: timezone,
  });
  const weekdayFormatter = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    timeZone: timezone,
  });
  const WEEKDAY_INDEX: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  const hourCounts = new Map<number, number>();
  const weekdayCounts = new Map<number, number>();
  // Clave `día * 100 + hora`: 523 = viernes a las 23.
  const cellCounts = new Map<number, number>();
  for (const { startedAt } of callTimes) {
    const hour = Number.parseInt(hourFormatter.format(startedAt), 10) % 24;
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    const weekday = WEEKDAY_INDEX[weekdayFormatter.format(startedAt)];
    if (weekday) {
      weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + 1);
      const cell = weekday * 100 + hour;
      cellCounts.set(cell, (cellCounts.get(cell) ?? 0) + 1);
    }
  }

  return {
    days,
    totals: {
      calls: aggregation._count._all,
      minutes: Math.ceil((aggregation._sum.durationSecs ?? 0) / 60),
      averageDurationSecs: Math.round(aggregation._avg.durationSecs ?? 0),
      bookings,
      cancelledBookings,
      waitlistLeads,
    },
    outcomes: outcomeGroups
      .map((group) => ({
        outcome: group.outcome as string,
        count: group._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    sentiments: sentimentGroups
      .map((group) => ({
        sentiment: group.sentiment as string,
        count: group._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    byHour: [...hourCounts.entries()]
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour - b.hour),
    byWeekday: [...weekdayCounts.entries()]
      .map(([weekday, count]) => ({ weekday, count }))
      .sort((a, b) => a.weekday - b.weekday),
    byWeekdayHour: [...cellCounts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([cell, count]) => ({
        weekday: Math.floor(cell / 100),
        hour: cell % 100,
        count,
      })),
    topServices: serviceGroups
      .map((group) => ({
        service: group.requestedService as string,
        count: group._count._all,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}
