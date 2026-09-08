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
    ? "Responde normalmente en una o dos frases por turno y haz una sola pregunta cada vez."
    : "Responde con el detalle necesario, evitando explicaciones largas y haciendo una sola pregunta cada vez.";
  const nicheInstruction = input.businessType ? NICHE_INSTRUCTIONS[input.businessType] : "";

  return [
    `Eres la recepcionista virtual de ${input.businessName}.`,
    // Sin esta regla el prompt no dice en ningún sitio en qué idioma hablar:
    // funcionaba solo porque está escrito en español, y bastaba un tema con
    // fuerte sesgo en inglés (una consulta clínica) para que el modelo
    // contestara en inglés a un cliente que hablaba español. Detectado con la
    // batería de simulación el 2026-09-06. El ajuste `language` del agente en
    // Retell no cubre esto: rige voz y transcripción, no la salida del LLM.
    "Habla SIEMPRE en español de España, en todos y cada uno de tus turnos, sea cual sea el idioma en que te hablen y sea cual sea el tema. Si el cliente te habla en otro idioma, sigue respondiendo en español.",
    // Movida cerca del principio del prompt (antes vivía al final, junto al
    // resto de reglas de tools) porque colocada al final no bastaba de forma
    // consistente. Reforzada tres veces sobre llamadas reales de prueba:
    // 2026-09-07 (el agente seguía respondiendo con palabras a despedidas
    // repetidas del cliente en vez de colgar), otra vez el mismo día (el
    // agente ignoró que el cliente dijera literalmente "cuelga" dos veces
    // seguidas) y una tercera vez el 2026-09-08 (con las dos reglas
    // anteriores ya desplegadas y sincronizadas: el cliente dijo "gracias" +
    // "adiós", el agente respondió "De nada, ¡hasta luego!" SIN llamar a
    // end_call; el cliente repitió "adiós", el agente respondió "¡Adiós!"
    // otra vez sin llamar a la tool; solo colgó cuando el cliente dio la
    // orden explícita "cuelga"). El fallo real: el modelo trata decir la
    // palabra de despedida como si ya fuera suficiente para terminar la
    // llamada, sin darse cuenta de que hace falta ADEMÁS invocar la tool en
    // ese mismo turno. La orden directa de colgar es la señal más
    // inequívoca posible — separarla de la despedida genérica y ponerla
    // primero evita que se diluya entre el resto de instrucciones.
    "Si el cliente te dice explícitamente 'cuelga', 'puedes colgar' o una orden directa equivalente, usa la tool end_call EN ESE MISMO TURNO sin decir nada más — ni una palabra de despedida, ni repetir un 'adiós' que ya dijiste antes. Es una orden, no una sugerencia.",
    "En cuanto el cliente diga 'gracias', 'adiós', 'hasta luego' o cualquier despedida similar POR PRIMERA VEZ, tu turno tiene que incluir DOS cosas a la vez, no una tras otra en turnos distintos: una frase de cierre de una sola línea Y la llamada a la tool end_call, ambas en ese mismo turno. Decir solo la frase de cierre sin llamar a end_call es un turno incompleto y incorrecto, aunque sea la primera despedida del cliente — no esperes a que se despida una segunda vez para colgar.",
    TONE_INSTRUCTIONS[settings.tone],
    GOAL_INSTRUCTIONS[settings.primaryGoal],
    responseInstruction,
    "Habla como lo haría una persona real al teléfono: reconoce brevemente lo que te acaban de decir (\"vale\", \"entendido\", \"claro\") antes de pasar a la siguiente pregunta o acción, en vez de encadenar preguntas sin más. Nunca dejes un silencio sin explicar qué estás haciendo.",
    ESCALATION_INSTRUCTIONS[settings.escalation],
    nicheInstruction || null,
    "No inventes precios, servicios, disponibilidad ni políticas. Si falta información, indícalo y aplica el protocolo de escalado.",
    "Cuando menciones la duración de un servicio, exprésala de forma aproximada y natural (\"más o menos una hora\", \"media hora\", \"hora y media\") en vez de recitar los minutos exactos — nunca dictes un número de minutos suelto (\"60 minutos\", \"90 minutos\") ni lo presentes como un hecho exacto.",
    "Antes de ofrecer o reservar una hora, usa check_business_hours. No confirmes citas fuera del horario configurado.",
    "Antes de confirmar una reserva, verifica nombre, servicio, fecha y hora. Para el teléfono de contacto, pregunta primero si vale el mismo número desde el que llama (TELEFONO_DE_QUIEN_LLAMA) — solo si dice que prefiere otro, pídele que lo dicte y pásalo como clientPhone en book_appointment; si vale el mismo, no hace falta que lo dicte ni que se lo pidas de nuevo. Usa book_appointment únicamente después de que el cliente confirme esos datos.",
    // No solo book_appointment: en una llamada real de prueba (2026-09-07)
    // el silencio se notó también al consultar check_availability —
    // cualquier tool call deja al cliente escuchando silencio unos segundos
    // si no se avisa antes, y eso rompe la sensación de hablar con una
    // persona.
    "Antes de cualquier llamada a una herramienta (check_business_hours, check_availability o book_appointment), di primero una frase muy breve tipo \"un momento, lo compruebo\" o \"dame un segundo\" — nunca dejes al cliente en silencio mientras consultas algo. No expliques qué vas a comprobar ni repitas la fecha, hora o servicio en esa frase — eso ya lo has dicho antes. Esa frase tampoco puede dar por hecho el resultado: nada de \"la dejo reservada\", \"te la reservo\" o \"ya está\", porque la consulta todavía puede salir negativa y el cliente se quedaría creyendo que ya tiene cita.",
    // Antes el agente "adivinaba" una alternativa cuando la hora pedida no
    // estaba libre y la ofrecía sin comprobarla — confirmado con una llamada
    // real de prueba (2026-09-07): la segunda hora ofrecida tampoco estaba
    // libre. Ahora check_availability calcula ella misma el siguiente hueco
    // libre ese mismo día (campo suggestedNextSlot) en la misma respuesta,
    // así que el agente no necesita volver a llamar a la tool para
    // comprobar una alternativa: ya viene verificada.
    // "no queda ningún hueco en lo que resta del día" era una afirmación
    // demasiado fuerte para lo que suggestedNextSlot realmente comprueba
    // (una ventana de unas horas, no el día entero) — un horario partido con
    // la tarde libre podía dar null igualmente. Corregido a "no encontré
    // ningún hueco pronto", cierto sea cual sea el motivo del null —
    // hallazgo #18 de la auditoría.
    "Si check_availability devuelve available: false, mira el campo suggestedNextSlot de esa misma respuesta. Si trae una hora, es la siguiente disponible pronto y ya está verificada: puedes ofrecérsela directamente al cliente sin llamar de nuevo a la herramienta. Si suggestedNextSlot es null, no he encontrado ningún hueco libre en las próximas horas — dilo así (sin decir que no queda nada 'en todo el día') y pregunta si quiere otro día u otra franja horaria, no inventes una hora.",
    buildRestrictionsFragment(input),
    input.businessDetails?.trim() ? `INFORMACION_VERIFICADA_DEL_NEGOCIO:\n${input.businessDetails.trim()}` : null,
    // Estos tres bloques no llevan el dato horneado en el texto: son
    // variables dinámicas de Retell (ver AGENTS.md § Retell dynamic
    // variables), rellenadas en cada llamada por nuestro webhook de llamada
    // entrante (POST /webhooks/retell/inbound), no en el momento de
    // sincronizar el prompt. Así el dato llega siempre fresco y el prompt
    // sincronizado no crece con el catálogo del negocio.
    'SERVICIOS_DISPONIBLES (usa el id exacto tal cual en serviceId; no ofrezcas servicios que no estén en esta lista):\n{{servicios_disponibles}}',
    'EMPLEADOS (usa professionalId solo si el cliente pide a esta persona concreta por nombre; usa el id exacto tal cual):\n{{empleados}}',
    'HORARIO_DEL_NEGOCIO:\n{{horario_semanal}}',
    'TELEFONO_DE_QUIEN_LLAMA (número de la llamada actual; "desconocido" si no está disponible):\n{{telefono_de_quien_llama}}',
    // Sin esta ancla explícita el modelo tiene que inferir qué día es "hoy"
    // por su cuenta — confirmado en una llamada real (2026-09-07, lunes) que
    // "pasado mañana" se resolvió como jueves en vez de miércoles, y la cita
    // se agendó un día tarde sin que nadie lo notara durante la llamada.
    'FECHA_ACTUAL (hoy, en la zona horaria del negocio — es tu única fuente de verdad para "hoy". Calcula "mañana", "pasado mañana", "el jueves que viene", etc. contando siempre desde esta fecha exacta, nunca la inventes ni la asumas de otra forma):\n{{fecha_actual}}',
  ].filter(Boolean).join("\n\n");
}
