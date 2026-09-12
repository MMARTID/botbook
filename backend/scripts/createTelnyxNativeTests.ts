/**
 * Crea el test nativo de Telnyx AI Assistants (client.ai.assistants.tests,
 * ver TelnyxAiAdapter.createAssistantTest) equivalente al caso de reserva
 * end-to-end que ya corre en Retell (tests/simulations/retell-agent-
 * simulation.test.ts, caso "2: Reserva de <servicio>" de cada nicho) — uno
 * por cada uno de los 5 negocios de desarrollo. No migra ni sustituye las
 * simulaciones de Retell (siguen siendo la referencia); esto solo añade el
 * mecanismo de test nativo de Telnyx para poder compararlos.
 *
 * Idempotente: si ya existe un test con el mismo `name` en el test_suite
 * "alhabla-dev-simulaciones", se omite en vez de duplicarlo.
 *
 * Uso: npx tsx scripts/createTelnyxNativeTests.ts
 */
import { getTelnyxClient } from "../src/lib/telnyx.js";
import { telnyxAiAdapter } from "../src/adapters/telnyx/TelnyxAiAdapter.js";

const TEST_SUITE = "alhabla-dev-simulaciones";

interface BusinessTestSpec {
  businessId: string;
  destination: string;
  name: string;
  instructions: string;
  rubric: Array<{ name: string; criteria: string }>;
}

const SPECS: BusinessTestSpec[] = [
  {
    businessId: "cmtpd23us000pnx1w7jvk6a5m",
    destination: "+34930453218",
    name: "Peluquería - Reserva de Corte",
    instructions:
      "Act as a new customer calling to book a Corte (haircut) for tomorrow at 11:00. Give your name when asked.",
    rubric: [
      { name: "Disponibilidad", criteria: "El asistente comprueba disponibilidad antes de confirmar nada" },
      { name: "Confirmación", criteria: "Confirma servicio (Corte), fecha, hora y nombre del cliente" },
      { name: "Reserva", criteria: "Completa la reserva y se lo confirma verbalmente al cliente" },
    ],
  },
  {
    businessId: "cmtpd2690000unx1wrvnewnze",
    destination: "+34930453219",
    name: "Barbería - Reserva de degradado",
    instructions:
      "Act as a new customer calling to book a degradado (fade haircut) for tomorrow at 12:00. Give your name when asked.",
    rubric: [
      { name: "Disponibilidad", criteria: "El asistente comprueba disponibilidad antes de confirmar nada" },
      { name: "Confirmación", criteria: "Confirma servicio (degradado), fecha, hora y nombre del cliente" },
      { name: "Reserva", criteria: "Completa la reserva y se lo confirma verbalmente al cliente" },
    ],
  },
  {
    businessId: "cmtpd28nm000znx1wc2bm1tu5",
    destination: "+34930453236",
    name: "Salón de Uñas - Reserva de Manicura semipermanente",
    instructions:
      "Act as a new customer calling to book a Manicura semipermanente for tomorrow at 10:00. Give your name when asked.",
    rubric: [
      { name: "Disponibilidad", criteria: "El asistente comprueba disponibilidad antes de confirmar nada" },
      { name: "Confirmación", criteria: "Confirma servicio, fecha, hora y nombre del cliente" },
      { name: "Reserva", criteria: "Completa la reserva y se lo confirma verbalmente al cliente" },
    ],
  },
  {
    businessId: "cmtpd2b250014nx1wxzdpm7zu",
    destination: "+34930453237",
    name: "Centro de Estética - Reserva de Limpieza facial",
    instructions:
      "Act as a new customer calling to book a Limpieza facial for tomorrow at 11:00. Give your name when asked.",
    rubric: [
      { name: "Disponibilidad", criteria: "El asistente comprueba disponibilidad antes de confirmar nada" },
      { name: "Confirmación", criteria: "Confirma servicio, fecha, hora y nombre del cliente" },
      { name: "Reserva", criteria: "Completa la reserva y se lo confirma verbalmente al cliente" },
    ],
  },
  {
    businessId: "cmtpd2dgr0019nx1w6n71afil",
    destination: "+34930453238",
    name: "Fisioterapia - Reserva de Valoración inicial",
    instructions:
      "Act as a new customer with back pain calling to book a Valoración inicial for tomorrow at 10:00. Give your name when asked. Only describe your issue in general terms, not clinical detail.",
    rubric: [
      { name: "Tono", criteria: "Pregunta el motivo en términos generales, sin pedir detalle médico estructurado" },
      { name: "Disponibilidad", criteria: "El asistente comprueba disponibilidad antes de confirmar nada" },
      { name: "Reserva", criteria: "Completa la reserva y se lo confirma verbalmente al cliente" },
    ],
  },
];

async function main() {
  const client = getTelnyxClient();
  const existingNames = new Set<string>();
  for await (const test of client.ai.assistants.tests.list({ test_suite: TEST_SUITE })) {
    existingNames.add(test.name);
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const spec of SPECS) {
    if (existingNames.has(spec.name)) {
      console.log(`[TelnyxTests] "${spec.name}" ya existe en el test_suite "${TEST_SUITE}" — se omite`);
      skipped++;
      continue;
    }

    try {
      const test = await telnyxAiAdapter.createAssistantTest({
        name: spec.name,
        destination: spec.destination,
        instructions: spec.instructions,
        rubric: spec.rubric,
        telnyxConversationChannel: "phone_call",
        testSuite: TEST_SUITE,
        description: `Negocio ${spec.businessId} — creado por createTelnyxNativeTests.ts`,
      });
      console.log(`[TelnyxTests] "${spec.name}" creado (${test.id})`);
      created++;
    } catch (error) {
      console.error(
        `[TelnyxTests] Fallo creando "${spec.name}": ${error instanceof Error ? error.message : String(error)}`
      );
      failed++;
    }
  }

  console.log(`[TelnyxTests] ${created} creado(s), ${skipped} omitido(s), ${failed} fallido(s) de ${SPECS.length}.`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error("[TelnyxTests] Fallo inesperado:", error);
    process.exit(1);
  });
