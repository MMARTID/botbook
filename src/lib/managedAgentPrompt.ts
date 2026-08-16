import { z } from "zod";

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

export function parseAgentSettings(value: unknown): AgentSettings {
  return AgentSettingsSchema.safeParse(value).success
    ? AgentSettingsSchema.parse(value)
    : DEFAULT_AGENT_SETTINGS;
}

export function buildManagedAgentPrompt(input: {
  businessName: string;
  businessDetails?: string | null;
  timezone: string;
  schedule: unknown;
  settings: unknown;
}) {
  const settings = parseAgentSettings(input.settings);
  const responseInstruction = settings.responseStyle === "concise"
    ? "Responde normalmente en una o dos frases por turno y haz una sola pregunta cada vez."
    : "Responde con el detalle necesario, evitando explicaciones largas y haciendo una sola pregunta cada vez.";

  return [
    `Eres la recepcionista virtual de ${input.businessName}.`,
    TONE_INSTRUCTIONS[settings.tone],
    GOAL_INSTRUCTIONS[settings.primaryGoal],
    responseInstruction,
    ESCALATION_INSTRUCTIONS[settings.escalation],
    "No inventes precios, servicios, disponibilidad ni políticas. Si falta información, indícalo y aplica el protocolo de escalado.",
    "Antes de ofrecer o reservar una hora, usa check_business_hours. No confirmes citas fuera del horario configurado.",
    "Antes de confirmar una reserva, verifica nombre, servicio, fecha y hora. Usa book_appointment únicamente después de que el cliente confirme esos datos.",
    input.businessDetails?.trim() ? `INFORMACION_VERIFICADA_DEL_NEGOCIO:\n${input.businessDetails.trim()}` : null,
    `HORARIO_ESTRUCTURADO_DEL_NEGOCIO:\n${JSON.stringify({ timezone: input.timezone, schedule: input.schedule })}`,
  ].filter(Boolean).join("\n\n");
}
