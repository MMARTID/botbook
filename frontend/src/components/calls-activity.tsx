"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, Frown, Meh, PhoneCall, RefreshCw, Smile } from "lucide-react";
import { CallDetailModal } from "@/components/call-detail-modal";
import { getCalls } from "@/lib/api";
import { formatDate, formatDuration, formatPhone, formatPrice, outcomeLabel, outcomeTone, sentimentLabel } from "@/lib/format";
import type { Call } from "@/lib/types";

const PAGE_SIZE = 25;

const OUTCOME_CLASSES = {
  success: "border-[#d8efd7] bg-[#ecf7ec] text-[#2c7334]",
  warning: "border-[#f0dfa8] bg-[#fef8e7] text-[#9f7a15]",
  neutral: "border-[#e5e5e5] bg-[#fafafa] text-[#52525b]",
} as const;

const SENTIMENT_ICON = { POSITIVE: Smile, NEUTRAL: Meh, NEGATIVE: Frown } as const;

/** Historial paginado: los detalles caros (transcripción y grabación) siguen bajo demanda. */
export function CallsActivity() {
  const [offset, setOffset] = useState(0);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const callsQuery = useQuery({
    queryKey: ["calls", PAGE_SIZE, offset],
    queryFn: () => getCalls(PAGE_SIZE, offset),
    refetchOnWindowFocus: true,
  });
  const response = callsQuery.data;
  const calls = response?.data ?? [];
  const first = response ? response.offset + 1 : 0;
  const last = response ? response.offset + calls.length : 0;

  return (
    <section className="panel overflow-hidden" aria-labelledby="calls-activity-title">
      <div className="border-b border-[#e5e5e5] p-4 sm:p-6">
        <h2 id="calls-activity-title" className="text-lg font-semibold text-[#0a0a0a]">Actividad telefónica</h2>
        <p className="mt-1 text-sm leading-6 text-muted">Revisa qué ocurrió en cada conversación y entra al detalle cuando necesites contexto.</p>
      </div>
      {callsQuery.isLoading ? <CallsLoading /> : null}
      {callsQuery.isError ? (
        <div className="m-4 flex flex-col items-center gap-3 rounded-2xl border border-[#f5d3d3] bg-[#fff1f1] px-4 py-8 text-center sm:m-6">
          <p className="text-sm font-semibold text-[#c53030]">No se pudieron cargar las llamadas.</p>
          <button type="button" onClick={() => callsQuery.refetch()} className="btn-secondary h-11 border-[#f5d3d3] px-4 text-[#c53030]"><RefreshCw className="h-4 w-4" aria-hidden="true" />Reintentar</button>
        </div>
      ) : null}
      {!callsQuery.isLoading && !callsQuery.isError && calls.length === 0 ? (
        <div className="m-4 flex flex-col items-start gap-3 rounded-2xl border border-dashed border-[#e5e5e5] bg-[#fafafa] p-5 sm:m-6 sm:flex-row sm:items-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]"><PhoneCall className="h-5 w-5" aria-hidden="true" /></span>
          <div><p className="text-sm font-semibold text-[#27272a]">Todavía no hay llamadas</p><p className="mt-1 text-sm leading-6 text-muted">La actividad aparecerá aquí cuando la recepcionista atienda a un cliente.</p></div>
        </div>
      ) : null}
      {!callsQuery.isLoading && !callsQuery.isError && calls.length > 0 ? (
        <ol className="divide-y divide-[#e5e5e5]">
          {calls.map((call) => <CallActivityRow key={call.id} call={call} onOpen={() => setSelectedCallId(call.id)} />)}
        </ol>
      ) : null}
      {response && response.total > 0 ? (
        <footer className="flex flex-col gap-3 border-t border-[#e5e5e5] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <p className="text-sm text-muted">Mostrando <span className="font-semibold tabular-nums text-[#27272a]">{first}–{last}</span> de <span className="font-semibold tabular-nums text-[#27272a]">{response.total}</span> llamadas.</p>
          <div className="flex gap-2">
            <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="btn-secondary h-11 px-4"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Anterior</button>
            <button type="button" disabled={offset + calls.length >= response.total} onClick={() => setOffset(offset + PAGE_SIZE)} className="btn-primary h-11 px-4">Siguiente<ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        </footer>
      ) : null}
      {selectedCallId ? <CallDetailModal callId={selectedCallId} onClose={() => setSelectedCallId(null)} /> : null}
    </section>
  );
}

function CallActivityRow({ call, onOpen }: { call: Call; onOpen: () => void }) {
  const booking = call.booking && !call.booking.isCancelled ? call.booking : null;
  const serviceNames = booking?.services?.map((service) => service.name).join(" + ");
  const amount = booking?.services?.length && booking.services.every((service) => service.priceCents != null)
    ? booking.services.reduce((sum, service) => sum + (service.priceCents ?? 0), 0)
    : null;
  const SentimentIcon = call.sentiment ? SENTIMENT_ICON[call.sentiment] : null;
  const tone = outcomeTone(call.outcome);

  return (
    <li>
      <button type="button" onClick={onOpen} className="grid w-full gap-3 p-4 text-left transition hover:bg-[#fafafa] focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6] sm:grid-cols-[minmax(10rem,0.8fr)_minmax(12rem,1.3fr)_minmax(7rem,0.7fr)_auto] sm:items-center sm:gap-5 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]"><PhoneCall className="h-4 w-4" aria-hidden="true" /></span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tabular-nums text-[#0a0a0a]">{formatPhone(call.fromNumber) ?? "Número oculto"}</span>
            <span className="mt-0.5 block text-xs leading-5 text-muted">{formatDate(call.startedAt)} · {formatDuration(call.durationSecs)}</span>
          </span>
        </div>
        <span className="min-w-0">
          {booking ? (
            <span className="block">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-[#27272a]"><CalendarCheck className="h-4 w-4 shrink-0 text-[#6d28d9]" aria-hidden="true" />{serviceNames || "Reserva creada"}</span>
              <span className="mt-1 block truncate text-xs leading-5 text-muted">{booking.professional?.name ? `${booking.professional.name} · ` : ""}{amount != null ? formatPrice(amount) : "Precio pendiente"}</span>
            </span>
          ) : (
            <span className="block"><span className="text-sm font-medium text-[#27272a]">{outcomeLabel(call.outcome)}</span>{call.summary ? <span className="mt-1 line-clamp-1 block text-xs leading-5 text-muted">{call.summary}</span> : null}</span>
          )}
        </span>
        <span className="flex items-center gap-2 sm:justify-end">
          {SentimentIcon ? <span title={sentimentLabel(call.sentiment) ?? undefined} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#fafafa] text-[#52525b]"><SentimentIcon className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{sentimentLabel(call.sentiment)}</span></span> : null}
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${OUTCOME_CLASSES[tone]}`}>{outcomeLabel(call.outcome)}</span>
        </span>
        <ChevronRight className="hidden h-4 w-4 text-[#a1a1aa] sm:block" aria-hidden="true" />
      </button>
    </li>
  );
}

function CallsLoading() {
  return <div className="space-y-px" aria-label="Cargando llamadas">{Array.from({ length: 6 }, (_, index) => <div key={index} className="grid animate-pulse gap-3 border-b border-[#e5e5e5] p-4 sm:grid-cols-[minmax(10rem,0.8fr)_minmax(12rem,1.3fr)_minmax(7rem,0.7fr)_auto] sm:px-6"><div className="h-10 rounded-xl bg-[#f4f4f5]" /><div className="h-10 rounded-xl bg-[#f4f4f5]" /><div className="h-8 w-24 rounded-full bg-[#f4f4f5]" /></div>)}</div>;
}
