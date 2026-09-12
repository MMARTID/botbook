/**
 * Batería de test reales sobre las 5 cuentas de desarrollo Telnyx
 * (PLAN-TELNYX-ORQUESTADOR.md). Pedido original: "crea 100 test" para cazar
 * tres tipos de problema (preguntas excesivas, calidad por nicho,
 * identificar/cancelar cita por número de quien llama con consentimiento);
 * acotado con el usuario a un lote representativo de ~20 llamadas reales en
 * vez de 100, dado el coste/tiempo de una llamada real por escenario
 * (~4-6h/100 llamadas en serie, minutos reales de Telnyx/OpenAI/Deepgram,
 * ~100 citas reales que limpiar en los calendarios).
 *
 * Reutiliza runOneCall de telnyxCallHarness.ts — no duplica la lógica de
 * originar / esperar / volcar una llamada real.
 *
 * Cuatro escenarios por negocio:
 *   1-2. Reserva con consentimiento SMS = sí / no -> Booking.smsConsent debe
 *      quedar en true / false respectivamente. La entrega real del SMS de
 *      confirmación falla hoy con el 40323 conocido (Telnyx bloquea
 *      Messaging Profile en números largos españoles, ver AGENTS.md) — el
 *      check automático es solo sobre el campo en BD; confirmar a mano en
 *      los logs del backend en vivo que el intento de envío sigue dando
 *      exactamente ESE error, no uno nuevo introducido por este cambio.
 *   3. Dos llamadas seguidas desde el mismo número: la 1ª reserva con
 *      consentimiento, la 2ª pide cancelarla -> la Booking de la 1ª llamada
 *      debe quedar con isCancelled=true.
 *   4. Persona exigente/específica del nicho de ese negocio -> sin
 *      comprobación determinista, se vuelca la transcripción para revisión
 *      manual (exceso de preguntas, calidad de manejo). El juez por rúbrica
 *      con LLM queda para un v2 (ver cabecera de telnyxCallHarness.ts).
 *
 * Ejecución secuencial a propósito: todas las llamadas comparten el mismo
 * Outbound Voice Profile y compiten por el mismo backend de desarrollo
 * procesando los webhooks — no conviene lanzarlas en paralelo.
 *
 * Uso:
 *   npx tsx scripts/telnyxCallBattery.ts [--only peluqueria|barberia|salon_unas|estetica|fisio]
 */
import { prisma } from "../src/lib/prisma.js";
import { getPublicWebhookBaseUrl } from "../src/lib/serverUrl.js";
import { runOneCall } from "./telnyxCallHarness.js";

const MAX_DURATION_SECS = 90;

type BusinessSlug = "peluqueria" | "barberia" | "salon_unas" | "estetica" | "fisio";

// Números reales de las 5 cuentas de desarrollo (createTelnyxNativeTests.ts).
const BUSINESSES: Record<BusinessSlug, { number: string; nichePersona: string }> = {
  peluqueria: {
    number: "+34930453218",
    nichePersona:
      "Te llamas Carmen. Quieres teñirte y cortarte el pelo el mismo día, pero antes preguntas si el tinte que usan es sin amoniaco y si tienen algún producto vegano — si no lo saben con certeza, pide que te lo confirmen antes de reservar nada.",
  },
  barberia: {
    number: "+34930453219",
    nichePersona:
      "Te llamas Javier. Quieres reservar corte para ti y tus dos hijos (8 y 11 años) el mismo día y a la misma hora si es posible, con el mismo barbero para los tres.",
  },
  salon_unas: {
    number: "+34930453236",
    nichePersona:
      "Te llamas Lucía. Preguntas por un servicio de uñas de gel con diseño personalizado que no sabes si tienen en el catálogo, y si no está, preguntas si se puede pedir como algo especial.",
  },
  estetica: {
    number: "+34930453237",
    nichePersona:
      "Te llamas Rosa. Preguntas por un tratamiento facial con radiofrecuencia que no sabes si ofrecen, y si no lo tienen, pides que te recomienden la alternativa más parecida de su catálogo.",
  },
  fisio: {
    number: "+34930453238",
    nichePersona:
      "Te llamas Antonio. Antes de reservar, preguntas si el tratamiento de fisioterapia lo cubre tu mutua y si te pueden dar un justificante para el seguro — si no lo saben, pide que te lo confirmen.",
  },
};

