"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import axios from "axios";
import type { Call, TelnyxRTC } from "@telnyx/webrtc";
import {
  Building2,
  Check,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Pencil,
  PhoneCall,
  PhoneOff,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  createDemoWebCall,
  getDemoPlaceDetails,
  searchDemoPlaces,
  type DemoPlaceDetails,
} from "@/lib/api";
import type { DemoPlaceSearchResult } from "@/lib/types";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { BrandMark } from "@/components/brand-mark";
import { BUSINESS_TYPE_LABELS } from "@/lib/business-type";
import { NICHE_ACCENTS } from "@/lib/niche-accents";

type DemoVoiceCallProps = {
  open: boolean;
  onClose: () => void;
  onActiveChange?: (active: boolean) => void;
  /** Nicho de la landing desde la que se abre la demo. Si el visitante busca
   * su negocio, manda el nicho detectado en Google Places sobre este. */
  niche?: string;
};

type DemoCallState = "idle" | "requesting-permission" | "connecting" | "active" | "ending" | "ended" | "error";

type TranscriptItem = {
  role: string;
  text: string;
};

/** Tope por defecto; el backend devuelve el real al preparar la demo. */
const DEMO_MAX_DURATION_SECONDS = 60;
const CONTACT_EMAIL = "hola@alhabla.ai";
const DEMO_NOT_CONFIGURED = "DEMO_NOT_CONFIGURED";
/** Elemento <audio> donde el SDK de Telnyx engancha el audio del assistant. */
const REMOTE_AUDIO_ID = "demo-audio-remoto";

function describeDemoError(error: unknown) {
  const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name?: unknown }).name) : "";
  const raw = error instanceof Error ? error.message : "";

  if (raw === DEMO_NOT_CONFIGURED) {
    return `La demo no está disponible ahora mismo. Escríbenos a ${CONTACT_EMAIL} y te la enseñamos en directo.`;
  }
  if (name === "NotAllowedError" || name === "SecurityError" || /permission|denied/i.test(raw)) {
    return "No hemos podido usar el micrófono. Actívalo para esta página en los ajustes de tu navegador y vuelve a intentarlo.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No hemos encontrado ningún micrófono conectado. Conecta uno o prueba desde el móvil.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "Otra aplicación está usando el micrófono. Ciérrala y vuelve a intentarlo.";
  }
  if (/network|fetch|timeout|connection|offline/i.test(raw)) {
    return "No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo en un momento.";
  }
  return `La demo no está disponible ahora mismo. Inténtalo de nuevo en un momento o escríbenos a ${CONTACT_EMAIL}.`;
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/**
 * Mensajes de la conversación que Telnyx emite por el canal `telnyx.ai.conversation`
 * mientras dura la llamada. El SDK los tipa como `{ type: string; ... }`, así que
 * aquí solo se leen las formas que sabemos interpretar y el resto se ignora:
 * la demo nunca debe romperse porque llegue un evento nuevo.
 */
type ConversationEvent = {
  params?: {
    type?: string;
    delta?: unknown;
    transcript?: unknown;
    item?: {
      type?: string;
      role?: string;
      content?: Array<{ text?: unknown; transcript?: unknown }>;
    };
  };
};

function textoDelEvento(params: ConversationEvent["params"]): string {
  if (typeof params?.transcript === "string") return params.transcript;
  if (typeof params?.delta === "string") return params.delta;
  const partes = params?.item?.content ?? [];
  return partes
    .map((parte) => (typeof parte.text === "string" ? parte.text : typeof parte.transcript === "string" ? parte.transcript : ""))
    .join(" ")
    .trim();
}

