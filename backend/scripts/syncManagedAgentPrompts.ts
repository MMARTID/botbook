/**
 * Resincroniza en Retell el prompt y saludo de todos los agentes gestionados.
 *
 * Úsalo tras desplegar una mejora transversal del prompt:
 *   npm run agents:sync-prompts
 *
 * Añade --dry-run para listar los negocios sin modificar Retell, o
 * --business <id> para limitar la operación a un negocio concreto.
 * Por defecto no toca los agentes con promptManuallyEdited=true. Con
 * --include-manual conserva su prompt manual y actualiza solo su configuración
 * transversal (voz, fallback, idioma, análisis y herramientas).
 */
import { prisma } from "../src/lib/prisma.js";
import { syncAgentToRetell } from "../src/lib/agentBootstrap.js";
import { syncAgentToTelnyx } from "../src/lib/telnyxAgentSync.js";

const BUSINESSES_PER_BATCH = 50;

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const includeManual = process.argv.includes("--include-manual");
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
            // La actualización de voz debe alcanzar también negocios cuyos
            // agentes sean todos manuales. syncAgentToRetell conserva su
            // texto y actualiza solo la configuración transversal.
            ...(includeManual ? {} : { promptManuallyEdited: false }),
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
          // syncAgentToRetell nunca reescribe el texto de un agente manual;
          // este flag solo permite que reciba las mejoras seguras de plataforma.
          ...(includeManual ? {} : { onlyManagedPrompts: true }),
          onlyActive: true,
          // En la ejecución de producción no aceptamos un falso positivo:
          // si las tools no pueden publicarse y verificarse en Retell, el
          // proceso termina con error y Cloud Build no lo marca como listo.
          strictCalendarTools: process.env.NODE_ENV === "production",
        });
        // No-op para negocios sin telnyxAssistantId todavía (la inmensa
        // mayoría hoy) — nunca lanza, ver syncAgentToTelnyx.
        await syncAgentToTelnyx(business.id, prisma, {
          ...(includeManual ? {} : { onlyManagedPrompts: true }),
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
