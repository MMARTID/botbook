"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, LoaderCircle, Mail, Video } from "lucide-react";
import { getGoogleCalendarAuthUrl, getMicrosoftCalendarAuthUrl } from "@/lib/api";
import { consumePendingPlan, isPlanId } from "@/lib/billing-navigation";
import { BUSINESS_TYPE_ONBOARDING_TEXTS, isBusinessType } from "@/lib/business-type";
import type { BusinessType } from "@/lib/types";

const REGISTRATION_NEXT_STEP_KEY = "registration_next_step";

export default function RegisterBusinessCalendarPage() {
  const router = useRouter();
  const [businessType, setBusinessType] = useState<BusinessType>("other");
  const [loading, setLoading] = useState<"google" | "outlook" | null>(null);
  const [error, setError] = useState("");
  const [hasPlaceSchedule, setHasPlaceSchedule] = useState(false);

  useEffect(() => {
    const token =
      window.localStorage.getItem("botbook_token") ??
      window.localStorage.getItem("token") ??
      window.localStorage.getItem("jwt");
    if (!token) {
      router.replace("/register");
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
      window.localStorage.setItem(
        REGISTRATION_NEXT_STEP_KEY,
        `/register/business/calendar?completed=true&businessType=${businessType}${hasPlaceSchedule ? "&hasPlaceSchedule=true" : ""}`
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
      redirectToFinalStep();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const texts = BUSINESS_TYPE_ONBOARDING_TEXTS[businessType];

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="panel w-full max-w-lg p-8">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1e2b22] text-[#b8d96e] shadow-sm">
            <CalendarDays className="h-7 w-7" />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-[#1e2b22]">
            {texts.calendar.heading}
          </h2>
          <p className="mx-auto max-w-md text-sm leading-6 text-muted">
            {texts.calendar.subheading}
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <button
            type="button"
            onClick={() => startOAuth("google")}
            disabled={loading !== null}
            className="flex w-full items-center gap-4 rounded-2xl border border-[#dce1d8] bg-white p-5 text-left transition hover:border-[#b8d96e] hover:bg-[#fbfcf8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#eef6dc] text-[#2c7334]">
              <Video className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-[#1e2b22]">Google Calendar</p>
              <p className="text-sm text-muted">Conecta tu agenda de Google para reservar citas.</p>
            </div>
            {loading === "google" ? (
              <LoaderCircle className="h-5 w-5 animate-spin text-muted" />
            ) : (
              <Check className="h-5 w-5 text-[#8a9388]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => startOAuth("outlook")}
            disabled={loading !== null}
            className="flex w-full items-center gap-4 rounded-2xl border border-[#dce1d8] bg-white p-5 text-left transition hover:border-[#b8d96e] hover:bg-[#fbfcf8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#eef6dc] text-[#2c7334]">
              <Mail className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-[#1e2b22]">Outlook / Microsoft 365</p>
              <p className="text-sm text-muted">Conecta tu agenda de Microsoft para reservar citas.</p>
            </div>
            {loading === "outlook" ? (
              <LoaderCircle className="h-5 w-5 animate-spin text-muted" />
            ) : (
              <Check className="h-5 w-5 text-[#8a9388]" />
            )}
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={() => redirectToFinalStep()}
            disabled={loading !== null}
            className="w-full rounded-xl border border-[#dce1d8] bg-white px-4 py-3 text-sm font-semibold text-muted transition hover:bg-[#fafbf8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Configurar calendario después
          </button>
        </div>
      </div>
    </div>
  );
}