const SLUGS = Object.keys(BUSINESSES) as BusinessSlug[];

/** Reutiliza el número Telnyx de otra cuenta de desarrollo como "cliente"
 * que llama — mismo patrón ya probado con éxito (barbería llamando a
 * peluquería), sin necesitar un número dedicado solo para el harness.
 *
 * El escenario de cancelación usa un `offset` distinto (2 en vez de 1) a
 * propósito: find_my_appointment busca la cita MÁS PRÓXIMA con
 * smsConsent=true para el número de quien llama, sin importar de qué
 * escenario venga. Validado en vivo el 2026-09-12: con los escenarios de
 * consentimiento y cancelación compartiendo el mismo número de llamada,
 * find_my_appointment devolvió la reserva del escenario de consentimiento
 * (más próxima en el tiempo) en vez de la propia del escenario de
 * cancelación — no es un bug del producto (es razonable devolver la cita
 * más próxima), pero contamina la comprobación determinista si dos
 * escenarios comparten número de llamada contra el mismo negocio.
 */
function callerNumberFor(slug: BusinessSlug, offset = 1): string {
  const index = SLUGS.indexOf(slug);
  const callerSlug = SLUGS[(index + offset) % SLUGS.length];
  return BUSINESSES[callerSlug].number;
}

type ScenarioStatus = "OK" | "FALLO" | "REVISAR";
type ScenarioResult = {
  business: BusinessSlug;
  scenario: string;
  status: ScenarioStatus;
  detail: string;
};

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

let cachedConnectionId: string | undefined;
function requireConnectionId(): string {
  cachedConnectionId ??= process.env.TELNYX_CALL_CONTROL_APP_ID;
  if (!cachedConnectionId) {
    throw new Error("Falta TELNYX_CALL_CONTROL_APP_ID en el entorno.");
  }
  return cachedConnectionId;
}

let cachedBaseUrl: string | undefined;
function requireBaseUrl(): string {
  cachedBaseUrl ??= getPublicWebhookBaseUrl() ?? undefined;
  if (!cachedBaseUrl) {
    throw new Error("No hay URL pública configurada (BASE_URL o ngrok).");
  }
  return cachedBaseUrl;
}

async function runConsentScenario(slug: BusinessSlug, consent: boolean): Promise<ScenarioResult> {
  const scenario = `consentimiento SMS = ${consent ? "sí" : "no"}`;
  const from = callerNumberFor(slug);
  const to = BUSINESSES[slug].number;
  const persona = `Te llamas ${consent ? "Marta" : "Pedro"}. Quieres reservar el próximo hueco libre, el que sea. Si te preguntan si pueden enviarte la confirmación por SMS a este número, responde ${
    consent ? "que sí, claro" : "que no, prefieres que no te manden nada"
  }.`;

  const result = await runOneCall({
    from,
    to,
    persona,
    maxDurationSecs: MAX_DURATION_SECS,
    connectionId: requireConnectionId(),
    baseUrl: requireBaseUrl(),
  });

  if (!result.ok) {
    return { business: slug, scenario, status: "FALLO", detail: result.reason };
  }

  const booking = await prisma.booking.findUnique({
    where: { callId: result.callId },
    select: { smsConsent: true },
  });

  if (!booking) {
    return {
      business: slug,
      scenario,
      status: "FALLO",
      detail: "La llamada se procesó pero no se creó ninguna Booking (¿no llegó a reservar?).",
    };
  }

  const matches = booking.smsConsent === consent;
  return {
    business: slug,
    scenario,
    status: matches ? "OK" : "FALLO",
    detail: matches
      ? `Booking.smsConsent=${booking.smsConsent} como se esperaba. Revisa los logs del backend para confirmar el intento de SMS (40323 esperado mientras Telnyx no lo resuelva).`
      : `Booking.smsConsent=${booking.smsConsent}, se esperaba ${consent}.`,
  };
}

