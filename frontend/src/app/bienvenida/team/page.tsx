"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PasoDelAlta } from "@/components/paso-del-alta";
import { ArrowRight, CalendarClock, LoaderCircle, Users } from "lucide-react";
import { createBookingProfessional, getBookingSettings, updateMyBusiness } from "@/lib/api";
import { getPlanLimitInfo, planLimitUpgradeMessage } from "@/lib/plan-limit";
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
  const [capacity, setCapacity] = useState(2);
  const [capacityTouched, setCapacityTouched] = useState(false);
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
    const typeFromUrl = params.get("businessType");
    setHasPlaceSchedule(params.get("hasPlaceSchedule") === "true");

    if (typeFromUrl && isBusinessType(typeFromUrl)) {
      setBusinessType(typeFromUrl);
    }
  }, [router]);

  // La capacidad sigue al número de profesionales por defecto — sin esto, un
  // negocio con varios profesionales se queda con la capacidad en 1 (el
  // valor inicial del slider) salvo que el usuario también toque el segundo
  // slider, y check_availability rechaza citas con profesionales libres
  // porque "ya tiene todas sus plazas ocupadas". En cuanto el usuario mueve
  // el slider de capacidad a mano, deja de seguir a employees — sigue
  // pudiendo fijar menos plazas que profesionales a propósito (ej. un solo
  // sillón compartido por turnos).
  useEffect(() => {
    if (!capacityTouched) {
      setCapacity(employees);
    }
  }, [employees, capacityTouched]);

  const handleCapacityChange = (value: number) => {
    setCapacityTouched(true);
    setCapacity(value);
  };

  const redirectToNextStep = () => {
    const params = new URLSearchParams();
    params.set("businessType", businessType);
    if (hasPlaceSchedule) {
      params.set("hasPlaceSchedule", "true");
    }
    window.location.href = `/bienvenida/calendar?${params.toString()}`;
  };

  const handleConfirm = async () => {
    setSaving(true);
    setError("");

    try {
      await updateMyBusiness({ bookingCapacity: capacity });

      // No se manda ningún vínculo con servicios a propósito: para el backend,
      // un profesional sin nivel explícito en un servicio «lo hace» (se le
      // puede reservar si lo piden por su nombre), así que check_availability
      // ya encuentra a todo el equipo disponible desde la primera llamada.
      // Marcar especialistas o retirar a alguien de las sugerencias se hace
      // después, en Agente → Profesionales.
      const { professionals: existingProfessionals } = await getBookingSettings();
      const existingNames = new Set(existingProfessionals.map((professional) => professional.name));

      // Igual que los servicios, el lote puede quedar parcialmente creado si
      // falla una petición. Reintentar solo completa los profesionales que
      // faltan en vez de duplicar los que ya existen.
      const professionals = Array.from({ length: employees }, (_, index) => {
        const name = `Profesional ${index + 1}`;
        return { name, active: true };
      }).filter((professional) => !existingNames.has(professional.name));

      const results = await Promise.allSettled(
        professionals.map((professional) => createBookingProfessional(professional)),
      );
      const rejections = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (rejections.length > 0) {
        // Si el fallo es el límite de profesionales del plan, el mensaje debe
        // invitar a subir de plan, no pedir un reintento que fallará igual.
        const planLimit = rejections
          .map((rejection) => getPlanLimitInfo(rejection.reason))
          .find((info) => info !== null);
        if (planLimit) {
          setError(
            planLimit.limit != null
              ? `${planLimitUpgradeMessage(planLimit)} Ajusta el equipo a ${planLimit.limit} para continuar, o amplía el plan después desde Ajustes → Facturación.`
              : planLimitUpgradeMessage(planLimit),
          );
          setSaving(false);
          return;
        }
        throw new Error("No se pudieron guardar todos los profesionales.");
      }

      redirectToNextStep();
    } catch {
      setError("No se pudo guardar el equipo. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const texts = BUSINESS_TYPE_ONBOARDING_TEXTS[businessType];

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="panel w-full max-w-lg p-6 sm:p-8">
        <PasoDelAlta paso={4} />
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
            <Users className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">
            {texts.team.heading}
          </h1>
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
            onChange={handleCapacityChange}
            ariaValueText={`${capacity} ${capacity === 1 ? "reserva a la vez" : "reservas a la vez"}`}
            displayValue={`${capacity} ${capacity === 1 ? "reserva a la vez" : "reservas a la vez"}`}
            minLabel={`${CAPACITY_MIN} reserva`}
            maxLabel={`${CAPACITY_MAX} reservas`}
            hint="Máximo de citas que pueden coincidir en el mismo horario."
          />
        </div>

        {error && <p role="alert" className="mt-4 text-sm text-[#c53030]">{error}</p>}

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="btn-primary w-full"
          >
            {saving ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : (
              <>
                {texts.team.cta}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => redirectToNextStep()}
            disabled={saving}
            className="btn-secondary w-full"
          >
            Configurar equipo después
          </button>
        </div>
      </div>
    </main>
  );
}
