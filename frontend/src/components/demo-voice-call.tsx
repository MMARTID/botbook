"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { RetellWebClient } from "retell-client-js-sdk";
import { Mic, MicOff, PhoneOff, Loader2, PhoneCall, ShieldCheck, X } from "lucide-react";

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

/**
 * Límite de la demo en segundos. Es un tope de interfaz: el límite real lo
 * aplica el backend al crear la llamada web (RETELL_DEMO_MAX_DURATION_SECONDS).
 */
const DEMO_MAX_DURATION_SECONDS = 60;

const STATE_COPY: Record<DemoCallState, string> = {
  idle: "Listo para empezar la demo.",
  "requesting-permission": "Necesitamos acceso al micrófono.",
  connecting: "Preparando la llamada…",
  active: "Alhabla te escucha.",
  ending: "Cerrando la llamada…",
  ended: "La demo ha terminado.",
  error: "No se pudo iniciar la demo.",
};

const CONTACT_EMAIL = "hola@alhabla.ai";

/** Error interno: la demo no está configurada en este entorno. */
const DEMO_NOT_CONFIGURED = "DEMO_NOT_CONFIGURED";

/**
 * Traduce cualquier fallo — de configuración, de permisos del navegador o del
 * proveedor de voz — a un mensaje en español que nombra el problema y la salida.
 * Nunca se muestra al usuario el mensaje crudo del SDK ni un nombre de variable
 * de entorno.
 */
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
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

