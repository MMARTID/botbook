"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, ChevronRight, Frown, Meh, PhoneCall, RefreshCw, Smile } from "lucide-react";
import { getCalls } from "@/lib/api";
import {
  formatDate,
  formatDuration,
  outcomeLabel,
  outcomeTone,
  sentimentLabel,
  sentimentTone,
} from "@/lib/format";
import { CallDetailModal } from "@/components/call-detail-modal";

const RECENT_CALLS_LIMIT = 6;

const TONE_BADGE_CLASSES = {
  success: "bg-[#ecf7ec] text-[#2c7334] ring-1 ring-inset ring-[#d8efd7]",
  warning: "bg-[#fef8e7] text-[#9f7a15] ring-1 ring-inset ring-[#f0dfa8]",
  neutral: "bg-[#f4f4f5] text-[#52525b] ring-1 ring-inset ring-[#e5e5e5]",
} as const;

const SENTIMENT_ICON = { POSITIVE: Smile, NEUTRAL: Meh, NEGATIVE: Frown } as const;
const SENTIMENT_ICON_CLASSES = {
  success: "text-[#2c7334]",
  warning: "text-[#9f7a15]",
  neutral: "text-[#52525b]",
} as const;

export function RecentCalls() {
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const callsQuery = useQuery({
    queryKey: ["recent-calls"],
    queryFn: () => getCalls(RECENT_CALLS_LIMIT, 0),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const calls = callsQuery.data?.data ?? [];

  return (
    <section className="panel p-4 sm:p-5 lg:p-6" aria-labelledby="recent-calls-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">Actividad</p>
          <h2 id="recent-calls-title" className="mt-1 text-lg font-semibold text-[#0a0a0a] sm:text-xl">
            Llamadas recientes
          </h2>
        </div>
      </div>

      {callsQuery.isLoading ? (
        <div className="mt-4 space-y-2" aria-label="Cargando llamadas recientes">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 rounded-xl p-3" aria-hidden="true">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-[#f4f4f5]" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-32 animate-pulse rounded bg-[#f4f4f5]" />
                <div className="h-3 w-48 animate-pulse rounded bg-[#f4f4f5]" />
              </div>
            </div>
          ))}
        </div>
      ) : callsQuery.isError ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-[#f5d3d3] bg-[#fff1f1] px-4 py-6 text-center">
          <p className="text-sm font-medium text-[#c53030]">No se pudieron cargar las llamadas.</p>
          <button
            type="button"
            onClick={() => callsQuery.refetch()}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#27272a]"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
        </div>
      ) : calls.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] px-4 py-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
            <PhoneCall className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#27272a]">Aún no hay llamadas</p>
            <p className="mt-1 text-sm text-muted">
              En cuanto el agente atienda a un cliente, la llamada aparecerá aquí con su resultado.
            </p>
          </div>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-[#e5e5e5]">
          {calls.map((call) => {
            const tone = outcomeTone(call.outcome);
            const hasBooking = call.booking && !call.booking.isCancelled;
            const SentimentIcon = call.sentiment ? SENTIMENT_ICON[call.sentiment] : null;
            return (
              <li key={call.id}>
                <button
                  type="button"
                  onClick={() => setSelectedCallId(call.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] sm:px-3"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
                    <PhoneCall className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#0a0a0a]">
                      {formatDate(call.startedAt)}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
                      <span>{formatDuration(call.durationSecs)}</span>
                      {hasBooking ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#f3eeff] px-2 py-0.5 font-semibold text-[#6d28d9]">
                          <CalendarCheck className="h-3 w-3" />
                          Reserva creada
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {SentimentIcon ? (
                    <span
                      title={sentimentLabel(call.sentiment) ?? undefined}
                      className={`hidden shrink-0 sm:inline-flex ${SENTIMENT_ICON_CLASSES[sentimentTone(call.sentiment)]}`}
                    >
                      <SentimentIcon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  ) : null}
                  <span className={`hidden shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold sm:inline-flex ${TONE_BADGE_CLASSES[tone]}`}>
                    {outcomeLabel(call.outcome)}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selectedCallId ? (
        <CallDetailModal callId={selectedCallId} onClose={() => setSelectedCallId(null)} />
      ) : null}
    </section>
  );
}
