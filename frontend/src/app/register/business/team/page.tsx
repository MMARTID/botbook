"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, LoaderCircle, Users } from "lucide-react";
import { createBookingProfessional, getBookingSettings, updateMyBusiness } from "@/lib/api";
import { BUSINESS_TYPE_ONBOARDING_TEXTS, isBusinessType } from "@/lib/business-type";
import { RangeSlider } from "@/components/range-slider";
import type { BusinessType } from "@/lib/types";

const EMPLOYEES_MIN = 1;
const EMPLOYEES_MAX = 20;
const CAPACITY_MIN = 1;
const CAPACITY_MAX = 50;

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
      window.localStorage.getItem("alhabla_token") ??
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

      // Se asume que cualquier profesional puede atender cualquiera de los
      // servicios ya elegidos en el paso anterior — sin esto, un negocio
      // recién registrado no tiene ningún profesional vinculado a ningún
      // servicio y check_availability falla siempre con
      // NO_AVAILABLE_PROFESSIONAL en la primera llamada real. Se puede
      // afinar después en Ajustes.
      const { services } = await getBookingSettings();
      const serviceIds = services.map((service) => service.id);

      const professionals = Array.from({ length: employees }, (_, index) => ({
        name: `Profesional ${index + 1}`,
        active: true,
        serviceIds,
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
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f3eeff] text-[#8b5cf6]">
            <Users className="h-7 w-7" />
          </div>
          <h2 className="text-3xl font-black tracking-tight text-[#0a0a0a]">
            {texts.team.heading}
          </h2>
          <p className="mx-auto max-w-md text-sm leading-6 text-muted">
            {texts.team.subheading}
          </p>
        </div>

        <div className="mt-8 space-y-5">
          <RangeSlider
            id="employees"
            icon={Users}
            label={texts.team.employeeLabel}
            value={employees}
            min={EMPLOYEES_MIN}
            max={EMPLOYEES_MAX}
            step={1}
            onChange={setEmployees}
            ariaValueText={`${employees} ${employees === 1 ? "persona" : "personas"}`}
            displayValue={`${employees} ${employees === 1 ? "persona" : "personas"}`}
            minLabel={`${EMPLOYEES_MIN} persona`}
            maxLabel={`${EMPLOYEES_MAX} personas`}
          />

          <RangeSlider
            id="capacity"
            icon={CalendarClock}
            label="Capacidad de reservas simultáneas"
            value={capacity}
            min={CAPACITY_MIN}
            max={CAPACITY_MAX}
            step={1}
            onChange={setCapacity}
            ariaValueText={`${capacity} ${capacity === 1 ? "reserva a la vez" : "reservas a la vez"}`}
            displayValue={`${capacity} ${capacity === 1 ? "reserva a la vez" : "reservas a la vez"}`}
            minLabel={`${CAPACITY_MIN} reserva`}
            maxLabel={`${CAPACITY_MAX} reservas`}
            hint="Máximo de citas que pueden coincidir en el mismo horario."
          />
        </div>

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
            className="btn-secondary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
          >
            Configurar equipo después
          </button>
        </div>
      </div>
    </div>
  );
}
