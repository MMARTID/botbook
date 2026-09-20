import { prisma } from "../lib/prisma.js";
import { enqueueEmailJob } from "../lib/cloudTasks.js";
import { weeklySummaryEmail } from "../lib/emailTemplates.js";
import { planAllows, resolvePlanId } from "../lib/planFeatures.js";
import { appUrl } from "../lib/urls.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
/** Negocios que se procesan a la vez. Cloud Tasks da 10 minutos a la
 * petición: en serie, unos cientos de negocios con 4 consultas cada uno se
 * acercaban al límite, y al reintentar el job entero los primeros recibían
 * el correo por segunda vez. */
const CONCURRENCIA = 5;
/** El resumen se manda a negocios españoles; la ventana se ancla a su día. */
const TIMEZONE_RESUMEN = "Europe/Madrid";

/**
 * Inicio de la semana que se resume: el lunes a las 00:00 de Madrid anterior
 * a la ejecución. Anclar la ventana (en vez de usar "ahora menos 7 días") es
 * lo que hace que dos ejecuciones del mismo lunes produzcan exactamente el
 * mismo contenido y que la marca de "ya enviado" sirva de algo.
 */
/**
 * Desfase de una zona respecto a UTC en un instante concreto, sin depender de
 * la zona en la que corra el proceso. `toLocaleString` + `new Date` no sirve
 * aquí: el parseo usa la zona de la máquina, así que en un portátil en Madrid
 * el desfase de Madrid salía siempre 0 (y la ventana empezaba a las 02:00 en
 * vez de a medianoche).
 */
function desfaseDeZonaMs(instante: Date, timeZone: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const valor = (tipo: string) =>
    Number(partes.find((parte) => parte.type === tipo)?.value ?? "0");

  const comoSiFueraUtc = Date.UTC(
    valor("year"),
    valor("month") - 1,
    valor("day"),
    valor("hour"),
    valor("minute"),
    valor("second")
  );
  return comoSiFueraUtc - instante.getTime();
}

/** Instante exacto de la medianoche local de esa fecha en esa zona. */
function medianocheLocal(fecha: string, timeZone: string): Date {
  const medianocheUtc = new Date(`${fecha}T00:00:00Z`).getTime();
  // Dos pasadas: la primera estimación usa el desfase de la medianoche UTC,
  // que en el día del cambio de hora puede ser el del lado equivocado.
  const primera = new Date(
    medianocheUtc - desfaseDeZonaMs(new Date(medianocheUtc), timeZone)
  );
  return new Date(medianocheUtc - desfaseDeZonaMs(primera, timeZone));
}

/**
 * Inicio de la semana que se resume: el lunes a las 00:00 de Madrid anterior
 * a la ejecución. Anclar la ventana (en vez de usar "ahora menos 7 días") es
 * lo que hace que dos ejecuciones del mismo lunes produzcan exactamente el
 * mismo contenido y que la marca de "ya enviado" sirva de algo.
 */
export function resolveInicioDeSemana(ahora: Date): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE_RESUMEN,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(ahora);
  const valor = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";
  const diasDesdeLunes =
    { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[
      valor("weekday")
    ] ?? 0;

  const hoy = medianocheLocal(
    `${valor("year")}-${valor("month")}-${valor("day")}`,
    TIMEZONE_RESUMEN
  );

  // Restar días sobre la fecha, no sobre el instante: una semana con cambio
  // de hora tiene 169 u 167 horas, y restar 7×24h desplazaría el lunes.
  const lunes = new Date(hoy.getTime() - diasDesdeLunes * 24 * 60 * 60 * 1000);
  const fechaDelLunes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE_RESUMEN,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(lunes);
  return medianocheLocal(fechaDelLunes, TIMEZONE_RESUMEN);
}

/**
 * Resumen semanal por email (feature de Pro/Scale). Lo dispara Cloud
 * Scheduler los lunes por la mañana contra /internal/jobs/send-weekly-summaries;
 * recorre los negocios con suscripción viva cuyo plan incluye la feature y
 * les envía la actividad de la semana pasada. Un negocio sin ninguna
 * actividad esa semana no recibe email — un resumen a ceros solo enseña que
 * el producto no se usó.
 *
 * Cloud Scheduler garantiza entrega "al menos una vez", así que cada negocio
 * lleva su propia marca `weeklySummarySentAt`: se reclama con un updateMany
 * condicional ANTES de encolar el correo, y una segunda ejecución de la misma
 * semana no reclama nada y no envía nada.
 */
