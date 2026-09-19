/**
 * Resincroniza las tools de voz (Telnyx primary + Retell fallback) de todos
 * los negocios de DESARROLLO contra `BASE_URL`.
 *
 * Con el hostname fijo del túnel de Cloudflare, la URL ya no cambia sola, así
 * que esto dejó de ser una reparación rutinaria: sirve para empujar a los
 * assistants ya creados un cambio de esquema de tools, de descripciones o de
 * prompt, que un deploy por sí solo no propaga (ver AGENTS.md
 * § "Propagating a tool-schema or prompt change to existing agents").
 *
 * Uso (dentro del contenedor de dev):
 *   docker exec alhabla_backend_dev npx tsx scripts/manual/resyncToolsDev.mts
 */
import { getPublicWebhookBaseUrl } from "../../src/lib/serverUrl.js";
import { prisma } from "../../src/lib/prisma.js";
import { calendarService } from "../../src/modules/calendar/service.js";

async function main() {
  const baseUrl = getPublicWebhookBaseUrl();
  if (!baseUrl) {
    throw new Error(
      "Falta BASE_URL: abortado para no dejar las tools apuntando a nada."
    );
  }
  // Guardarraíl: este script es de desarrollo y escribe en los assistants
  // reales de la cuenta (dev y producción comparten cuenta de Telnyx/Retell
  // hoy). Con BASE_URL de producción reescribiría las URLs de los assistants
  // de clientes reales apuntándolas a este proceso.
  if (baseUrl.includes("api.alhabla.ai")) {
    throw new Error(
      `BASE_URL es la de producción (${baseUrl}). Este script es solo para desarrollo.`
    );
  }
  console.log(`[Resync] BASE_URL: ${baseUrl}`);

  const businesses = await prisma.business.findMany({
    select: { id: true, name: true, orchestrator: true },
    orderBy: { createdAt: "asc" },
  });

  let fallos = 0;
  for (const business of businesses) {
    try {
      await calendarService.syncCalendarToolsToAgents(business.id, {
        strict: true,
      });
      console.log(`[Resync] OK  ${business.name} (${business.orchestrator})`);
    } catch (error) {
      fallos++;
      console.error(`[Resync] FALLO ${business.name}:`, error);
    }
  }
  console.log(
    `[Resync] Terminado: ${businesses.length - fallos}/${businesses.length} negocios`
  );
  await prisma.$disconnect();
  if (fallos > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error("[Resync] Error fatal:", error);
  await prisma.$disconnect();
  process.exit(1);
});
