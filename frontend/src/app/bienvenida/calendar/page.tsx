"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PasoDelAlta } from "@/components/paso-del-alta";
import { CalendarDays, ChevronRight, LoaderCircle } from "lucide-react";
import { SiGooglecalendar } from "@icons-pack/react-simple-icons";
import { BetaPill } from "@/components/beta-pill";
import { MicrosoftLogo } from "@/components/brand-icons";
import { getGoogleCalendarAuthUrl, getMicrosoftCalendarAuthUrl } from "@/lib/api";
import { consumePendingPlan, isPlanId } from "@/lib/billing-navigation";
import { saveRegistrationNextStep } from "@/lib/registration-next-step";
import { BUSINESS_TYPE_ONBOARDING_TEXTS, isBusinessType } from "@/lib/business-type";
import type { BusinessType } from "@/lib/types";

export default function RegisterBusinessCalendarPage() {
  const router = useRouter();
  const [businessType, setBusinessType] = useState<BusinessType>("other");
  const [loading, setLoading] = useState<"google" | "outlook" | null>(null);
  const [error, setError] = useState("");
  const [hasPlaceSchedule, setHasPlaceSchedule] = useState(false);
  // Vuelta de Google/Microsoft con el calendario ya conectado: se redirige
  // al pago, y mientras tanto no se vuelven a ofrecer las opciones de
  // conectar, que parecían decir que no había funcionado.
  const [redirigiendo, setRedirigiendo] = useState(false);

  useEffect(() => {
    const token =
      window.localStorage.getItem("alhabla_token") ??
      window.localStorage.getItem("token") ??
      window.localStorage.getItem("jwt");
    if (!token) {
      router.replace("/login");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const typeFromUrl = params.get("businessType");
    setHasPlaceSchedule(params.get("hasPlaceSchedule") === "true");

    if (typeFromUrl && isBusinessType(typeFromUrl)) {
      setBusinessType(typeFromUrl);
    }
  }, [router]);

  const redirectToFinalStep = () => {
    const params = new URLSearchParams(window.location.search);
    const planFromUrl = params.get("plan");
    const pendingPlan = consumePendingPlan();
    const plan = isPlanId(planFromUrl) ? planFromUrl : pendingPlan;

    if (plan) {
      window.location.href = `/checkout?plan=${plan}`;
      return;
    }

    const redirectParams = new URLSearchParams();
    redirectParams.set("from", "register");
    if (businessType) {
      redirectParams.set("businessType", businessType);
    }
    if (hasPlaceSchedule) {
      redirectParams.set("hasPlaceSchedule", "true");
    }
    window.location.href = `/planes?${redirectParams.toString()}`;
  };

  const startOAuth = async (provider: "google" | "outlook") => {
    setLoading(provider);
    setError("");

    try {
      saveRegistrationNextStep(
        `/bienvenida/calendar?completed=true&businessType=${businessType}${hasPlaceSchedule ? "&hasPlaceSchedule=true" : ""}`
      );

      const url =
        provider === "google"
          ? await getGoogleCalendarAuthUrl()
          : await getMicrosoftCalendarAuthUrl();

      window.location.href = url;
    } catch {
      setLoading(null);
      setError("No se pudo iniciar la conexión. Inténtalo de nuevo.");
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("completed") === "true") {
      setRedirigiendo(true);
      redirectToFinalStep();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const texts = BUSINESS_TYPE_ONBOARDING_TEXTS[businessType];

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="panel w-full max-w-lg p-6 sm:p-8">
        <PasoDelAlta paso={5} />
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
            <CalendarDays className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">
            {texts.calendar.heading}
          </h1>
          <p className="mx-auto max-w-md text-sm leading-6 text-muted">
            {texts.calendar.subheading}
          </p>
        </div>

        {redirigiendo ? (
          <p role="status" className="mt-8 flex items-center justify-center gap-2 rounded-2xl border border-[#d8efd7] bg-[#ecf7ec] px-4 py-4 text-sm font-medium text-[#2c7334]">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Calendario conectado. Te llevamos al siguiente paso…
          </p>
        ) : (
        <>
        <div className="mt-8 space-y-4">
          <button
            type="button"
            onClick={() => startOAuth("google")}
            disabled={loading !== null}
            className="relative flex w-full items-center gap-4 rounded-2xl border border-[#e5e5e5] bg-white p-5 text-left transition duration-200 hover:border-[#8b5cf6] hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <BetaPill />
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#e5e5e5] bg-white">
              <SiGooglecalendar className="h-6 w-6" color="#4285F4" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-[#0a0a0a]">Google Calendar</p>
              <p className="text-sm text-muted">Conecta tu agenda de Google para reservar citas.</p>
            </div>
            {loading === "google" ? (
              <LoaderCircle className="h-5 w-5 animate-spin text-muted" aria-label="Conectando" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => startOAuth("outlook")}
            disabled={loading !== null}
            className="flex w-full items-center gap-4 rounded-2xl border border-[#e5e5e5] bg-white p-5 text-left transition duration-200 hover:border-[#8b5cf6] hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#e5e5e5] bg-white">
              <MicrosoftLogo className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-[#0a0a0a]">Outlook / Microsoft 365</p>
              <p className="text-sm text-muted">Conecta tu agenda de Microsoft para reservar citas.</p>
            </div>
            {loading === "outlook" ? (
              <LoaderCircle className="h-5 w-5 animate-spin text-muted" aria-label="Conectando" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted" aria-hidden="true" />
            )}
          </button>
        </div>

        {error && <p role="alert" className="mt-4 text-sm text-[#c53030]">{error}</p>}

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={() => redirectToFinalStep()}
            disabled={loading !== null}
            className="btn-secondary w-full"
          >
            Configurar calendario después
          </button>
        </div>
        </>
        )}
      </div>
    </main>
  );
}
