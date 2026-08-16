"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Building2, CalendarClock, LoaderCircle, MapPin, Phone, Search } from "lucide-react";
import { getPlaceDetails, searchPlaces, updateMyBusiness } from "@/lib/api";
import { consumePendingPlan, isPlanId } from "@/lib/billing-navigation";
import { detectBusinessTypeFromPlaceTypes } from "@/lib/business-type";
import type { BusinessSchedule, PlaceDetails, PlaceSearchResult, WeekDay } from "@/lib/types";

const DETECTED_BUSINESS_TYPE_KEY = "asistai_detected_business_type";
const REGISTRATION_COUNTRY_KEY = "asistai_registration_country";

const COUNTRY_OPTIONS = [
  { value: "ES", label: "España" },
  { value: "FR", label: "Francia" },
  { value: "DE", label: "Alemania" },
  { value: "IT", label: "Italia" },
  { value: "PT", label: "Portugal" },
  { value: "NL", label: "Países Bajos" },
  { value: "BE", label: "Bélgica" },
  { value: "AT", label: "Austria" },
  { value: "CH", label: "Suiza" },
  { value: "GB", label: "Reino Unido" },
  { value: "US", label: "Estados Unidos" },
  { value: "MX", label: "México" },
  { value: "OTHER", label: "Otro" },
];

