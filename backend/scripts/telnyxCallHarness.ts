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
 * `runOneCall` se extrajo para que `scripts/telnyxCallBattery.ts` (batería de
 * varios escenarios reales) la reutilice en vez de duplicar la lógica de
 * originar/esperar/volcar — este archivo queda como wrapper de CLI de un
 * único escenario.
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

export type CallHarnessResult =
  | {
      ok: true;
      businessId: string;
      businessName: string;
      callId: string;
      callStatus: string;
      durationSecs: number | null;
      transcriptText: string | null;
      toolCallNames: string[];
      toolErrors: number;
      recordingUrl: string | null;
    }
  | { ok: false; reason: string };

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

/**
 * Origina una llamada real de `from` a `to` con un assistant "cliente"
 * siguiendo `persona`, espera a que termine y se procese, y devuelve el
 * resultado ya persistido por el webhook de producción (Call + Transcript)
 * junto a las comprobaciones deterministas sobre las tool calls reales.
 */
export async function runOneCall(input: {
  from: string;
  to: string;
  persona: string;
  maxDurationSecs: number;
  connectionId: string;
  baseUrl: string;
}): Promise<CallHarnessResult> {
  const { from, to, persona, maxDurationSecs, connectionId, baseUrl } = input;

  const destinationBusiness = await prisma.business.findUnique({
    where: { telnyxPhoneNumber: to },
    select: { id: true, name: true },
  });
  if (!destinationBusiness) {
    return { ok: false, reason: `No hay ningún negocio con telnyxPhoneNumber=${to}` };
  }

  const harnessAssistantId = await ensureHarnessAssistant(persona);

  const testStartedAt = new Date();
  const { callControlId } = await telnyxAiAdapter.dialWithAssistant({
    connectionId,
    from,
    to,
    assistantId: harnessAssistantId,
    webhookUrl: `${baseUrl.replace(/\/$/, "")}/webhooks/telnyx-harness`,
    timeLimitSecs: maxDurationSecs,
    record: true,
  });

  const waitSecs = maxDurationSecs + 25;
  await sleep(waitSecs * 1000);

  const call = await prisma.call.findFirst({
    where: { businessId: destinationBusiness.id, startedAt: { gte: testStartedAt } },
    orderBy: { startedAt: "desc" },
    include: { transcript: true, recording: true },
  });

  if (!call) {
    return {
      ok: false,
      reason:
        "No se encontró ninguna Call nueva para ese negocio — la llamada no llegó a procesarse por el webhook de producción (revisa ngrok/logs). call_control_id=" +
        callControlId,
    };
  }

  let toolCallNames: string[] = [];
  let toolErrors = 0;
  if (call.providerConversationId) {
    const { getTelnyxClient } = await import("../src/lib/telnyx.js");
    const client = getTelnyxClient();
    const names = new Set<string>();
    for await (const message of client.ai.conversations.messages.list(
      call.providerConversationId
    )) {
      for (const toolCall of message.tool_calls ?? []) {
        if (toolCall.function?.name) names.add(toolCall.function.name);
      }
      if (message.role === "tool" && message.text?.includes('"error"')) toolErrors++;
    }
    toolCallNames = [...names];
  }

  return {
    ok: true,
    businessId: destinationBusiness.id,
    businessName: destinationBusiness.name,
    callId: call.id,
    callStatus: call.status,
    durationSecs: call.durationSecs,
    transcriptText: call.transcript?.fullText ?? null,
    toolCallNames,
    toolErrors,
    recordingUrl: call.recording?.vapiUrl ?? null,
  };
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

  console.log(`[Harness] Originando llamada real ${from} -> ${to} (máx. ${maxDurationSecs}s)...`);
  const result = await runOneCall({ from, to, persona, maxDurationSecs, connectionId, baseUrl });

  if (!result.ok) {
    console.error(`[Harness] ${result.reason}`);
    process.exitCode = 1;
    await prisma.$disconnect();
    return;
  }

  console.log(`[Harness] Negocio bajo prueba: ${result.businessName} (${result.businessId})`);
  console.log(`\n=== Resultado ===`);
  console.log(`Call ID: ${result.callId} · estado: ${result.callStatus} · duración: ${result.durationSecs ?? "?"}s`);

  if (!result.transcriptText) {
    console.warn("[Harness] Sin transcripción todavía (puede tardar tras call.conversation.ended).");
  } else {
    console.log(`\n--- Transcripción ---\n${result.transcriptText}\n`);
  }

  console.log(`--- Comprobaciones deterministas ---`);
  console.log(`Tools invocadas: ${result.toolCallNames.length ? result.toolCallNames.join(", ") : "ninguna"}`);
  console.log(`Respuestas de tool con error: ${result.toolErrors}`);

  if (result.recordingUrl) {
    console.log(`\nGrabación: ${result.recordingUrl}`);
  }

  await prisma.$disconnect();
}

if (process.argv[1]?.endsWith("telnyxCallHarness.ts")) {
  main().catch((error) => {
    console.error("[Harness] Fallo inesperado:", error);
    process.exit(1);
  });
}
