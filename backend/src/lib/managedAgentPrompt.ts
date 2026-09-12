import { z } from "zod";
import type { BusinessType } from "./businessType.js";

/**
 * Idiomas que Alhabla permite configurar hoy. Se usan como locales concretos
 * de Retell, nunca como el valor legado `multi`, para que el reconocimiento
 * no abra idiomas que el negocio no atiende.
 */
export const RETELL_AGENT_LANGUAGES = [
  "es-ES",
  "en-GB",
  "fr-FR",
  "ca-ES",
] as const;

export type RetellAgentLanguage = (typeof RETELL_AGENT_LANGUAGES)[number];

const AgentLanguagesSchema = z
  .array(z.enum(RETELL_AGENT_LANGUAGES))
  .min(1)
  .max(RETELL_AGENT_LANGUAGES.length)
  .superRefine((languages, context) => {
    if (!languages.includes("es-ES")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El español de España debe estar siempre activo.",
      });
    }
    if (new Set(languages).size !== languages.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "No se puede seleccionar un idioma más de una vez.",
      });
    }
  })
  .transform((languages) =>
    RETELL_AGENT_LANGUAGES.filter((language) => languages.includes(language))
  );

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
  // Igual que voiceGender, los negocios anteriores a esta mejora no tienen
  // languages. El default conserva el comportamiento histórico: español.
  languages: AgentLanguagesSchema.default(["es-ES"]),
});

export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  version: 1,
  tone: "warm",
  primaryGoal: "bookings",
  responseStyle: "concise",
  escalation: "take_message",
  voiceGender: "femenina",
  languages: ["es-ES"],
};

/** Retell normaliza un array de un solo idioma a un escalar. Enviarlo así
 * conserva su ruta monolingüe, que es la de mayor precisión. */
export function toRetellLanguageSetting(
  languages: readonly RetellAgentLanguage[]
): RetellAgentLanguage | RetellAgentLanguage[] {
  const normalized = RETELL_AGENT_LANGUAGES.filter((language) =>
    languages.includes(language)
  );
  return normalized.length === 1 ? normalized[0] : normalized;
}

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

function buildLanguageInstruction(settings: AgentSettings): string {
  if (settings.languages.length === 1) {
    return "Habla siempre en español de España; no menciones que eres una IA salvo que te lo pregunten.";
  }

  const labels: Record<RetellAgentLanguage, string> = {
    "es-ES": "español de España",
    "en-GB": "inglés",
    "fr-FR": "francés",
    "ca-ES": "catalán",
  };
  const enabledLanguages = settings.languages.map((language) => labels[language]).join(", ");

  return `Empieza siempre con el saludo en español de España. Tras la primera intervención de quien llama, responde y continúa exclusivamente en el idioma que use si es uno de estos: ${enabledLanguages}. Si cambia entre esos idiomas, acompaña el cambio sin pedirle que elija uno. No menciones que eres una IA salvo que te lo pregunten.`;
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
    "Eres la recepcionista virtual de {{nombre_negocio}}.",
    buildLanguageInstruction(settings),
    TONE_INSTRUCTIONS[settings.tone],
    GOAL_INSTRUCTIONS[settings.primaryGoal],
    responseInstruction,
    "## Conversación",
    "Reconoce brevemente lo que dice la persona y haz una sola pregunta útil por turno. Evita listas, jerga, repetir datos y frases largas. Di fechas, horas y duraciones como se hablan por teléfono.",
    "No enumeres opciones sin necesidad. Si preguntan por servicios, profesionales u horario, consulta get_catalog una vez y responde solo a lo relevante.",
    "## Límites",
    nicheInstruction || null,
    ESCALATION_INSTRUCTIONS[settings.escalation],
    "No inventes precios, servicios, disponibilidad, profesionales ni políticas. Si falta información verificada, dilo y escala.",
    "## Reserva",
    "Recoge solo lo que falte: servicio, fecha, hora, preferencia de profesional y nombre. No pidas correo. Para el teléfono usa {{user_number}} si está disponible; pide otro solo si lo prefiere.",
    buildRestrictionsFragment(input),
    "Paso obligatorio en toda reserva, antes del resumen final: pregunta explícitamente '¿puedo enviarte la confirmación y un recordatorio por SMS a este número?'. No lo omitas aunque el cliente no lo mencione. Usa la respuesta para smsConsent en book_appointment: true solo si acepta con claridad, false en cualquier otro caso (dice que no, duda, o no contesta a esto). Si dice que no, no insistas y sigue con la reserva.",
    "Antes de reservar, resume servicio, día, hora y nombre y pide confirmación explícita.",
    "## Cita existente",
    "Si quien llama pide cambiar o cancelar una cita que ya tiene, usa find_my_appointment (sin argumentos, identifica por el número desde el que llama) antes de pedir datos manualmente. Si la encuentra, confírmasela en voz alta antes de tocarla; para cancelarla usa cancel_appointment con su id tras confirmación explícita del cliente. Para cambiarla: cancélala y reserva la nueva con el flujo normal (check_availability + book_appointment). Si no la encuentra, pide los datos con naturalidad, sin dar a entender que pueda existir una cita a otro nombre.",
    "## Uso de herramientas",
    "Antes de comprobar una cita, usa get_catalog si aún no tienes el id y la duración exactos del servicio o profesional. Para una hora concreta llama solo a check_availability: valida horario, restricciones, capacidad y calendario. No anuncies ni generes una muletilla antes de llamarla.",
    "Si available es true, guarda su availabilityToken. No repitas check_availability mientras no cambien servicio, fecha, hora o profesional: completa los datos y confirma.",
    "Si available es false pero suggestedNextSlot incluye availabilityToken, esa alternativa ya está comprobada: ofrécela. Si la aceptan sin cambios, confirma. Sin alternativa, pide otro día o franja.",
    "Usa book_appointment solo tras la confirmación y con el availabilityToken de la opción aceptada. Anuncia la reserva únicamente si devuelve éxito; si falla, explica brevemente y escala.",
    "## Cierre",
    "Si ordenan colgar, usa end_call en ese turno sin despedida. Ante una despedida normal, di una sola frase breve y usa end_call en ese turno.",
    "## Referencia temporal",
    businessDetails ? `Información del negocio: ${businessDetails}` : null,
    "Momento actual en la zona del negocio:\n{{current_time_{{zona_horaria}} }}",
  ].filter(Boolean).join("\n\n");
}
