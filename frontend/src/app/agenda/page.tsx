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
  const { business, hasToken, isLoadingBusiness } = useBusiness();
  const [days, setDays] = useState<AgendaRange>(7);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
  }, [hasToken, router]);

  if (isLoadingBusiness || !business) return <div className="p-8 text-center text-muted">Cargando agenda…</div>;

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