export async function sendWeeklySummaryJob(): Promise<{
  sent: number;
  skipped: number;
}> {
  const weekStart = resolveInicioDeSemana(new Date());
  const weekEnd = new Date(weekStart.getTime() + WEEK_MS);

  const frontendUrl = appUrl();

  let sent = 0;
  let skipped = 0;
  let total = 0;
  let cursor: string | undefined;

  // Paginado por cursor en vez de un findMany sin límite: el parque de
  // negocios crece y esta consulta no debe crecer con él.
  for (;;) {
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
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (businesses.length === 0) {
      break;
    }
    total += businesses.length;
    cursor = businesses[businesses.length - 1].id;
    const esUltimaPagina = businesses.length < PAGE_SIZE;

    for (let i = 0; i < businesses.length; i += CONCURRENCIA) {
      const lote = businesses.slice(i, i + CONCURRENCIA);
      const resultados = await Promise.all(
        lote.map((business) =>
          enviarResumenDeNegocio(business, weekStart, weekEnd, frontendUrl)
        )
      );
      for (const enviado of resultados) {
        if (enviado) sent += 1;
        else skipped += 1;
      }
    }

    if (esUltimaPagina) {
      break;
    }
  }

  console.log(
    `[Job] Resumen semanal: ${sent} enviados, ${skipped} omitidos de ${total} negocios`
  );
  return { sent, skipped };
}

async function enviarResumenDeNegocio(
  business: {
    id: string;
    name: string;
    plan: string | null;
    stripePriceId: string | null;
    users: { email: string }[];
  },
  weekStart: Date,
  weekEnd: Date,
  frontendUrl: string
): Promise<boolean> {
  const email = business.users[0]?.email;
  if (!email || !planAllows(resolvePlanId(business), "resumen_semanal")) {
    return false;
  }

  try {
    const [callAggregation, bookingCount, leadCount, pendingBookingCount] =
      await Promise.all([
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
        // Sin ventana temporal a propósito: una cita que no llegó al
        // calendario sigue sin resolver hasta que alguien la atiende, sea de
        // esta semana o de la anterior.
        prisma.lead.count({
          where: {
            call: { businessId: business.id },
            type: "pending_booking",
            resolvedAt: null,
          },
        }),
      ]);

    const callCount = callAggregation._count._all;
    if (callCount === 0 && bookingCount === 0 && pendingBookingCount === 0) {
      return false;
    }

    // Reclamar la semana ANTES de encolar: si dos ejecuciones coinciden, solo
    // una actualiza la fila y solo una manda el correo.
    const { count } = await prisma.business.updateMany({
      where: {
        id: business.id,
        OR: [
          { weeklySummarySentAt: null },
          { weeklySummarySentAt: { lt: weekStart } },
        ],
      },
      data: { weeklySummarySentAt: new Date() },
    });
    if (count === 0) {
      return false;
    }

    const { subject, html } = weeklySummaryEmail({
      businessName: business.name,
      weekStart,
      weekEnd,
      callCount,
      totalMinutes: Math.ceil((callAggregation._sum.durationSecs ?? 0) / 60),
      bookingCount,
      leadCount,
      pendingBookingCount,
      panelUrl: `${frontendUrl}/`,
    });

    await enqueueEmailJob(
      {
        fromAlias: "support",
        toAddress: email,
        subject,
        html,
      },
      // Identificador estable: si Cloud Tasks recibe dos veces la misma tarea
      // (o el job se reintenta antes de que la marca se haya guardado), la
      // segunda se descarta por id repetido.
      `weekly-summary-${business.id}-${weekStart.toISOString().slice(0, 10)}`
    );
    return true;
  } catch (error) {
    // Un negocio con datos rotos no debe tumbar el resumen del resto.
    console.error(
      `[Job] Resumen semanal de ${business.id} falló:`,
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}
