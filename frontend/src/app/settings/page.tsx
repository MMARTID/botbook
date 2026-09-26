// frontend/src/app/settings/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck2, CircleAlert, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { connectMicrosoftCalendar, selectCalendar } from "@/lib/api";
import { parseGoogleCalendarSelection, parseOutlookCalendarSelection } from "@/lib/calendar-callback";
import { clearRegistrationNextStep, consumeRegistrationNextStep } from "@/lib/registration-next-step";

export default function SettingsCallbackPage() {
  return (
    <Suspense fallback={<div role="status" className="flex min-h-[60vh] items-center justify-center px-4 py-16 text-sm text-muted">Cargando…</div>}>
      <SettingsCallbackContent />
    </Suspense>
  );
}

function SettingsCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"processing" | "complete">("processing");
  const [connectingCalendarId, setConnectingCalendarId] = useState<string | null>(null);

  const isSuccess = searchParams.get("calendar_success") === "true";
  const outlookCalendarsParam = searchParams.get("outlook_calendars");
  const parsedOutlookCalendars = useMemo(
    () => parseOutlookCalendarSelection(outlookCalendarsParam),
    [outlookCalendarsParam],
  );
  const hasInvalidOutlookCalendars = outlookCalendarsParam !== null && !parsedOutlookCalendars;
  const isOutlookError = searchParams.has("outlook_error") || hasInvalidOutlookCalendars;
  // Google devuelve ahora su lista de calendarios para elegir, como Outlook:
  // hasta que el dueño elija, la conexión queda sin confirmar.
  const googleCalendarsParam = searchParams.get("google_calendars");
  const parsedGoogleCalendars = useMemo(
    () => parseGoogleCalendarSelection(googleCalendarsParam),
    [googleCalendarsParam],
  );
  const hasInvalidGoogleCalendars = googleCalendarsParam !== null && !parsedGoogleCalendars;
  const isError =
    searchParams.has("calendar_error") ||
    hasInvalidGoogleCalendars ||
    isOutlookError;

  useEffect(() => {
    let redirectTimer: number | undefined;
    const intervalId = window.setInterval(() => {
      setProgress((value) => (value < 100 ? value + 6 : 100));
    }, 60);

    const finishTimer = window.setTimeout(async () => {
      if (parsedOutlookCalendars || parsedGoogleCalendars) {
        setProgress(100);
        setPhase("complete");
        return;
      }

      if (isSuccess) {
        await queryClient.invalidateQueries({ queryKey: ["my-business"] });
        await queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
        await queryClient.refetchQueries({ queryKey: ["my-business"], type: "active" });
      }

      setProgress(100);
      setPhase("complete");
      redirectTimer = window.setTimeout(() => {
        if (isError) {
          // La conexión falló: el paso de registro pendiente deja de tener
          // sentido y, si se queda guardado, reaparece en la siguiente
          // conexión de agenda aunque sea meses después desde Ajustes.
          clearRegistrationNextStep();
          router.replace(isOutlookError ? "/?outlook_error=true" : "/?calendar_error=true");
          return;
        }
        const nextStep = consumeRegistrationNextStep();
        if (nextStep) {
          router.replace(nextStep);
          return;
        }
        router.replace("/");
      }, 700);
    }, 900);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(finishTimer);
      if (redirectTimer !== undefined) window.clearTimeout(redirectTimer);
    };
  }, [isError, isOutlookError, isSuccess, parsedGoogleCalendars, parsedOutlookCalendars, queryClient, router]);

  if (parsedGoogleCalendars) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
        <div className="panel w-full max-w-xl space-y-5 p-6">
          <div>
            <span className="badge-soft">Google Calendar</span>
            <h1 className="mt-3 text-2xl font-semibold text-[#0a0a0a]">Elige el calendario que quieres usar</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Cuenta conectada: {parsedGoogleCalendars.email ?? "Cuenta de Google"}. La recepcionista apuntará las citas
              en el calendario que elijas y respetará lo que ya tengas en él.
            </p>
          </div>
          <div className="grid gap-3">
            {parsedGoogleCalendars.calendars.map((calendar) => (
              <button
                key={calendar.id}
                type="button"
                disabled={connectingCalendarId !== null}
                onClick={async () => {
                  setConnectingCalendarId(calendar.id);
                  try {
                    const updatedBusiness = await selectCalendar(calendar.id);
                    queryClient.setQueryData(["my-business"], updatedBusiness);
                    await queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
                    const nextStep = consumeRegistrationNextStep();
                    if (nextStep) {
                      router.replace(nextStep);
                      return;
                    }
                    router.replace("/?calendar_success=true");
                  } catch {
                    clearRegistrationNextStep();
                    router.replace("/?calendar_error=true");
                  }
                }}
                className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-4 text-left transition duration-200 hover:border-[#ddd6fe] hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
              >
                <p className="text-sm font-semibold text-[#0a0a0a]">
                  {connectingCalendarId === calendar.id ? "Conectando…" : calendar.name}
                </p>
                <p className="mt-1 text-xs text-muted">{calendar.primary ? "Calendario principal" : "Calendario secundario"}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (parsedOutlookCalendars) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
        <div className="panel w-full max-w-xl space-y-5 p-6">
          <div>
            <span className="badge-soft">Outlook Calendar</span>
            <h1 className="mt-3 text-2xl font-semibold text-[#0a0a0a]">Elige el calendario que quieres usar</h1>
            <p className="mt-2 text-sm leading-6 text-muted">Cuenta conectada: {parsedOutlookCalendars.email ?? "Cuenta Microsoft"}</p>
          </div>
          <div className="grid gap-3">
            {parsedOutlookCalendars.calendars.map((calendar) => (
              <button
                key={calendar.id}
                type="button"
                disabled={connectingCalendarId !== null}
                onClick={async () => {
                  setConnectingCalendarId(calendar.id);
                  try {
                    const updatedBusiness = await connectMicrosoftCalendar(calendar.id);
                    queryClient.setQueryData(["my-business"], updatedBusiness);
                    await queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
                    const nextStep = consumeRegistrationNextStep();
                    if (nextStep) {
                      router.replace(nextStep);
                      return;
                    }
                    router.replace("/?outlook_success=true");
                  } catch {
                    clearRegistrationNextStep();
                    router.replace("/?outlook_error=true");
                  }
                }}
                className="rounded-2xl border border-[#e5e5e5] bg-white px-4 py-4 text-left transition duration-200 hover:border-[#ddd6fe] hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
              >
                <p className="text-sm font-semibold text-[#0a0a0a]">
                  {connectingCalendarId === calendar.id ? "Conectando…" : calendar.name}
                </p>
                <p className="mt-1 text-xs text-muted">{calendar.ownerEmail ?? "Calendario principal"}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="panel w-full max-w-md overflow-hidden p-0">
        <div className="bg-[#fafafa] px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
              <CalendarCheck2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <span className="badge-soft">
                {searchParams.has("outlook_error") ? "Outlook Calendar" : "Google Calendar"}
              </span>
              <h1 className="mt-2 text-xl font-semibold text-[#0a0a0a]">
                {isSuccess ? "Conexión completada" : isError ? "Hubo un problema" : "Finalizando configuración"}
              </h1>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-6 py-8">
          <div className="flex justify-center">
            <div className={`relative flex h-20 w-20 items-center justify-center rounded-full ${phase === "complete" ? "bg-[#ecf7ec] text-[#2c7334]" : "bg-[#fafafa] text-[#52525b]"}`}>
              {phase === "complete" ? (
                isSuccess ? (
                  <CheckCircleAnimation />
                ) : (
                  <CircleAlert className="h-10 w-10" aria-hidden="true" />
                )
              ) : (
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#e5e5e5] border-t-[#0a0a0a]" />
              )}
            </div>
          </div>

          <div className="space-y-3">
            {/* Barra de tiempo, no de progreso real: decorativa. */}
            <div className="h-2 overflow-hidden rounded-full bg-[#e5e5e5]" aria-hidden="true">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#0a0a0a] via-[#8b5cf6] to-[#a78bfa] transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p role="status" className="text-center text-sm text-muted">
              {phase === "processing"
                ? "Estamos cerrando la conexión y devolviéndote al panel…"
                : isSuccess
                  ? "Todo quedó listo. Te estamos llevando de vuelta al panel."
                  : searchParams.has("outlook_error")
                    ? "Se produjo un error al conectar Outlook Calendar. Te estamos devolviendo para intentarlo otra vez."
                    : "Se produjo un error. Te estamos llevando de vuelta para intentarlo otra vez."}
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm font-medium text-muted">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Redirigiendo automáticamente
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckCircleAnimation() {
  return (
    <div className="relative flex h-12 w-12 items-center justify-center">
      <div className="absolute inset-0 animate-ping rounded-full bg-[#d8efd7]" />
      <div className="absolute inset-1 rounded-full bg-[#ecf7ec]" />
      <svg viewBox="0 0 24 24" className="relative h-8 w-8 text-[#2c7334]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </div>
  );
}
