"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getOnboardingState, getStats } from "@/lib/api";
import { useBusiness } from "@/components/providers";
import { CallForwardingCard } from "@/components/call-forwarding-card";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { PendingBookings } from "@/components/pending-bookings";
import { RecentCalls } from "@/components/recent-calls";
import { StatusStrip } from "@/components/status-strip";
import { UpcomingBookings } from "@/components/upcoming-bookings";
import { WeeklySummary } from "@/components/weekly-summary";

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { business, isLoadingBusiness, hasToken, isError: isBusinessError, errorMessage } = useBusiness();

  const [calendarStatus, setCalendarStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (hasToken === false) {
      router.replace("/landing");
      return;
    }

    if (searchParams.get("calendar_error")) {
      setCalendarStatus({ type: "error", message: "Hubo un error al conectar Google Calendar." });
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
    return <div className="p-8 text-center text-muted">Cargando tu panel...</div>;
  }

  if (isBusinessError) {
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
          <p className="font-mono text-xs leading-5 text-[#a1a1aa]">{errorMessage}</p>
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

  const activeCalendarProvider = business.calendarProvider === "outlook" ? "outlook" : "google";
  const hasCalendar =
    activeCalendarProvider === "outlook"
      ? business.outlookCalendarConnected === true
      : business.googleCalendarConnected === true;
  const agent = business.agents?.[0];
  const timeZone = business.timezone || "Europe/Madrid";
  const forwarding = onboardingQuery.data?.forwarding;

  return (
    <div className="space-y-5 sm:space-y-8">
      <OnboardingChecklist />

      <PendingBookings timeZone={timeZone} />

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
          hay que resolver, por delante de cualquier métrica. */}
      {forwarding && forwarding.status !== "done" ? (
        <CallForwardingCard forwarding={forwarding} />
      ) : null}

      {/* Vercel puede publicar esta interfaz unos minutos antes de que Cloud
          Run exponga la ventana `week`. Durante ese despliegue escalonado no
          renderizamos un resumen con datos inexistentes. */}
      {statsQuery.data?.week ? <WeeklySummary week={statsQuery.data.week} /> : null}

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <UpcomingBookings
          timeZone={timeZone}
          calendarProvider={activeCalendarProvider}
          hasCalendar={hasCalendar}
        />
        <RecentCalls />
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Cargando...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
