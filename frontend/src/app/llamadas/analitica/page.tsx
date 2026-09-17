"use client";

import { useEffect } from "react";
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
import { useBusiness } from "@/components/providers";
import { AppPageHeader } from "@/components/app-page-header";
import { BackLink } from "@/components/back-link";
import { SectionCard, SectionErrorState } from "@/components/section-card";

const OUTCOME_LABELS: Record<string, string> = {
  RESOLVED: "Resuelta",
  FRUSTRATED: "Cliente frustrado",
  NO_ANSWER: "Sin respuesta",
  ESCALATED: "Derivada al negocio",
  LEAD_CAPTURED: "Oportunidad captada",
};

const SENTIMENT_LABELS: Record<string, string> = {
  POSITIVE: "Positivo",
  NEUTRAL: "Neutro",
  NEGATIVE: "Negativo",
};

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
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="mt-4 text-3xl font-black tabular-nums tracking-tight text-[#0a0a0a]">{value}</p>
      <p className="mt-1 text-sm font-semibold text-[#27272a]">{label}</p>
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
                <span className="font-semibold text-[#27272a]">{row.label}</span>
                <span className="tabular-nums text-muted">{row.count}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#f4f4f5]">
                <div
                  className="h-full rounded-full bg-[#8b5cf6]"
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
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f3eeff] text-[#8b5cf6]">
        <Lock className="h-7 w-7" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-2xl font-black tracking-tight text-[#0a0a0a]">
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

export default function CallAnalyticsPage() {
  const router = useRouter();
  const { hasToken, isLoadingBusiness } = useBusiness();

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
  }, [hasToken, router]);

  const analyticsQuery = useQuery({
    queryKey: ["call-analytics", 30],
    queryFn: () => getCallAnalytics(30),
    enabled: hasToken === true,
    retry: false,
  });

  if (isLoadingBusiness || analyticsQuery.isLoading) {
    return <div className="p-8 text-center text-muted">Cargando analítica…</div>;
  }

  const planLimit = analyticsQuery.error
    ? getPlanLimitInfo(analyticsQuery.error)
    : null;

  const data = analyticsQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <BackLink fallbackHref="/llamadas" />
      </div>
      <AppPageHeader
        icon={BarChart3}
        title="Analítica avanzada"
        description={`Los últimos ${data?.days ?? 30} días de tu recepción, en datos accionables.`}
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
                  ? `${data.totals.cancelledBookings} canceladas`
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
                label: OUTCOME_LABELS[row.outcome] ?? row.outcome,
                count: row.count,
              }))}
            />
            <BarList
              id="calls-sentiments"
              title="Sentimiento del cliente"
              description="Cómo se fue el cliente de la llamada."
              rows={data.sentiments.map((row) => ({
                label: SENTIMENT_LABELS[row.sentiment] ?? row.sentiment,
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
