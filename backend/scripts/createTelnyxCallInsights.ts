/**
 * Crea (si no existen) los insights custom que clasifican el resultado de
 * una llamada Telnyx — equivalente a CALL_OUTCOME_ANALYSIS_FIELD/
 * ESCALATION_REASON_FIELD/TOOL_FAILURE_FIELD de Retell (agentBootstrap.ts),
 * mismas categorías exactas para que ambos proveedores sean comparables. Los
 * asigna al insight group indicado (el "Default" que ya usan los 5
 * assistants de desarrollo, id fijo de cuenta — ver memoria del proyecto).
 *
 * Idempotente: si un insight con ese nombre ya existe, no lo vuelve a crear;
 * reintenta la asignación al grupo siempre (Telnyx la trata como no-op si ya
 * estaba asignado).
 *
 * `requested_service_type` queda fuera a propósito: en Retell es un enum
 * generado por negocio con sus propios servicios, pero el insight group de
 * Telnyx es único y compartido para toda la plataforma — no hay forma limpia
 * de un enum por negocio aquí sin duplicar insights por cada uno.
 *
 * Uso:
 *   npx tsx scripts/createTelnyxCallInsights.ts --group <insight_group_id>
 */
import { telnyxAiAdapter } from "../src/adapters/telnyx/TelnyxAiAdapter.js";

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const INSIGHTS = [
  {
    name: "call_outcome",
    instructions:
      "Clasifica el resultado de la llamada en una sola categoría: RESOLVED si se resolvió la petición del cliente o se completó una reserva; FRUSTRATED si el cliente mostró enfado, frustración o insatisfacción notable; NO_ANSWER si la llamada terminó sin una resolución clara o el cliente colgó sin más; ESCALATED si la llamada se transfirió a una persona, a otro departamento, o se tomó un recado porque el asistente no pudo resolverlo; LEAD_CAPTURED si se recogió un contacto o interés comercial sin llegar a resolver la petición.",
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        call_outcome: {
          type: "string",
          enum: ["RESOLVED", "FRUSTRATED", "NO_ANSWER", "ESCALATED", "LEAD_CAPTURED"],
        },
      },
      required: ["call_outcome"],
    },
    envVar: "TELNYX_INSIGHT_CALL_OUTCOME_ID",
  },
  {
    name: "escalation_reason",
    instructions:
      "Motivo principal por el que la llamada terminó escalada, con una reserva sin completar, o sin resolución clara. Solo evalúa esto si el resultado de la llamada fue ESCALATED, o si alguna reserva no se pudo completar durante la llamada; en cualquier otro caso usa NO_APLICA. CLIENTE_LO_PIDIO si el cliente pidió hablar con una persona; FALLO_TECNICO si alguna herramienta (calendario, disponibilidad) falló o no respondió; FUERA_DE_HORARIO si lo solicitado caía fuera del horario del negocio; CONSULTA_COMPLEJA si la petición excedía lo que el asistente puede resolver; NO_APLICA si la llamada no tuvo ningún problema de este tipo.",
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        escalation_reason: {
          type: "string",
          enum: ["CLIENTE_LO_PIDIO", "FALLO_TECNICO", "FUERA_DE_HORARIO", "CONSULTA_COMPLEJA", "NO_APLICA"],
        },
      },
      required: ["escalation_reason"],
    },
    envVar: "TELNYX_INSIGHT_ESCALATION_REASON_ID",
  },
  {
    name: "tool_failure_detected",
    instructions:
      "true si alguna herramienta (check_business_hours, check_availability, book_appointment, find_my_appointment o cancel_appointment) falló, dio error o no pudo completarse durante la llamada, aunque la llamada terminara bien igualmente. false en cualquier otro caso.",
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: { tool_failure_detected: { type: "boolean" } },
      required: ["tool_failure_detected"],
    },
    envVar: "TELNYX_INSIGHT_TOOL_FAILURE_ID",
  },
  // Los dos siguientes nacen de la revisión de transcripciones reales del
  // 2026-09-14/16: una llamada perdida por malentendidos de transcripción
  // encadenados (barbería, "Miguel Martín Pilosa") y otra perdida porque el
  // agente rechazó como no disponibles horas que sí lo estaban (bug de zona
  // horaria UTC). Sirven para vigilar que no reaparezcan y para medir la
  // demanda de horas que se quedan sin reservar.
  {
    name: "comprehension_issue",
    instructions:
      "true si durante la llamada hubo problemas claros de comprensión entre el asistente y el cliente: frases transcritas sin sentido que el asistente trató como datos reales, el cliente teniendo que repetir o corregir lo mismo más de una vez, el asistente preguntando de nuevo algo ya respondido, o el cliente expresando confusión ('¿perdón?', '¿cómo?') más de una vez. false si la conversación fluyó sin estos problemas.",
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: { comprehension_issue: { type: "boolean" } },
      required: ["comprehension_issue"],
    },
    envVar: "TELNYX_INSIGHT_COMPREHENSION_ISSUE_ID",
  },
  {
    name: "requested_time_unavailable",
    instructions:
      "Si el cliente pidió una fecha y hora concretas y el asistente le dijo que no estaban disponibles (por horario, capacidad o calendario), devuelve requested_time con esa fecha y hora tal y como la pidió el cliente (texto libre, ej. 'viernes 18 a las 16:00') y booked_alternative=true solo si al final reservó otra hora en la misma llamada. Si ninguna hora pedida fue rechazada, devuelve requested_time como cadena vacía y booked_alternative=false.",
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        requested_time: { type: "string" },
        booked_alternative: { type: "boolean" },
      },
      required: ["requested_time", "booked_alternative"],
    },
    envVar: "TELNYX_INSIGHT_REQUESTED_TIME_UNAVAILABLE_ID",
  },
] as const;

async function main() {
  const groupId = readArgument("--group");
  if (!groupId) {
    console.error("Uso: npx tsx scripts/createTelnyxCallInsights.ts --group <insight_group_id>");
    process.exitCode = 1;
    return;
  }

  const existing = await telnyxAiAdapter.listInsights();
  const envLines: string[] = [];

  for (const insight of INSIGHTS) {
    const found = existing.find((item) => item.name === insight.name);
    const id = found
      ? found.id
      : (
          await telnyxAiAdapter.createInsight({
            name: insight.name,
            instructions: insight.instructions,
            jsonSchema: insight.jsonSchema,
          })
        ).id;

    console.log(`[Insights] ${insight.name}: ${found ? "ya existía" : "creado"} (${id})`);
    await telnyxAiAdapter.assignInsightToGroup(id, groupId);
    console.log(`[Insights] ${insight.name} asignado al grupo ${groupId}`);
    envLines.push(`${insight.envVar}=${id}`);
  }

  console.log("\nAñade esto a .env (y al Cloud Run de producción):\n");
  console.log(envLines.join("\n"));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[Insights] Fallo inesperado:", error);
    process.exit(1);
  });
