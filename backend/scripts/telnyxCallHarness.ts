/**
 * Harness de tests inbound por llamada real (PLAN-TELNYX-ORQUESTADOR.md,
 * diseño validado 2026-09-12 tras descartar el tests API nativo: el 422 del
 * issue #18 viene de un modelo interno de Telnyx no disponible en esta
 * cuenta, sin workaround por parámetro). En vez de un test "de mentira",
 * origina una llamada REAL de un número Telnyx nuestro a otro, con un
 * assistant "cliente" enganchado a la pata que marca — el assistant bajo
 * prueba recibe una llamada entrante indistinguible de un cliente real, así
 * que ejercita el código de producción sin modificarlo (webhooks firmados,
 * tools reales, `call_control_id` real).
 *
 * v1: origina la llamada, aplica el guardarraíl de duración server-side
 * (`time_limit_secs`, sin temporizador propio), y vuelca la transcripción
 * real ya procesada por nuestro propio webhook de producción (Call +
 * Transcript en la BD) junto a comprobaciones deterministas básicas. La
 * evaluación por rúbrica con LLM-juez queda para un v2 una vez esto se
 * pruebe contra una llamada real.
 *
 * Uso:
 *   npx tsx scripts/telnyxCallHarness.ts \
 *     --from +34930453219 --to +34930453218 \
 *     --persona "Te llamas Juan Ramón. Quieres reservar el próximo hueco libre, el que sea." \
 *     --max-duration 120
 */
import { prisma } from "../src/lib/prisma.js";
import { telnyxAiAdapter } from "../src/adapters/telnyx/TelnyxAiAdapter.js";
import { getPublicWebhookBaseUrl } from "../src/lib/serverUrl.js";

const HARNESS_ASSISTANT_NAME = "alhabla-harness-cliente-simulado";
// Marcos - Steady Advisor (es-ES, masculino) — deliberadamente distinta de
// la voz femenina que usan los negocios reales, para no confundirlas al
// escuchar una grabación.
const HARNESS_VOICE = "Telnyx.Ultra.13ff5deb-2591-42ad-a356-63a04e524411";

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function ensureHarnessAssistant(instructions: string): Promise<string> {
  const client = telnyxAiAdapter;
  const existing = await findAssistantByName(HARNESS_ASSISTANT_NAME);
  if (existing) {
    await client.updateAssistant(existing, { instructions });
    return existing;
  }
  const created = await client.createAssistant({
    name: HARNESS_ASSISTANT_NAME,
    instructions,
    greeting: "",
    model: "openai/gpt-5.6-luna",
    voiceSettings: { voice: HARNESS_VOICE, voice_speed: 1.0 },
    transcription: { model: "deepgram/flux", language: "es" },
    telephonySettings: { time_limit_secs: 300, user_idle_timeout_secs: 20 },
  });
  return created.id;
}

async function findAssistantByName(name: string): Promise<string | null> {
  const { getTelnyxClient } = await import("../src/lib/telnyx.js");
  const client = getTelnyxClient();
  const response = await client.ai.assistants.list();
  return response.data.find((assistant) => assistant.name === name)?.id ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const from = readArg("from");
  const to = readArg("to");
  const persona = readArg("persona");
  const maxDurationSecs = Number(readArg("max-duration") ?? 120);

  if (!from || !to || !persona) {
    console.error(
      "Uso: npx tsx scripts/telnyxCallHarness.ts --from <número propio> --to <número del assistant a probar> --persona \"<instrucciones del cliente simulado>\" [--max-duration 120]"
    );
    process.exitCode = 1;
    return;
  }

  const connectionId = process.env.TELNYX_CALL_CONTROL_APP_ID;
  if (!connectionId) {
    console.error("Falta TELNYX_CALL_CONTROL_APP_ID en el entorno.");
    process.exitCode = 1;
    return;
  }

  const baseUrl = getPublicWebhookBaseUrl();
  if (!baseUrl) {
    console.error("No hay URL pública configurada (BASE_URL o ngrok).");
    process.exitCode = 1;
    return;
  }

  const destinationBusiness = await prisma.business.findUnique({
    where: { telnyxPhoneNumber: to },
    select: { id: true, name: true },
  });
  if (!destinationBusiness) {
    console.error(`No hay ningún negocio con telnyxPhoneNumber=${to}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[Harness] Negocio bajo prueba: ${destinationBusiness.name} (${destinationBusiness.id})`);
  console.log(`[Harness] Preparando assistant "cliente simulado"...`);
  const harnessAssistantId = await ensureHarnessAssistant(persona);
  console.log(`[Harness] Assistant cliente: ${harnessAssistantId}`);

  const testStartedAt = new Date();
  console.log(`[Harness] Originando llamada real ${from} -> ${to} (máx. ${maxDurationSecs}s)...`);
  const { callControlId } = await telnyxAiAdapter.dialWithAssistant({
    connectionId,
    from,
    to,
    assistantId: harnessAssistantId,
    webhookUrl: `${baseUrl.replace(/\/$/, "")}/webhooks/telnyx-harness`,
    timeLimitSecs: maxDurationSecs,
    record: true,
  });
  console.log(`[Harness] Llamada originada, call_control_id=${callControlId}`);

  const waitSecs = maxDurationSecs + 25;
  console.log(`[Harness] Esperando ${waitSecs}s a que la llamada termine y se procese...`);
  await sleep(waitSecs * 1000);

  const call = await prisma.call.findFirst({
    where: { businessId: destinationBusiness.id, startedAt: { gte: testStartedAt } },
    orderBy: { startedAt: "desc" },
    include: { transcript: true, recording: true },
  });

  if (!call) {
    console.error(
      "[Harness] No se encontró ninguna Call nueva para ese negocio — la llamada no llegó a procesarse por el webhook de producción (revisa ngrok/logs)."
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n=== Resultado ===`);
  console.log(`Call ID: ${call.id} · estado: ${call.status} · duración: ${call.durationSecs ?? "?"}s`);

  if (!call.transcript) {
    console.warn("[Harness] Sin transcripción todavía (puede tardar tras call.conversation.ended).");
  } else {
    console.log(`\n--- Transcripción ---\n${call.transcript.fullText}\n`);
  }

  // El adaptador (toConversationMessage) no conserva tool_calls al guardar
  // el Transcript — para las comprobaciones deterministas hace falta el
  // mensaje crudo de Telnyx, no lo que ya persistimos.
  if (call.providerConversationId) {
    const { getTelnyxClient } = await import("../src/lib/telnyx.js");
    const client = getTelnyxClient();
    const toolCallNames = new Set<string>();
    let toolErrors = 0;
    for await (const message of client.ai.conversations.messages.list(
      call.providerConversationId
    )) {
      for (const toolCall of message.tool_calls ?? []) {
        if (toolCall.function?.name) toolCallNames.add(toolCall.function.name);
      }
      if (message.role === "tool" && message.text?.includes('"error"')) toolErrors++;
    }
    console.log(`--- Comprobaciones deterministas ---`);
    console.log(`Tools invocadas: ${toolCallNames.size ? [...toolCallNames].join(", ") : "ninguna"}`);
    console.log(`Respuestas de tool con error: ${toolErrors}`);
  }

  if (call.recording?.vapiUrl) {
    console.log(`\nGrabación: ${call.recording.vapiUrl}`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("[Harness] Fallo inesperado:", error);
  process.exit(1);
});
