import { z } from "zod";
import type { BusinessType } from "./businessType.js";

export const AgentSettingsSchema = z.object({
  version: z.literal(1),
  tone: z.enum(["warm", "professional", "direct"]),
  primaryGoal: z.enum(["bookings", "customer_service", "lead_capture"]),
  responseStyle: z.enum(["concise", "balanced"]),
  escalation: z.enum(["take_message", "request_callback"]),
});

export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  version: 1,
  tone: "warm",
  primaryGoal: "bookings",
  responseStyle: "concise",
  escalation: "take_message",
};

const TONE_INSTRUCTIONS: Record<AgentSettings["tone"], string> = {
  warm: "Habla con cercanía, empatía y naturalidad, manteniendo un tono profesional.",
  professional: "Habla con claridad, seguridad y cortesía profesional.",
  direct: "Habla de forma ágil, práctica y directa, sin resultar brusco.",
};

const GOAL_INSTRUCTIONS: Record<AgentSettings["primaryGoal"], string> = {
  bookings: "Tu objetivo principal es convertir consultas en reservas correctamente confirmadas.",
  customer_service: "Tu objetivo principal es resolver consultas con precisión y facilitar una reserva cuando corresponda.",
  lead_capture: "Tu objetivo principal es identificar la necesidad del cliente y recoger sus datos para que el negocio pueda continuar la atención.",
};

const ESCALATION_INSTRUCTIONS: Record<AgentSettings["escalation"], string> = {
  take_message: "Si no puedes resolver algo con información verificada, toma un recado claro con nombre, teléfono y motivo.",
  request_callback: "Si no puedes resolver algo con información verificada, solicita nombre y teléfono para que el equipo devuelva la llamada.",
};

/**
 * Instrucciones específicas por tipo de negocio: qué preguntar además de los
 * datos básicos de la reserva. Añadir un nicho nuevo es una línea aquí, no
 * una rama de código nueva. La de fisioterapia pide el motivo en términos
 * generales a propósito: no solicita datos de salud estructurados.
 */
const NICHE_INSTRUCTIONS: Record<BusinessType, string> = {
  peluqueria: "Cuando el cliente quiera reservar, pregunta también qué servicio busca (corte, coloración, mechas, tratamiento) para poder asignar profesional y duración correctos.",
  barberia: "Cuando el cliente quiera reservar, pregunta si busca corte, arreglo de barba o ambos, para asignar la duración correcta.",
  fisioterapia: "Pregunta el motivo de la consulta en términos generales (revisión, rehabilitación, primera visita) sin solicitar detalles médicos específicos salvo que el cliente los ofrezca voluntariamente.",
  "salon-de-unas": "Pregunta el tipo de acabado que busca (esmaltado, semipermanente, gel, uñas acrílicas) y si es mantenimiento o aplicación nueva.",
  "centro-de-estetica": "Pregunta qué tratamiento busca y si es su primera vez, por si el negocio necesita indicar una valoración previa.",
  other: "",
};

export function parseAgentSettings(value: unknown): AgentSettings {
  return AgentSettingsSchema.safeParse(value).success
    ? AgentSettingsSchema.parse(value)
    : DEFAULT_AGENT_SETTINGS;
}

export interface PromptServiceInfo {
  id: string;
  name: string;
  durationMinutes: number;
}

export interface PromptProfessionalInfo {
  id: string;
  name: string;
}

const MAX_LISTED_ITEMS = 40;

function buildServicesBlock(services: PromptServiceInfo[] | undefined): string | null {
  if (!services || services.length === 0) return null;
  const lines = services
    .slice(0, MAX_LISTED_ITEMS)
    .map((service) => `- id: ${service.id} | nombre: "${service.name}" | duración: ${service.durationMinutes} min`);
  return `SERVICIOS_DISPONIBLES (usa el id exacto tal cual en serviceId; no ofrezcas servicios que no estén en esta lista):\n${lines.join("\n")}`;
}

function buildProfessionalsBlock(professionals: PromptProfessionalInfo[] | undefined): string | null {
  if (!professionals || professionals.length === 0) return null;
  const lines = professionals
    .slice(0, MAX_LISTED_ITEMS)
    .map((professional) => `- id: ${professional.id} | nombre: "${professional.name}"`);
  return `EMPLEADOS (usa professionalId solo si el cliente pide a esta persona concreta por nombre; usa el id exacto tal cual):\n${lines.join("\n")}`;
}

function formatMinutesForHumans(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hora" : "horas"}`;
  }
  return `${minutes} minutos`;
}

function buildRestrictionsFragment(input: {
  minAdvanceBookingMinutes?: number | null;
  maxAppointmentDurationMinutes?: number | null;
}): string | null {
  const parts: string[] = [];
  if (input.minAdvanceBookingMinutes) {
    parts.push(`No ofrezcas ni confirmes citas con menos de ${formatMinutesForHumans(input.minAdvanceBookingMinutes)} de antelación.`);
  }
  if (input.maxAppointmentDurationMinutes) {
    parts.push(`Ninguna cita puede durar más de ${input.maxAppointmentDurationMinutes} minutos.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

export function buildManagedAgentPrompt(input: {
  businessName: string;
  businessDetails?: string | null;
  businessType?: BusinessType;
  timezone: string;
  schedule: unknown;
  settings: unknown;
  services?: PromptServiceInfo[];
  professionals?: PromptProfessionalInfo[];
  minAdvanceBookingMinutes?: number | null;
  maxAppointmentDurationMinutes?: number | null;
}) {
  const settings = parseAgentSettings(input.settings);
  const responseInstruction = settings.responseStyle === "concise"
    ? "Responde normalmente en una o dos frases por turno y haz una sola pregunta cada vez."
    : "Responde con el detalle necesario, evitando explicaciones largas y haciendo una sola pregunta cada vez.";
  const nicheInstruction = input.businessType ? NICHE_INSTRUCTIONS[input.businessType] : "";

  return [
    `Eres la recepcionista virtual de ${input.businessName}.`,
    TONE_INSTRUCTIONS[settings.tone],
    GOAL_INSTRUCTIONS[settings.primaryGoal],
    responseInstruction,
    ESCALATION_INSTRUCTIONS[settings.escalation],
    nicheInstruction || null,
    "No inventes precios, servicios, disponibilidad ni políticas. Si falta información, indícalo y aplica el protocolo de escalado.",
    "Antes de ofrecer o reservar una hora, usa check_business_hours. No confirmes citas fuera del horario configurado.",
    "Antes de confirmar una reserva, verifica nombre, servicio, fecha y hora. Usa book_appointment únicamente después de que el cliente confirme esos datos.",
    buildRestrictionsFragment(input),
    input.businessDetails?.trim() ? `INFORMACION_VERIFICADA_DEL_NEGOCIO:\n${input.businessDetails.trim()}` : null,
    buildServicesBlock(input.services),
    buildProfessionalsBlock(input.professionals),
    `HORARIO_ESTRUCTURADO_DEL_NEGOCIO:\n${JSON.stringify({ timezone: input.timezone, schedule: input.schedule })}`,
  ].filter(Boolean).join("\n\n");
}
