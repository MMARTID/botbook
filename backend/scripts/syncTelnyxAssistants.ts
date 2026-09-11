/**
 * Reaplica la configuración gestionada actual (buildTelnyxAssistantPayload)
 * a los assistants Telnyx ya creados de los negocios indicados — para
 * cuando cambia el payload builder (p. ej. el fix de data_retention/
 * send_conversation_message_events del 2026-09-11) y hace falta empujarlo a
 * assistants que ya existían. syncAgentToTelnyx solo actualiza si el hash
 * de configuración cambió; nunca lanza.
 *
 * Uso:
 *   npx tsx scripts/syncTelnyxAssistants.ts --business <id> [--business <id> ...]
 */
import { prisma } from "../src/lib/prisma.js";
import { syncAgentToTelnyx } from "../src/lib/telnyxAgentSync.js";

function readAllArguments(name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === name && process.argv[i + 1]) {
      values.push(process.argv[i + 1]);
    }
  }
  return values;
}

async function main() {
  const businessIds = readAllArguments("--business");
  if (businessIds.length === 0) {
    console.error(
      "Uso: npx tsx scripts/syncTelnyxAssistants.ts --business <id> [--business <id> ...]"
    );
    process.exitCode = 1;
    return;
  }

  for (const businessId of businessIds) {
    console.log(`[Sync] ${businessId}...`);
    await syncAgentToTelnyx(businessId, prisma);
  }
  console.log(`[Sync] Hecho para ${businessIds.length} negocio(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[Sync] Fallo inesperado:", error);
    process.exit(1);
  });
