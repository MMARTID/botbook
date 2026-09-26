"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getOnboardingState, getStats } from "@/lib/api";
import { useBusiness } from "@/components/providers";
import { CallForwardingCard } from "@/components/call-forwarding-card";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { PendingBookings } from "@/components/pending-bookings";
import { RecentCalls } from "@/components/recent-calls";
import { SectionErrorState } from "@/components/section-card";
import { StatusStrip } from "@/components/status-strip";
import { UpcomingBookings } from "@/components/upcoming-bookings";
import { WeeklySummary } from "@/components/weekly-summary";
import { AppPageHeader, AppPageSkeleton } from "@/components/app-page-header";
import { LayoutDashboard } from "lucide-react";

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { business, isLoadingBusiness, hasToken, isError: isBusinessError, errorMessage } = useBusiness();

  const [calendarStatus, setCalendarStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (hasToken === false) {
      router.replace("/login");
      return;
    }

    if (searchParams.get("calendar_error")) {
      setCalendarStatus({ type: "error", message: "Hubo un error al conectar Google Calendar." });
      router.replace("/");
    }

    if (searchParams.get("calendar_success")) {
      setCalendarStatus({ type: "success", message: "Google Calendar está conectado correctamente." });
      router.replace("/");
    }

    if (searchParams.get("outlook_error")) {
      setCalendarStatus({ type: "error", message: "Hubo un error al conectar Outlook Calendar." });
      router.replace("/");
    }

    if (searchParams.get("outlook_success")) {
      setCalendarStatus({ type: "success", message: "Outlook Calendar está conectado correctamente." });
      router.replace("/");
    }
  }, [hasToken, router, searchParams]);

  const statsQuery = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
    enabled: !!business,
  });

  const onboardingQuery = useQuery({
    queryKey: ["onboarding-state"],
    queryFn: getOnboardingState,
    enabled: !!business,
  });

  if (isLoadingBusiness) {
    return <AppPageSkeleton label="Cargando tu panel…" />;
  }

  // El `&& !business` evita tirar abajo el panel ya pintado cuando lo que falla
  // es el refresco al volver a la pestaña: React Query marca error pero mantiene
  // los datos en caché, y sin esta condición un microcorte de red se llevaba por
  // delante la pantalla entera.
  if (isBusinessError && !business) {
    return (
      <div className="panel mx-auto max-w-2xl space-y-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-[#0a0a0a]">No se pudo cargar tu panel</h1>
        <p className="text-sm leading-6 text-muted">
          Puede haber sido un corte momentáneo de conexión. Vuelve a intentarlo; si sigue sin cargar,
          escríbenos y lo miramos.
        </p>
        {/* El detalle técnico solo tiene sentido para quien puede hacer algo
            con él: en producción no se enseña. */}
        {process.env.NODE_ENV === "development" && errorMessage ? (
          <p className="font-mono text-xs leading-5 text-muted">{errorMessage}</p>
        ) : null}
        <button type="button" onClick={() => window.location.reload()} className="btn-primary mx-auto">
          Reintentar
        </button>
      </div>
    );
  }

  if (!business) {
    return null; // Will redirect to login via useEffect
  }

  const agent = business.agents?.[0];
  const timeZone = business.timezone || "Europe/Madrid";
  const forwarding = onboardingQuery.data?.forwarding;

  return (
    <div className="space-y-5 sm:space-y-8">
      <AppPageHeader icon={LayoutDashboard} title="Tu negocio, al día" description="Comprueba que la recepción está lista, mira las citas que entran y revisa las últimas conversaciones.">
        <Link href="/agente" className="btn-secondary h-11 shrink-0 px-5">Configurar agente</Link>
      </AppPageHeader>

      <StatusStrip business={business} agentActive={agent?.active !== false} />

      {calendarStatus ? (
        <div
          role="status"
          className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
            calendarStatus.type === "success"
              ? "border-[#d8efd7] bg-[#ecf7ec] text-[#2c7334]"
              : "border-[#f5d3d3] bg-[#fff1f1] text-[#c53030]"
          }`}
        >
          {calendarStatus.message}
        </div>
      ) : null}

      {/* Sin desvío no entra ni una llamada: mientras falte, es lo primero que
          hay que resolver, por delante de cualquier métrica. Por eso, si la
          consulta falla, se avisa en vez de esconder la tarjeta en silencio:
          un negocio sin desvío y sin instrucciones no recibe nada. */}
      {onboardingQuery.isError ? (
        <SectionErrorState
          message="No hemos podido comprobar si el desvío de llamadas está activo. Hasta que no lo esté, tus clientes no llegan a tu recepcionista."
          onRetry={() => void onboardingQuery.refetch()}
        />
      ) : forwarding && forwarding.status !== "done" ? (
        <CallForwardingCard
          forwarding={forwarding}
          customerLineType={business.customerLineType ?? null}
        />
      ) : null}

      {/* Antes que la guía de configuración: estas citas se pierden si el
          negocio no llama hoy; la guía puede esperar a mañana. */}
      <PendingBookings timeZone={timeZone} />

      <OnboardingChecklist />

      {/* Vercel puede publicar esta interfaz unos minutos antes de que Cloud
          Run exponga la ventana `week`. Durante ese despliegue escalonado no
          renderizamos un resumen con datos inexistentes. */}
      {statsQuery.data?.week ? <WeeklySummary week={statsQuery.data.week} /> : null}

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <UpcomingBookings timeZone={timeZone} />
        <RecentCalls />
      </div>
    </div>
  );
}

export function PanelInicio() {
  return (
    <Suspense fallback={<AppPageSkeleton label="Cargando tu panel…" />}>
      <DashboardContent />
    </Suspense>
  );
}
