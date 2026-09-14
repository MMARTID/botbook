import { prisma } from "../lib/prisma.js";
import { getRedis } from "../lib/redis.js";
import { checkTelnyxAiInfraStatus } from "../lib/telnyxStatusPage.js";
import { repointTelnyxPhoneNumber } from "../lib/voiceRouting.js";
import { errorMessage } from "../lib/logUtils.js";

// Plan §7: dos lecturas malas consecutivas activan el failover a Retell,
// cinco buenas consecutivas hacen el failback a Telnyx.
const CONSECUTIVE_BAD_TO_FAILOVER = 2;
const CONSECUTIVE_GOOD_TO_FAILBACK = 5;

const REDIS_KEY_BAD_STREAK = "telnyx_health:consecutive_bad";
const REDIS_KEY_GOOD_STREAK = "telnyx_health:consecutive_good";

function isVoiceFailoverEnabled(): boolean {
  // Kill switch global (plan §7) — por defecto apagado: sin esto, un
  // despliegue que se olvide de fijarlo no debe poder mover tráfico real
  // por su cuenta.
  return process.env.VOICE_FAILOVER_ENABLED === "true";
}

/**
 * `telnyx-health-check` — invocado cada 2 minutos por Cloud Scheduler vía
 * POST /internal/jobs/telnyx-health-check (plan §7). Hoy es inerte para
 * cualquier negocio real: solo actúa sobre negocios con
 * `orchestrator="telnyx"`, y ninguno lo tiene todavía (eso es la Fase 5,
 * deliberadamente no ejecutada).
 */
export async function telnyxHealthCheckJob(): Promise<void> {
  if (!isVoiceFailoverEnabled()) {
    console.log(
      "[TelnyxHealth] VOICE_FAILOVER_ENABLED no está activo — no se evalúa nada."
    );
    return;
  }

  let status;
  try {
    status = await checkTelnyxAiInfraStatus();
  } catch (error) {
    // Un fallo de RED consultando el status page no es lo mismo que Telnyx
    // caído — no debe poder disparar un failover por sí solo.
    console.error(
      `[TelnyxHealth] No se pudo consultar el status page de Telnyx: ${errorMessage(error)}`
    );
    return;
  }

  if (status.unconfigured) {
    console.warn(
      "[TelnyxHealth] TELNYX_STATUS_COMPONENT_IDS no está configurado — el failover automático permanece inactivo."
    );
    return;
  }

  const redis = getRedis();
  let badStreak = 0;
  let goodStreak = 0;

  if (status.healthy) {
    goodStreak = await redis.incr(REDIS_KEY_GOOD_STREAK);
    await redis.del(REDIS_KEY_BAD_STREAK);
  } else {
    badStreak = await redis.incr(REDIS_KEY_BAD_STREAK);
    await redis.del(REDIS_KEY_GOOD_STREAK);
    console.warn(
      `[TelnyxHealth] Lectura degradada (${badStreak}/${CONSECUTIVE_BAD_TO_FAILOVER}): ${JSON.stringify(
        status.components
      )}`
    );
  }

  if (badStreak >= CONSECUTIVE_BAD_TO_FAILOVER) {
    await applyRoutingTarget(
      "retell",
      `Telnyx AI/Inference degradado (${badStreak} lecturas seguidas): ${JSON.stringify(
        status.components
      )}`
    );
  } else if (goodStreak >= CONSECUTIVE_GOOD_TO_FAILBACK) {
    await applyRoutingTarget(
      "telnyx",
      `Telnyx AI/Inference recuperado (${goodStreak} lecturas seguidas)`
    );
    // Sin este reset, cada tick posterior a alcanzar el umbral repetiría el
    // failback (ya no-op en la práctica, pero generaría ruido/logs de más).
    await redis.del(REDIS_KEY_GOOD_STREAK);
  }
}

async function applyRoutingTarget(
  target: "telnyx" | "retell",
  reason: string
): Promise<void> {
  const currentRoute = target === "telnyx" ? "retell" : "telnyx";
  const businesses = await prisma.business.findMany({
    where: {
      orchestrator: "telnyx",
      voiceRoutingTarget: currentRoute,
      telnyxPhoneNumberId: { not: null },
    },
    select: { id: true, telnyxPhoneNumberId: true },
  });

  if (businesses.length === 0) return;

  console.log(
    `[TelnyxHealth] Aplicando ruta "${target}" a ${businesses.length} negocio(s): ${reason}`
  );

  for (const business of businesses) {
    const result = await repointTelnyxPhoneNumber(
      business.id,
      business.telnyxPhoneNumberId!,
      target
    );

    if (!result.success) {
      console.error(
        `[TelnyxHealth] Fallo cambiando la ruta del negocio ${business.id}: ${result.error}`
      );
      continue;
    }

    await prisma.business.update({
      where: { id: business.id },
      data: {
        voiceRoutingTarget: target,
        voiceFailoverActive: target === "retell",
        voiceFailoverReason: target === "retell" ? reason : null,
        voiceRoutingChangedAt: new Date(),
      },
    });

    console.log(
      `[TelnyxHealth] Negocio ${business.id} cambiado a ruta "${target}"`
    );
  }
}
