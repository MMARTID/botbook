"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Vapi from "@vapi-ai/web";
import type { AssistantOverrides } from "@vapi-ai/web/dist/api";
import { Mic, MicOff, PhoneOff, Loader2, PhoneCall, ShieldCheck, X } from "lucide-react";

type DemoVoiceCallProps = {
  open: boolean;
  onClose: () => void;
  onActiveChange?: (active: boolean) => void;
};

type DemoCallState = "idle" | "requesting-permission" | "connecting" | "active" | "ending" | "ended" | "error";

type TranscriptItem = {
  role: string;
  text: string;
};

type SpeechLifecycleEvent = {
  role?: string;
};

const DEMO_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_DEMO_PUBLIC_KEY || "";
const DEMO_ASSISTANT_ID = process.env.NEXT_PUBLIC_VAPI_DEMO_ASSISTANT_ID || "fb5bef81-c78a-4f88-987b-406b4944d9cb";
const DEMO_MAX_DURATION_SECONDS = Number(process.env.NEXT_PUBLIC_VAPI_DEMO_MAX_DURATION_SECONDS || 59);
const DEMO_ASSISTANT_VOICE_SPEED = Number(process.env.NEXT_PUBLIC_VAPI_DEMO_VOICE_SPEED || 1.08);
const DEMO_ASSISTANT_VOICE_ID = process.env.NEXT_PUBLIC_VAPI_DEMO_VOICE_ID || "538a8872-3799-4df5-b373-b78493b766c6";

const DEMO_ASSISTANT_OVERRIDES: AssistantOverrides = {
  backgroundSound: "off",
  maxDurationSeconds: DEMO_MAX_DURATION_SECONDS,
  voice: {
    provider: "cartesia",
    voiceId: DEMO_ASSISTANT_VOICE_ID,
    generationConfig: {
      speed: DEMO_ASSISTANT_VOICE_SPEED,
    },
  },
  artifactPlan: {
    recordingEnabled: false,
    videoRecordingEnabled: false,
    transcriptPlan: {
      enabled: false,
    },
    loggingEnabled: false,
  },
};

const STATE_COPY: Record<DemoCallState, string> = {
  idle: "Listo para empezar la demo.",
  "requesting-permission": "Necesitamos acceso al micrófono.",
  connecting: "Preparando la llamada…",
  active: "AsistAI te escucha.",
  ending: "Cerrando la llamada…",
  ended: "La demo ha terminado.",
  error: "No se pudo iniciar la demo.",
};

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function isTranscriptMessage(
  value: unknown
): value is { type: string; role?: string; transcript: string; transcriptType?: "partial" | "final" } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { transcript?: unknown }).transcript === "string"
  );
}

function mergeTranscriptChunk(current: TranscriptItem[], message: { role?: string; transcript: string; transcriptType?: "partial" | "final" }) {
  const role = message.role || "assistant";
  const text = message.transcript.trim();

  if (!text) {
    return current;
  }

  const next = [...current];
  const lastItem = next.at(-1);

  // If last item exists and is same role, try to merge intelligently
  if (lastItem?.role === role) {
    const lastText = (lastItem.text || "").trim();

    // If the incoming partial appears to be cumulative (contains previous text), replace
    if (message.transcriptType === "partial") {
      if (lastText && text.includes(lastText)) {
        next[next.length - 1] = { ...lastItem, text };
        return next;
      }

      // Otherwise treat partial as a delta and append to last bubble
      const appended = lastText ? `${lastText} ${text}` : text;
      next[next.length - 1] = { ...lastItem, text: appended };
      return next;
    }

    // For final transcripts, also avoid duplication: if final contains last, replace; otherwise append
    if (message.transcriptType === "final") {
      if (lastText && text.includes(lastText)) {
        next[next.length - 1] = { ...lastItem, text };
        return next;
      }

      const appended = lastText ? `${lastText} ${text}` : text;
      next[next.length - 1] = { ...lastItem, text: appended };
      return next;
    }

    // If no transcriptType provided, attempt best-effort merge: if incoming contains last, replace, else append
    if (lastText && text.includes(lastText)) {
      next[next.length - 1] = { ...lastItem, text };
      return next;
    }

    next[next.length - 1] = { ...lastItem, text: `${lastText} ${text}` };
    return next;
  }

  // Different role or no previous item: push new bubble
  next.push({ role, text });
  return next;
}

