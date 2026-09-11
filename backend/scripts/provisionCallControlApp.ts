/**
 * Provisioning ÚNICO del Call Control App de plataforma (plan §4). Se
 * ejecuta a mano una sola vez; el id resultante se guarda como
 * TELNYX_CALL_CONTROL_APP_ID. No crea nada si ya existe uno con ese nombre
 * — hay que pasar el id existente por argumento para solo verificarlo.
 *
 * Uso:
 *   npx tsx scripts/provisionCallControlApp.ts --webhook-url https://.../webhooks/telnyx
 *   npx tsx scripts/provisionCallControlApp.ts --verify <id>
 */
import { telnyxAiAdapter } from "../src/adapters/telnyx/TelnyxAiAdapter.js";

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const verifyId = readArgument("--verify");
  if (verifyId) {
    const app = await telnyxAiAdapter.getCallControlApp(verifyId);
    console.log(app);
    return;
  }

  const webhookUrl = readArgument("--webhook-url");
  if (!webhookUrl) {
    console.error(
      "Uso: npx tsx scripts/provisionCallControlApp.ts --webhook-url <url> | --verify <id>"
    );
    process.exitCode = 1;
    return;
  }

  const app = await telnyxAiAdapter.createCallControlApp({
    name: "alhabla-platform",
    webhookEventUrl: webhookUrl,
  });

  console.log(`Call Control App creado: ${app.id}`);
  console.log(`Guarda esto como TELNYX_CALL_CONTROL_APP_ID=${app.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fallo:", error);
    process.exit(1);
  });
