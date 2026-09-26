"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarCheck, CalendarClock, ChevronLeft, ChevronRight, Frown, Meh, MessageCircle, PhoneCall, Smile } from "lucide-react";
import { CallDetailModal } from "@/components/call-detail-modal";
import { SectionEmptyState, SectionErrorState } from "@/components/section-card";
import { getCalls } from "@/lib/api";
import { esChatDeWhatsapp, etiquetaDeReserva, formatCanalYDuracion, formatDate, formatPhone, formatPrice, outcomeLabel, outcomeTone, sentimentLabel } from "@/lib/format";
import type { Call } from "@/lib/types";

const PAGE_SIZE = 25;

// Mismo tono que la insignia de resultado del modal de detalle: la misma
// llamada se lee en dos vistas y debe llevar la misma insignia.
const TONE_BADGE_CLASSES = {
  success: "bg-[#ecf7ec] text-[#2c7334] ring-1 ring-inset ring-[#d8efd7]",
  warning: "bg-[#fef8e7] text-[#806012] ring-1 ring-inset ring-[#f0dfa8]",
  neutral: "bg-[#f4f4f5] text-[#52525b] ring-1 ring-inset ring-[#e5e5e5]",
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
        {/* La cabecera de página ya presenta la vista: aquí solo cabe cómo se
            usa la lista, no otra descripción de lo mismo. */}
        <h2 id="calls-activity-title" className="text-lg font-semibold text-[#0a0a0a] sm:text-xl">Historial</h2>
        <p className="mt-1 text-sm leading-6 text-muted">Toca una conversación para leer la transcripción y escuchar la grabación.</p>
      </div>
      {callsQuery.isLoading ? <CallsLoading /> : null}
      {callsQuery.isError ? (
        <SectionErrorState
          className="m-4 sm:m-6"
          message="No se pudieron cargar las llamadas."
          onRetry={() => callsQuery.refetch()}
        />
      ) : null}
      {!callsQuery.isLoading && !callsQuery.isError && calls.length === 0 ? (
        <SectionEmptyState
          className="m-4 sm:m-6"
          icon={PhoneCall}
          title="Todavía no hay llamadas"
          description="La actividad aparecerá aquí cuando la recepcionista atienda a un cliente."
        />
      ) : null}
      {!callsQuery.isLoading && !callsQuery.isError && calls.length > 0 ? (
        <ol className="divide-y divide-[#e5e5e5]">
          {calls.map((call) => <CallActivityRow key={call.id} call={call} onOpen={() => setSelectedCallId(call.id)} />)}
        </ol>
      ) : null}
      {response && response.total > 0 ? (
        <footer className="flex flex-col gap-3 border-t border-[#e5e5e5] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <p className="text-sm text-muted">Mostrando <span className="font-semibold tabular-nums text-[#27272a]">{first}–{last}</span> de <span className="font-semibold tabular-nums text-[#27272a]">{response.total}</span> llamadas.</p>
          {offset > 0 || response.total > PAGE_SIZE ? (
          <div className="flex gap-2">
            <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="btn-secondary h-11 px-4"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Anterior</button>
            <button type="button" disabled={offset + calls.length >= response.total} onClick={() => setOffset(offset + PAGE_SIZE)} className="btn-primary h-11 px-4">Siguiente<ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          ) : null}
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
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">{esChatDeWhatsapp(call) ? <MessageCircle className="h-4 w-4" aria-label="Chat de WhatsApp" /> : <PhoneCall className="h-4 w-4" aria-hidden="true" />}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tabular-nums text-[#0a0a0a]">{formatPhone(call.fromNumber) ?? "Número oculto"}</span>
            <span className="mt-0.5 block text-xs leading-5 text-muted">{formatDate(call.startedAt)} · {formatCanalYDuracion(call)}</span>
          </span>
        </div>
        <span className="min-w-0">
          {booking ? (
            <span className="block">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-[#27272a]"><CalendarCheck className="h-4 w-4 shrink-0 text-[#6d28d9]" aria-hidden="true" />{serviceNames || "Reserva creada"}</span>
              <span className="mt-1 block truncate text-xs leading-5 text-muted">{booking.professional?.name ? `${booking.professional.name} · ` : ""}{amount != null ? formatPrice(amount) : "Precio pendiente"}</span>
            </span>
          ) : (
            <span className="block">
              {/* Sin reserva, lo que pasó lo cuenta el resumen: el resultado
                  ya va en la insignia de la derecha y repetirlo aquí dejaba la
                  misma palabra dos veces en cada fila. */}
              {etiquetaDeReserva(call.booking) === "modificada" ? (
                <>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-[#27272a]"><CalendarClock className="h-4 w-4 shrink-0 text-[#52525b]" aria-hidden="true" />Reserva modificada</span>
                  {call.summary ? <span className="mt-1 line-clamp-1 block text-xs leading-5 text-muted">{call.summary}</span> : null}
                </>
              ) : call.summary ? (
                <span className="line-clamp-2 block text-sm leading-6 text-[#27272a]">{call.summary}</span>
              ) : (
                <span className="text-sm text-muted">Sin resumen de la conversación.</span>
              )}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 sm:justify-end">
          {SentimentIcon ? <span title={sentimentLabel(call.sentiment) ?? undefined} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#fafafa] text-[#52525b]"><SentimentIcon className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{sentimentLabel(call.sentiment)}</span></span> : null}
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_BADGE_CLASSES[tone]}`}>{outcomeLabel(call.outcome)}</span>
        </span>
        <ChevronRight className="hidden h-4 w-4 text-muted sm:block" aria-hidden="true" />
      </button>
    </li>
  );
}

function CallsLoading() {
  return <div className="space-y-px" aria-label="Cargando llamadas">{Array.from({ length: 6 }, (_, index) => <div key={index} className="grid animate-pulse gap-3 border-b border-[#e5e5e5] p-4 sm:grid-cols-[minmax(10rem,0.8fr)_minmax(12rem,1.3fr)_minmax(7rem,0.7fr)_auto] sm:px-6"><div className="h-10 rounded-xl bg-[#f4f4f5]" /><div className="h-10 rounded-xl bg-[#f4f4f5]" /><div className="h-8 w-24 rounded-full bg-[#f4f4f5]" /></div>)}</div>;
}
