"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CalendarDays,
  Check,
  Clock3,
  PhoneForwarded,
  RefreshCw,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { getOnboardingState, getPhoneNumberInfo, provisionPhoneNumber } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import type { Business } from "@/lib/types";

type Tone = "ok" | "warning" | "error" | "waiting";

/**
 * El tono no viaja solo en el color: cada estado tiene su propio icono, para
 * que un fallo se distinga sin depender de distinguir verde de rojo.
 */
const TONE: Record<Tone, { icon: LucideIcon; text: string; dot: string }> = {
  ok: { icon: Check, text: "text-[#2c7334]", dot: "bg-[#2c7334]" },
  warning: { icon: AlertTriangle, text: "text-[#9f7a15]", dot: "bg-[#9f7a15]" },
  error: { icon: AlertTriangle, text: "text-[#c53030]", dot: "bg-[#c53030]" },
  waiting: { icon: Clock3, text: "text-[#52525b]", dot: "bg-[#a1a1aa]" },
};

type StatusItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  value: string;
  tone: Tone;
  action?: { label: string; href: string } | { label: string; onClick: () => void; pending?: boolean };
};

type StatusStripProps = {
  business: Business;
  agentActive: boolean;
};

/**
 * Responde de un vistazo a «¿está funcionando mi recepcionista ahora mismo?».
 * Sustituye al antiguo «Resumen operativo», que pintaba «Activo» y «Error» con
 * exactamente la misma píldora gris.
 */