export function DemoVoiceCall({ open, onClose, onActiveChange, niche }: DemoVoiceCallProps) {
  const [state, setState] = useState<DemoCallState>("idle");
  const [isClosing, setIsClosing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchResults, setSearchResults] = useState<DemoPlaceSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingPlace, setIsLoadingPlace] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<DemoPlaceDetails | null>(null);
  /** Nicho que ha elegido el backend para esta demo; da nombre a la llamada. */
  const [demoNiche, setDemoNiche] = useState<string | null>(null);
  const [maxDurationSeconds, setMaxDurationSeconds] = useState(DEMO_MAX_DURATION_SECONDS);

  const clientRef = useRef<TelnyxRTC | null>(null);
  const callRef = useRef<Call | null>(null);
  const stopSpeakingMeterRef = useRef<(() => void) | null>(null);
  const intervalRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const isCallView = state !== "idle";
  const isCallInProgress = state === "active" || state === "connecting" || state === "requesting-permission" || state === "ending";

  useEffect(() => {
    onActiveChange?.(isCallInProgress);
  }, [isCallInProgress, onActiveChange]);

  useEffect(() => {
    if (!open) {
      setIsClosing(false);
      return;
    }
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) previousFocusRef.current?.focus();
  }, [open]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
      stopSpeakingMeterRef.current?.();
      void callRef.current?.hangup();
      callRef.current = null;
      void clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!open || state !== "active") {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = window.setInterval(() => setElapsedSeconds((current) => current + 1), 1000);
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [open, state]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    if (!open || state !== "idle" || selectedBusiness || debouncedSearch.length < 3) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    setSearchError(null);
    searchDemoPlaces(debouncedSearch)
      .then((places) => {
        if (!cancelled) setSearchResults(places);
      })
      .catch(() => {
        if (!cancelled) setSearchError("No hemos podido buscar negocios ahora mismo. Prueba de nuevo o continúa con la demo genérica.");
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, open, selectedBusiness, state]);

  const resetState = useCallback(() => {
    setState("idle");
    setErrorMessage(null);
    setTranscript([]);
    setIsMuted(false);
    setElapsedSeconds(0);
    setIsSpeaking(false);
    setSearchQuery("");
    setDebouncedSearch("");
    setSearchResults([]);
    setSearchError(null);
    setIsSearching(false);
    setIsLoadingPlace(false);
    setSelectedBusiness(null);
    setDemoNiche(null);
    setMaxDurationSeconds(DEMO_MAX_DURATION_SECONDS);
  }, []);

  const teardownCall = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    stopSpeakingMeterRef.current?.();
    stopSpeakingMeterRef.current = null;
    callRef.current = null;
    // Cerrar el socket de Telnyx al salir: sin esto el cliente sigue vivo
    // (y reconectando) aunque el visitante haya cerrado el modal.
    void clientRef.current?.disconnect();
    clientRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      teardownCall();
      resetState();
      onClose();
    }, 320);
  }, [isClosing, onClose, resetState, teardownCall]);

  /**
   * Indicador de «está hablando» medido sobre el audio real que llega de
   * Telnyx. No hay evento de habla en el SDK, y derivarlo de la transcripción
   * llega tarde y a trompicones; el nivel de la pista remota es inmediato.
   */
  const startSpeakingMeter = (stream: MediaStream) => {
    stopSpeakingMeterRef.current?.();
    let audioContext: AudioContext;
    try {
      audioContext = new AudioContext();
    } catch {
      return;
    }
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const muestras = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    const medir = () => {
      analyser.getByteTimeDomainData(muestras);
      let suma = 0;
      for (let i = 0; i < muestras.length; i += 1) suma += (muestras[i] - 128) ** 2;
      setIsSpeaking(Math.sqrt(suma / muestras.length) > 4);
      frame = window.requestAnimationFrame(medir);
    };
    frame = window.requestAnimationFrame(medir);
    stopSpeakingMeterRef.current = () => {
      window.cancelAnimationFrame(frame);
      source.disconnect();
      void audioContext.close();
      stopSpeakingMeterRef.current = null;
      setIsSpeaking(false);
    };
  };

  const bindClientEvents = (client: TelnyxRTC) => {
    client.on("telnyx.notification", (notification: { type?: string; call?: Call }) => {
      const call = notification?.call;
      if (notification?.type !== "callUpdate" || !call) return;
      callRef.current = call;
      if (call.state === "active") {
        setState("active");
        setErrorMessage(null);
        setElapsedSeconds(0);
        if (call.remoteStream) startSpeakingMeter(call.remoteStream);
      }
      if (call.state === "hangup" || call.state === "destroy") {
        stopSpeakingMeterRef.current?.();
        setState((current) => (current === "error" ? current : "ended"));
        setIsMuted(false);
        callRef.current = null;
      }
    });

    // Transcripción en vivo. Se acumula por turno: el evento trae deltas del
    // mismo mensaje, y un turno nuevo abre una burbuja nueva.
    client.on("telnyx.ai.conversation", (evento: ConversationEvent) => {
      const tipo = evento?.params?.type ?? "";
      const texto = textoDelEvento(evento?.params);
      if (!texto) return;
      const esDelCliente = /input_audio|\.user\b/.test(tipo) || evento?.params?.item?.role === "user";
      const role = esDelCliente ? "user" : "assistant";
      const cierraTurno = tipo.endsWith(".done") || tipo.endsWith(".completed") || tipo === "conversation.item.created";
      setTranscript((actual) => {
        const ultimo = actual[actual.length - 1];
        if (ultimo && ultimo.role === role && !cierraTurno) {
          return [...actual.slice(0, -1), { role, text: `${ultimo.text}${texto}` }];
        }
        if (ultimo && ultimo.role === role && cierraTurno) {
          return [...actual.slice(0, -1), { role, text: texto }];
        }
        return [...actual, { role, text: texto }];
      });
    });

    client.on("telnyx.error", (error: unknown) => {
      setErrorMessage(describeDemoError(error));
      setState("error");
      stopSpeakingMeterRef.current?.();
      void callRef.current?.hangup();
    });
  };

  const requestMicrophone = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  };

  const startDemo = async (placeId?: string) => {
    try {
      setErrorMessage(null);
      setTranscript([]);
      // El micrófono se pide antes de nada: si el visitante lo deniega, no
      // llegamos a molestar ni a Telnyx ni al assistant de la demo.
      setState("requesting-permission");
      await requestMicrophone();
      setState("connecting");

      let demo: { assistantId: string; niche: string; maxDurationSeconds: number };
      try {
        demo = await createDemoWebCall(niche, placeId);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 503) throw new Error(DEMO_NOT_CONFIGURED);
        throw error;
      }
      if (!demo?.assistantId) throw new Error(DEMO_NOT_CONFIGURED);
      setDemoNiche(demo.niche);
      setMaxDurationSeconds(demo.maxDurationSeconds || DEMO_MAX_DURATION_SECONDS);

      // El SDK de Telnyx solo existe en el navegador y pesa lo suyo: se carga
      // cuando alguien empieza la demo, no en el bundle de la landing.
      const { TelnyxRTC: ClienteTelnyx } = await import("@telnyx/webrtc");
      const client = new ClienteTelnyx({
        // Llamada web sin autenticar contra el assistant de la cuenta de demo
        // (`supports_unauthenticated_web_calls`): no hay credencial SIP ni
        // token que pueda acabar en el bundle de la web pública.
        anonymous_login: { target_type: "ai_assistant", target_id: demo.assistantId },
      });
      clientRef.current = client;
      bindClientEvents(client);
      client.on("telnyx.ready", () => {
        // Con anonymous_login el destino es el assistant, así que el número va vacío.
        callRef.current = client.newCall({ destinationNumber: "", remoteElement: REMOTE_AUDIO_ID });
      });
      await client.connect();
    } catch (error) {
      setErrorMessage(describeDemoError(error));
      setState("error");
    }
  };

  const selectBusiness = async (place: DemoPlaceSearchResult) => {
    setIsLoadingPlace(true);
    setSearchError(null);
    try {
      const details = await getDemoPlaceDetails(place.placeId);
      setSelectedBusiness(details);
      setSearchQuery(`${details.name}${details.address ? ` · ${details.address}` : ""}`);
      setSearchResults([]);
    } catch {
      setSearchError("No hemos podido cargar ese negocio. Elige otro resultado o continúa con la demo genérica.");
    } finally {
      setIsLoadingPlace(false);
    }
  };

  const endCall = useCallback(async () => {
    if (!callRef.current) {
      handleClose();
      return;
    }
    setState("ending");
    await callRef.current.hangup();
  }, [handleClose]);

  useEffect(() => {
    if (!open || elapsedSeconds < maxDurationSeconds) return;
    void endCall();
  }, [elapsedSeconds, endCall, maxDurationSeconds, open]);

  // Escape y trampa de Tab. El bloqueo de scroll y la devolución del foco los
  // hace el efecto de apertura, que es quien conoce la animación de cierre.
  const dialogRef = useFocusTrap<HTMLDivElement>({
    active: open,
    onEscape: () => {
      if (isCallInProgress) void endCall();
      else handleClose();
    },
    initialFocusRef: closeButtonRef,
    lockScroll: false,
    restoreFocus: false,
  });

  useEffect(() => {
    if (!open) return;
    const handlePageHide = () => void callRef.current?.hangup();
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [open]);

  const toggleMute = () => {
    const nextValue = !isMuted;
    if (nextValue) callRef.current?.muteAudio();
    else callRef.current?.unmuteAudio();
    setIsMuted(nextValue);
  };

  if (!open) return null;
  // El visitante no habla con «su» negocio: habla con la cuenta de demostración
  // del nicho que le corresponde, con su agenda y sus servicios de prueba.
  const etiquetaDelNicho = demoNiche && demoNiche in BUSINESS_TYPE_LABELS
    ? BUSINESS_TYPE_LABELS[demoNiche as keyof typeof BUSINESS_TYPE_LABELS]
    : null;
  const demoLabel = etiquetaDelNicho ? `Recepción de ${etiquetaDelNicho.toLowerCase()}` : "Recepción de ejemplo";

  return (
    <div className={`demo-call-backdrop fixed inset-0 z-[80] flex items-end bg-[#0a0a0a]/60 backdrop-blur-sm sm:items-center sm:justify-center sm:px-4 sm:py-6 ${isClosing ? "demo-call-backdrop-closing" : ""}`}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-voz-titulo"
        aria-describedby="demo-voz-descripcion"
        className={`demo-call-modal flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[#e5e5e5] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.18)] sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:rounded-3xl ${isClosing ? "demo-call-modal-closing" : ""}`}
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- audio en vivo de la llamada; el SDK de Telnyx lo engancha por id. */}
        <audio id={REMOTE_AUDIO_ID} autoPlay className="hidden" />
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e5e5e5] px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-start gap-3">
            <BrandMark className="mt-0.5 h-9 w-9 shrink-0 sm:h-10 sm:w-10" />
            <div className="min-w-0">
              <h2 id="demo-voz-titulo" className="text-xl font-bold tracking-[-0.02em] text-[#0a0a0a] sm:text-2xl">
                {isCallView ? "Habla con Alhabla" : "Prueba Alhabla con tu negocio"}
              </h2>
              {!isCallView ? (
                <span className="badge-soft mt-2 gap-1.5">
                  <Sparkles className="h-3 w-3" />
                  Demo real · máx. {formatDuration(maxDurationSeconds)}
                </span>
              ) : null}
              <p id="demo-voz-descripcion" className="mt-1.5 text-sm leading-6 text-[#52525b]">
                {isCallView
                  ? "Hablas con una cuenta de demostración: cualquier reserva se queda en su agenda de prueba."
                  : "Busca tu negocio y te pasamos con la recepción de un negocio como el tuyo."}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => {
              if (isCallInProgress) void endCall();
              else handleClose();
            }}
            aria-label="Cerrar demo"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#0a0a0a] transition hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!isCallView ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-6">
            <div className="relative">
              <label htmlFor="demo-place-search" className="sr-only">Busca tu negocio</label>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#71717a]" />
              <input
                id="demo-place-search"
                type="search"
                autoComplete="organization"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSelectedBusiness(null);
                  setSearchError(null);
                }}
                placeholder="Busca tu negocio o dirección"
                className="field h-12 w-full pl-12 pr-12"
              />
              {(isSearching || isLoadingPlace) ? <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-[#8b5cf6]" /> : null}
              {searchResults.length > 0 && !selectedBusiness ? (
                <ul className="mt-2 max-h-80 overflow-y-auto rounded-2xl border border-[#e5e5e5] bg-white py-1 shadow-[0_14px_30px_rgba(0,0,0,0.08)]">
                  {searchResults.map((place) => (
                    <li key={place.placeId}>
                      <button type="button" onClick={() => void selectBusiness(place)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-[#fafafa] focus-visible:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]">
                        {place.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- imagen remota de Google Places, tamaño dinámico por resultado.
                          <img src={place.photoUrl} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                        ) : (
                          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
                            <Building2 className="h-5 w-5" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[#27272a]">{place.name}</span>
                          {place.address ? <span className="mt-0.5 block truncate text-xs leading-5 text-[#71717a]">{place.address}</span> : null}
                        </span>
                        {place.businessType !== "other" ? (
                          <span
                            className="inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-semibold"
                            style={{
                              backgroundColor: NICHE_ACCENTS[place.businessType].soft,
                              color: NICHE_ACCENTS[place.businessType].deep,
                              boxShadow: `inset 0 0 0 1px ${NICHE_ACCENTS[place.businessType].strong}33`,
                            }}
                          >
                            {BUSINESS_TYPE_LABELS[place.businessType]}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {searchQuery.trim().length > 0 && searchQuery.trim().length < 3 && !selectedBusiness ? <p className="mt-2 text-xs text-[#71717a]">Escribe al menos 3 caracteres para buscar.</p> : null}
            {searchError ? <p className="mt-3 text-sm leading-6 text-[#a52626]" role="alert">{searchError}</p> : null}
            {selectedBusiness ? (
              <div className="mt-5 flex items-start justify-between gap-4 rounded-2xl bg-[#f3eeff] p-4">
                <div className="flex min-w-0 gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#8b5cf6] text-white"><Check className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#27272a]">{selectedBusiness.name}</p>
                    {selectedBusiness.address ? <p className="mt-1 flex gap-1.5 text-xs leading-5 text-[#52525b]"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{selectedBusiness.address}</p> : null}
                  </div>
                </div>
                <button type="button" onClick={() => { setSelectedBusiness(null); setSearchQuery(""); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-full text-xs font-semibold text-[#5b21b6] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/40 focus-visible:ring-offset-2">
                  <Pencil className="h-3.5 w-3.5" /> Cambiar
                </button>
              </div>
            ) : null}
            <div className="mt-auto pt-7">
              {selectedBusiness ? (
                <button type="button" onClick={() => void startDemo(selectedBusiness.placeId)} className="btn-primary w-full px-5 sm:w-auto">
                  Empezar demo
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void startDemo()}
                className="btn-secondary mt-5 w-full"
              >
                Continuar con una demo genérica
              </button>
              <div className="mt-4 flex gap-2 text-xs leading-5 text-[#71717a]">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8b5cf6]" />
                <p>
                  El micrófono solo se utiliza durante la demo, y de tu negocio solo usamos su categoría para elegir la recepción que te enseñamos. ·{" "}
                  <Link href="/legal/privacidad" className="font-medium text-[#27272a] underline underline-offset-2">
                    Privacidad
                  </Link>
                </p>
              </div>
              <p className="mt-2 text-xs text-[#71717a]">Resultados proporcionados por Google.</p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col bg-[#0a0a0a] px-4 py-4 text-white sm:px-6 sm:py-5">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${state === "active" ? "bg-[#8b5cf6]" : "bg-white/10"}`}>{state === "active" && isSpeaking ? <Mic className="h-5 w-5" /> : <PhoneCall className="h-5 w-5 text-[#c4b5fd]" />}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{demoLabel}</p>
                  <p className="flex items-center gap-1.5 text-xs text-white/60" aria-live="polite">
                    {state === "active" ? (
                      <>
                        <span className="relative flex h-1.5 w-1.5 shrink-0">
                          <span className="absolute hidden h-full w-full animate-ping rounded-full bg-[#2c7334] opacity-75 sm:inline-flex" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#2c7334]" />
                        </span>
                        {isSpeaking ? "Alhabla está hablando" : "Alhabla está escuchando"}
                      </>
                    ) : (
                      "Demo de recepción · reservas simuladas"
                    )}
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tabular-nums text-white/80">{formatDuration(elapsedSeconds)}</span>
            </div>
            <div className="scrollbar-dark mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl bg-white/5 p-3 sm:p-4">
              {state === "requesting-permission" || state === "connecting" || state === "ending" ? (
                <div className="m-auto flex max-w-xs flex-col items-center text-center">
                  <Loader2 className="h-7 w-7 animate-spin text-[#a78bfa]" />
                  <p className="mt-4 text-sm font-semibold">{state === "requesting-permission" ? "Esperando acceso al micrófono" : state === "connecting" ? "Conectando tu demo" : "Cerrando llamada"}</p>
                  <p className="mt-1 text-sm leading-6 text-white/60">{etiquetaDelNicho ? `Preparando la recepción de ${etiquetaDelNicho.toLowerCase()}.` : "Preparando un ejemplo de recepción."}</p>
                </div>
              ) : state === "error" ? (
                <div className="m-auto max-w-md text-center"><p className="text-base font-semibold">No hemos podido iniciar la demo</p><p className="mt-2 text-sm leading-6 text-white/65" role="alert">{errorMessage}</p></div>
              ) : transcript.length === 0 ? (
                <p className="m-auto max-w-sm text-center text-sm leading-6 text-white/60">La conversación aparecerá aquí en tiempo real para que puedas seguir cada respuesta.</p>
              ) : (
                <div className="space-y-3">
                  {transcript.map((item, index) => (
                    <div key={`${item.role}-${index}`} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${item.role === "user" ? "rounded-br-sm bg-[#8b5cf6] text-white" : "rounded-bl-sm bg-white/10 text-white"}`}><span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] opacity-70">{item.role === "user" ? "Tú" : "Alhabla"}</span>{item.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 shrink-0">
              {state === "active" ? (
                <div className="grid gap-2 sm:flex sm:flex-wrap sm:gap-3">
                  <button type="button" onClick={toggleMute} className="btn-secondary w-full px-5 sm:w-auto">{isMuted ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}{isMuted ? "Activar micrófono" : "Silenciar micrófono"}</button>
                  <button type="button" onClick={() => void endCall()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[#c53030] px-5 text-sm font-semibold text-white transition hover:bg-[#a52626] sm:w-auto"><PhoneOff className="h-4 w-4" /> Colgar demo</button>
                </div>
              ) : null}
              {state === "error" ? <div className="grid gap-2 sm:flex sm:flex-wrap sm:gap-3"><button type="button" onClick={() => void startDemo(selectedBusiness?.placeId)} className="btn-primary w-full px-5 sm:w-auto">Reintentar demo</button><button type="button" onClick={handleClose} className="btn-secondary w-full px-5 sm:w-auto">Cerrar</button></div> : null}
              {state === "ended" ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#c4b5fd]">
                      <Check className="h-4 w-4" />
                    </span>
                    <p className="text-sm font-semibold">¿Quieres que atienda así en tu negocio?</p>
                  </div>
                  <Link href="/planes" className="btn-purple justify-center">Ver planes</Link>
                </div>
              ) : null}
              <p className="mt-3 text-xs leading-5 text-white/50">Demo con una cuenta de prueba · máximo {formatDuration(maxDurationSeconds)} · no se reserva nada en tu agenda.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
