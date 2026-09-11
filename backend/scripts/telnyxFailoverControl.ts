/**
 * Comando manual de failover Telnyx → Retell (plan §7: "comando manual
 * interno, autenticado y auditado"). No hay panel de administración ni rol
 * de staff en este proyecto (auth es por negocio) — "autenticado" aquí es
 * el mismo control de acceso que ya rige scripts/syncManagedAgentPrompts.ts:
 * requiere acceso al servidor/BD para ejecutarlo. "Auditado" = deja
 * constancia en Business.voiceFailoverReason/voiceRoutingChangedAt y en el
 * log de esta ejecución.
 *
 * Uso:
 *   npx tsx scripts/telnyxFailoverControl.ts --business <id> --action activate --reason "..."
 *   npx tsx scripts/telnyxFailoverControl.ts --business <id> --action revert
 *
 * - activate: fuerza la ruta a Retell YA, aunque Telnyx esté sano. Uso: un
 *   incidente detectado a mano antes de que el health-check automático
 *   dispare (o si VOICE_FAILOVER_ENABLED está apagado).
 * - revert: fuerza la vuelta a Telnyx. Solo tiene efecto si el negocio
 *   sigue configurado con orchestrator="telnyx" — revertir un negocio que
 *   nunca tuvo Telnyx como primary es un error de uso, no un no-op silencioso.
 *
 * LÍMITE CONOCIDO: no existe todavía un campo "pausado manualmente" — si
 * telnyx-health-check automático (VOICE_FAILOVER_ENABLED=true) alcanza 5
 * lecturas buenas seguidas DESPUÉS de un `activate` manual, puede revertirlo
 * él solo sin que nadie lo haya pedido. Aceptable hoy porque el failover
 * automático está apagado en producción; documentado para cuando se active.
 */
import { prisma } from "../src/lib/prisma.js";
import { telnyxAiAdapter } from "../src/adapters/telnyx/TelnyxAiAdapter.js";

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const businessId = readArgument("--business");
  const action = readArgument("--action");
  const reason = readArgument("--reason") || "Cambio manual sin motivo indicado";

  if (!businessId || (action !== "activate" && action !== "revert")) {
    console.error(
      "Uso: npx tsx scripts/telnyxFailoverControl.ts --business <id> --action activate|revert [--reason \"...\"]"
    );
    process.exitCode = 1;
    return;
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      orchestrator: true,
      voiceRoutingTarget: true,
      telnyxPhoneNumberId: true,
    },
  });

  if (!business) {
    console.error(`No existe el negocio ${businessId}`);
    process.exitCode = 1;
    return;
  }

  if (business.orchestrator !== "telnyx") {
    console.error(
      `El negocio ${business.name} (${business.id}) no tiene orchestrator="telnyx" (tiene "${business.orchestrator}") — no hay ningún failover que activar o revertir.`
    );
    process.exitCode = 1;
    return;
  }

  if (!business.telnyxPhoneNumberId) {
    console.error(
      `El negocio ${business.name} (${business.id}) no tiene telnyxPhoneNumberId — no se puede cambiar su connection_id.`
    );
    process.exitCode = 1;
    return;
  }

  const target = action === "activate" ? "retell" : "telnyx";
  if (business.voiceRoutingTarget === target) {
    console.log(
      `[FailoverControl] ${business.name} (${business.id}) ya está en ruta "${target}" — nada que hacer.`
    );
    return;
  }

  const connectionId =
    target === "telnyx"
      ? process.env.TELNYX_CALL_CONTROL_APP_ID
      : process.env.TELNYX_SIP_CONNECTION_ID;
  if (!connectionId) {
    console.error(
      `Falta ${
        target === "telnyx" ? "TELNYX_CALL_CONTROL_APP_ID" : "TELNYX_SIP_CONNECTION_ID"
      } — no se puede completar el cambio de ruta.`
    );
    process.exitCode = 1;
    return;
  }

  await telnyxAiAdapter.setPhoneNumberConnectionId(
    business.telnyxPhoneNumberId,
    connectionId
  );

  await prisma.business.update({
    where: { id: business.id },
    data: {
      voiceRoutingTarget: target,
      voiceFailoverActive: target === "retell",
      voiceFailoverReason: target === "retell" ? `Manual: ${reason}` : null,
      voiceRoutingChangedAt: new Date(),
    },
  });

  console.log(
    `[FailoverControl] ${business.name} (${business.id}) cambiado manualmente a ruta "${target}". Motivo: ${reason}`
  );
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error("[FailoverControl] Fallo:", error);
    process.exit(1);
  });