async function runCancelByCallerIdScenario(slug: BusinessSlug): Promise<ScenarioResult> {
  const scenario = "identificar y cancelar por número de quien llama";
  // offset=2: número distinto al de los otros tres escenarios de este mismo
  // negocio, para que find_my_appointment no encuentre la reserva de
  // consentimiento (más próxima en el tiempo) en vez de la propia de este
  // escenario — ver comentario en callerNumberFor.
  const from = callerNumberFor(slug, 2);
  const to = BUSINESSES[slug].number;

  const bookingCall = await runOneCall({
    from,
    to,
    persona:
      "Te llamas Sofía. Quieres reservar el próximo hueco libre, el que sea. Cuando te pregunten si pueden enviarte la confirmación por SMS a este número, responde que sí.",
    maxDurationSecs: MAX_DURATION_SECS,
    connectionId: requireConnectionId(),
    baseUrl: requireBaseUrl(),
  });

  if (!bookingCall.ok) {
    return { business: slug, scenario, status: "FALLO", detail: `1ª llamada (reserva): ${bookingCall.reason}` };
  }

  const cancelCall = await runOneCall({
    from,
    to,
    persona:
      "Te llamas Sofía. Ya tienes una cita reservada y llamas para cancelarla. Si te preguntan, confirma que quieres cancelarla.",
    maxDurationSecs: MAX_DURATION_SECS,
    connectionId: requireConnectionId(),
    baseUrl: requireBaseUrl(),
  });

  if (!cancelCall.ok) {
    return { business: slug, scenario, status: "FALLO", detail: `2ª llamada (cancelar): ${cancelCall.reason}` };
  }

  const booking = await prisma.booking.findUnique({
    where: { callId: bookingCall.callId },
    select: { isCancelled: true },
  });

  if (!booking) {
    return { business: slug, scenario, status: "FALLO", detail: "No se encontró la Booking de la 1ª llamada." };
  }

  return {
    business: slug,
    scenario,
    status: booking.isCancelled ? "OK" : "FALLO",
    detail: booking.isCancelled
      ? "La cita de la 1ª llamada quedó cancelada tras la 2ª."
      : `Tools invocadas en la 2ª llamada: ${cancelCall.toolCallNames.join(", ") || "ninguna"}. La cita NO quedó cancelada.\n${cancelCall.transcriptText ?? ""}`,
  };
}

async function runNichePersonaScenario(slug: BusinessSlug): Promise<ScenarioResult> {
  const from = callerNumberFor(slug);
  const to = BUSINESSES[slug].number;

  const result = await runOneCall({
    from,
    to,
    persona: BUSINESSES[slug].nichePersona,
    maxDurationSecs: MAX_DURATION_SECS,
    connectionId: requireConnectionId(),
    baseUrl: requireBaseUrl(),
  });

  if (!result.ok) {
    return { business: slug, scenario: "persona exigente del nicho", status: "FALLO", detail: result.reason };
  }

  return {
    business: slug,
    scenario: "persona exigente del nicho (revisión manual)",
    status: "REVISAR",
    detail: result.transcriptText ?? "(sin transcripción)",
  };
}

async function main() {
  const only = readArg("only") as BusinessSlug | undefined;

  if (only && !BUSINESSES[only]) {
    console.error(`Negocio desconocido "${only}". Opciones: ${SLUGS.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const slugs = only ? [only] : SLUGS;
  const results: ScenarioResult[] = [];

  for (const slug of slugs) {
    console.log(`\n### ${slug} (${BUSINESSES[slug].number}) ###`);

    console.log("-> consentimiento SMS = sí");
    results.push(await runConsentScenario(slug, true));

    console.log("-> consentimiento SMS = no");
    results.push(await runConsentScenario(slug, false));

    console.log("-> identificar y cancelar por número de quien llama");
    results.push(await runCancelByCallerIdScenario(slug));

    console.log("-> persona exigente del nicho");
    results.push(await runNichePersonaScenario(slug));
  }

  console.log(`\n\n=== Resumen (${results.length} escenarios) ===`);
  let ok = 0;
  let fallo = 0;
  let revisar = 0;
  for (const r of results) {
    if (r.status === "OK") ok++;
    else if (r.status === "FALLO") fallo++;
    else revisar++;
    console.log(`[${r.status}] ${r.business} — ${r.scenario}`);
    if (r.status !== "OK") {
      console.log(`    ${r.detail.split("\n").join("\n    ")}`);
    }
  }
  console.log(`\nOK: ${ok} · FALLO: ${fallo} · REVISAR (manual): ${revisar}`);

  await prisma.$disconnect();
  if (fallo > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[Batería] Fallo inesperado:", error);
  process.exit(1);
});
