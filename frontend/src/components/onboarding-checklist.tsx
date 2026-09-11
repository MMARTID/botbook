"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Check,
  Clock3,
  PhoneForwarded,
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
// El desvío es la excepción: no se configura en ajustes sino en el propio
// panel, porque son instrucciones para el teléfono, no un formulario.
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
  {
    clave: "forwarding",
    titulo: "Desvía tu teléfono",
    descripcion: "El último paso: sin el desvío, tus llamadas no llegan a la recepcionista.",
    href: "#desvio",
    icono: PhoneForwarded,
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
  // Compatibilidad con la respuesta anterior durante un despliegue escalonado
  // frontend (Vercel) → backend (Cloud Run): antes no existía `forwarding`.
  const esperandoNumero = estado.forwarding?.status === "waiting_number";

  return (
    <section
      className="panel border-[#ddd6fe] bg-[#f3eeff] p-4 sm:p-5"
      aria-labelledby="onboarding-checklist-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#8b5cf6]">
            <CalendarClock className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2
            id="onboarding-checklist-title"
            className="text-base font-semibold text-[#0a0a0a] sm:text-lg"
          >
            Termina de configurar tu recepcionista
          </h2>
        </div>
        <button
          type="button"
          onClick={() => dismissMutation.mutate()}
          disabled={dismissMutation.isPending}
          aria-label="Ocultar la guía de configuración"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#6d28d9] transition duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
        {esperandoNumero
          ? "Tu número aún se está activando. Aprovecha estos minutos para dejar lista la configuración: es lo que tu recepcionista necesita para reservar citas."
          : "Hasta que no termines estos pasos, tu recepcionista no puede atender y reservar como debería."}
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
        <span className="shrink-0 text-xs font-semibold tabular-nums text-[#6d28d9]">
          {completados.length} de {PASOS.length}
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {pendientes.map((paso) => {
          const Icono = paso.icono;
          // El desvío no se puede hacer hasta que el número esté aprobado:
          // enlazar a unas instrucciones que aún no aplican sería mandar al
          // usuario a una pared.
          const bloqueado = paso.clave === "forwarding" && esperandoNumero;

          if (bloqueado) {
            return (
              <li
                key={paso.clave}
                className="flex items-center gap-3 rounded-xl border border-[#ddd6fe] bg-white/60 p-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
                  <Icono className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#0a0a0a]">{paso.titulo}</span>
                  <span className="block text-xs leading-5 text-muted">
                    Disponible en cuanto tu número esté activo.
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#52525b]">
                  <Clock3 className="h-4 w-4" aria-hidden="true" />
                  En curso
                </span>
              </li>
            );
          }

          return (
            <li key={paso.clave}>
              <Link
                href={paso.href}
                className="group flex items-center gap-3 rounded-xl border border-[#ddd6fe] bg-white p-3 transition duration-200 hover:border-[#8b5cf6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
                  <Icono className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[#0a0a0a]">{paso.titulo}</span>
                  <span className="block text-xs leading-5 text-muted">{paso.descripcion}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#6d28d9]">
                  {paso.clave === "forwarding" ? "Activar" : "Configurar"}
                  <ArrowRight className="h-4 w-4 transition duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
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
