"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, LoaderCircle, Users } from "lucide-react";
import { createBookingProfessional, updateMyBusiness } from "@/lib/api";
import { BUSINESS_TYPE_ONBOARDING_TEXTS, isBusinessType } from "@/lib/business-type";
import type { BusinessType } from "@/lib/types";

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
      window.localStorage.getItem("asistai_token") ??
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
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[#1e2b22] text-[#b8d96e] shadow-sm">
            <Users className="h-7 w-7" />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-[#1e2b22]">
            {texts.team.heading}
          </h2>
          <p className="mx-auto max-w-md text-sm leading-6 text-[#687267]">
            {texts.team.subheading}
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <div>
            <label className="text-sm font-medium text-[#344038]">{texts.team.employeeLabel}</label>
            <select
              className="field mt-2 w-full"
              value={employees}
              onChange={(event) => setEmployees(Number(event.target.value))}
            >
              {Array.from({ length: 20 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value} {value === 1 ? "persona" : "personas"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-[#344038]">Capacidad de reservas simultáneas</label>
            <select
              className="field mt-2 w-full"
              value={capacity}
              onChange={(event) => setCapacity(Number(event.target.value))}
            >
              {Array.from({ length: 50 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value} {value === 1 ? "reserva a la vez" : "reservas a la vez"}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[#687267]">
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
            className="w-full rounded-xl border border-[#dce1d8] bg-white px-4 py-3 text-sm font-semibold text-[#687267] transition hover:bg-[#fafbf8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Configurar equipo después
          </button>
        </div>
      </div>
    </div>
  );
}
