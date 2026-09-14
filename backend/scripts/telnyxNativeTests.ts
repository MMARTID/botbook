/**
 * Batería de calidad como tests NATIVOS de Telnyx (`ai.assistants.tests`),
 * complemento — no sustituto — de `telnyxCallBattery.ts`.
 *
 * `telnyxCallBattery.ts` solo comprueba estado determinista en nuestra BD
 * (Booking.smsConsent, isCancelled, professional asignado); el escenario de
 * "persona exigente del nicho" no tiene comprobación determinista posible
 * (depende de si el agente respondió con naturalidad, no sobre-preguntó,
 * fue honesto cuando no sabía algo, etc.) y quedaba como "REVISAR": volcar
 * la transcripción para que alguien la leyera a mano.
 *
 * Telnyx tiene su propio juez por rúbrica (`ai.assistants.tests` + `.runs`):
 * origina la llamada real él mismo contra el número de cada negocio con su
 * propio agente de prueba, y evalúa la conversación contra una rúbrica con
 * su propio LLM. Este script crea/actualiza (idempotente, por nombre) un
 * test por negocio reusando exactamente la misma persona "exigente del
 * nicho" que ya usa `telnyxCallBattery.ts`, y opcionalmente dispara la
 * ejecución real y espera el resultado.
 *
 * Uso:
 *   npx tsx scripts/telnyxNativeTests.ts                # solo crea/actualiza los tests (sin coste)
 *   npx tsx scripts/telnyxNativeTests.ts --only peluqueria
 *   npx tsx scripts/telnyxNativeTests.ts --trigger       # además dispara la ejecución real y espera el resultado
 */
import { telnyxAiAdapter } from "../src/adapters/telnyx/TelnyxAiAdapter.js";
import { BUSINESSES, SLUGS, type BusinessSlug } from "./telnyxCallBattery.js";

const TEST_SUITE = "alhabla-calidad-nicho";
const MAX_DURATION_SECONDS = 230;
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

// Rúbrica específica por negocio — traduce lo que `nichePersona` pone a
// prueba en cada caso (producto/servicio que no se sabe si existe, alergias,
// cobertura de mutua...) en criterios evaluables por el juez de Telnyx.
// Los dos últimos criterios son comunes a los 5: son justo los dos problemas
// que motivaron esta batería originalmente (ver cabecera de
// telnyxCallBattery.ts — "preguntas excesivas, calidad por nicho").
const NICHE_RUBRIC: Record<BusinessSlug, Array<{ name: string; criteria: string }>> = {
  peluqueria: [
    {
      name: "Honestidad sobre el producto",
      criteria:
        "Si no tiene información certera sobre si el tinte es sin amoníaco o si hay opción vegana, lo dice honestamente y ofrece confirmarlo, en vez de inventar una respuesta.",
    },
  ],
  barberia: [
    {
      name: "Reserva múltiple coordinada",
      criteria:
        "Intenta agendar a las tres personas (padre y dos hijos) en el mismo hueco y con el mismo barbero si es posible, sin obligar a tres llamadas o reservas separadas innecesarias.",
    },
  ],
  salon_unas: [
    {
      name: "Manejo de servicio fuera de catálogo",
      criteria:
        "Si el diseño de uñas personalizado no está en el catálogo, lo dice con claridad y ofrece registrarlo como petición especial o la alternativa más parecida, sin inventar disponibilidad ni precio.",
    },
  ],
  estetica: [
    {
      name: "Alternativa cuando el tratamiento no existe",
      criteria:
        "Si no ofrecen el tratamiento de radiofrecuencia, lo dice claramente y recomienda la alternativa más parecida de su catálogo real, sin inventar un tratamiento que no existe.",
    },
  ],
  fisio: [
    {
      name: "Honestidad sobre cobertura de mutua",
      criteria:
        "Si no sabe con certeza si la mutua cubre el tratamiento o si se puede dar justificante, lo dice honestamente y ofrece confirmarlo, en vez de garantizar algo que no puede saber.",
    },
  ],
};

const COMMON_RUBRIC: Array<{ name: string; criteria: string }> = [
  {
    name: "No sobre-pregunta",
    criteria:
      "No hace más de 3-4 preguntas de seguimiento antes de intentar comprobar disponibilidad o reservar — evita interrogar al cliente con preguntas que ya podría inferir o confirmar de una vez.",
  },
  {
    name: "Tono natural",
    criteria:
      "Suena cordial y natural, no robótico ni repetitivo; reconoce lo que dice el cliente antes de continuar en vez de ignorarlo.",
  },
];

function testNameFor(slug: BusinessSlug): string {
  return `alhabla-nicho-${slug}`;
}

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function createOrUpdateTest(slug: BusinessSlug): Promise<string> {
  const business = BUSINESSES[slug];
  const name = testNameFor(slug);
  const rubric = [...NICHE_RUBRIC[slug], ...COMMON_RUBRIC];

  const existing = await telnyxAiAdapter.listAssistantTests({
    testSuite: TEST_SUITE,
    destination: business.number,
  });
  const match = existing.find((test) => test.name === name);

  if (match) {
    await telnyxAiAdapter.updateAssistantTest(match.id, {
      instructions: business.nichePersona,
      rubric,
      maxDurationSeconds: MAX_DURATION_SECONDS,
      description: `Cliente exigente del nicho — ${slug} (actualizado automáticamente)`,
    });
    console.log(`[${slug}] Test actualizado (${match.id})`);
    return match.id;
  }

  const created = await telnyxAiAdapter.createAssistantTest({
    name,
    destination: business.number,
    instructions: business.nichePersona,
    rubric,
    telnyxConversationChannel: "phone_call",
    maxDurationSeconds: MAX_DURATION_SECONDS,
    testSuite: TEST_SUITE,
    description: `Cliente exigente del nicho — ${slug}`,
  });
  console.log(`[${slug}] Test creado (${created.id})`);
  return created.id;
}

async function triggerAndWait(slug: BusinessSlug, testId: string) {
  const { runId } = await telnyxAiAdapter.triggerAssistantTestRun(testId);
  console.log(`[${slug}] Ejecución disparada (run ${runId}), esperando resultado...`);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const run = await telnyxAiAdapter.getAssistantTestRun(testId, runId);
    if (run.status === "passed" || run.status === "failed" || run.status === "error") {
      console.log(`[${slug}] Resultado: ${run.status.toUpperCase()}`);
      for (const detail of run.detailStatus ?? []) {
        console.log(`    [${detail.status}] ${detail.name}`);
      }
      if (run.status !== "passed" && run.logs) {
        console.log(`    Logs: ${run.logs}`);
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  console.log(`[${slug}] Tiempo de espera agotado (${POLL_TIMEOUT_MS / 1000}s) sin resultado final — revisar en Mission Control.`);
}

async function main() {
  const only = readArg("only") as BusinessSlug | undefined;
  const trigger = process.argv.includes("--trigger");

  if (only && !BUSINESSES[only]) {
    console.error(`Negocio desconocido "${only}". Opciones: ${SLUGS.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const slugs = only ? [only] : SLUGS;

  for (const slug of slugs) {
    const testId = await createOrUpdateTest(slug);
    if (trigger) {
      await triggerAndWait(slug, testId);
    }
  }

  if (!trigger) {
    console.log(
      `\nTests creados/actualizados en el test suite "${TEST_SUITE}". Vuelve a correr con --trigger para ejecutarlos de verdad (coste real de llamada) o dispáralos desde Mission Control.`
    );
  }
}

main().catch((error) => {
  console.error("[telnyxNativeTests] Fallo inesperado:", error);
  process.exit(1);
});
