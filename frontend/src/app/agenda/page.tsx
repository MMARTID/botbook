"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { AgendaTimeline, type AgendaRange } from "@/components/agenda-timeline";
import { useBusiness } from "@/components/providers";
import { AppPageHeader } from "@/components/app-page-header";

const RANGES: { value: AgendaRange; label: string }[] = [
  { value: 1, label: "Hoy" },
  { value: 7, label: "7 días" },
  { value: 30, label: "30 días" },
];

export default function AgendaPage() {
  const router = useRouter();
  const { business, hasToken, isLoadingBusiness, isError: isBusinessError, errorMessage } = useBusiness();
  const [days, setDays] = useState<AgendaRange>(7);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
  }, [hasToken, router]);

  if (isLoadingBusiness) return <div className="p-8 text-center text-muted">Cargando agenda…</div>;

  // Carga y error son cosas distintas: si /business/me falla, `isLoading` pasa
  // a false y `business` se queda vacío, así que sin esta rama el negocio se
  // quedaba mirando "Cargando agenda…" para siempre.
  if (isBusinessError) {
    return (
      <div className="panel mx-auto max-w-2xl space-y-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-[#0a0a0a]">No se pudo cargar tu agenda</h1>
        <p className="text-sm leading-6 text-muted">
          Puede haber sido un corte momentáneo de conexión. Vuelve a intentarlo; si sigue sin cargar,
          escríbenos y lo miramos.
        </p>
        {process.env.NODE_ENV === "development" && errorMessage ? (
          <p className="font-mono text-xs leading-5 text-muted">{errorMessage}</p>
        ) : null}
        <button type="button" onClick={() => window.location.reload()} className="btn-primary mx-auto">
          Reintentar
        </button>
      </div>
    );
  }

  if (!business) return null; // Sin sesión: el efecto de arriba redirige a /login.

  const calendarProvider = business.calendarProvider === "outlook" ? "outlook" : "google";
  const hasCalendar = calendarProvider === "outlook" ? business.outlookCalendarConnected === true : business.googleCalendarConnected === true;

  return (
    <div className="space-y-6">
      <AppPageHeader icon={CalendarRange} title="Agenda" description="Las citas verificadas que tu recepcionista ha reservado para el negocio.">
        <div className="flex w-full gap-1 rounded-full border border-[#e5e5e5] bg-[#fafafa] p-1 sm:w-auto" aria-label="Periodo de agenda">
          {RANGES.map((range) => <button key={range.value} type="button" onClick={() => { setDays(range.value); setOffset(0); }} aria-pressed={days === range.value} className={`min-h-10 flex-1 rounded-full px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] sm:flex-none ${days === range.value ? "bg-white text-[#0a0a0a]" : "text-[#52525b] hover:text-[#0a0a0a]"}`}>{range.label}</button>)}
        </div>
      </AppPageHeader>
      <AgendaTimeline days={days} offset={offset} timeZone={business.timezone || "Europe/Madrid"} calendarProvider={calendarProvider} hasCalendar={hasCalendar} onOffsetChange={setOffset} />
    </div>
  );
}
