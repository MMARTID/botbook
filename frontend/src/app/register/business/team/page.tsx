"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, LoaderCircle, Users } from "lucide-react";
import { createBookingProfessional, updateMyBusiness } from "@/lib/api";
import { BUSINESS_TYPE_ONBOARDING_TEXTS, isBusinessType } from "@/lib/business-type";
import type { BusinessType } from "@/lib/types";

const EMPLOYEES_MIN = 1;
const EMPLOYEES_MAX = 20;
const CAPACITY_MIN = 1;
const CAPACITY_MAX = 50;

function sliderBackground(value: number, minimum: number, maximum: number) {
  const progress = ((value - minimum) / (maximum - minimum)) * 100;

  return {
    background: `linear-gradient(to right, #b8d96e 0%, #b8d96e ${progress}%, #dce4d7 ${progress}%, #dce4d7 100%)`,
  };
}

export default function RegisterBusinessTeamPage() {
  const router = useRouter();
  const [businessType, setBusinessType] = useState<BusinessType>("other");
  const [employees, setEmployees] = useState(2);
  const [capacity, setCapacity] = useState(1);
  const [saving, setSaving] = useState(false);
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

  const redirectToNextStep = () => {
    const params = new URLSearchParams();
    params.set("businessType", businessType);
    if (hasPlaceSchedule) {
      params.set("hasPlaceSchedule", "true");
    }
    window.location.href = `/register/business/calendar?${params.toString()}`;
  };

  const handleConfirm = async () => {
    setSaving(true);
    setError("");

    try {
      await updateMyBusiness({ bookingCapacity: capacity });

      const professionals = Array.from({ length: employees }, (_, index) => ({
        name: `Profesional ${index + 1}`,
        active: true,
        serviceIds: [] as string[],
      }));

      await Promise.all(professionals.map((professional) => createBookingProfessional(professional)));

      redirectToNextStep();
    } catch {
      setError("No se pudo guardar el equipo. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const texts = BUSINESS_TYPE_ONBOARDING_TEXTS[businessType];

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="panel w-full max-w-lg p-8">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1e2b22] text-[#b8d96e] shadow-sm">
            <Users className="h-7 w-7" />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-[#1e2b22]">
            {texts.team.heading}
          </h2>
          <p className="mx-auto max-w-md text-sm leading-6 text-muted">
            {texts.team.subheading}
          </p>
        </div>

        <div className="mt-8 space-y-7">
          <div className="rounded-xl border border-[#e2e9dc] bg-[#f8faf5] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <label htmlFor="employees" className="text-sm font-semibold leading-5 text-[#344038]">
                {texts.team.employeeLabel}
              </label>
              <output htmlFor="employees" className="shrink-0 text-2xl font-semibold tracking-tight text-[#1e2b22]">
                {employees} {employees === 1 ? "persona" : "personas"}
              </output>
            </div>
            <input
              id="employees"
              type="range"
              min={EMPLOYEES_MIN}
              max={EMPLOYEES_MAX}
              step={1}
              value={employees}
              onChange={(event) => setEmployees(Number(event.target.value))}
              aria-valuetext={`${employees} ${employees === 1 ? "persona" : "personas"}`}
              className="mt-6 h-11 w-full cursor-pointer appearance-none rounded-full bg-transparent accent-[#1e2b22] transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#b8d96e]/60 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[#1e2b22] [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:transition-transform [&::-moz-range-thumb]:duration-150 [&::-moz-range-thumb]:ease-out [&::-moz-range-thumb]:hover:scale-110 [&::-moz-range-thumb]:active:scale-95 [&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#1e2b22] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:ease-out [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:active:scale-95 [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:transition-all [&::-webkit-slider-runnable-track]:duration-150 [&::-webkit-slider-runnable-track]:ease-out"
              style={sliderBackground(employees, EMPLOYEES_MIN, EMPLOYEES_MAX)}
            />
            <div className="mt-3 flex justify-between text-xs font-medium text-[#54634b]" aria-hidden="true">
              <span>{EMPLOYEES_MIN} persona</span>
              <span>{EMPLOYEES_MAX} personas</span>
            </div>
          </div>

          <div className="rounded-xl border border-[#e2e9dc] bg-[#f8faf5] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <label htmlFor="capacity" className="text-sm font-semibold leading-5 text-[#344038]">
                Capacidad de reservas simultáneas
              </label>
              <output htmlFor="capacity" className="shrink-0 text-2xl font-semibold tracking-tight text-[#1e2b22]">
                {capacity} {capacity === 1 ? "reserva a la vez" : "reservas a la vez"}
              </output>
            </div>
            <input
              id="capacity"
              type="range"
              min={CAPACITY_MIN}
              max={CAPACITY_MAX}
              step={1}
              value={capacity}
              onChange={(event) => setCapacity(Number(event.target.value))}
              aria-valuetext={`${capacity} ${capacity === 1 ? "reserva a la vez" : "reservas a la vez"}`}
              className="mt-6 h-11 w-full cursor-pointer appearance-none rounded-full bg-transparent accent-[#1e2b22] transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#b8d96e]/60 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[#1e2b22] [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:transition-transform [&::-moz-range-thumb]:duration-150 [&::-moz-range-thumb]:ease-out [&::-moz-range-thumb]:hover:scale-110 [&::-moz-range-thumb]:active:scale-95 [&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#1e2b22] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:ease-out [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:active:scale-95 [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:transition-all [&::-webkit-slider-runnable-track]:duration-150 [&::-webkit-slider-runnable-track]:ease-out"
              style={sliderBackground(capacity, CAPACITY_MIN, CAPACITY_MAX)}
            />
            <div className="mt-3 flex justify-between text-xs font-medium text-[#54634b]" aria-hidden="true">
              <span>{CAPACITY_MIN} reserva</span>
              <span>{CAPACITY_MAX} reservas</span>
            </div>
            <p className="mt-3 text-xs text-muted">
              Máximo de citas que pueden coincidir en el mismo horario.
            </p>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

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
              <>
                <CalendarClock className="mr-2 h-4 w-4" />
                {texts.team.cta}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => redirectToNextStep()}
            disabled={saving}
            className="w-full rounded-xl border border-[#dce1d8] bg-white px-4 py-3 text-sm font-semibold text-muted transition hover:bg-[#fafbf8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Configurar equipo después
          </button>
        </div>
      </div>
    </div>
  );
}
