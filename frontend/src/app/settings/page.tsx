// frontend/src/app/settings/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck2, CircleAlert, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { connectMicrosoftCalendar } from "@/lib/api";
import type { MicrosoftCalendarOption } from "@/lib/types";

export default function SettingsCallbackPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center px-4 py-16">Cargando...</div>}>
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
  const isError = searchParams.has("calendar_error") || searchParams.has("outlook_error");
  const outlookCalendarsParam = searchParams.get("outlook_calendars");
  const parsedOutlookCalendars = (() => {
    if (!outlookCalendarsParam) return null;
    try {
      return JSON.parse(decodeURIComponent(outlookCalendarsParam)) as { calendars: MicrosoftCalendarOption[]; email: string | null };
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    let redirectTimer: number | undefined;
    const intervalId = window.setInterval(() => {
      setProgress((value) => (value < 100 ? value + 6 : 100));
    }, 60);

    const finishTimer = window.setTimeout(async () => {
      if (outlookCalendarsParam) {
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
        if (typeof window !== "undefined") {
          const nextStep = window.localStorage.getItem("registration_next_step");
          if (nextStep) {
            window.localStorage.removeItem("registration_next_step");
            router.replace(nextStep);
            return;
          }
        }
        if (isError) {
          router.replace("/?calendar_error=true");
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
  }, [isError, isSuccess, outlookCalendarsParam, queryClient, router]);

  if (parsedOutlookCalendars) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-transparent px-4 py-16">
        <div className="panel w-full max-w-xl space-y-5 p-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#7b886f]">Outlook Calendar</p>
            <h1 className="mt-2 text-2xl font-semibold text-[#1e2b22]">Elige el calendario que quieres usar</h1>
            <p className="mt-2 text-sm leading-6 text-[#687267]">Cuenta conectada: {parsedOutlookCalendars.email ?? "Cuenta Microsoft"}</p>
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
                    if (typeof window !== "undefined") {
                      const nextStep = window.localStorage.getItem("registration_next_step");
                      if (nextStep) {
                        window.localStorage.removeItem("registration_next_step");
                        router.replace(nextStep);
                        return;
                      }
                    }
                    router.replace("/?outlook_success=true");
                  } catch {
                    router.replace("/?outlook_error=true");
                  }
                }}
                className="rounded-2xl border border-[#dce7d2] bg-white px-4 py-4 text-left shadow-sm transition hover:border-[#cfe1ae] hover:bg-[#f8fbf1] disabled:cursor-wait disabled:opacity-60"
              >
                <p className="text-sm font-semibold text-[#1e2b22]">
                  {connectingCalendarId === calendar.id ? "Conectando..." : calendar.name}
                </p>
                <p className="mt-1 text-xs text-[#687267]">{calendar.ownerEmail ?? "Calendario principal"}</p>
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-transparent px-4 py-16">
      <div className="panel w-full max-w-md overflow-hidden p-0">
        <div className="bg-[#f7faef] px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1e2b22] text-white">
              <CalendarCheck2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#7b886f]">
                {searchParams.has("outlook_error") ? "Outlook Calendar" : "Google Calendar"}
              </p>
              <h1 className="text-xl font-semibold text-[#1e2b22]">
                {isSuccess ? "Conexión completada" : isError ? "Hubo un problema" : "Finalizando configuración"}
              </h1>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-6 py-8">
          <div className="flex justify-center">
            <div className={`relative flex h-20 w-20 items-center justify-center rounded-full ${phase === "complete" ? "bg-[#ecf7ec] text-[#2c7334]" : "bg-[#f4f6f1] text-[#5c6958]"}`}>
              {phase === "complete" ? (
                isSuccess ? (
                  <CheckCircleAnimation />
                ) : (
                  <CircleAlert className="h-10 w-10" />
                )
              ) : (
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#dce6cf] border-t-[#1e2b22]" />
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="h-2 overflow-hidden rounded-full bg-[#ecefe7]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#1e2b22] via-[#2c7334] to-[#b8d96e] transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-center text-sm text-[#687267]">
              {phase === "processing"
                ? "Estamos cerrando la conexión y devolviéndote al panel..."
                : isSuccess
                  ? "Todo quedó listo. Te estamos llevando de vuelta al panel."
                  : searchParams.has("outlook_error")
                    ? "Se produjo un error al conectar Outlook Calendar. Te estamos devolviendo para intentarlo otra vez."
                    : "Se produjo un error. Te estamos llevando de vuelta para intentarlo otra vez."}
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm font-medium text-[#7b886f]">
            <Sparkles className="h-4 w-4" />
            Redirigiendo automáticamente
          </div>
        </div>
      </div>
    </main>
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