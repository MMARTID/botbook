"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarCheck2,
  Clock3,
  Lock,
  PhoneCall,
  Users,
} from "lucide-react";
import { getCallAnalytics } from "@/lib/api";
import { getPlanLimitInfo } from "@/lib/plan-limit";
import { outcomeLabel, sentimentLabel } from "@/lib/format";
import type { CallOutcome, CallSentiment } from "@/lib/types";
import { useBusiness } from "@/components/providers";
import { AppPageHeader, AppPageSkeleton } from "@/components/app-page-header";
import { SectionCard, SectionErrorState } from "@/components/section-card";
import { AnaliticaEscritorio } from "@/components/escritorio/analitica/analitica-escritorio";
import { useEsMovil } from "@/hooks/use-es-movil";

const WEEKDAY_LABELS = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof PhoneCall;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <article className="panel p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lavado text-morado">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="mt-4 text-3xl font-black tabular-nums tracking-tight text-tinta">{value}</p>
      <p className="mt-1 text-sm font-semibold text-tinta-2">{label}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-muted">{detail}</p> : null}
    </article>
  );
}

function BarList({
  id,
  title,
  description,
  rows,
}: {
  id: string;
  title: string;
  description: string;
  rows: Array<{ label: string; count: number }>;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <SectionCard id={id} title={title} description={description}>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Sin datos todavía en este periodo.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => (
            <li key={row.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold text-tinta-2">{row.label}</span>
                <span className="tabular-nums text-muted">{row.count}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-relleno-fuerte">
                <div
                  className="h-full rounded-full bg-morado"
                  style={{ width: `${Math.max(4, Math.round((row.count / max) * 100))}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function UpgradePanel() {
  return (
    <section className="panel mx-auto max-w-xl p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-lavado text-morado">
        <Lock className="h-7 w-7" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-2xl font-black tracking-tight text-tinta">
        Analítica avanzada, con el plan Scale
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
        Horas punta de llamadas, resultado y sentimiento de cada conversación,
        servicios más pedidos y demanda que no pudiste atender — los datos para
        decidir horarios, personal y servicios.
      </p>
      <Link href="/ajustes/facturacion" className="btn-primary mt-6 inline-flex px-6">
        Ampliar a Scale
      </Link>
    </section>
  );
}

// Pantalla de borde a borde en escritorio: <main> no le pone margen.
const ESQUELETO_ANCHO = "lg:px-8 lg:py-6";

export default function CallAnalyticsPage() {
  const router = useRouter();
  const { business, hasToken, isLoadingBusiness } = useBusiness();
  const esMovil = useEsMovil();

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
  }, [hasToken, router]);

  if (isLoadingBusiness || esMovil === null) return <AppPageSkeleton label="Cargando analítica…" className={ESQUELETO_ANCHO} />;
  if (esMovil) return <AnaliticaMovil />;
  if (!business) return null;
  return (
    <Suspense fallback={<AppPageSkeleton label="Cargando analítica…" className={ESQUELETO_ANCHO} />}>
      <AnaliticaEscritorio business={business} />
    </Suspense>
  );
}

/** La analítica en el móvil: una columna con las cifras y las listas de barras. */
function AnaliticaMovil() {
  const { hasToken, isLoadingBusiness } = useBusiness();

  const analyticsQuery = useQuery({
    queryKey: ["call-analytics", 30],
    queryFn: () => getCallAnalytics(30),
    enabled: hasToken === true,
    retry: false,
  });

  if (isLoadingBusiness || analyticsQuery.isLoading) {
    return <AppPageSkeleton label="Cargando analítica…" />;
  }

  const planLimit = analyticsQuery.error
    ? getPlanLimitInfo(analyticsQuery.error)
    : null;

  const data = analyticsQuery.data;

  return (
    <div className="space-y-6">
      <AppPageHeader
        icon={BarChart3}
        title="Analítica avanzada"
        description={`Los últimos ${data?.days ?? 30} días de tu recepción, en datos accionables.`}
        volver={{ href: "/llamadas", etiqueta: "Llamadas" }}
      />

      {planLimit ? (
        <UpgradePanel />
      ) : analyticsQuery.isError ? (
        <SectionErrorState
          message="No se pudo cargar la analítica. Inténtalo de nuevo en unos minutos."
          onRetry={() => analyticsQuery.refetch()}
        />
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={PhoneCall}
              label="Llamadas atendidas"
              value={String(data.totals.calls)}
              detail={`${data.totals.minutes} minutos al teléfono`}
            />
            <StatCard
              icon={Clock3}
              label="Duración media"
              value={`${Math.floor(data.totals.averageDurationSecs / 60)}m ${data.totals.averageDurationSecs % 60}s`}
            />
            <StatCard
              icon={CalendarCheck2}
              label="Citas reservadas"
              value={String(data.totals.bookings)}
              detail={
                data.totals.cancelledBookings > 0
                  ? `${data.totals.cancelledBookings} ${data.totals.cancelledBookings === 1 ? "cancelada" : "canceladas"}`
                  : undefined
              }
            />
            <StatCard
              icon={Users}
              label="Demanda en espera"
              value={String(data.totals.waitlistLeads)}
              detail="Clientes apuntados a avisos de hueco libre"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <BarList
              id="calls-by-hour"
              title="Horas con más llamadas"
              description="Hora local del negocio. Útil para decidir refuerzos y horarios."
              rows={data.byHour.map((row) => ({
                label: `${String(row.hour).padStart(2, "0")}:00`,
                count: row.count,
              }))}
            />
            <BarList
              id="calls-by-weekday"
              title="Días con más llamadas"
              description="Distribución semanal de la demanda."
              rows={data.byWeekday.map((row) => ({
                label: WEEKDAY_LABELS[row.weekday] ?? String(row.weekday),
                count: row.count,
              }))}
            />
            <BarList
              id="calls-outcomes"
              title="Resultado de las llamadas"
              description="En qué acaba cada conversación."
              rows={data.outcomes.map((row) => ({
                // Mismas etiquetas que el historial y el detalle de llamada:
                // una llamada no puede ser «Escalada» en una vista y
                // «Derivada al negocio» en otra.
                label: outcomeLabel(row.outcome as CallOutcome) ?? row.outcome,
                count: row.count,
              }))}
            />
            <BarList
              id="calls-sentiments"
              title="Sentimiento del cliente"
              description="Cómo se fue el cliente de la llamada."
              rows={data.sentiments.map((row) => ({
                label: sentimentLabel(row.sentiment as CallSentiment) ?? row.sentiment,
                count: row.count,
              }))}
            />
          </div>

          <BarList
            id="calls-top-services"
            title="Servicios más pedidos"
            description="Lo que la gente pide por teléfono, se reserve o no — la señal para ampliar oferta o disponibilidad."
            rows={data.topServices.map((row) => ({
              label: row.service,
              count: row.count,
            }))}
          />
        </>
      ) : null}
    </div>
  );
}