export function DemoVoiceCall({ open, onClose, onActiveChange }: DemoVoiceCallProps) {
  const [state, setState] = useState<DemoCallState>("idle");
  const [isClosing, setIsClosing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const vapiRef = useRef<Vapi | null>(null);
  const intervalRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Pending transcript buffers per role (partial transcripts). Stored in ref to avoid excessive renders.
  const pendingRef = useRef<Record<string, string>>({});
  const pendingDebounceRef = useRef<number | null>(null);
  const [, setPendingTick] = useState(0); // used to trigger UI updates for pending buffer

  function schedulePendingUIUpdate() {
    if (pendingDebounceRef.current) return;
    pendingDebounceRef.current = window.setTimeout(() => {
      pendingDebounceRef.current = null;
      setPendingTick((t) => t + 1);
    }, 220);
  }

  function updatePending(role: string, text: string) {
    pendingRef.current[role] = text.trim();
    schedulePendingUIUpdate();
  }

  function flushPending(role: string) {
    const text = (pendingRef.current[role] || "").trim();
    if (!text) {
      delete pendingRef.current[role];
      setPendingTick((t) => t + 1);
      return;
    }

    setTranscript((current) => {
      // append as final message; merge if last has same role
      const next = [...current];
      const last = next.at(-1);
      if (last && last.role === role) {
        next[next.length - 1] = { ...last, text: `${last.text} ${text}`.trim() };
      } else {
        next.push({ role, text });
      }
      return next;
    });

    delete pendingRef.current[role];
    setPendingTick((t) => t + 1);
  }

  const statusCopy = useMemo(() => STATE_COPY[state], [state]);

  useEffect(() => {
    onActiveChange?.(state === "active" || state === "connecting" || state === "requesting-permission" || state === "ending");
  }, [onActiveChange, state]);

  useEffect(() => {
    if (!open) {
      setIsClosing(false);
      return;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) {
      return;
    }

    previousFocusRef.current?.focus();
  }, [open]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
      }
      vapiRef.current?.stop();
      vapiRef.current?.removeAllListeners();
      vapiRef.current = null;
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

    intervalRef.current = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [open, state]);

  const resetState = useCallback(() => {
    setState("idle");
    setErrorMessage(null);
    setTranscript([]);
    setIsMuted(false);
    setElapsedSeconds(0);
    setIsSpeaking(false);
  }, []);

  const teardownVapi = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    vapiRef.current?.removeAllListeners();
    vapiRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    if (isClosing) {
      return;
    }

    setIsClosing(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      teardownVapi();
      resetState();
      onClose();
    }, 320);
  }, [isClosing, onClose, resetState, teardownVapi]);

  const bindVapiEvents = (vapi: Vapi) => {
    const vapiWithSpeechEvents = vapi as Vapi & {
      on(event: "speech-start" | "speech-end", listener: (event: SpeechLifecycleEvent) => void): void;
    };

    vapi.on("call-start", () => {
      setState("active");
      setErrorMessage(null);
      setElapsedSeconds(0);
    });

    vapi.on("call-end", () => {
      setState("ended");
      setIsSpeaking(false);
      setIsMuted(false);
    });

    vapiWithSpeechEvents.on("speech-start", (event: SpeechLifecycleEvent) => {
      setIsSpeaking(true);
      const role = event.role || "assistant";
      pendingRef.current[role] = pendingRef.current[role] || "";
      schedulePendingUIUpdate();
    });

    vapiWithSpeechEvents.on("speech-end", (event: SpeechLifecycleEvent) => {
      setIsSpeaking(false);
      const role = event.role || "assistant";
      flushPending(role);
    });

    vapi.on("message", (message) => {
      if (!isTranscriptMessage(message) || !message.type.startsWith("transcript") || !message.transcript) {
        return;
      }

      const role = message.role || "assistant";

      // Prefer to buffer partials and only commit on final or speech-end
      if (message.transcriptType === "partial") {
        // ignore very small fragments
        if (message.transcript.trim().length < 3) return;

        // if partial appears cumulative, replace; else concatenate
        const prev = pendingRef.current[role] || "";
        const incoming = message.transcript.trim();
        if (prev && incoming.includes(prev)) {
          updatePending(role, incoming);
        } else {
          updatePending(role, `${prev} ${incoming}`.trim());
        }
        return;
      }

      // Final transcript: flush directly
      if (message.transcriptType === "final") {
        updatePending(role, message.transcript.trim());
        flushPending(role);
        return;
      }

      // If no transcriptType, fallback to merging logic
      setTranscript((current) => mergeTranscriptChunk(current, message));
    });

    vapi.on("error", (error) => {
      const message = error instanceof Error ? error.message : "No se pudo conectar con la demo.";
      setErrorMessage(message);
      setState("error");
      setIsSpeaking(false);
    });
  };

  const requestMicrophone = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  };

  const startDemo = async () => {
    try {
      if (!DEMO_PUBLIC_KEY) {
        throw new Error("Falta configurar NEXT_PUBLIC_VAPI_DEMO_PUBLIC_KEY.");
      }

      setErrorMessage(null);
      setState("requesting-permission");
      await requestMicrophone();

      setState("connecting");
      const vapi = new Vapi(DEMO_PUBLIC_KEY);
      vapiRef.current = vapi;
      bindVapiEvents(vapi);

      await vapi.start(DEMO_ASSISTANT_ID, DEMO_ASSISTANT_OVERRIDES);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo iniciar la demo.";
      setErrorMessage(message);
      setState("error");
    }
  };

  const endCall = useCallback(async () => {
    if (!vapiRef.current) {
      handleClose();
      return;
    }

    setState("ending");
    vapiRef.current.stop();
  }, [handleClose]);

  useEffect(() => {
    if (!open || elapsedSeconds < DEMO_MAX_DURATION_SECONDS) {
      return;
    }

    void endCall();
  }, [elapsedSeconds, endCall, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      if (state === "active" || state === "connecting" || state === "requesting-permission") {
        void endCall();
        return;
      }

      handleClose();
    };

    const handlePageHide = () => {
      vapiRef.current?.stop();
    };

    window.addEventListener("keydown", handleEscape);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [endCall, handleClose, open, state]);

  const toggleMute = () => {
    const nextValue = !isMuted;
    vapiRef.current?.setMuted(nextValue);
    setIsMuted(nextValue);
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-[#1e2b22]/60 backdrop-blur-sm sm:items-center sm:justify-center sm:px-4 sm:py-6">
      <div className={`demo-call-modal panel flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-b-none border-white/70 bg-[#fbfcf8] shadow-[0_26px_80px_rgba(16,24,20,0.28)] sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:rounded-3xl ${isClosing ? "demo-call-modal-closing" : ""}`}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e4e8df] px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#718064]">Demo en directo</p>
            <h2 className="mt-1 text-xl font-semibold text-[#1e2b22] sm:mt-2 sm:text-2xl">Habla con AsistAI</h2>
            <p className="mt-1 text-sm leading-5 text-[#5f6d63] sm:mt-2 sm:leading-6">
              Hablarás con una demo. Necesitamos acceso al micrófono y no se realizará ninguna reserva real.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => {
              if (state === "active" || state === "connecting" || state === "requesting-permission") {
                void endCall();
                return;
              }
              handleClose();
            }}
            aria-label="Cerrar demo"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d6dfcf] bg-white text-[#344038] transition hover:bg-[#f4f6f1]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 gap-4 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-5 lg:grid-cols-[0.92fr_1.08fr] lg:overflow-visible">
          <div className="space-y-3 sm:space-y-4">
            <div className="hidden rounded-[1.5rem] border border-[#e2e9dc] bg-white p-5 sm:block">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef6dc] text-[#2c7334]">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#1e2b22]">Privacidad y control</p>
                  <p className="text-sm leading-6 text-[#5f6d63]">Micrófono solo para esta demo. Sin reservas reales ni formularios previos.</p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-[#e2e9dc] bg-white p-4 sm:p-5">
              <p className="text-sm font-semibold text-[#1e2b22]">Estado actual</p>
              <p className="mt-2 text-sm leading-6 text-[#5f6d63]" aria-live="polite">
                {errorMessage ?? statusCopy}
              </p>
              <div className="mt-3 flex items-center gap-3 text-sm font-medium text-[#344038] sm:mt-4">
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${state === "active" ? "bg-[#2c7334]" : state === "error" ? "bg-[#c94b4b]" : "bg-[#d5dbcf]"}`} />
                {state === "active" ? (isSpeaking ? "AsistAI está hablando" : "AsistAI está escuchando") : "Demo inactiva"}
              </div>
              <p className="mt-3 text-xs text-[#7a8774]">Tiempo máximo: {formatDuration(DEMO_MAX_DURATION_SECONDS)}</p>
            </div>

            <div className="grid gap-2 sm:flex sm:flex-wrap sm:gap-3">
              {state === "idle" || state === "error" || state === "ended" ? (
                <button type="button" onClick={startDemo} className="btn-primary w-full px-5 sm:w-auto">
                  {state === "error" ? "Reintentar demo" : "Empezar demo con micrófono"}
                </button>
              ) : null}

              {state === "active" ? (
                <>
                  <button type="button" onClick={toggleMute} className="btn-secondary w-full px-5 sm:w-auto">
                    {isMuted ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                    {isMuted ? "Activar micrófono" : "Silenciar micrófono"}
                  </button>
                  <button type="button" onClick={() => void endCall()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#c94b4b] px-5 text-sm font-semibold text-white transition hover:bg-[#b63c3c] sm:w-auto">
                    <PhoneOff className="h-4 w-4" />
                    Colgar demo
                  </button>
                </>
              ) : null}

              {(state === "connecting" || state === "requesting-permission" || state === "ending") ? (
                <button type="button" disabled className="btn-secondary w-full px-5 opacity-80 sm:w-auto">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {state === "requesting-permission"
                    ? "Esperando permiso"
                    : state === "connecting"
                      ? "Conectando demo"
                      : "Cerrando llamada"}
                </button>
              ) : null}
            </div>

            <p className="hidden text-xs leading-5 text-[#7a8774] sm:block">
              Al continuar aceptas el uso temporal del micrófono para la demostración. Consulta nuestra <Link href="#" className="font-medium text-[#344038] underline underline-offset-2">política de privacidad</Link>.
            </p>
          </div>

          <div className="order-first flex min-h-0 flex-col rounded-[1.7rem] border border-[#dce6d4] bg-[#1e2b22] p-4 text-white sm:p-6 lg:order-none">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[#b8d96e]">
                  <PhoneCall className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Demo de recepción telefónica</p>
                  <p className="text-xs text-white/60">Salón ficticio · reservas simuladas</p>
                </div>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                {formatDuration(elapsedSeconds)}
              </span>
            </div>

            <div className="mt-4 h-[clamp(10rem,30vh,18rem)] space-y-3 overflow-y-auto rounded-[1.35rem] border border-white/10 bg-white/5 p-3 sm:min-h-[18rem] sm:p-4">
              {transcript.length === 0 ? (
                <p className="text-sm leading-6 text-white/60">
                  Cuando empiece la conversación, verás aquí un resumen en texto de lo que se va diciendo en la demo.
                </p>
              ) : (
                transcript.map((item, index) => (
                  <div key={`${item.role}-${index}`} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[88%] rounded-[1.1rem] px-3 py-2 text-sm leading-6 ${item.role === "user" ? "bg-[#b8d96e] text-[#1e2b22]" : "bg-white/10 text-white"}`}>
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">
                        {item.role === "user" ? "Tú" : "AsistAI"}
                      </span>
                      {item.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            {state === "ended" ? (
              <div className="mt-4 rounded-[1.25rem] border border-[#b8d96e]/20 bg-[#b8d96e]/10 p-4">
                <p className="text-sm font-semibold text-white">¿Quieres que atienda así en tu negocio?</p>
                <Link href="/planes" className="mt-3 inline-flex h-11 items-center justify-center rounded-2xl bg-[#b8d96e] px-5 text-sm font-semibold text-[#1e2b22] transition hover:bg-[#e3ff9e]">
                  Ver planes
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
