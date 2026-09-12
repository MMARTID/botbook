/**
 * Cutover real (PLAN-TELNYX-ORQUESTADOR.md Fase 5, etapa 1: cuentas de
 * desarrollo). Para cada negocio: exige que ya tenga un assistant Telnyx
 * (backfillTelnyxAssistants.ts) y un número Telnyx propio, cambia su
 * connection_id al Call Control App de plataforma y marca
 * orchestrator/voiceRoutingTarget="telnyx". Retell queda intacto como
 * fallback — nada de esto lo borra.
 *
 * Uso:
 *   npx tsx scripts/cutoverToTelnyx.ts --business <id> [--business <id> ...]
 *   npx tsx scripts/cutoverToTelnyx.ts --dry-run --business <id>
 */
import { prisma } from "../src/lib/prisma.js";
import { telnyxAiAdapter } from "../src/adapters/telnyx/TelnyxAiAdapter.js";
import { calendarService } from "../src/modules/calendar/service.js";

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
      "Uso: npx tsx scripts/cutoverToTelnyx.ts --business <id> [--business <id> ...] [--dry-run]"
    );
    process.exitCode = 1;
    return;
  }

  const connectionId = process.env.TELNYX_CALL_CONTROL_APP_ID;
  if (!connectionId) {
    console.error("Falta TELNYX_CALL_CONTROL_APP_ID — crea antes el Call Control App de plataforma.");
    process.exitCode = 1;
    return;
  }

  let cutover = 0;
  let skipped = 0;
  let failed = 0;

  for (const businessId of businessIds) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        orchestrator: true,
        telnyxPhoneNumberId: true,
        telnyxPhoneNumber: true,
        agents: {
          where: { active: true, deletedAt: null },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { telnyxAssistantId: true },
        },
      },
    });

    if (!business) {
      console.error(`[Cutover] No existe el negocio ${businessId}`);
      failed++;
      continue;
    }

    if (business.orchestrator === "telnyx") {
      console.log(`[Cutover] ${business.name} (${business.id}) ya está en orchestrator=telnyx — se omite`);
      skipped++;
      continue;
    }

    if (!business.telnyxPhoneNumberId) {
      console.error(`[Cutover] ${business.name} (${business.id}) no tiene un número Telnyx propio — se omite`);
      failed++;
      continue;
    }

    const agentTelnyxAssistantId = business.agents[0]?.telnyxAssistantId;
    if (!agentTelnyxAssistantId) {
      console.error(
        `[Cutover] ${business.name} (${business.id}) no tiene assistant Telnyx todavía — ejecuta antes backfillTelnyxAssistants.ts`
      );
      failed++;
      continue;
    }

    if (dryRun) {
      console.log(
        `[Cutover] [dry-run] Cambiaría ${business.name} (${business.id}, ${business.telnyxPhoneNumber}) a orchestrator=telnyx`
      );
      continue;
    }

    try {
      // Gate obligatorio: createTelnyxAssistantForAgent (backfill) crea el
      // assistant SIN tools de calendario — solo se registran cuando se
      // guarda el horario o se conecta un calendario (mismo patrón que
      // Retell, ver retell-tools-only-registered-on-schedule-or-calendar).
      // Sin este paso, el cutover deja tráfico real en un assistant que
      // cuelga en cuanto intenta comprobar disponibilidad (incidente real
      // 2026-09-12 en las 5 cuentas de test).
      await calendarService.syncCalendarToolsToAgents(business.id, {
        strict: true,
      });

      await telnyxAiAdapter.setPhoneNumberConnectionId(
        business.telnyxPhoneNumberId,
        connectionId
      );

      await prisma.business.update({
        where: { id: business.id },
        data: {
          orchestrator: "telnyx",
          voiceRoutingTarget: "telnyx",
          telnyxEligibilityStatus: "eligible",
          telnyxEligibilityReason: null,
          voiceRoutingChangedAt: new Date(),
        },
      });

      console.log(`[Cutover] ${business.name} (${business.id}, ${business.telnyxPhoneNumber}) cambiado a orchestrator=telnyx`);
      cutover++;
    } catch (error) {
      console.error(
        `[Cutover] Fallo en ${business.name} (${business.id}): ${
          error instanceof Error ? error.message : String(error)
        } — se sigue con el resto`
      );
      failed++;
    }
  }

  console.log(
    `[Cutover] ${cutover} negocio(s) cambiados, ${skipped} omitido(s), ${failed} fallido(s) de ${businessIds.length}.`
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error("[Cutover] Fallo inesperado:", error);
    process.exit(1);
  });
