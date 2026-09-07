"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { RetellWebClient } from "retell-client-js-sdk";
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
import { BrandMark } from "@/components/brand-mark";
import { BUSINESS_TYPE_LABELS } from "@/lib/business-type";
import { NICHE_ACCENTS } from "@/lib/niche-accents";

type DemoVoiceCallProps = {
  open: boolean;
  onClose: () => void;
  onActiveChange?: (active: boolean) => void;
  /** Nicho de la landing desde la que se abre la demo; decide el agente de Retell. */
  niche?: string;
};

type DemoCallState = "idle" | "requesting-permission" | "connecting" | "active" | "ending" | "ended" | "error";

type TranscriptItem = {
  role: string;
  text: string;
};

/** El límite real lo aplica el backend al crear la llamada web. */
const DEMO_MAX_DURATION_SECONDS = 60;
const CONTACT_EMAIL = "hola@alhabla.ai";
const DEMO_NOT_CONFIGURED = "DEMO_NOT_CONFIGURED";

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

type RetellUpdateEvent = {
  transcript?: Array<{ role?: string; content?: string }>;
};

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
  const [allowBusinessDataRetention, setAllowBusinessDataRetention] = useState(false);

  const retellRef = useRef<RetellWebClient | null>(null);
  const intervalRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

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
      retellRef.current?.stopCall();
      retellRef.current?.removeAllListeners();
      retellRef.current = null;
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
    setAllowBusinessDataRetention(false);
  }, []);

  const teardownRetell = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    retellRef.current?.removeAllListeners();
    retellRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      teardownRetell();
      resetState();
      onClose();
    }, 320);
  }, [isClosing, onClose, resetState, teardownRetell]);

  const bindRetellEvents = (client: RetellWebClient) => {
    client.on("call_started", () => {
      setState("active");
      setErrorMessage(null);
      setElapsedSeconds(0);
    });
    client.on("call_ended", () => {
      setState("ended");
      setIsSpeaking(false);
      setIsMuted(false);
    });
    client.on("agent_start_talking", () => setIsSpeaking(true));
    client.on("agent_stop_talking", () => setIsSpeaking(false));
    client.on("update", (update: RetellUpdateEvent) => {
      if (!update?.transcript) return;
      setTranscript(
        update.transcript
          .filter((item) => item.content?.trim())
          .map((item) => ({ role: item.role === "user" ? "user" : "assistant", text: (item.content ?? "").trim() })),
      );
    });
    client.on("error", (error: unknown) => {
      setErrorMessage(describeDemoError(error));
      setState("error");
      setIsSpeaking(false);
      retellRef.current?.stopCall();
    });
  };

  const requestMicrophone = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  };

  const startDemo = async (placeId?: string, allowRetention = false) => {
    try {
      setErrorMessage(null);
      setState("requesting-permission");
      await requestMicrophone();
      setState("connecting");
      let accessToken: string | undefined;
      try {
        const data = await createDemoWebCall(niche, placeId, allowRetention);
        accessToken = data.accessToken;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 503) throw new Error(DEMO_NOT_CONFIGURED);
        throw error;
      }
      if (!accessToken) throw new Error(DEMO_NOT_CONFIGURED);
      const client = new RetellWebClient();
      retellRef.current = client;
      bindRetellEvents(client);
      await client.startCall({ accessToken, sampleRate: 24000 });
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
      setAllowBusinessDataRetention(false);
      setSearchQuery(`${details.name}${details.address ? ` · ${details.address}` : ""}`);
      setSearchResults([]);
    } catch {
      setSearchError("No hemos podido cargar ese negocio. Elige otro resultado o continúa con la demo genérica.");
    } finally {
      setIsLoadingPlace(false);
    }
  };

  const endCall = useCallback(async () => {
    if (!retellRef.current) {
      handleClose();
      return;
    }
    setState("ending");
    retellRef.current.stopCall();
  }, [handleClose]);

  useEffect(() => {
    if (!open || elapsedSeconds < DEMO_MAX_DURATION_SECONDS) return;
    void endCall();
  }, [elapsedSeconds, endCall, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
        ).filter((element) => element.offsetParent !== null || element === document.activeElement);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !dialog.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (isCallInProgress) void endCall();
      else handleClose();
    };
    const handlePageHide = () => retellRef.current?.stopCall();
    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [endCall, handleClose, isCallInProgress, open]);

  const toggleMute = () => {
    const nextValue = !isMuted;
    if (nextValue) retellRef.current?.mute();
    else retellRef.current?.unmute();
    setIsMuted(nextValue);
  };

  if (!open) return null;
  const demoLabel = selectedBusiness ? selectedBusiness.name : "Salón ficticio";

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
                  Demo personalizada · máx. {formatDuration(DEMO_MAX_DURATION_SECONDS)}
                </span>
              ) : null}
              <p id="demo-voz-descripcion" className="mt-1.5 text-sm leading-6 text-[#52525b]">
                {isCallView ? "Es una simulación: no se crea ninguna reserva real." : "Busca tu negocio y personalizaremos la demo automáticamente."}
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
                  setAllowBusinessDataRetention(false);
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
                <button type="button" onClick={() => { setSelectedBusiness(null); setAllowBusinessDataRetention(false); setSearchQuery(""); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-full text-xs font-semibold text-[#5b21b6] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/40 focus-visible:ring-offset-2">
                  <Pencil className="h-3.5 w-3.5" /> Cambiar
                </button>
              </div>
            ) : null}
            <div className="mt-auto pt-7">
              {selectedBusiness ? (
                <>
                  <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-[#52525b]">
                    <input
                      type="checkbox"
                      checked={allowBusinessDataRetention}
                      onChange={(event) => setAllowBusinessDataRetention(event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#a1a1aa] accent-[#8b5cf6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/40 focus-visible:ring-offset-1"
                    />
                    <span>
                      Acepto los{" "}
                      <Link href="/legal/aviso-legal" className="font-medium text-[#3f3f46] underline underline-offset-2">
                        términos de la demo
                      </Link>{" "}
                      y autorizo a Alhabla a conservar los datos públicos de este negocio para mejorar sus demos y el servicio.
                      <span className="block text-[#71717a]">Opcional; puedes probar la demo sin marcarla.</span>
                    </span>
                  </label>
                  <button type="button" onClick={() => void startDemo(selectedBusiness.placeId, allowBusinessDataRetention)} className="btn-primary mt-5 w-full px-5 sm:w-auto">Empezar demo personalizada</button>
                </>
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
                  El micrófono solo se utiliza durante la demo. No guardamos audio ni transcripción. ·{" "}
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
                  <p className="mt-1 text-sm leading-6 text-white/60">{selectedBusiness ? `Preparando la recepción de ${selectedBusiness.name}.` : "Preparando un ejemplo de recepción."}</p>
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
                  <button type="button" onClick={() => void endCall()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#c53030] px-5 text-sm font-semibold text-white transition hover:bg-[#a52626] sm:w-auto"><PhoneOff className="h-4 w-4" /> Colgar demo</button>
                </div>
              ) : null}
              {state === "error" ? <div className="grid gap-2 sm:flex sm:flex-wrap sm:gap-3"><button type="button" onClick={() => void startDemo(selectedBusiness?.placeId, allowBusinessDataRetention)} className="btn-primary w-full px-5 sm:w-auto">Reintentar demo</button><button type="button" onClick={handleClose} className="btn-secondary w-full px-5 sm:w-auto">Cerrar</button></div> : null}
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
              <p className="mt-3 text-xs leading-5 text-white/50">Demo simulada · máximo {formatDuration(DEMO_MAX_DURATION_SECONDS)} · no se realiza ninguna reserva.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