/** El evento `update` del SDK de Retell trae la transcripción completa acumulada. */
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

  const retellRef = useRef<RetellWebClient | null>(null);
  const intervalRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

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

    // Con el diálogo abierto el fondo no debe desplazarse: en móvil ocupa toda
    // la pantalla y el scroll de detrás deja el panel flotando sobre el contenido.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
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

  const teardownRetell = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    retellRef.current?.removeAllListeners();
    retellRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    if (isClosing) {
      return;
    }

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

    client.on("agent_start_talking", () => {
      setIsSpeaking(true);
    });

    client.on("agent_stop_talking", () => {
      setIsSpeaking(false);
    });

    client.on("update", (update: RetellUpdateEvent) => {
      if (!update?.transcript) {
        return;
      }

      setTranscript(
        update.transcript
          .filter((item) => item.content?.trim())
          .map((item) => ({
            role: item.role === "user" ? "user" : "assistant",
            text: (item.content ?? "").trim(),
          })),
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

  const startDemo = async () => {
    try {
      setErrorMessage(null);
      setState("requesting-permission");
      await requestMicrophone();

      setState("connecting");
      const response = await fetch("/api/backend/demo/web-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(niche ? { niche } : {}),
      });
      if (!response.ok) {
        throw new Error(response.status === 503 ? DEMO_NOT_CONFIGURED : `DEMO_CALL_FAILED_${response.status}`);
      }

      const { accessToken } = (await response.json()) as { accessToken?: string };
      if (!accessToken) {
        throw new Error(DEMO_NOT_CONFIGURED);
      }

      const client = new RetellWebClient();
      retellRef.current = client;
      bindRetellEvents(client);

      await client.startCall({ accessToken, sampleRate: 24000 });
    } catch (error) {
      setErrorMessage(describeDemoError(error));
      setState("error");
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
      // Tab queda atrapado dentro del diálogo: con la llamada en curso, tabular
      // fuera dejaría al lector de pantalla leyendo la landing de detrás.
      if (event.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) {
          return;
        }

        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((element) => element.offsetParent !== null || element === document.activeElement);

        if (focusable.length === 0) {
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && (active === first || !dialog.contains(active))) {
          event.preventDefault();
          last.focus();
          return;
        }

        if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }

        return;
      }

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
      retellRef.current?.stopCall();
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
    if (nextValue) {
      retellRef.current?.mute();
    } else {
      retellRef.current?.unmute();
    }
    setIsMuted(nextValue);
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-[#0a0a0a]/60 backdrop-blur-sm sm:items-center sm:justify-center sm:px-4 sm:py-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-voz-titulo"
        aria-describedby="demo-voz-descripcion"
        className={`demo-call-modal flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[#e5e5e5] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.18)] sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:rounded-3xl ${isClosing ? "demo-call-modal-closing" : ""}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e5e5e5] px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 id="demo-voz-titulo" className="text-xl font-bold text-[#0a0a0a] sm:text-2xl">
              Habla con Alhabla
            </h2>
            <p id="demo-voz-descripcion" className="mt-2 text-sm leading-6 text-[#52525b]">
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
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#0a0a0a] transition hover:bg-[#fafafa]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 gap-4 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-5 lg:grid-cols-[0.92fr_1.08fr] lg:overflow-visible">
          <div className="space-y-3 sm:space-y-4">
            <div className="hidden rounded-2xl border border-[#e5e5e5] bg-white p-5 sm:block">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#0a0a0a]">Privacidad y control</p>
                  <p className="text-sm leading-6 text-[#52525b]">Micrófono solo para esta demo. Sin reservas reales ni formularios previos.</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4 sm:p-5">
              <p className="text-sm font-semibold text-[#0a0a0a]">Estado actual</p>
              <p className="mt-2 text-sm leading-6 text-[#52525b]" aria-live="polite">
                {errorMessage ?? statusCopy}
              </p>
              <div className="mt-3 flex items-center gap-3 text-sm font-medium text-[#27272a] sm:mt-4">
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${state === "active" ? "bg-[#2c7334]" : state === "error" ? "bg-[#c53030]" : "bg-[#d4d4d8]"}`} />
                {state === "active" ? (isSpeaking ? "Alhabla está hablando" : "Alhabla está escuchando") : "Demo inactiva"}
              </div>
              <p className="mt-3 text-xs text-[#52525b]">Tiempo máximo: {formatDuration(DEMO_MAX_DURATION_SECONDS)}</p>
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
                  <button type="button" onClick={() => void endCall()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#c53030] px-5 text-sm font-semibold text-white transition hover:bg-[#a52626] sm:w-auto">
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

            <p className="text-sm leading-6 text-[#52525b]">
              El micrófono se usa solo mientras dure esta demo: no se graba el audio ni se guarda la transcripción.
              Puedes leer los detalles en nuestra{" "}
              <Link href="/legal/privacidad" className="font-medium text-[#0a0a0a] underline underline-offset-2">
                política de privacidad
              </Link>
              .
            </p>
          </div>

          <div className="order-first flex min-h-0 flex-col rounded-3xl bg-[#0a0a0a] p-4 text-white sm:p-6 lg:order-none">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-[#a78bfa]">
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

            <div className="scrollbar-dark mt-4 h-[clamp(10rem,30vh,18rem)] space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-3 sm:min-h-[18rem] sm:p-4">
              {transcript.length === 0 ? (
                <p className="text-sm leading-6 text-white/60">
                  Cuando empiece la conversación, verás aquí un resumen en texto de lo que se va diciendo en la demo.
                </p>
              ) : (
                transcript.map((item, index) => (
                  <div key={`${item.role}-${index}`} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-6 ${item.role === "user" ? "rounded-br-sm bg-[#8b5cf6] text-white" : "rounded-bl-sm bg-white/10 text-white"}`}>
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] opacity-70">
                        {item.role === "user" ? "Tú" : "Alhabla"}
                      </span>
                      {item.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            {state === "ended" ? (
              <div className="mt-4 rounded-2xl border border-[#8b5cf6]/20 bg-[#8b5cf6]/10 p-4">
                <p className="text-sm font-semibold text-white">¿Quieres que atienda así en tu negocio?</p>
                <Link href="/planes" className="btn-purple mt-3">
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
