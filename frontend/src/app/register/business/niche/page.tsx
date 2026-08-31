"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, LoaderCircle, Store } from "lucide-react";
import { updateMyBusiness } from "@/lib/api";
import { consumePendingPlan, isPlanId } from "@/lib/billing-navigation";
import {
  BUSINESS_TYPE_LABELS,
  type BusinessType,
} from "@/lib/business-type";

const REGISTRATION_NICHE_KEY = "alhabla_registration_niche";
const DETECTED_BUSINESS_TYPE_KEY = "alhabla_detected_business_type";

const SELECTABLE_TYPES: BusinessType[] = [
  "centro-de-estetica",
  "fisioterapia",
  "peluqueria",
  "barberia",
  "salon-de-unas",
  "other",
];

export default function RegisterBusinessNichePage() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<BusinessType | null>(null);
  const [selectionSource, setSelectionSource] = useState<"landing" | "places" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<string | null>(null);
  const [hasPlaceSchedule, setHasPlaceSchedule] = useState(false);

  useEffect(() => {
    const token =
      window.localStorage.getItem("alhabla_token") ??
      window.localStorage.getItem("token") ??
      window.localStorage.getItem("jwt");
    if (!token) {
      router.replace("/register");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const planFromUrl = params.get("plan");
    const pendingPlan = consumePendingPlan();
    const selectedPlan = isPlanId(planFromUrl) ? planFromUrl : pendingPlan;
    setPlan(selectedPlan);
    setHasPlaceSchedule(params.get("hasPlaceSchedule") === "true");

    const storedNiche = window.localStorage.getItem(REGISTRATION_NICHE_KEY);
    const detectedType = window.localStorage.getItem(DETECTED_BUSINESS_TYPE_KEY);
    if (storedNiche && storedNiche !== "other") {
      setSelectedType(storedNiche as BusinessType);
      setSelectionSource("landing");
    } else if (detectedType && detectedType !== "other") {
      setSelectedType(detectedType as BusinessType);
      setSelectionSource("places");
    }
  }, [router]);

  const handleConfirm = async (type: BusinessType) => {
    setSaving(true);
    setError("");

    try {
      await updateMyBusiness({ businessType: type });
      window.localStorage.removeItem(REGISTRATION_NICHE_KEY);
      window.localStorage.removeItem(DETECTED_BUSINESS_TYPE_KEY);
      redirectToNextStep(type);
    } catch {
      setError("No se pudo guardar el tipo de negocio. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const redirectToNextStep = (type: BusinessType) => {
    const params = new URLSearchParams();
    if (plan) {
      params.set("plan", plan);
    }
    params.set("businessType", type);
    if (hasPlaceSchedule) {
      params.set("hasPlaceSchedule", "true");
    }
    window.location.href = `/register/business/services?${params.toString()}`;
  };

  const isConfirmationMode = selectedType !== null && selectedType !== "other";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="panel w-full max-w-lg p-8">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f3eeff] text-[#8b5cf6]">
            <Store className="h-7 w-7" />
          </div>
          <h2 className="text-3xl font-black tracking-tight text-[#0a0a0a]">
            ¿Qué tipo de negocio tienes?
          </h2>
          <p className="mx-auto max-w-md text-sm leading-6 text-muted">
            Adaptamos la recepción a tu sector para que el asistente hable el mismo idioma que tus clientes.
          </p>
        </div>

        {isConfirmationMode ? (
          <div className="mt-8 space-y-6">
            <div className="rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-6 text-center">
              <p className="text-sm text-muted">
                {selectionSource === "places"
                  ? "Hemos detectado que tu negocio es una"
                  : "El asistente sería para una"}
              </p>
              <p className="mt-2 text-2xl font-black text-[#0a0a0a]">
                {BUSINESS_TYPE_LABELS[selectedType]}
              </p>
              {selectionSource === "places" ? (
                <p className="mt-2 text-xs text-[#a1a1aa]">
                  Basado en la información de Google Maps
                </p>
              ) : null}
            </div>

            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => handleConfirm(selectedType)}
                disabled={saving}
                className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Sí, continuar
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSelectedType(null)}
                disabled={saving}
                className="btn-secondary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                No, cambiar tipo de negocio
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {SELECTABLE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleConfirm(type)}
                disabled={saving}
                className="flex w-full items-center justify-between rounded-2xl border border-[#e5e5e5] bg-white px-5 py-4 text-left transition hover:border-[#8b5cf6] hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="font-semibold text-[#27272a]">
                  {BUSINESS_TYPE_LABELS[type]}
                </span>
                <Bot className="h-4 w-4 text-[#a1a1aa]" />
              </button>
            ))}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-[#c53030]">{error}</p>}
      </div>
    </div>
  );
}
