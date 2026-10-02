"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  Copy,
  Info,
  LoaderCircle,
  MessageSquareText,
  Mic,
  Phone,
  Sparkles,
  User,
} from "lucide-react";
import { getCall, marcarRecado } from "@/lib/api";
import {
  escalationReasonLabel,
  esChatDeWhatsapp,
  formatCanalYDuracion,
  formatCurrency,
  formatPhoneLocal,
  outcomeLabel,
  outcomeTone,
  sentimentLabel,
  sentimentTone,
  statusLabel,
} from "@/lib/format";
import { claveDeDia, diaLargo, etiquetaDeDia, horaDelNegocio } from "@/lib/fechas-negocio";
import { enlaceTel, parseTranscriptMessages, telefonoParaDevolver } from "@/lib/llamadas";
import type { Call } from "@/lib/types";
import { SectionErrorState } from "@/components/section-card";
import { CuerpoDeHoja, HojaInferior } from "@/components/movil/hoja-inferior";
import { Insignia, type Tono } from "@/components/movil/piezas";

const TONO_DE_RESULTADO: Record<"success" | "warning" | "neutral", Tono> = {
  success: "exito",
  warning: "aviso",
  neutral: "neutro",
};

/** Las cachés donde aparece una llamada: tras cerrar o reabrir su recado,
 * la insignia de la pestaña, los filtros y las filas cambian a la vez. */
export function invalidarLlamadas(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["llamadas"] }),
    queryClient.invalidateQueries({ queryKey: ["llamadas-conteos"] }),
    queryClient.invalidateQueries({ queryKey: ["recent-calls"] }),
    queryClient.invalidateQueries({ queryKey: ["calls"] }),
  ]);
}

export function copiarAlPortapapeles(
  texto: string,
  avisar: (mensaje: string, tipo?: "success" | "error") => void
) {
  if (!navigator.clipboard) {
    avisar("Tu navegador no deja copiar desde aquí.", "error");
    return;
  }
  navigator.clipboard.writeText(texto).then(
    () => avisar(`Copiado: ${texto}`),
    () => avisar("No se pudo copiar el número.", "error")
  );
}

/** «Marcar como devuelta» y deshacer, en la hoja del móvil y en el panel
 * de detalle del escritorio. */
export function useMarcarRecado(
  id: string | null,
  avisar: (mensaje: string, tipo?: "success" | "error") => void
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (atendido: boolean) => marcarRecado(id!, atendido),
    onSuccess: async (recado, atendido) => {
      queryClient.setQueryData<Call | undefined>(["call-detail", id], (actual) =>
        actual ? { ...actual, recado } : actual
      );
      await invalidarLlamadas(queryClient);
      if (atendido) avisar("Marcada como devuelta.");
    },
    onError: () => avisar("No se pudo guardar. Inténtalo otra vez.", "error"),
  });
}

/**
 * Detalle de una llamada en el móvil: acciones arriba (llamar, copiar,
 * marcar el recado como devuelto), dos pestañas sin scroll dentro del scroll
 * y la grabación fija abajo.
 */
