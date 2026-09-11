"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, Phone, RefreshCw, Users } from "lucide-react";
import { getAgenda } from "@/lib/api";
import { formatClock, formatDayLabel, formatPhone, formatPrice } from "@/lib/format";
import type { AgendaBooking } from "@/lib/types";

const AGENDA_DAYS = 7;

type UpcomingBookingsProps = {
  timeZone: string;
  calendarProvider: "google" | "outlook";
  hasCalendar: boolean;
};

/**
 * Agenda de las próximas citas reservadas por el agente. Se construye sobre
 * `Booking` (cliente, servicios, profesional) en vez de sobre los eventos
 * crudos del calendario: el negocio necesita saber quién viene y a qué, no
 * leer la cadena de texto que se guardó en Google.
 */
export function UpcomingBookings({ timeZone, calendarProvider, hasCalendar }: UpcomingBookingsProps) {
  const agendaQuery = useQuery({
    queryKey: ["agenda", AGENDA_DAYS],
    queryFn: () => getAgenda(AGENDA_DAYS),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const bookings = agendaQuery.data?.bookings ?? [];
  const days = groupByDay(bookings, timeZone);

  const calendarUrl =
    calendarProvider === "outlook"
      ? "https://outlook.office.com/calendar/"
      : "https://calendar.google.com/calendar/u/0/r/agenda";

  return (
    <section className="panel min-w-0 p-4 sm:p-5 lg:p-6" aria-labelledby="upcoming-bookings-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="upcoming-bookings-title" className="text-lg font-semibold text-[#0a0a0a] sm:text-xl">
            Próximas citas
          </h2>
          <p className="mt-1 text-sm text-muted">
            {bookings.length > 0
              ? `${bookings.length} ${bookings.length === 1 ? "cita reservada" : "citas reservadas"} en los próximos ${AGENDA_DAYS} días.`
              : `Lo que tu recepcionista tiene agendado para los próximos ${AGENDA_DAYS} días.`}
          </p>
        </div>
        {hasCalendar ? (
          <a
            href={calendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#e5e5e5] bg-white px-3 text-sm font-medium text-[#27272a] transition duration-200 hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
          >
            Calendario
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      {agendaQuery.isLoading ? (
        <div className="mt-5 space-y-4" aria-label="Cargando próximas citas">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex gap-4" aria-hidden="true">
              <div className="h-10 w-14 shrink-0 animate-pulse rounded-lg bg-[#f4f4f5]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/5 animate-pulse rounded bg-[#f4f4f5]" />
                <div className="h-3 w-3/5 animate-pulse rounded bg-[#f4f4f5]" />
              </div>
            </div>
          ))}
        </div>
      ) : agendaQuery.isError ? (
        <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl border border-[#f5d3d3] bg-[#fff1f1] px-4 py-6 text-center">
          <p className="text-sm font-medium text-[#c53030]">No se pudieron cargar las próximas citas.</p>
          <button
            type="button"
            onClick={() => agendaQuery.refetch()}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#f5d3d3] bg-white px-4 text-sm font-semibold text-[#c53030] transition duration-200 hover:bg-[#fff1f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reintentar
          </button>
        </div>
      ) : days.length === 0 ? (
        <div className="mt-5 flex flex-col items-start gap-3 rounded-2xl border border-dashed border-[#e5e5e5] bg-[#fafafa] px-4 py-6 sm:flex-row sm:items-center">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#27272a]">Ninguna cita en los próximos días</p>
            <p className="mt-1 text-sm leading-6 text-muted">
              Cuando tu recepcionista reserve una cita por teléfono, aparecerá aquí con el cliente, el
              servicio y el profesional asignado.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {days.map(({ key, label, bookings: dayBookings }) => (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-3 border-b border-[#e5e5e5] pb-2">
                <h3 className="text-sm font-semibold text-[#0a0a0a]">{label}</h3>
                <span className="shrink-0 text-xs text-muted">
                  {dayBookings.length} {dayBookings.length === 1 ? "cita" : "citas"}
                </span>
              </div>
              <ul className="divide-y divide-[#f4f4f5]">
                {dayBookings.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} timeZone={timeZone} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function BookingRow({ booking, timeZone }: { booking: AgendaBooking; timeZone: string }) {
  const start = formatClock(booking.programedAt, timeZone);
  const end = formatClock(
    new Date(new Date(booking.programedAt).getTime() + booking.durationMinutes * 60_000).toISOString(),
    timeZone
  );
  const serviceNames = booking.services.map((service) => service.name).join(" + ");
  const phone = formatPhone(booking.clientPhone);

  // Solo se suma si TODOS los servicios de la cita tienen precio: media
  // estimación es peor que ninguna.
  const total = booking.services.every((service) => service.priceCents != null)
    ? booking.services.reduce((acc, service) => acc + (service.priceCents ?? 0), 0)
    : null;

  return (
    <li className="flex items-start gap-3 py-3 sm:gap-4">
      <p className="w-12 shrink-0 pt-0.5 text-right text-sm font-semibold tabular-nums text-[#0a0a0a]">
        {start}
      </p>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm font-semibold text-[#0a0a0a]">
            {serviceNames || "Cita reservada"}
          </p>
          {total != null ? (
            <span className="shrink-0 text-sm font-semibold tabular-nums text-[#0a0a0a]">
              {formatPrice(total)}
            </span>
          ) : null}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="tabular-nums">
            {booking.durationMinutes} min · hasta las {end}
          </span>
          {booking.professional ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{booking.professional.name}</span>
            </>
          ) : null}
          {/* Sin nombre de cliente en la reserva, el teléfono es lo único que
              identifica a quién espera el negocio. */}
          {phone ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{phone}</span>
            </>
          ) : null}
          {booking.numberPeople > 1 ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" aria-hidden="true" />
                {booking.numberPeople} personas
              </span>
            </>
          ) : null}
        </p>
      </div>

      {phone ? (
        <a
          href={`tel:${booking.clientPhone}`}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#52525b] transition duration-200 hover:border-[#ddd6fe] hover:bg-[#f3eeff] hover:text-[#6d28d9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
          aria-label={`Llamar al cliente al ${phone}`}
          title={`Llamar al ${phone}`}
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
        </a>
      ) : null}
    </li>
  );
}

type AgendaDay = { key: string; label: string; bookings: AgendaBooking[] };

function groupByDay(bookings: AgendaBooking[], timeZone: string): AgendaDay[] {
  const days = new Map<string, AgendaDay>();

  for (const booking of bookings) {
    // Clave por día natural en la zona del negocio (no del navegador): una
    // cita de las 00:30 pertenece a su día en Madrid, no al del visitante.
    const key = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    }).format(new Date(booking.programedAt));

    const day = days.get(key);
    if (day) {
      day.bookings.push(booking);
    } else {
      days.set(key, {
        key,
        label: formatDayLabel(booking.programedAt, timeZone),
        bookings: [booking],
      });
    }
  }

  return Array.from(days.values());
}
