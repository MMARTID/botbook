"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Phone } from "lucide-react";
import { getPendingBookings } from "@/lib/api";
import { formatClock, formatDayLabel, formatPhone } from "@/lib/format";
import type { PendingBooking } from "@/lib/types";

/**
 * Traduce el código técnico del fallo a lo que el negocio necesita saber: si
 * fue culpa de algo que puede arreglar (el calendario) o de un tropiezo puntual.
 */
function motivo(failureCode: string | null): string {
  if (!failureCode) return "No se pudo guardar en la agenda durante la llamada.";
  if (failureCode.includes("RECONNECT_REQUIRED")) {
    return "La conexión con tu agenda estaba caducada en ese momento.";
  }
  if (failureCode === "BOOKING_LOCK_TIMEOUT") {
    return "Había otra reserva en curso para la misma hora.";
  }
  return "No se pudo guardar en la agenda durante la llamada.";
}

type PendingBookingsProps = {
  timeZone: string;
};

/**
 * Citas que el cliente pidió por teléfono y no llegaron a la agenda por un
 * fallo técnico, sin recuperar por el reintento automático. Son la única cosa
 * del panel que exige que el negocio descuelgue el teléfono, así que solo
 * aparece cuando hay alguna.
 */
export function PendingBookings({ timeZone }: PendingBookingsProps) {
  const pendingQuery = useQuery({
    queryKey: ["pending-bookings"],
    queryFn: getPendingBookings,
    refetchInterval: 5 * 60_000,
  });

  const pending = pendingQuery.data ?? [];
  if (pending.length === 0) return null;

  return (
    <section
      className="panel border-[#f5d3d3] bg-[#fff1f1] p-4 sm:p-5"
      aria-labelledby="pending-bookings-title"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#c53030]">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="pending-bookings-title" className="text-base font-semibold text-[#0a0a0a] sm:text-lg">
            {pending.length === 1
              ? "Una cita se quedó sin reservar"
              : `${pending.length} citas se quedaron sin reservar`}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#c53030]">
            Tu cliente pidió la cita por teléfono pero no llegó a la agenda. Llámale para confirmarla:
            todavía estás a tiempo.
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {pending.map((item) => (
          <PendingRow key={item.id} item={item} timeZone={timeZone} />
        ))}
      </ul>
    </section>
  );
}

function PendingRow({ item, timeZone }: { item: PendingBooking; timeZone: string }) {
  const phone = formatPhone(item.clientPhone);
  const cuando = item.requestedAt
    ? `${formatDayLabel(item.requestedAt, timeZone)} a las ${formatClock(item.requestedAt, timeZone)}`
    : null;

  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#0a0a0a]">
          {item.clientName ?? "Cliente sin nombre"}
          {cuando ? <span className="font-normal text-muted"> · pedía {cuando}</span> : null}
        </p>
        <p className="mt-1 text-sm leading-6 text-muted">{motivo(item.failureCode)}</p>
      </div>
      {phone && item.clientPhone ? (
        <a
          href={`tel:${item.clientPhone}`}
          className="btn-primary h-11 shrink-0 px-4"
          aria-label={`Llamar a ${item.clientName ?? "el cliente"} al ${phone}`}
        >
          <Phone className="h-4 w-4" aria-hidden="true" />
          <span className="tabular-nums">{phone}</span>
        </a>
      ) : null}
    </li>
  );
}
