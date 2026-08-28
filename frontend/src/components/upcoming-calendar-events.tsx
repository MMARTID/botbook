"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, ExternalLink, MapPin, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getUpcomingCalendarEvents } from "@/lib/api";
import { formatCalendarEventDate } from "@/lib/format";
import type { CalendarEvent } from "@/lib/types";

const EVENT_LIMIT = 15;

function requiresReconnect(error: unknown) {
  return axios.isAxiosError(error) && ["GOOGLE_CALENDAR_RECONNECT_REQUIRED", "OUTLOOK_CALENDAR_RECONNECT_REQUIRED"].includes(error.response?.data?.code);
}

type UpcomingCalendarEventsProps = {
  businessId: string;
  timeZone: string;
  onReconnectRequired: (provider?: "google" | "outlook") => void;
};

export function UpcomingCalendarEvents({ businessId, timeZone, onReconnectRequired }: UpcomingCalendarEventsProps) {
  const queryClient = useQueryClient();
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  const eventsQuery = useQuery({
    queryKey: ["calendar-events", businessId, EVENT_LIMIT],
    queryFn: () => getUpcomingCalendarEvents(EVENT_LIMIT),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (eventsQuery.error && requiresReconnect(eventsQuery.error)) {
      queryClient.invalidateQueries({ queryKey: ["my-business"] });
      const provider = axios.isAxiosError(eventsQuery.error) && eventsQuery.error.response?.data?.code === "OUTLOOK_CALENDAR_RECONNECT_REQUIRED"
        ? "outlook"
        : "google";
      onReconnectRequired(provider);
    }
  }, [eventsQuery.error, onReconnectRequired, queryClient]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const updateControls = () => {
      setCanScrollBack(track.scrollLeft > 4);
      setCanScrollForward(track.scrollLeft + track.clientWidth < track.scrollWidth - 4);
    };

    updateControls();
    track.addEventListener("scroll", updateControls, { passive: true });
    const resizeObserver = new ResizeObserver(updateControls);
    resizeObserver.observe(track);

    return () => {
      track.removeEventListener("scroll", updateControls);
      resizeObserver.disconnect();
    };
  }, [eventsQuery.data]);

  const scroll = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * track.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section className="panel relative overflow-hidden p-4 sm:p-5 lg:p-6" aria-labelledby="calendar-events-title">
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[#8b5cf6]/20 blur-3xl" />
      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">Agenda · {eventsQuery.data?.provider === "outlook" ? "Outlook" : "Google Calendar"}</p>
          <h2 id="calendar-events-title" className="mt-1 text-lg font-semibold text-[#0a0a0a] sm:text-xl">
            Próximos eventos
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <a
            href={eventsQuery.data?.provider === "outlook" ? "https://outlook.office.com/calendar/" : "https://calendar.google.com/calendar/u/0/r/agenda"}
            target="_blank"
            rel="noopener noreferrer"
            className="mr-1 hidden items-center gap-2 text-sm font-semibold text-[#52525b] transition hover:text-[#0a0a0a] sm:inline-flex"
          >
            Ver calendario
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            onClick={() => scroll(-1)}
            disabled={!canScrollBack}
            aria-label="Ver eventos anteriores"
            className="calendar-arrow"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            disabled={!canScrollForward}
            aria-label="Ver más eventos"
            className="calendar-arrow"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {eventsQuery.isLoading ? (
        <div className="calendar-track mt-4" aria-label="Cargando próximos eventos">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="calendar-card animate-pulse" aria-hidden="true">
              <div className="h-3 w-20 rounded bg-[#e4e4e7]" />
              <div className="mt-4 h-4 w-full rounded bg-[#e4e4e7]" />
              <div className="mt-2 h-4 w-2/3 rounded bg-[#e4e4e7]" />
              <div className="mt-5 h-3 w-16 rounded bg-[#e4e4e7]" />
            </div>
          ))}
        </div>
      ) : eventsQuery.isError ? (
        <div className="mt-4 flex min-h-32 flex-col items-center justify-center rounded-xl border border-[#f5d3d3] bg-[#fff1f1] px-4 py-6 text-center">
          <p className="text-sm font-medium text-[#c53030]">No se pudo actualizar la agenda.</p>
          <button type="button" onClick={() => eventsQuery.refetch()} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#27272a]">
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
        </div>
      ) : eventsQuery.data?.events.length ? (
        <div ref={trackRef} className="calendar-track relative mt-4" aria-label="Lista de próximos eventos">
          {eventsQuery.data.events.map((event, index) => (
            <EventCard
              key={event.id ?? `${event.start}-${index}`}
              event={event}
              timeZone={timeZone}
              provider={eventsQuery.data?.provider ?? "google"}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 flex min-h-32 items-center gap-3 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] px-4 py-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#27272a]">No hay próximos eventos</p>
            <p className="mt-1 text-sm text-muted">Las nuevas reservas aparecerán aquí automáticamente.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function EventCard({ event, timeZone, provider }: { event: CalendarEvent; timeZone: string; provider: "google" | "outlook" }) {
  const { date, time, allDay } = formatCalendarEventDate(event.start, timeZone);
  const endTime = event.end && !allDay
    ? new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(event.end))
    : null;
  const content = (
    <>
      <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#52525b]">
        <span className="truncate">{date}</span>
        {event.htmlLink ? <ArrowUpRight className="h-3.5 w-3.5 shrink-0" /> : null}
      </div>
      <h3 className="mt-3 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-[#0a0a0a]">{event.summary}</h3>
      <div className="mt-3 space-y-1.5 text-xs text-muted">
        <p className="flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5 shrink-0" />
          <span>{time ?? "Hora pendiente"}{endTime ? ` – ${endTime}` : ""}</span>
        </p>
        {event.location ? (
          <p className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{event.location}</span>
          </p>
        ) : null}
      </div>
    </>
  );

  if (!event.htmlLink) {
    return <article className="calendar-card">{content}</article>;
  }

  return (
    <a
      href={event.htmlLink}
      target="_blank"
      rel="noopener noreferrer"
      className="calendar-card transition hover:-translate-y-0.5 hover:border-[#ddd6fe] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
      aria-label={`Abrir ${event.summary} en ${provider === "outlook" ? "Outlook Calendar" : "Google Calendar"}`}
    >
      {content}
    </a>
  );
}
