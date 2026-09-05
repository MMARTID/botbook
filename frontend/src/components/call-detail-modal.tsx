"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  Clock3,
  Coins,
  Frown,
  LoaderCircle,
  Meh,
  Mic,
  Phone,
  Smile,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { getCall } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  formatDuration,
  outcomeLabel,
  outcomeTone,
  sentimentLabel,
  sentimentTone,
  statusLabel,
} from "@/lib/format";
import type { TranscriptMessage } from "@/lib/types";

const TONE_BADGE_CLASSES = {
  success: "bg-[#ecf7ec] text-[#2c7334] ring-1 ring-inset ring-[#d8efd7]",
  warning: "bg-[#fef8e7] text-[#9f7a15] ring-1 ring-inset ring-[#f0dfa8]",
  neutral: "bg-[#f4f4f5] text-[#52525b] ring-1 ring-inset ring-[#e5e5e5]",
} as const;

const SENTIMENT_ICON = { POSITIVE: Smile, NEUTRAL: Meh, NEGATIVE: Frown } as const;

function parseTranscriptMessages(value: unknown): TranscriptMessage[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(
    (item): item is TranscriptMessage =>
      typeof item === "object" && item !== null
  );
}

export function CallDetailModal({
  callId,
  onClose,
}: {
  callId: string;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const callQuery = useQuery({
    queryKey: ["call-detail", callId],
    queryFn: () => getCall(callId),
  });

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButtonRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeydown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeydown);
      previousFocusRef.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const call = callQuery.data;
  const messages = call?.transcript
    ? parseTranscriptMessages(call.transcript.messages)
    : null;
  const recordingSrc = call?.recording?.storageUrl ?? call?.recording?.vapiUrl ?? null;
  const tone = call ? outcomeTone(call.outcome) : "neutral";
  const SentimentIcon = call?.sentiment ? SENTIMENT_ICON[call.sentiment] : null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end bg-[#0a0a0a]/60 backdrop-blur-sm sm:items-center sm:justify-center sm:px-4 sm:py-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="call-detail-titulo"
        className="demo-call-modal flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[#e5e5e5] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.18)] sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e5e5e5] px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 id="call-detail-titulo" className="text-xl font-bold text-[#0a0a0a] sm:text-2xl">
              {call ? formatDate(call.startedAt) : "Detalle de la llamada"}
            </h2>
            {call ? (
              <p className="mt-2 text-sm leading-6 text-[#52525b]">
                {formatDuration(call.durationSecs)} · {statusLabel(call.status)}
                {call.fromNumber ? (
                  <span className="inline-flex items-center gap-1">
                    {" · "}
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    {call.fromNumber}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle de llamada"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#0a0a0a] transition hover:bg-[#fafafa]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-5">
          {callQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Cargando llamada…
            </div>
          ) : callQuery.isError || !call ? (
            <div className="rounded-2xl border border-[#f5d3d3] bg-[#fff1f1] px-4 py-6 text-center text-sm text-[#c53030]">
              No se pudo cargar el detalle de esta llamada.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${TONE_BADGE_CLASSES[tone]}`}>
                  {outcomeLabel(call.outcome)}
                </span>
                {call.sentiment && SentimentIcon ? (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${TONE_BADGE_CLASSES[sentimentTone(call.sentiment)]}`}
                  >
                    <SentimentIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {sentimentLabel(call.sentiment)}
                  </span>
                ) : null}
                {call.costCents !== null ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#fafafa] px-3 py-1 text-xs font-semibold text-[#52525b]">
                    <Coins className="h-3.5 w-3.5" />
                    {formatCurrency(call.costCents)}
                  </span>
                ) : null}
              </div>

              {call.summary ? (
                <div className="rounded-2xl border border-[#e9e0fe] bg-[#f7f4ff] p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#0a0a0a]">
                    <Sparkles className="h-4 w-4 text-[#8b5cf6]" />
                    Resumen de la llamada
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#3f3a4d]">{call.summary}</p>
                </div>
              ) : null}

              <div className="rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-4 sm:p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0a0a0a]">
                  <CalendarCheck className="h-4 w-4 text-[#8b5cf6]" />
                  Reserva vinculada
                </div>
                {call.booking && !call.booking.isCancelled ? (
                  <dl className="mt-3 space-y-1.5 text-sm leading-6 text-[#27272a]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Servicio</dt>
                      <dd className="text-right font-medium">{call.booking.service?.name ?? "Sin especificar"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Profesional</dt>
                      <dd className="text-right font-medium">{call.booking.professional?.name ?? "Cualquiera disponible"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Fecha</dt>
                      <dd className="text-right font-medium">{formatDate(call.booking.programedAt)}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {call.booking?.isCancelled
                      ? "La reserva creada en esta llamada se canceló después."
                      : "Esta llamada no generó ninguna reserva."}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4 sm:p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0a0a0a]">
                  <Mic className="h-4 w-4 text-[#8b5cf6]" />
                  Grabación
                </div>
                {recordingSrc ? (
                  <audio controls preload="none" src={recordingSrc} className="mt-3 w-full">
                    Tu navegador no puede reproducir audio.
                  </audio>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Todavía no hay grabación disponible para esta llamada.
                  </p>
                )}
              </div>

              <div className="flex min-h-0 flex-col rounded-3xl bg-[#0a0a0a] p-4 text-white sm:p-6">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <User className="h-4 w-4 text-[#a78bfa]" />
                    Transcripción
                  </div>
                  {call.endedAt ? (
                    <span className="inline-flex items-center gap-1 text-xs text-white/60">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDate(call.endedAt)}
                    </span>
                  ) : null}
                </div>

                <div className="scrollbar-dark mt-3 max-h-96 space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                  {!call.transcript ? (
                    <p className="text-sm leading-6 text-white/60">
                      Todavía no hay transcripción disponible para esta llamada.
                    </p>
                  ) : messages && messages.length > 0 ? (
                    messages.map((message, index) => {
                      const isClient = message.role === "user" || message.role === "client";
                      return (
                        <div key={index} className={`flex ${isClient ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-6 ${
                              isClient
                                ? "rounded-br-sm bg-[#8b5cf6] text-white"
                                : "rounded-bl-sm bg-white/10 text-white"
                            }`}
                          >
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] opacity-70">
                              {isClient ? "Cliente" : "Agente"}
                            </span>
                            {message.content}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="whitespace-pre-line text-sm leading-6 text-white/80">
                      {call.transcript.fullText}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
