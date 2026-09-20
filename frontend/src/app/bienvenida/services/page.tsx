"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, LoaderCircle, Plus, Scissors } from "lucide-react";
import { createBookingService, getBookingSettings } from "@/lib/api";
import { getPendingPlan, isPlanId } from "@/lib/billing-navigation";
import { BUSINESS_TYPE_ONBOARDING_TEXTS, isBusinessType } from "@/lib/business-type";
import { getServiceTemplateCategories, type ServiceTemplateCategory } from "@/lib/service-templates";
import type { BusinessType } from "@/lib/types";

const REGISTRATION_NICHE_KEY = "alhabla_registration_niche";
const DETECTED_BUSINESS_TYPE_KEY = "alhabla_detected_business_type";
const MIN_SERVICES_REQUIRED = 4;

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}min` : `${hours}h`;
}

export default function RegisterBusinessServicesPage() {
  const router = useRouter();
  const [businessType, setBusinessType] = useState<BusinessType>("other");
  const [categories, setCategories] = useState<ServiceTemplateCategory[]>([]);
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
      router.replace("/login");
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
    // Empieza vacío a propósito: antes marcábamos todo el preset por
    // defecto y se pedía "quitar lo que no aplique", una interacción que
    // confundía (el botón pasa de blanco a negro según seleccionas) y
    // llevaba a negocios a dejar fuera servicios reales que sí ofrecen —
    // el agente terminaba sin poder reservarlos. Ahora es una selección
    // activa: solo entra lo que el negocio marca explícitamente.
    setCategories(getServiceTemplateCategories(resolvedType));
    setSelected(new Set());

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
    window.location.href = `/bienvenida/team?${params.toString()}`;
  };

  const handleConfirm = async () => {
    if (selected.size < MIN_SERVICES_REQUIRED) return;

    setSaving(true);
    setError("");

    try {
      const allTemplates = categories.flatMap((category) => category.services);
      // Una petición puede terminar bien aunque otra del lote falle. Consultar
      // antes de reintentar evita duplicar los servicios que ya llegaron a
      // guardarse en ese intento parcial.
      const { services: existingServices } = await getBookingSettings();
      const existingNames = new Set(existingServices.map((service) => service.name));
      const servicesToCreate = allTemplates.filter(
        (service) => selected.has(service.name) && !existingNames.has(service.name),
      );
      // Uno por uno, NO en paralelo: cada servicio creado dispara una
      // sincronización completa del agente de Retell (borrador -> publicar)
      // para el mismo agente, y dos de esas sincronizaciones a la vez para
      // el mismo agente compiten entre sí — Retell responde "Cannot update
      // published LLM" cuando una publica justo entre que la otra lee el
      // borrador y lo actualiza. Antes casi nunca se disparaba (la
      // selección venía premarcada y "configurar después" evitaba crear
      // varios de golpe); con la selección mínima de 4 pasó a ser el
      // camino normal, y encontrado 2026-09-14 probando el onboarding real.
      let anyFailed = false;
      for (const service of servicesToCreate) {
        try {
          await createBookingService({
            name: service.name,
            durationMinutes: service.durationMinutes,
            active: true,
          });
        } catch {
          anyFailed = true;
        }
      }
      if (anyFailed) {
        throw new Error("No se pudieron guardar todos los servicios.");
      }
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
  const missing = Math.max(0, MIN_SERVICES_REQUIRED - selected.size);
  const canContinue = selected.size >= MIN_SERVICES_REQUIRED;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="panel w-full max-w-xl p-8">
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

        <div className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold">
          <span
            className={`rounded-full px-3 py-1 ${
              canContinue ? "bg-[#ecfdf3] text-[#2c7334]" : "bg-[#f3eeff] text-[#6d28d9]"
            }`}
          >
            {canContinue
              ? `${selected.size} servicios seleccionados`
              : `Selecciona al menos ${MIN_SERVICES_REQUIRED} servicios · llevas ${selected.size} de ${MIN_SERVICES_REQUIRED}`}
          </span>
        </div>

        <div className="mt-6 max-h-96 space-y-5 overflow-y-auto pr-1">
          {categories.map((category) => (
            <div key={category.category}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                {category.category}
              </h3>
              <div className="flex flex-wrap gap-2">
                {category.services.map((service) => {
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
                          : "border-[#e5e5e5] bg-white text-[#27272a] hover:border-[#8b5cf6] hover:bg-[#fafafa]"
                      }`}
                    >
                      {isSelected ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Plus className="h-3.5 w-3.5 text-[#a1a1aa]" />
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
          ))}
        </div>

        {!canContinue && (
          <p className="mt-4 text-center text-sm text-muted">
            Marca los servicios que sí ofreces — te faltan {missing}. Podrás añadir o editar el resto más tarde en ajustes.
          </p>
        )}

        {error && <p className="mt-4 text-sm text-[#c53030]">{error}</p>}

        <div className="mt-8">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || !canContinue}
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
        </div>
      </div>
    </div>
  );
}
