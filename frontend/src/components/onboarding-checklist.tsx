"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Check,
  ScissorsLineDashed,
  UserRoundCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { dismissOnboarding, getOnboardingState } from "@/lib/api";
import type { OnboardingSteps } from "@/lib/types";

type PasoOnboarding = {
  clave: keyof OnboardingSteps;
  titulo: string;
  descripcion: string;
  href: string;
  icono: LucideIcon;
};

// Mismo orden e iconos que las secciones de /ajustes, para que el salto desde
// aquí lleve a algo reconocible. Los `section` son los ids reales de esa página:
// `business-hours` vive en BusinessHoursEditor, el resto en ajustes/page.tsx.
const PASOS: PasoOnboarding[] = [
  {
    clave: "schedule",
    titulo: "Configura tu horario",
    descripcion: "El agente lo comprueba antes de ofrecer o confirmar cualquier cita.",
    href: "/ajustes?section=business-hours",
    icono: CalendarClock,
  },
  {
    clave: "services",
    titulo: "Añade tus servicios",
    descripcion: "Sin servicios el agente no sabe qué ofreces ni cuánto dura cada cita.",
    href: "/ajustes?section=services",
    icono: ScissorsLineDashed,
  },
  {
    clave: "professionals",
    titulo: "Añade a tu equipo",
    descripcion: "Cada profesional necesita sus servicios marcados para repartir bien las citas.",
    href: "/ajustes?section=professionals",
    icono: UserRoundCheck,
  },
  {
    clave: "calendar",
    titulo: "Conecta tu calendario",
    descripcion: "Es lo que permite al agente reservar las citas automáticamente.",
    href: "/ajustes?section=calendar-section",
    icono: CalendarDays,
  },
];

export function OnboardingChecklist() {
  const queryClient = useQueryClient();

  const onboardingQuery = useQuery({
    queryKey: ["onboarding-state"],
    queryFn: getOnboardingState,
  });

  const dismissMutation = useMutation({
    mutationFn: dismissOnboarding,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["onboarding-state"] });
    },
  });

  const estado = onboardingQuery.data;

  // Mientras carga, si la petición falla, o si el negocio ya está configurado
  // (progreso 100, descartado o completado) no ocupamos sitio en el panel:
  // este aviso solo tiene sentido cuando falta algo de verdad.
  if (!estado?.isActive) return null;

  const pendientes = PASOS.filter((paso) => !estado.steps[paso.clave]);
  const completados = PASOS.filter((paso) => estado.steps[paso.clave]);

  return (
    <section
      className="panel border-[#ddd6fe] bg-[#f3eeff] p-4 sm:p-5"
      aria-labelledby="onboarding-checklist-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#8b5cf6]">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-[#6d28d9]">Configuración pendiente</p>
            <h2
              id="onboarding-checklist-title"
              className="mt-1 text-base font-semibold text-[#0a0a0a] sm:text-lg"
            >
              Termina de configurar tu asistente
            </h2>
          </div>
        </div>
        <button
          type="button"
          onClick={() => dismissMutation.mutate()}
          disabled={dismissMutation.isPending}
          aria-label="Ocultar la guía de configuración"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#6d28d9] transition duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
        El agente ya atiende llamadas, pero hasta que completes estos pasos no podrá reservar
        citas correctamente.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-white"
          role="progressbar"
          aria-label="Progreso de configuración"
          aria-valuenow={estado.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-[#8b5cf6] transition-all duration-200"
            style={{ width: `${estado.progress}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-semibold text-[#6d28d9]">
          {completados.length} de {PASOS.length}
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {pendientes.map((paso) => {
          const Icono = paso.icono;
          return (
            <li key={paso.clave}>
              <Link
                href={paso.href}
                className="group flex items-center gap-3 rounded-xl border border-[#ddd6fe] bg-white p-3 transition duration-200 hover:border-[#8b5cf6]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f3eeff] text-[#8b5cf6]">
                  <Icono className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#0a0a0a]">{paso.titulo}</span>
                  <span className="block text-xs leading-5 text-muted">{paso.descripcion}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#6d28d9]">
                  Configurar
                  <ArrowRight className="h-4 w-4 transition duration-200 group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {completados.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {completados.map((paso) => (
            <li
              key={paso.clave}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#52525b]"
            >
              <Check className="h-3.5 w-3.5 text-[#2c7334]" aria-hidden="true" />
              {paso.titulo}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
