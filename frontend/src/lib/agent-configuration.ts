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
  /** Destino en la app móvil, donde cada ajuste tiene su pantalla. */
  hrefMovil: string;
  icon: LucideIcon;
}> = [
  {
    key: "schedule",
    title: "Configura tu horario",
    description: "El agente lo comprueba antes de ofrecer o confirmar cualquier cita.",
    href: "/agente?section=business-hours",
    hrefMovil: "/agente/horario",
    icon: CalendarClock,
  },
  {
    key: "services",
    title: "Añade tus servicios",
    description: "Sin servicios el agente no sabe qué ofreces ni cuánto dura cada cita.",
    href: "/agente?section=services",
    hrefMovil: "/agente/servicios",
    icon: ScissorsLineDashed,
  },
  {
    key: "professionals",
    title: "Añade a tu equipo",
    description: "Cada profesional necesita sus servicios marcados para repartir bien las citas.",
    href: "/agente?section=professionals",
    hrefMovil: "/agente/profesionales",
    icon: UserRoundCheck,
  },
  {
    key: "calendar",
    title: "Conecta tu calendario",
    description: "Es lo que permite al agente reservar las citas automáticamente.",
    href: "/agente?section=calendar-section",
    hrefMovil: "/agente/calendario",
    icon: CalendarDays,
  },
  {
    key: "whatsapp",
    title: "Activa los avisos por WhatsApp",
    description:
      "Un mensaje desde tu móvil y recibirás cada reserva y recado al momento.",
    href: "/ajustes/telefono#whatsapp",
    hrefMovil: "/ajustes/telefono#whatsapp",
    icon: MessageCircle,
  },
  {
    key: "forwarding",
    title: "Desvía tu teléfono",
    description: "El último paso: sin el desvío, tus llamadas no llegan a la recepcionista.",
    href: "#desvio",
    hrefMovil: "#desvio",
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

/**
 * En la app móvil cada ajuste del agente es una pantalla (`/agente/horario`…)
 * en vez de un bloque plegable de `/agente`. Este mapa traduce entre las dos:
 * los enlaces `?section=` de siempre siguen funcionando en el móvil, y una
 * pantalla de ajuste abierta en escritorio vuelve a su bloque.
 */
export const AJUSTES_DEL_AGENTE = {
  horario: "business-hours",
  capacidad: "capacity",
  servicios: "services",
  profesionales: "professionals",
  calendario: "calendar-section",
  informacion: "business-information",
  comportamiento: "agent-settings",
} as const;

export type AjusteDelAgente = keyof typeof AJUSTES_DEL_AGENTE;

export function esAjusteDelAgente(valor: string): valor is AjusteDelAgente {
  return Object.prototype.hasOwnProperty.call(AJUSTES_DEL_AGENTE, valor);
}

export function ajustePorSeccion(seccion: string | null): AjusteDelAgente | null {
  if (!seccion) return null;
  const encontrado = (Object.entries(AJUSTES_DEL_AGENTE) as Array<[AjusteDelAgente, string]>).find(
    ([, id]) => id === seccion
  );
  return encontrado ? encontrado[0] : null;
}
