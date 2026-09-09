/**
 * Resincroniza en Retell el prompt y saludo de todos los agentes gestionados.
 *
 * Úsalo tras desplegar una mejora transversal del prompt:
 *   npm run agents:sync-prompts
 *
 * Añade --dry-run para listar los negocios sin modificar Retell, o
 * --business <id> para limitar la operación a un negocio concreto.
 * Nunca toca agentes inactivos ni con promptManuallyEdited=true.
 */
import { prisma } from "../src/lib/prisma.js";
import { syncAgentToRetell } from "../src/lib/agentBootstrap.js";

const BUSINESSES_PER_BATCH = 50;

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const businessId = readArgument("--business");
  let cursor: string | undefined;
  let processed = 0;
  let failures = 0;

  do {
    const businesses = await prisma.business.findMany({
      where: {
        ...(businessId ? { id: businessId } : {}),
        orchestrator: "retell",
        agents: {
          some: {
            active: true,
            retellAgentId: { not: null },
            retellLlmId: { not: null },
            promptManuallyEdited: false,
          },
        },
      },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
      take: BUSINESSES_PER_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (businesses.length === 0) break;

    for (const business of businesses) {
      if (dryRun) {
        console.log(`[AgentPromptSync] Se sincronizaría ${business.name} (${business.id})`);
        continue;
      }

      try {
        await syncAgentToRetell(business.id, prisma, {
          onlyManagedPrompts: true,
          onlyActive: true,
        });
        console.log(`[AgentPromptSync] Sincronizado ${business.name} (${business.id})`);
      } catch (error) {
        failures++;
        console.error(`[AgentPromptSync] Error en ${business.id}:`, error);
      }
    }

    processed += businesses.length;
    if (businesses.length < BUSINESSES_PER_BATCH || businessId) break;
    cursor = businesses[businesses.length - 1].id;
  } while (true);

  console.log(
    `[AgentPromptSync] ${dryRun ? "Se revisarían" : "Se sincronizaron"} ` +
      `${processed} negocio(s)${failures > 0 ? `; ${failures} con error` : ""}.`
  );
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[AgentPromptSync] Error fatal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
