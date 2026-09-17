"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Phone, Users } from "lucide-react";
import { getAgenda } from "@/lib/api";
import { formatClock, formatDayLabel, formatPhone, formatPrice } from "@/lib/format";
import type { AgendaBooking } from "@/lib/types";
import { SectionEmptyState, SectionErrorState } from "@/components/section-card";

const PAGE_SIZE = 50;

export type AgendaRange = 1 | 7 | 30;

type AgendaTimelineProps = {
  days: AgendaRange;
  offset: number;
  timeZone: string;
  calendarProvider: "google" | "outlook";
  hasCalendar: boolean;
  onOffsetChange: (offset: number) => void;
};

type AgendaDay = { key: string; label: string; bookings: AgendaBooking[] };

/**
 * La agenda muestra únicamente reservas que Alhabla ha podido verificar y
 * escribir. Google Calendar y Outlook siguen siendo la agenda canónica: por
 * eso no mezclamos aquí eventos externos opacos con las reservas del agente.
 */
export function AgendaTimeline({
  days,
  offset,
  timeZone,
  calendarProvider,
  hasCalendar,
  onOffsetChange,
}: AgendaTimelineProps) {
  const agendaQuery = useQuery({
    queryKey: ["agenda", days, offset],
    queryFn: () => getAgenda(days, PAGE_SIZE, offset),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
  const agenda = agendaQuery.data;
  const groupedDays = groupByDay(agenda?.bookings ?? [], timeZone);
  const calendarUrl = calendarProvider === "outlook"
    ? "https://outlook.office.com/calendar/"
    : "https://calendar.google.com/calendar/u/0/r/agenda";
  const first = agenda ? agenda.offset + 1 : 0;
  const last = agenda ? agenda.offset + agenda.bookings.length : 0;

  return (
    <section className="panel overflow-hidden" aria-labelledby="agenda-timeline-title">
      <div className="flex flex-col gap-4 border-b border-[#e5e5e5] p-4 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 id="agenda-timeline-title" className="text-lg font-semibold text-[#0a0a0a] sm:text-xl">Citas creadas por Alhabla</h2>
          <p className="mt-1 text-sm leading-6 text-muted">Reservas verificadas que tu recepcionista ha añadido a la agenda.</p>
        </div>
        {hasCalendar ? (
          <a href={calendarUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary h-11 shrink-0 px-4">
            Abrir calendario
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      {agendaQuery.isLoading ? <AgendaLoading /> : null}
      {agendaQuery.isError ? (
        <SectionErrorState
          className="m-4 sm:m-6"
          message="No se pudieron cargar las citas."
          onRetry={() => agendaQuery.refetch()}
        />
      ) : null}
      {!agendaQuery.isLoading && !agendaQuery.isError && groupedDays.length === 0 ? (
        <SectionEmptyState
          className="m-4 sm:m-6"
          icon={CalendarDays}
          title="Aún no hay citas en este periodo"
          description="Cuando la recepcionista confirme una reserva por teléfono, verás aquí el servicio, la hora y a quién atenderá el negocio."
        />
      ) : null}
      {!agendaQuery.isLoading && !agendaQuery.isError && groupedDays.length > 0 ? (
        <div className="divide-y divide-[#e5e5e5]">
          {groupedDays.map((day) => (
            <section key={day.key} className="grid gap-3 p-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6 sm:p-6" aria-label={day.label}>
              <div className="sm:pt-2">
                <h3 className="text-base font-semibold capitalize text-[#0a0a0a]">{day.label}</h3>
                <p className="mt-1 text-sm text-muted">{day.bookings.length} {day.bookings.length === 1 ? "cita" : "citas"}</p>
              </div>
              <ol className="relative space-y-2 before:absolute before:bottom-4 before:left-[1.45rem] before:top-4 before:w-px before:bg-[#e5e5e5] sm:before:left-[3.25rem]">
                {day.bookings.map((booking) => <AgendaBookingRow key={booking.id} booking={booking} timeZone={timeZone} />)}
              </ol>
            </section>
          ))}
        </div>
      ) : null}

      {agenda && agenda.total > 0 ? (
        <footer className="flex flex-col gap-3 border-t border-[#e5e5e5] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <p className="text-sm text-muted">
            Mostrando <span className="font-semibold tabular-nums text-[#27272a]">{first}–{last}</span> de <span className="font-semibold tabular-nums text-[#27272a]">{agenda.total}</span> citas.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => onOffsetChange(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0} className="btn-secondary h-11 px-4">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior
            </button>
            <button type="button" onClick={() => onOffsetChange(offset + PAGE_SIZE)} disabled={!agenda.hasMore} className="btn-primary h-11 px-4">
              Siguiente <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </footer>
      ) : null}
    </section>
  );
}

function AgendaBookingRow({ booking, timeZone }: { booking: AgendaBooking; timeZone: string }) {
  const start = formatClock(booking.programedAt, timeZone);
  const end = formatClock(new Date(new Date(booking.programedAt).getTime() + booking.durationMinutes * 60_000).toISOString(), timeZone);
  const phone = formatPhone(booking.clientPhone);
  const serviceNames = booking.services.map((service) => service.name).join(" + ");
  const total = booking.services.length > 0 && booking.services.every((service) => service.priceCents != null)
    ? booking.services.reduce((sum, service) => sum + (service.priceCents ?? 0), 0)
    : null;

  return (
    <li className="relative grid grid-cols-[3rem_minmax(0,1fr)] gap-3 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-4">
      <p className="pt-4 text-right text-sm font-semibold tabular-nums text-[#0a0a0a]">{start}</p>
      <span className="absolute left-[1.15rem] top-[1.55rem] h-2.5 w-2.5 rounded-full border-2 border-white bg-[#8b5cf6] shadow-[0_0_0_1px_#ddd6fe] sm:left-[3rem]" aria-hidden="true" />
      <article className="min-w-0 rounded-2xl border border-[#e5e5e5] bg-white p-4 transition hover:border-[#ddd6fe] hover:bg-[#fafafa]">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#0a0a0a]">{serviceNames || "Cita reservada"}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{booking.durationMinutes} min · hasta las {end}{booking.professional ? ` · ${booking.professional.name}` : ""}</p>
          </div>
          {total != null ? <span className="shrink-0 text-sm font-semibold tabular-nums text-[#0a0a0a]">{formatPrice(total)}</span> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {phone ? <span className="inline-flex items-center gap-1.5 text-xs font-medium tabular-nums text-[#52525b]"><Phone className="h-3.5 w-3.5 text-[#6d28d9]" aria-hidden="true" />{phone}</span> : <span className="text-xs text-muted">Teléfono no disponible</span>}
          {booking.numberPeople > 1 ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#52525b]"><Users className="h-3.5 w-3.5 text-[#6d28d9]" aria-hidden="true" />{booking.numberPeople} personas</span> : null}
          {phone ? <a href={`tel:${booking.clientPhone}`} className="ml-auto inline-flex min-h-10 items-center rounded-full px-2 text-xs font-semibold text-[#6d28d9] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">Llamar</a> : null}
        </div>
      </article>
    </li>
  );
}

function AgendaLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6" aria-label="Cargando agenda">
      {Array.from({ length: 3 }, (_, index) => <div key={index} className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6"><div className="h-10 w-28 animate-pulse rounded bg-[#f4f4f5]" /><div className="h-28 animate-pulse rounded-2xl bg-[#f4f4f5]" /></div>)}
    </div>
  );
}

function groupByDay(bookings: AgendaBooking[], timeZone: string): AgendaDay[] {
  const days = new Map<string, AgendaDay>();
  for (const booking of bookings) {
    const key = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(new Date(booking.programedAt));
    const existing = days.get(key);
    if (existing) existing.bookings.push(booking);
    else days.set(key, { key, label: formatDayLabel(booking.programedAt, timeZone), bookings: [booking] });
  }
  return Array.from(days.values());
}