const DAYS: Array<{ key: WeekDay; label: string }> = [
  { key: "monday", label: "Lunes" },
  { key: "tuesday", label: "Martes" },
  { key: "wednesday", label: "Miércoles" },
  { key: "thursday", label: "Jueves" },
  { key: "friday", label: "Viernes" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
];

function isBusinessSchedule(value: unknown): value is BusinessSchedule {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BusinessSchedule>;
  return candidate.version === 1 && Boolean(candidate.week) && DAYS.every(({ key }) => Boolean(candidate.week?.[key]));
}

function scheduleSummary(schedule: unknown) {
  if (!isBusinessSchedule(schedule)) return "Horario por defecto";
  return DAYS.map(({ key, label }) => {
    const day = schedule.week[key];
    if (!day.enabled || day.intervals.length === 0) return `${label}: cerrado`;
    return `${label}: ${day.intervals.map((interval) => `${interval.start}–${interval.end}`).join(" · ")}`;
  });
}

function useDebounce<T>(value: T, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export default function RegisterBusinessPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [selected, setSelected] = useState<PlaceDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [country, setCountry] = useState<string>("ES");
  const [isEditingCountry, setIsEditingCountry] = useState(false);
  const debouncedQuery = useDebounce(query, 350);

  useEffect(() => {
    const storedCountry = window.localStorage.getItem(REGISTRATION_COUNTRY_KEY);
    if (storedCountry) {
      setCountry(storedCountry);
      setIsEditingCountry(false);
    } else {
      setIsEditingCountry(true);
    }
  }, []);

  useEffect(() => {
    const token =
      window.localStorage.getItem("asistai_token") ??
      window.localStorage.getItem("token") ??
      window.localStorage.getItem("jwt");
    if (!token) {
      router.replace("/register");
    }
  }, [router]);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    searchPlaces(debouncedQuery, country === "OTHER" ? undefined : country)
      .then((places) => {
        if (!cancelled) setResults(places);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudieron buscar negocios. Inténtalo de nuevo.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, country]);

  const handleSelect = async (place: PlaceSearchResult) => {
    setLoading(true);
    setError("");
    setResults([]);
    setQuery(`${place.name}${place.address ? `, ${place.address}` : ""}`);

    try {
      const details = await getPlaceDetails(place.placeId);
      const detectedType = detectBusinessTypeFromPlaceTypes(details.types);
      window.localStorage.setItem(DETECTED_BUSINESS_TYPE_KEY, detectedType);
      setSelected(details);
    } catch {
      setError("No se pudieron cargar los detalles del negocio.");
      setSelected(null);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!selected) return;

    setSaving(true);
    setError("");

    try {
      const businessDetails = [selected.name, selected.address]
        .filter(Boolean)
        .join("\n");

      await updateMyBusiness({
        name: selected.name,
        phone: selected.phone ?? undefined,
        businessDetails,
        schedule: selected.schedule,
      });

      redirectToNextStep();
    } catch {
      setError("No se pudo guardar la información del negocio. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    redirectToNextStep();
  };

  const redirectToNextStep = () => {
    const hasSchedule = isBusinessSchedule(selected?.schedule);
    if (hasSchedule) {
      window.localStorage.setItem("asistai_place_schedule_imported", "true");
    } else {
      window.localStorage.removeItem("asistai_place_schedule_imported");
    }

    const planFromUrl = new URLSearchParams(window.location.search).get("plan");
    const pendingPlan = consumePendingPlan();
    const selectedPlan = isPlanId(planFromUrl) ? planFromUrl : pendingPlan;

    const params = new URLSearchParams();
    if (selectedPlan) {
      params.set("plan", selectedPlan);
    }
    if (hasSchedule) {
      params.set("hasPlaceSchedule", "true");
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    window.location.href = `/register/business/niche${query}`;
  };

  const summary = selected ? scheduleSummary(selected.schedule) : [];
  const summaryLines = Array.isArray(summary) ? summary : [];

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="panel w-full max-w-lg p-8">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1e2b22] text-[#b8d96e] shadow-sm">
            <Bot className="h-7 w-7" />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-[#1e2b22]">¿Cuál es tu negocio?</h2>
          <p className="mx-auto max-w-md text-sm leading-6 text-muted">
            Busca tu negocio para rellenar automáticamente dirección, teléfono y horario. Puedes cambiarlo luego en ajustes.
          </p>
        </div>

        <div className="mt-8">
          {isEditingCountry ? (
            <>
              <label className="text-sm font-medium text-[#344038]">País del negocio</label>
              <select
                className="field mt-2 w-full"
                value={country}
                onChange={(event) => {
                  const value = event.target.value;
                  setCountry(value);
                  window.localStorage.setItem(REGISTRATION_COUNTRY_KEY, value);
                  setSelected(null);
                  setIsEditingCountry(false);
                }}
              >
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-[#dce7d2] bg-[#fbfcf8] px-4 py-3">
              <div>
                <p className="text-xs text-[#8a9388]">País de búsqueda</p>
                <p className="text-sm font-semibold text-[#344038]">
                  {COUNTRY_OPTIONS.find((option) => option.value === country)?.label ?? country}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingCountry(true)}
                className="text-sm font-semibold text-[#1e2b22] transition hover:text-[#243026]"
              >
                Cambiar
              </button>
            </div>
          )}
        </div>

        <div className="relative mt-4">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-5 w-5 text-[#8a9388]" />
          </div>
          <input
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (selected) setSelected(null);
            }}
            placeholder="Nombre del negocio o dirección"
            className="field w-full pl-10"
          />
          {loading && !selected && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
              <LoaderCircle className="h-5 w-5 animate-spin text-[#405115]" />
            </div>
          )}

          {results.length > 0 && !selected && (
            <ul className="absolute z-10 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-[#dce1d8] bg-white shadow-lg">
              {results.map((place) => (
                <li key={place.placeId}>
                  <button
                    type="button"
                    onClick={() => handleSelect(place)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-[#fbfcf8]"
                  >
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                    <div>
                      <p className="text-sm font-semibold text-[#344038]">{place.name}</p>
                      {place.address && <p className="text-xs text-muted">{place.address}</p>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <div className="mt-6 space-y-4 rounded-2xl border border-[#dce7d2] bg-[#fbfcf8] p-5">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-5 w-5 text-[#405115]" />
              <div>
                <p className="text-sm font-semibold text-[#344038]">{selected.name}</p>
                {selected.address && (
                  <p className="mt-0.5 flex items-start gap-1.5 text-sm text-muted">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {selected.address}
                  </p>
                )}
                {selected.phone && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    {selected.phone}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 h-5 w-5 text-[#405115]" />
              <div className="text-sm text-muted">
                {summaryLines.length > 0 ? (
                  <ul className="space-y-0.5">
                    {summaryLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Horario no disponible</p>
                )}
              </div>
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selected || saving}
            className="btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Confirmar y continuar"}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={saving}
            className="w-full rounded-xl border border-[#dce1d8] bg-white px-4 py-3 text-sm font-semibold text-muted transition hover:bg-[#fafbf8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            No encontré mi negocio / configurar después
          </button>
        </div>
      </div>
    </div>
  );
}
