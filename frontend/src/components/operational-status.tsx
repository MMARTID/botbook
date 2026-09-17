"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CalendarDays,
  Check,
  Clock3,
  HelpCircle,
  PhoneForwarded,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { getOnboardingState, getPhoneNumberInfo } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import type { Business, PhoneNumberInfo } from "@/lib/types";

/**
 * `unknown` no es un estado del negocio, sino de la comprobación: la consulta
 * falló y no sabemos nada. Se separó de `waiting` porque decir "Activándose"
 * de un número que lleva semanas funcionando es mentir al negocio.
 */
export type OperationalTone = "ok" | "warning" | "error" | "waiting" | "unknown";

export type OperationalStatusItem = {
  key: "agent" | "phone" | "forwarding" | "calendar";
  label: string;
  icon: LucideIcon;
  value: string;
  tone: OperationalTone;
  action?: { label: string; href: string } | { label: string; kind: "retry-phone" };
};

export const OPERATIONAL_TONE: Record<OperationalTone, { icon: LucideIcon; text: string; dot: string }> = {
  ok: { icon: Check, text: "text-[#2c7334]", dot: "bg-[#2c7334]" },
  warning: { icon: AlertTriangle, text: "text-[#9f7a15]", dot: "bg-[#9f7a15]" },
  error: { icon: AlertTriangle, text: "text-[#c53030]", dot: "bg-[#c53030]" },
  waiting: { icon: Clock3, text: "text-[#52525b]", dot: "bg-[#a1a1aa]" },
  unknown: { icon: HelpCircle, text: "text-[#52525b]", dot: "bg-[#a1a1aa]" },
};

const NO_COMPROBADO = "No se ha podido comprobar";

/**
 * Fuente única para las señales de salud operativa. Las pantallas deciden si
 * muestran las cuatro señales o una versión resumida, pero no reinterpretan
 * por su cuenta el estado de teléfono, desvío, agenda y recepcionista.
 */
export function buildOperationalStatus({
  business,
  agentActive,
  phone,
  forwardingStatus,
  phoneUnavailable = false,
  forwardingUnavailable = false,
}: {
  business: Business;
  agentActive: boolean;
  phone: PhoneNumberInfo | undefined;
  forwardingStatus: string | null | undefined;
  /** La consulta del teléfono falló: no hay dato, no es que esté en curso. */
  phoneUnavailable?: boolean;
  /** La consulta del onboarding falló: no sabemos si el desvío está puesto. */
  forwardingUnavailable?: boolean;
}): OperationalStatusItem[] {
  const hasPlan = business.subscriptionStatus === "ACTIVE" || business.subscriptionStatus === "TRIALING";
  const usesOutlook = business.calendarProvider === "outlook";
  const calendarConnected = usesOutlook ? business.outlookCalendarConnected === true : business.googleCalendarConnected === true;
  const calendarExpired = usesOutlook ? business.outlookCalendarDisconnectedAt != null : business.googleCalendarDisconnectedAt != null;

  const agent: OperationalStatusItem = business.callsSuspendedAt
    ? { key: "agent", label: "Recepcionista", icon: Bot, value: "Suspendida por impago", tone: "error", action: { label: "Regularizar el pago", href: "/ajustes/facturacion" } }
    : !business.active || !agentActive
      ? { key: "agent", label: "Recepcionista", icon: Bot, value: "Inactiva", tone: "warning", action: { label: "Revisar agente", href: "/agente?section=agent-settings" } }
      : { key: "agent", label: "Recepcionista", icon: Bot, value: "Atendiendo llamadas", tone: "ok" };

  const phoneItem: OperationalStatusItem = phone?.status === "active" && phone.phoneNumber
    ? { key: "phone", label: "Tu número", icon: Smartphone, value: formatPhone(phone.phoneNumber) ?? phone.phoneNumber, tone: "ok" }
    : !hasPlan
      ? { key: "phone", label: "Tu número", icon: Smartphone, value: "Necesita un plan activo", tone: "warning", action: { label: "Elegir plan", href: "/ajustes/facturacion" } }
      : phone?.status === "failed"
        ? { key: "phone", label: "Tu número", icon: Smartphone, value: "No se pudo asignar", tone: "error", action: { label: "Reintentar", kind: "retry-phone" } }
        : phoneUnavailable
          ? { key: "phone", label: "Tu número", icon: Smartphone, value: NO_COMPROBADO, tone: "unknown" }
          : { key: "phone", label: "Tu número", icon: Smartphone, value: "Activándose", tone: "waiting" };

  const forwarding: OperationalStatusItem = forwardingStatus === "done"
    ? { key: "forwarding", label: "Desvío de llamadas", icon: PhoneForwarded, value: "Activo", tone: "ok" }
    : forwardingStatus === "ready"
      ? { key: "forwarding", label: "Desvío de llamadas", icon: PhoneForwarded, value: "Sin activar", tone: "error", action: { label: "Activarlo ahora", href: "/#desvio" } }
      : forwardingUnavailable
        ? { key: "forwarding", label: "Desvío de llamadas", icon: PhoneForwarded, value: NO_COMPROBADO, tone: "unknown" }
        : { key: "forwarding", label: "Desvío de llamadas", icon: PhoneForwarded, value: "Esperando al número", tone: "waiting" };

  const calendar: OperationalStatusItem = calendarConnected
    ? { key: "calendar", label: "Agenda", icon: CalendarDays, value: usesOutlook ? "Outlook Calendar" : "Google Calendar", tone: "ok" }
    : calendarExpired
      ? { key: "calendar", label: "Agenda", icon: CalendarDays, value: "Conexión caducada", tone: "error", action: { label: "Reconectar", href: "/agente?section=calendar-section" } }
      : { key: "calendar", label: "Agenda", icon: CalendarDays, value: "Sin conectar", tone: "warning", action: { label: "Conectar agenda", href: "/agente?section=calendar-section" } };

  return [agent, phoneItem, forwarding, calendar];
}

export function useOperationalStatus(business: Business | undefined, agentActive = true) {
  const phoneQuery = useQuery({ queryKey: ["phone-number"], queryFn: getPhoneNumberInfo, enabled: Boolean(business) });
  const onboardingQuery = useQuery({ queryKey: ["onboarding-state"], queryFn: getOnboardingState, enabled: Boolean(business) });

  return {
    items: business
      ? buildOperationalStatus({
          business,
          agentActive,
          phone: phoneQuery.data,
          forwardingStatus: onboardingQuery.data?.forwarding?.status,
          phoneUnavailable: phoneQuery.isError,
          forwardingUnavailable: onboardingQuery.isError,
        })
      : [],
    phoneQuery,
    onboardingQuery,
    isLoading: phoneQuery.isLoading || onboardingQuery.isLoading,
  };
}
