"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarClock,
  LoaderCircle,
  MapPin,
  Phone,
  Search,
} from "lucide-react";
import { LottieAnimation } from "@/components/lottie-animation";
import { getPlaceDetails, searchPlaces, updateMyBusiness } from "@/lib/api";
import { consumePendingPlan, isPlanId } from "@/lib/billing-navigation";
import { detectBusinessTypeFromPlaceTypes } from "@/lib/business-type";
import type {
  BusinessSchedule,
  PlaceDetails,
  PlaceSearchResult,
  WeekDay,
} from "@/lib/types";

const DETECTED_BUSINESS_TYPE_KEY = "alhabla_detected_business_type";

// Cuánto tiempo esperamos a que el navegador resuelva la geolocalización
// antes de rendirnos y mostrar el selector de país como alternativa.
const GEOLOCATION_TIMEOUT_MS = 8_000;

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
  return (
    candidate.version === 1 &&
    Boolean(candidate.week) &&
    DAYS.every(({ key }) => Boolean(candidate.week?.[key]))
  );
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

type LocationStatus = "detecting" | "geolocated" | "fallback";

export default function RegisterBusinessPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [selected, setSelected] = useState<PlaceDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [country, setCountry] = useState<string>("ES");
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("detecting");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const debouncedQuery = useDebounce(query, 350);

  // Preferimos geolocalizar al negocio en vez de preguntarle el país: menos
  // fricción y más preciso (sesga la búsqueda a su zona, no a todo un país).
  // Si no hay soporte, el usuario deniega el permiso o el navegador tarda
  // demasiado, caemos al selector de país como alternativa — nunca bloquea
  // la búsqueda.
  useEffect(() => {
    let cancelled = false;

    const fallbackToCountrySelect = () => {
      if (!cancelled) setLocationStatus("fallback");
    };

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      fallbackToCountrySelect();
      return;
    }

    const requestPosition = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return;
          setCoords({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          setLocationStatus("geolocated");
        },
        () => fallbackToCountrySelect(),
        { enableHighAccuracy: false, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 5 * 60 * 1000 }
      );
    };

    // La Permissions API evita reintentar un permiso ya denegado antes (no
    // todos los navegadores la soportan para "geolocation" — Safari no —
    // así que si falta, simplemente pedimos la posición y dejamos que
    // getCurrentPosition gestione el permiso).
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((status) => {
          if (cancelled) return;
          if (status.state === "denied") {
            fallbackToCountrySelect();
          } else {
            requestPosition();
          }
        })
        .catch(() => requestPosition());
    } else {
      requestPosition();
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const token =
      window.localStorage.getItem("alhabla_token") ??
      window.localStorage.getItem("token") ??
      window.localStorage.getItem("jwt");
    if (!token) {
      router.replace("/register");
    }
  }, [router]);

  useEffect(() => {
    if (!debouncedQuery.trim() || locationStatus === "detecting") {
      setResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    const location =
      locationStatus === "geolocated" && coords
        ? { latitude: coords.latitude, longitude: coords.longitude }
        : country !== "OTHER"
          ? { countryCode: country }
          : undefined;

    searchPlaces(debouncedQuery, location)
      .then((places) => {
        if (!cancelled) setResults(places);
      })
      .catch(() => {
        if (!cancelled)
          setError("No se pudieron buscar negocios. Inténtalo de nuevo.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, locationStatus, coords, country]);

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
      setError(
        "No se pudo guardar la información del negocio. Inténtalo de nuevo."
      );
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
      window.localStorage.setItem("alhabla_place_schedule_imported", "true");
    } else {
      window.localStorage.removeItem("alhabla_place_schedule_imported");
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
          <LottieAnimation
            src="/animations/landing/GoogleMaposIcon.json"
            className="mx-auto h-16 w-16"
          />
          <h2 className="text-3xl font-black tracking-tight text-[#0a0a0a]">
            ¿Cuál es tu negocio?
          </h2>
          <p className="mx-auto max-w-md text-sm leading-6 text-muted">
            Busca tu negocio para rellenar automáticamente dirección, teléfono y
            horario. Puedes cambiarlo luego en ajustes.
          </p>
        </div>

        {locationStatus === "detecting" ? (
          <div className="mt-8 flex items-center justify-center gap-2 rounded-2xl border border-[#e5e5e5] bg-[#fafafa] px-4 py-3 text-sm text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin text-[#8b5cf6]" />
            Detectando tu ubicación para buscar cerca de ti…
          </div>
        ) : locationStatus === "fallback" ? (
          <div className="mt-8">
            <label className="text-sm font-medium text-[#27272a]">
              País del negocio
            </label>
            <select
              className="field mt-2 w-full"
              value={country}
              onChange={(event) => {
                setCountry(event.target.value);
                setSelected(null);
              }}
            >
              {COUNTRY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              No pudimos usar tu ubicación. Elige el país para buscar tu negocio.
            </p>
          </div>
        ) : null}

        <div className="relative mt-4">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-5 w-5 text-[#a1a1aa]" />
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
              <LoaderCircle className="h-5 w-5 animate-spin text-[#8b5cf6]" />
            </div>
          )}

          {results.length > 0 && !selected && (
            <ul className="absolute z-10 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-[#e5e5e5] bg-white shadow-lg">
              {results.map((place) => (
                <li key={place.placeId}>
                  <button
                    type="button"
                    onClick={() => handleSelect(place)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-[#fafafa]"
                  >
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                    <div>
                      <p className="text-sm font-semibold text-[#27272a]">
                        {place.name}
                      </p>
                      {place.address && (
                        <p className="text-xs text-muted">{place.address}</p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <div className="mt-6 space-y-4 rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-5">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-5 w-5 text-[#8b5cf6]" />
              <div>
                <p className="text-sm font-semibold text-[#27272a]">
                  {selected.name}
                </p>
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
              <CalendarClock className="mt-0.5 h-5 w-5 text-[#8b5cf6]" />
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

        {error && <p className="mt-4 text-sm text-[#c53030]">{error}</p>}

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
            className="btn-secondary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
          >
            No encontré mi negocio / configurar después
          </button>
        </div>
      </div>
    </div>
  );
}
