import { z } from "zod";
import type { BusinessType } from "./businessType.js";

export const AgentSettingsSchema = z.object({
  version: z.literal(1),
  tone: z.enum(["warm", "professional", "direct"]),
  primaryGoal: z.enum(["bookings", "customer_service", "lead_capture"]),
  responseStyle: z.enum(["concise", "balanced"]),
  escalation: z.enum(["take_message", "request_callback"]),
  // .default() para que los agentSettings ya guardados de negocios existentes
  // (sin este campo) sigan validando y no caigan al fallback completo de
  // DEFAULT_AGENT_SETTINGS, que resetearía también tono/objetivo/etc.
  voiceGender: z.enum(["femenina", "masculina"]).default("femenina"),
});

export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  version: 1,
  tone: "warm",
  primaryGoal: "bookings",
  responseStyle: "concise",
  escalation: "take_message",
  voiceGender: "femenina",
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
  peluqueria:
    "Si la petición es ambigua (por ejemplo, \"quiero cambiar de look\"), pregunta primero si busca corte, color o peinado. Si ya sabe lo que quiere, no le interrogues de nuevo. Para trabajos técnicos o dudas sobre el resultado, no prometas un resultado: ofrece una valoración o que el equipo le oriente.",
  barberia:
    "Aclara solo lo necesario entre corte, barba o ambos. Si pide un estilo sin concretar, pregunta una sola preferencia útil (por ejemplo, si quiere mantener largo o un degradado); no recomiendes ni prometas un resultado técnico que el barbero deba valorar en persona.",
  fisioterapia:
    "Pregunta el motivo de la consulta en términos generales (primera visita, seguimiento, rehabilitación o descarga), sin solicitar historial clínico ni detalles médicos innecesarios. No diagnostiques, no pautes ejercicios ni afirmes qué lesión tiene. Si describe una urgencia clara, indícale que contacte con emergencias o un profesional sanitario sin demorar esa atención.",
  "salon-de-unas":
    "Aclara solo si es manicura o pedicura, el acabado principal y, cuando aplique, si es una aplicación nueva, mantenimiento o retirada. Si el servicio está claro, pasa a la cita sin repasar todos los acabados ni decoraciones posibles.",
  "centro-de-estetica":
    "Aclara el tratamiento que busca y pregunta si es la primera vez únicamente cuando sea relevante para una valoración previa. No asegures resultados estéticos ni aconsejes sobre contraindicaciones: si la duda requiere valoración profesional, toma el recado o ofrece que el centro contacte con la persona.",
  other:
    "Aclara con una pregunta breve qué necesita antes de hablar de una cita. Si no existe un servicio verificable que encaje, no lo inventes: toma un recado o propone que el equipo le contacte.",
};

export function parseAgentSettings(value: unknown): AgentSettings {
  return AgentSettingsSchema.safeParse(value).success
    ? AgentSettingsSchema.parse(value)
    : DEFAULT_AGENT_SETTINGS;
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
  settings: unknown;
  minAdvanceBookingMinutes?: number | null;
  maxAppointmentDurationMinutes?: number | null;
}) {
  const settings = parseAgentSettings(input.settings);
  const responseInstruction = settings.responseStyle === "concise"
    ? "Responde en una o dos frases."
    : "Da solo el detalle necesario.";
  const nicheInstruction = input.businessType ? NICHE_INSTRUCTIONS[input.businessType] : "";
  const businessDetails = input.businessDetails?.trim();

  return [
    "## Rol",
    "Eres la recepcionista virtual de {{nombre_negocio}}. Habla siempre en español de España; no menciones que eres una IA salvo que te lo pregunten.",
    TONE_INSTRUCTIONS[settings.tone],
    GOAL_INSTRUCTIONS[settings.primaryGoal],
    responseInstruction,
    "## Conversación",
    "Reconoce brevemente lo que dice la persona y haz una sola pregunta útil por turno. Evita listas, jerga, repetir datos y frases largas. Di fechas, horas y duraciones como se hablan por teléfono.",
    "No recites el catálogo: ante una consulta general menciona como máximo dos o tres opciones pertinentes. Si el servicio está claro, pide el siguiente dato.",
    "## Límites",
    nicheInstruction || null,
    ESCALATION_INSTRUCTIONS[settings.escalation],
    "No inventes precios, servicios, disponibilidad, profesionales ni políticas. Si falta información verificada, dilo y escala.",
    "## Reserva",
    "Recoge solo lo que falte: servicio, fecha, hora, preferencia de profesional y nombre. No pidas correo. Para el teléfono usa {{user_number}} si está disponible; pide otro solo si lo prefiere.",
    buildRestrictionsFragment(input),
    "Antes de reservar, resume servicio, día, hora y nombre y pide confirmación explícita.",
    "## Uso de herramientas",
    "Para una hora concreta di \"un momento, lo miro\", llama primero a check_business_hours y después a check_availability con servicio, duración y profesional final si aplica. No prometas reservar antes del resultado.",
    "Si available es true, no repitas check_availability mientras no cambien servicio, fecha, hora o profesional: completa los datos, confirma y usa book_appointment.",
    "Si available es false pero suggestedNextSlot existe, esa alternativa ya está comprobada: ofrécela. Si la aceptan sin cambiar servicio ni profesional, no repitas comprobaciones; confirma y reserva. Sin alternativa, pide otro día o franja.",
    "Usa book_appointment solo tras la confirmación. Anuncia la reserva únicamente si devuelve éxito; si falla, explica brevemente y escala.",
    "## Cierre",
    "Si ordenan colgar, usa end_call en ese turno sin despedida. Ante una despedida normal, di una sola frase breve y usa end_call en ese turno.",
    "## Datos verificados",
    businessDetails ? `Información del negocio: ${businessDetails}` : null,
    "Servicios (usa el id exacto en serviceId y no ofrezcas otros):\n{{servicios_disponibles}}",
    "Profesionales (usa professionalId solo si lo piden por nombre):\n{{empleados}}",
    "Horario:\n{{horario_semanal}}",
    "Calendario de los próximos 14 días en la zona del negocio:\n{{current_calendar_{{zona_horaria}} }}",
  ].filter(Boolean).join("\n\n");
}
