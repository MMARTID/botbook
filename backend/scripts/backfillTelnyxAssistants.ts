/**
 * Migración idempotente para cuentas existentes (PLAN-TELNYX-ORQUESTADOR.md
 * Fase 1: "crea los assistants Telnyx faltantes sin tocar la ruta de las
 * llamadas"). Crea el assistant Telnyx de cada agente activo que todavía no
 * tenga uno, SIN cambiar orchestrator/voiceRoutingTarget ni el connection_id
 * del número — eso es el cutover de la Fase 5, un paso aparte y deliberado.
 *
 * Uso:
 *   npx tsx scripts/backfillTelnyxAssistants.ts --business <id> [--business <id> ...]
 *   npx tsx scripts/backfillTelnyxAssistants.ts --dry-run --business <id>
 */
import { prisma } from "../src/lib/prisma.js";
import { createTelnyxAssistantForAgent } from "../src/lib/telnyxAgentSync.js";

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
  const dryRun = process.argv.includes("--dry-run");
  const businessIds = readAllArguments("--business");

  if (businessIds.length === 0) {
    console.error(
      "Uso: npx tsx scripts/backfillTelnyxAssistants.ts --business <id> [--business <id> ...] [--dry-run]"
    );
    process.exitCode = 1;
    return;
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const businessId of businessIds) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        agents: {
          where: { active: true, deletedAt: null },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { id: true, telnyxAssistantId: true },
        },
      },
    });

    if (!business) {
      console.error(`[Backfill] No existe el negocio ${businessId}`);
      failed++;
      continue;
    }

    const agent = business.agents[0];
    if (!agent) {
      console.warn(`[Backfill] ${business.name} (${business.id}) no tiene ningún agente activo — se omite`);
      skipped++;
      continue;
    }

    if (agent.telnyxAssistantId) {
      console.log(`[Backfill] ${business.name} (${business.id}) ya tiene assistant Telnyx (${agent.telnyxAssistantId}) — se omite`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[Backfill] [dry-run] Crearía el assistant Telnyx del agente ${agent.id} de ${business.name} (${business.id})`);
      continue;
    }

    const result = await createTelnyxAssistantForAgent({
      agentId: agent.id,
      businessId: business.id,
    });

    if (result.eligible) {
      console.log(`[Backfill] ${business.name} (${business.id}): assistant Telnyx creado`);
      created++;
    } else {
      console.error(`[Backfill] ${business.name} (${business.id}): no elegible — ${result.reason}`);
      failed++;
    }
  }

  console.log(
    `[Backfill] ${created} creado(s), ${skipped} omitido(s), ${failed} fallido(s) de ${businessIds.length} negocio(s).`
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error("[Backfill] Fallo inesperado:", error);
    process.exit(1);
  });