export function StatusStrip({ business, agentActive }: StatusStripProps) {
  const queryClient = useQueryClient();

  const phoneQuery = useQuery({
    queryKey: ["phone-number"],
    queryFn: getPhoneNumberInfo,
  });

  const onboardingQuery = useQuery({
    queryKey: ["onboarding-state"],
    queryFn: getOnboardingState,
  });

  const provisionMutation = useMutation({
    mutationFn: provisionPhoneNumber,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["phone-number"] });
    },
  });

  const hasPlan =
    business.subscriptionStatus === "ACTIVE" || business.subscriptionStatus === "TRIALING";

  const items: StatusItem[] = [
    buildReceptionistItem(business, agentActive),
    buildPhoneItem(phoneQuery.data?.status ?? null, phoneQuery.data?.phoneNumber ?? null, hasPlan, {
      retry: () => provisionMutation.mutate(),
      pending: provisionMutation.isPending,
    }),
    // La interfaz puede llegar a Vercel antes que el backend nuevo; en ese
    // intervalo la respuesta de onboarding aún no contiene `forwarding`.
    buildForwardingItem(onboardingQuery.data?.forwarding?.status ?? null),
    buildCalendarItem(business),
  ];

  return (
    <section aria-label="Estado del servicio" className="panel overflow-hidden p-0">
      {/* El hueco de 1px deja ver el fondo del contenedor como separador, así
          las divisiones caen solas sea cual sea el número de columnas. */}
      <ul className="grid grid-cols-1 gap-px bg-[#e5e5e5] sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-3 bg-white p-4">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
              <item.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">{item.label}</p>
              <p className={`mt-0.5 flex items-center gap-1.5 text-sm font-semibold ${TONE[item.tone].text}`}>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE[item.tone].dot}`} aria-hidden="true" />
                <span className="truncate">{item.value}</span>
              </p>
              {item.action ? (
                "href" in item.action ? (
                  <Link
                    href={item.action.href}
                    className="mt-1.5 inline-flex items-center text-xs font-semibold text-[#6d28d9] underline underline-offset-2 transition duration-200 hover:text-[#8b5cf6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
                  >
                    {item.action.label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={item.action.onClick}
                    disabled={item.action.pending}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#6d28d9] underline underline-offset-2 transition duration-200 hover:text-[#8b5cf6] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
                  >
                    {item.action.pending ? (
                      <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
                    ) : null}
                    {item.action.label}
                  </button>
                )
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function buildReceptionistItem(business: Business, agentActive: boolean): StatusItem {
  // La suspensión por impago deja al agente sin atender llamadas y hasta ahora
  // no se veía en ningún sitio del panel, aunque el dato ya viajaba en la API.
  if (business.callsSuspendedAt) {
    return {
      key: "agent",
      label: "Recepcionista",
      icon: Bot,
      value: "Suspendida por impago",
      tone: "error",
      action: { label: "Regularizar el pago", href: "/ajustes/facturacion" },
    };
  }

  if (!business.active || !agentActive) {
    return {
      key: "agent",
      label: "Recepcionista",
      icon: Bot,
      value: "Inactiva",
      tone: "warning",
      action: { label: "Revisar en ajustes", href: "/ajustes?section=agent-behaviour" },
    };
  }

  return {
    key: "agent",
    label: "Recepcionista",
    icon: Bot,
    value: "Atendiendo llamadas",
    tone: "ok",
  };
}

function buildPhoneItem(
  status: string | null,
  phoneNumber: string | null,
  hasPlan: boolean,
  retry: { retry: () => void; pending: boolean }
): StatusItem {
  if (status === "active" && phoneNumber) {
    return {
      key: "phone",
      label: "Tu número",
      icon: Smartphone,
      value: formatPhone(phoneNumber) ?? phoneNumber,
      tone: "ok",
    };
  }

  if (!hasPlan) {
    return {
      key: "phone",
      label: "Tu número",
      icon: Smartphone,
      value: "Necesita un plan activo",
      tone: "warning",
      action: { label: "Elegir plan", href: "/ajustes/facturacion" },
    };
  }

  if (status === "failed") {
    return {
      key: "phone",
      label: "Tu número",
      icon: Smartphone,
      value: "No se pudo asignar",
      tone: "error",
      action: { label: "Reintentar", onClick: retry.retry, pending: retry.pending },
    };
  }

  return {
    key: "phone",
    label: "Tu número",
    icon: Smartphone,
    // Telnyx tarda unos minutos en aprobar el número de España.
    value: "Activándose",
    tone: "waiting",
  };
}

function buildForwardingItem(status: string | null): StatusItem {
  if (status === "done") {
    return {
      key: "forwarding",
      label: "Desvío de llamadas",
      icon: PhoneForwarded,
      value: "Activo",
      tone: "ok",
    };
  }

  if (status === "ready") {
    return {
      key: "forwarding",
      label: "Desvío de llamadas",
      icon: PhoneForwarded,
      value: "Sin activar",
      tone: "error",
      action: { label: "Activarlo ahora", href: "/#desvio" },
    };
  }

  return {
    key: "forwarding",
    label: "Desvío de llamadas",
    icon: PhoneForwarded,
    value: "Esperando al número",
    tone: "waiting",
  };
}

function buildCalendarItem(business: Business): StatusItem {
  const usesOutlook = business.calendarProvider === "outlook";
  const providerName = usesOutlook ? "Outlook" : "Google Calendar";
  const connected = usesOutlook
    ? business.outlookCalendarConnected === true
    : business.googleCalendarConnected === true;
  // Haber estado conectado y no estarlo ahora es un token caducado, no una
  // cuenta sin configurar: son dos avisos distintos.
  const expired = usesOutlook
    ? business.outlookCalendarDisconnectedAt != null
    : business.googleCalendarDisconnectedAt != null;

  if (connected) {
    return {
      key: "calendar",
      label: "Agenda",
      icon: CalendarDays,
      value: providerName,
      tone: "ok",
    };
  }

  if (expired) {
    return {
      key: "calendar",
      label: "Agenda",
      icon: CalendarDays,
      value: "Conexión caducada",
      tone: "error",
      action: { label: "Reconectar", href: "/ajustes?section=calendar-section" },
    };
  }

  return {
    key: "calendar",
    label: "Agenda",
    icon: CalendarDays,
    value: "Sin conectar",
    tone: "warning",
    action: { label: "Conectar agenda", href: "/ajustes?section=calendar-section" },
  };
}
