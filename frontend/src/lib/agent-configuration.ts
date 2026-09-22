import {
  CalendarClock,
  CalendarDays,
  MessageCircle,
  PhoneForwarded,
  ScissorsLineDashed,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";

export type AgentSetupKey =
  | "schedule"
  | "services"
  | "professionals"
  | "calendar"
  | "whatsapp"
  | "forwarding";

/** El mismo itinerario guía el panel y decide qué bloque abrir en Agente. */
export const AGENT_CONFIGURATION_STEPS: Array<{
  key: AgentSetupKey;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}> = [
  {
    key: "schedule",
    title: "Configura tu horario",
    description: "El agente lo comprueba antes de ofrecer o confirmar cualquier cita.",
    href: "/agente?section=business-hours",
    icon: CalendarClock,
  },
  {
    key: "services",
    title: "Añade tus servicios",
    description: "Sin servicios el agente no sabe qué ofreces ni cuánto dura cada cita.",
    href: "/agente?section=services",
    icon: ScissorsLineDashed,
  },
  {
    key: "professionals",
    title: "Añade a tu equipo",
    description: "Cada profesional necesita sus servicios marcados para repartir bien las citas.",
    href: "/agente?section=professionals",
    icon: UserRoundCheck,
  },
  {
    key: "calendar",
    title: "Conecta tu calendario",
    description: "Es lo que permite al agente reservar las citas automáticamente.",
    href: "/agente?section=calendar-section",
    icon: CalendarDays,
  },
  {
    key: "whatsapp",
    title: "Activa los avisos por WhatsApp",
    description:
      "Un mensaje desde tu móvil y recibirás cada reserva y recado al momento.",
    href: "/ajustes/telefono#whatsapp",
    icon: MessageCircle,
  },
  {
    key: "forwarding",
    title: "Desvía tu teléfono",
    description: "El último paso: sin el desvío, tus llamadas no llegan a la recepcionista.",
    href: "#desvio",
    icon: PhoneForwarded,
  },
];

export function getNextAgentSetupSection({
  hasSchedule,
  serviceCount,
  professionalCount,
  hasCalendar,
}: {
  hasSchedule: boolean;
  serviceCount: number;
  professionalCount: number;
  hasCalendar: boolean;
}) {
  if (!hasSchedule) return "business-hours";
  if (serviceCount === 0) return "services";
  if (professionalCount === 0) return "professionals";
  if (!hasCalendar) return "calendar-section";
  return null;
}
