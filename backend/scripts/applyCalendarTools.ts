/**
 * Aplica syncCalendarToolsToAgents (ahora también Telnyx) a los negocios
 * indicados — el mismo camino real que dispara guardar el horario o
 * conectar un calendario, invocado a mano para las 4 cuentas ya cortadas a
 * Telnyx.
 */
import { calendarService } from "../src/modules/calendar/service.js";

async function main() {
  const businessIds = process.argv.slice(2);
  if (businessIds.length === 0) {
    console.error("Uso: npx tsx scripts/applyCalendarTools.ts <businessId> [...]");
    process.exitCode = 1;
    return;
  }

  for (const businessId of businessIds) {
    console.log(`[applyCalendarTools] ${businessId}...`);
    await calendarService.syncCalendarToolsToAgents(businessId);
  }
  console.log("[applyCalendarTools] Hecho.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[applyCalendarTools] Fallo:", error);
    process.exit(1);
  });
