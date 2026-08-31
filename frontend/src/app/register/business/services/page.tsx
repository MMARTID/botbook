"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, LoaderCircle, Scissors, Sparkles } from "lucide-react";
import { createBookingService } from "@/lib/api";
import { getPendingPlan, isPlanId } from "@/lib/billing-navigation";
import { BUSINESS_TYPE_ONBOARDING_TEXTS, isBusinessType } from "@/lib/business-type";
import { getServiceTemplate, type ServiceTemplate } from "@/lib/service-templates";
import type { BusinessType } from "@/lib/types";

const REGISTRATION_NICHE_KEY = "alhabla_registration_niche";
const DETECTED_BUSINESS_TYPE_KEY = "alhabla_detected_business_type";

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}min` : `${hours}h`;
}

export default function RegisterBusinessServicesPage() {
  const router = useRouter();
  const [businessType, setBusinessType] = useState<BusinessType>("other");
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
    const selectedPlan = isPlanId(planFromUrl) ? planFromUrl : getPendingPlan();
    setHasPlaceSchedule(params.get("hasPlaceSchedule") === "true");

    const typeFromUrl = params.get("businessType");
    const storedNiche = window.localStorage.getItem(REGISTRATION_NICHE_KEY);
    const detectedType = window.localStorage.getItem(DETECTED_BUSINESS_TYPE_KEY);

    const resolvedType =
      (typeFromUrl && isBusinessType(typeFromUrl) ? typeFromUrl : null) ??
      (storedNiche && isBusinessType(storedNiche) ? storedNiche : null) ??
      (detectedType && isBusinessType(detectedType) ? detectedType : null) ??
      "other";

    setBusinessType(resolvedType);
    const serviceTemplates = getServiceTemplate(resolvedType);
    setTemplates(serviceTemplates);
    setSelected(new Set(serviceTemplates.map((service) => service.name)));

    if (selectedPlan) {
      window.localStorage.setItem("alhabla_pending_plan", selectedPlan);
    }
  }, [router]);

  const toggleService = (name: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const redirectToNextStep = () => {
    const params = new URLSearchParams();
    params.set("businessType", businessType);
    if (hasPlaceSchedule) {
      params.set("hasPlaceSchedule", "true");
    }
    window.location.href = `/register/business/team?${params.toString()}`;
  };

  const handleConfirm = async () => {
    if (selected.size === 0) {
      redirectToNextStep();
      return;
    }

    setSaving(true);
    setError("");

    try {
      const servicesToCreate = templates.filter((service) => selected.has(service.name));
      await Promise.all(
        servicesToCreate.map((service) =>
          createBookingService({
            name: service.name,
            durationMinutes: service.durationMinutes,
            active: true,
          })
        )
      );
      window.localStorage.removeItem(REGISTRATION_NICHE_KEY);
      window.localStorage.removeItem(DETECTED_BUSINESS_TYPE_KEY);
      redirectToNextStep();
    } catch {
      setError("No se pudieron guardar los servicios. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const texts = BUSINESS_TYPE_ONBOARDING_TEXTS[businessType];
  const ctaLabel = texts.services.cta
    .replace("{count}", String(selected.size))
    .replace("{s}", selected.size === 1 ? "" : "s");

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="panel w-full max-w-lg p-8">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f3eeff] text-[#8b5cf6]">
            <Scissors className="h-7 w-7" />
          </div>
          <h2 className="text-3xl font-black tracking-tight text-[#0a0a0a]">
            {texts.services.heading}
          </h2>
          <p className="mx-auto max-w-md text-sm leading-6 text-muted">
            {texts.services.subheading}
          </p>
        </div>

        <div className="mt-8 max-h-72 overflow-y-auto pr-1">
          <div className="flex flex-wrap gap-2">
            {templates.map((service) => {
              const isSelected = selected.has(service.name);
              return (
                <button
                  key={service.name}
                  type="button"
                  onClick={() => toggleService(service.name)}
                  disabled={saving}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    isSelected
                      ? "border-[#0a0a0a] bg-[#0a0a0a] text-white"
                      : "border-[#e5e5e5] bg-white text-[#27272a] hover:bg-[#fafafa]"
                  }`}
                >
                  {isSelected ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-[#a1a1aa]" />
                  )}
                  <span>{service.name}</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                      isSelected ? "bg-white/20 text-white" : "bg-[#f3eeff] text-[#6d28d9]"
                    }`}
                  >
                    <Clock className="h-3 w-3" />
                    {formatDuration(service.durationMinutes)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {selected.size === 0 && (
          <p className="mt-4 text-sm text-[#a1a1aa]">
            No has seleccionado ningún servicio. Puedes añadirlos más tarde en ajustes.
          </p>
        )}

        {error && <p className="mt-4 text-sm text-[#c53030]">{error}</p>}

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              ctaLabel
            )}
          </button>
          <button
            type="button"
            onClick={() => redirectToNextStep()}
            disabled={saving}
            className="btn-secondary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
          >
            Configurar servicios después
          </button>
        </div>
      </div>
    </div>
  );
}