export function HojaLlamada({
  callId,
  timeZone,
  onCerrar,
  avisar,
}: {
  callId: string | null;
  timeZone: string;
  onCerrar: () => void;
  avisar: (mensaje: string, tipo?: "success" | "error") => void;
}) {
  // Se queda con la última llamada mientras la hoja baja al cerrarse.
  const [ultimoId, setUltimoId] = useState(callId);
  useEffect(() => {
    if (callId) setUltimoId(callId);
  }, [callId]);
  const id = callId ?? ultimoId;

  const [pestaña, setPestaña] = useState<"resumen" | "transcripcion">("resumen");
  useEffect(() => {
    if (callId) setPestaña("resumen");
  }, [callId]);

  const callQuery = useQuery({
    queryKey: ["call-detail", id],
    queryFn: () => getCall(id!),
    enabled: Boolean(id),
  });
  const call = callQuery.data;
  const recadoMutation = useMarcarRecado(id, avisar);

  const hoy = claveDeDia(new Date(), timeZone);
  const telefono = call ? telefonoParaDevolver(call) : null;
  const recadoPendiente = Boolean(call?.recado && !call.recado.atendidoAt);
  const recadoAtendido = Boolean(call?.recado?.atendidoAt);
  const grabacion = call?.recording?.storageUrl ?? call?.recording?.externalUrl ?? null;

  const titulo = call ? formatPhoneLocal(call.fromNumber) ?? "Número oculto" : "Detalle de la llamada";
  const subtitulo = call
    ? `${etiquetaDeDia(claveDeDia(call.startedAt, timeZone), hoy)}, ${horaDelNegocio(call.startedAt, timeZone)} · ${formatCanalYDuracion(call)} · ${statusLabel(call.status)}`
    : undefined;

  return (
    <HojaInferior
      abierta={Boolean(callId)}
      onCerrar={onCerrar}
      titulo={<span className="tabular-nums">{titulo}</span>}
      subtitulo={subtitulo}
      etiquetaCerrar="Cerrar detalle de llamada"
      alta
      pie={
        call ? (
          grabacion && !esChatDeWhatsapp(call) ? (
            <Reproductor key={call.id} src={grabacion} duracion={call.durationSecs ?? 0} semilla={call.id} activo={Boolean(callId)} />
          ) : (
            <p className="flex min-h-12 items-center gap-2 text-sm text-muted">
              <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
              {esChatDeWhatsapp(call) ? "Chat de WhatsApp: no hay grabación." : "Todavía no hay grabación disponible."}
            </p>
          )
        ) : null
      }
    >
      {callQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-12 text-sm text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Cargando llamada…
        </div>
      ) : callQuery.isError || !call ? (
        <div className="px-4">
          <SectionErrorState message="No se pudo cargar el detalle de esta llamada." onRetry={() => void callQuery.refetch()} />
        </div>
      ) : (
        <>
          <div className="shrink-0 space-y-2 px-4 pb-3 pt-1">
            {telefono ? (
              <div className="flex gap-2">
                <a href={enlaceTel(telefono)} className="btn-primary flex-1 px-4">
                  <Phone className="h-[18px] w-[18px]" aria-hidden="true" />
                  Llamar
                </a>
                <button
                  type="button"
                  onClick={() => copiarAlPortapapeles(formatPhoneLocal(telefono) ?? telefono, avisar)}
                  className="btn-secondary flex-none px-4"
                >
                  <Copy className="h-[18px] w-[18px]" aria-hidden="true" />
                  Copiar número
                </button>
              </div>
            ) : null}
            {recadoPendiente ? (
              <button
                type="button"
                onClick={() => recadoMutation.mutate(true)}
                disabled={recadoMutation.isPending}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] border border-aviso-borde bg-aviso-fondo text-sm font-bold text-aviso transition duration-200 hover:bg-aviso-fondo-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado disabled:opacity-60"
              >
                <Check className="h-[18px] w-[18px]" aria-hidden="true" />
                {recadoMutation.isPending ? "Guardando…" : "Marcar como devuelta"}
              </button>
            ) : null}
            {recadoAtendido ? (
              <div className="flex min-h-12 items-center justify-between gap-2 rounded-[10px] bg-exito-fondo px-3.5 text-sm font-bold text-exito ring-1 ring-inset ring-exito-borde">
                <span className="flex items-center gap-2">
                  <Check className="h-[18px] w-[18px]" aria-hidden="true" />
                  Llamada devuelta
                </span>
                <button
                  type="button"
                  onClick={() => recadoMutation.mutate(false)}
                  disabled={recadoMutation.isPending}
                  className="min-h-11 px-1 text-[13px] font-semibold underline underline-offset-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado disabled:opacity-60"
                >
                  Deshacer
                </button>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 px-4 pb-2">
            <div role="tablist" aria-label="Detalle de la llamada" className="flex gap-1 rounded-full border border-linea bg-relleno p-1">
              {(
                [
                  ["resumen", "Resumen"],
                  ["transcripcion", "Transcripción"],
                ] as const
              ).map(([clave, etiqueta]) => (
                <button
                  key={clave}
                  type="button"
                  role="tab"
                  aria-selected={pestaña === clave}
                  onClick={() => setPestaña(clave)}
                  className={`min-h-10 flex-1 rounded-full text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${
                    pestaña === clave ? "bg-lavado text-morado-tinta ring-1 ring-inset ring-lavado-borde" : "text-apagado"
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          </div>

          <CuerpoDeHoja className="pb-5 pt-2">
            {pestaña === "resumen" ? <Resumen call={call} timeZone={timeZone} onCerrar={onCerrar} /> : <Transcripcion call={call} timeZone={timeZone} />}
          </CuerpoDeHoja>
        </>
      )}
    </HojaInferior>
  );
}

export function Resumen({ call, timeZone, onCerrar }: { call: Call; timeZone: string; onCerrar: () => void }) {
  const tono = TONO_DE_RESULTADO[outcomeTone(call.outcome)];
  const reserva = call.booking && !call.booking.isCancelled ? call.booking : null;
  const motivo = escalationReasonLabel(call.escalationReason);
  const recado = call.recado;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Insignia tono={tono}>{outcomeLabel(call.outcome)}</Insignia>
        {call.sentiment ? <Insignia tono={TONO_DE_RESULTADO[sentimentTone(call.sentiment)]}>{sentimentLabel(call.sentiment)}</Insignia> : null}
        {call.costCents !== null ? <Insignia tono="neutro">{formatCurrency(call.costCents)}</Insignia> : null}
      </div>

      {call.summary ? (
        <section className="rounded-2xl border border-lavado-borde bg-lavado p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-tinta">
            <Sparkles className="h-4 w-4 text-morado" aria-hidden="true" />
            Resumen de la llamada
          </h3>
          <p className="mt-2 text-[15px] leading-[1.6] text-tinta-2">{call.summary}</p>
        </section>
      ) : null}

      {recado ? (
        <section className="rounded-2xl border border-linea bg-superficie p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-tinta">
            <MessageSquareText className="h-4 w-4 text-morado" aria-hidden="true" />
            Recado
          </h3>
          <dl className="mt-2.5 space-y-1.5 text-sm leading-6">
            {recado.nombre ? <Dato termino="De" valor={recado.nombre} /> : null}
            {recado.telefono ? <Dato termino="Teléfono" valor={formatPhoneLocal(recado.telefono) ?? recado.telefono} numerico /> : null}
          </dl>
          {recado.motivo ? <p className="mt-2 text-sm leading-6 text-tinta-2">{recado.motivo}</p> : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-linea bg-relleno p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-tinta">
          <CalendarCheck className="h-4 w-4 text-morado" aria-hidden="true" />
          Reserva vinculada
        </h3>
        {reserva ? (
          <>
            <dl className="mt-2.5 space-y-1.5 text-sm leading-6">
              <Dato
                termino="Servicio"
                valor={reserva.services?.length ? reserva.services.map((service) => service.name).join(" y ") : "Sin especificar"}
              />
              <Dato termino="Profesional" valor={reserva.professional?.name ?? "Cualquiera disponible"} />
              <Dato
                termino="Fecha"
                valor={`${diaLargo(claveDeDia(reserva.programedAt, timeZone))}, ${horaDelNegocio(reserva.programedAt, timeZone)}`}
              />
              <Dato
                termino="Teléfono"
                valor={formatPhoneLocal(reserva.clientPhone ?? call.fromNumber) ?? "No proporcionado"}
                numerico
              />
            </dl>
            <Link
              href={`/agenda?dia=${claveDeDia(reserva.programedAt, timeZone)}&cita=${encodeURIComponent(reserva.id)}`}
              onClick={onCerrar}
              className="mt-1.5 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-morado-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
            >
              Ver en la agenda
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </>
        ) : (
          <div className="mt-2 space-y-2 text-sm leading-6">
            <p className="text-muted">
              {call.booking?.isCancelled
                ? call.booking.rescheduledToId
                  ? "La reserva creada en esta conversación la cambió el cliente después: la cita nueva está en la conversación en la que la cambió."
                  : "La reserva creada en esta llamada se canceló después."
                : "Esta llamada no generó ninguna reserva."}
            </p>
            {motivo ? (
              <p className="flex items-start gap-2 text-tinta-2">
                <Info className="mt-1 h-3.5 w-3.5 shrink-0 text-morado" aria-hidden="true" />
                {motivo}
              </p>
            ) : null}
            {call.requestedService ? (
              <p className="text-muted">
                El cliente preguntaba por <strong className="font-semibold text-tinta-2">{call.requestedService}</strong>.
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function Dato({ termino, valor, numerico = false }: { termino: string; valor: string; numerico?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{termino}</dt>
      <dd className={`text-right font-semibold text-tinta ${numerico ? "tabular-nums" : ""}`}>{valor}</dd>
    </div>
  );
}

export function Transcripcion({ call, timeZone }: { call: Call; timeZone: string }) {
  const mensajes = call.transcript ? parseTranscriptMessages(call.transcript.messages) : null;
  const visibles = (mensajes ?? []).filter((mensaje) => {
    const texto = mensaje.content ?? mensaje.text ?? "";
    return mensaje.role !== "tool" && texto.trim().length > 0;
  });

  return (
    <section className="rounded-3xl bg-oscuro p-4 text-white" aria-label="Transcripción">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <span className="flex items-center gap-2 text-sm font-bold">
          <User className="h-4 w-4 text-morado-claro" aria-hidden="true" />
          Transcripción
        </span>
        <span className="text-xs text-white/70">{horaDelNegocio(call.startedAt, timeZone)}</span>
      </div>
      <div className="flex flex-col gap-3 pt-3.5">
        {!call.transcript ? (
          <p className="text-sm leading-6 text-white/70">Todavía no hay transcripción disponible para esta llamada.</p>
        ) : visibles.length > 0 ? (
          visibles.map((mensaje, indice) => {
            const cliente = mensaje.role === "user" || mensaje.role === "client";
            return (
              <div key={indice} className={`flex ${cliente ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-6 ${cliente ? "rounded-br-[4px] bg-morado" : "rounded-bl-[4px] bg-white/10"}`}
                >
                  <span className="mb-0.5 block text-[11px] font-bold uppercase tracking-[0.12em] opacity-75">
                    {cliente ? "Cliente" : "Agente"}
                  </span>
                  {mensaje.content ?? mensaje.text}
                </div>
              </div>
            );
          })
        ) : (
          <p className="whitespace-pre-line text-sm leading-6 text-white/80">{call.transcript.fullText}</p>
        )}
      </div>
    </section>
  );
}

const VELOCIDADES = [1, 1.5, 2];
const BARRAS = 44;

function mmss(segundos: number) {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Alturas fijas por llamada para la tira de la grabación: es una barra de
 * posición, no un análisis del audio. */
function alturas(semilla: string) {
  let estado = 0;
  for (const caracter of semilla) estado = (estado * 31 + caracter.charCodeAt(0)) >>> 0;
  return Array.from({ length: BARRAS }, (_, indice) => {
    const onda = Math.abs(Math.sin(indice * 1.3 + (estado % 97)) * Math.cos(indice * 0.45 + (estado % 13)));
    return 8 + Math.round(onda * 26);
  });
}

/**
 * Reproductor de la grabación fijo al pie de la hoja: reproducir, una tira
 * que se toca para saltar y la velocidad (1×, 1,5×, 2×). Se para al cerrar
 * la hoja.
 */
export function Reproductor({
  src,
  duracion,
  semilla,
  activo,
}: {
  src: string;
  duracion: number;
  semilla: string;
  activo: boolean;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [sonando, setSonando] = useState(false);
  const [posicion, setPosicion] = useState(0);
  const [total, setTotal] = useState(duracion);
  const [velocidad, setVelocidad] = useState(1);
  const [error, setError] = useState(false);
  const barras = useMemo(() => alturas(semilla), [semilla]);

  useEffect(() => {
    if (!activo) audio.current?.pause();
  }, [activo]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = velocidad;
  }, [velocidad]);

  const progreso = total > 0 ? Math.min(1, posicion / total) : 0;
  const saltar = (segundos: number) => {
    if (!audio.current) return;
    const destino = Math.max(0, Math.min(total || duracion, segundos));
    audio.current.currentTime = destino;
    setPosicion(destino);
  };

  if (error) {
    return (
      <p className="flex min-h-12 items-center gap-2 text-sm text-muted">
        <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
        No se pudo cargar la grabación. Cierra y vuelve a abrir la llamada.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <audio
        ref={audio}
        src={src}
        preload="none"
        onPlay={() => setSonando(true)}
        onPause={() => setSonando(false)}
        onEnded={() => setSonando(false)}
        onTimeUpdate={(event) => setPosicion(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          if (Number.isFinite(event.currentTarget.duration)) setTotal(event.currentTarget.duration);
          event.currentTarget.playbackRate = velocidad;
        }}
        onError={() => setError(true)}
      />
      <button
        type="button"
        onClick={() => {
          if (!audio.current) return;
          if (audio.current.paused) void audio.current.play().catch(() => setError(true));
          else audio.current.pause();
        }}
        aria-label={sonando ? "Pausar" : "Reproducir"}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tinta text-sobre-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado focus-visible:ring-offset-2"
      >
        {sonando ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="5" y="3" width="5" height="18" rx="1" />
            <rect x="14" y="3" width="5" height="18" rx="1" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="ml-0.5">
            <path d="M6 3.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 6 3.5z" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Posición de la grabación"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(posicion)}
          aria-valuetext={`${mmss(posicion)} de ${mmss(total)}`}
          onClick={(event) => {
            const caja = event.currentTarget.getBoundingClientRect();
            saltar(((event.clientX - caja.left) / caja.width) * total);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") saltar(posicion + 5);
            if (event.key === "ArrowLeft") saltar(posicion - 5);
          }}
          className="flex h-10 cursor-pointer items-center gap-[2px] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
        >
          {barras.map((alto, indice) => (
            <span
              key={indice}
              aria-hidden="true"
              className={`flex-1 rounded-sm ${indice / BARRAS < progreso ? "bg-morado" : "bg-linea-fuerte"}`}
              style={{ height: alto }}
            />
          ))}
        </div>
        <div className="flex justify-between text-xs tabular-nums text-muted">
          <span>{mmss(posicion)}</span>
          <span>{mmss(total)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setVelocidad(VELOCIDADES[(VELOCIDADES.indexOf(velocidad) + 1) % VELOCIDADES.length])}
        aria-label={`Velocidad de reproducción: ${String(velocidad).replace(".", ",")}×`}
        className="h-11 min-w-12 shrink-0 rounded-full border border-linea bg-superficie px-2 text-[13px] font-bold tabular-nums text-tinta-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
      >
        {String(velocidad).replace(".", ",")}×
      </button>
    </div>
  );
}
