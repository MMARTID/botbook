/**
 * Resincroniza las tools de voz (Telnyx primary + Retell fallback) de todos
 * los negocios de DESARROLLO contra la URL pública actual.
 *
 * Existe porque ngrok rota el dominio en cada reinicio del contenedor y las
 * URLs de las tools quedan horneadas en el assistant: apuntan al túnel
 * anterior y todas las llamadas de tool fallan en silencio (ver AGENTS.md
 * § "Re-syncing webhook URLs"). También arrastra las tools nuevas a los
 * assistants sincronizados antes de que existieran.
 *
 * Uso (dentro del contenedor de dev, que es quien ve http://ngrok:4040):
 *   docker exec alhabla_backend_dev npx tsx scripts/manual/resyncToolsDev.mts
 */
import { fetchAndSetNgrokUrl } from "../../src/lib/ngrok.js";
import { getPublicWebhookBaseUrl } from "../../src/lib/serverUrl.js";
import { prisma } from "../../src/lib/prisma.js";
import { calendarService } from "../../src/modules/calendar/service.js";

async function main() {
  // El script es un proceso aparte del servidor: serverConfig.webhookUrl
  // empieza a null y hay que capturar el túnel aquí.
  await fetchAndSetNgrokUrl();
  const baseUrl = getPublicWebhookBaseUrl();
  if (!baseUrl) {
    throw new Error(
      "Sin URL pública (ni ngrok ni BASE_URL): abortado para no dejar las tools apuntando a nada."
    );
  }
  console.log(`[Resync] URL pública actual: ${baseUrl}`);

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
