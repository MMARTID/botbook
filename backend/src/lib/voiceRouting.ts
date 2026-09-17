import { telnyxAiAdapter } from "../adapters/telnyx/TelnyxAiAdapter.js";
import { acquireLock, releaseLock } from "./bookingLock.js";

const LOCK_TTL_MS = 60_000;
const LOCK_ACQUIRE_BUDGET_MS = 5_000;

// Mismo formato de clave que provisionPhoneNumber (phone/service.ts) — un
// cambio de ruta y un aprovisionamiento inicial nunca deben poder pisarse.
function phoneProvisionLockKey(businessId: string): string {
  return `phone_provision_lock:${businessId}`;
}

export type VoiceRoutingTarget = "telnyx" | "retell";

export function resolveConnectionIdForTarget(
  target: VoiceRoutingTarget
): string | undefined {
  return target === "telnyx"
    ? process.env.TELNYX_CALL_CONTROL_APP_ID
    : process.env.TELNYX_SIP_CONNECTION_ID;
}

/**
 * Repunta de verdad el número Telnyx de un negocio al connection_id de
 * Telnyx AI Assistants o al SIP trunk de Retell — bloqueado con el mismo
 * lock que el aprovisionamiento inicial para que un cambio de ruta y una
 * compra de número nunca puedan pisarse. Extraído de telnyxHealthCheck.ts
 * (failover automático) para que el cambio reactivo por idioma/plan
 * (telnyxAgentSync.ts) reutilice el mismo mecanismo en vez de duplicarlo.
 *
 * No toca la base de datos: cada caller decide qué campos de `Business`
 * actualizar tras el éxito, porque tienen semánticas distintas (un
 * failover no cambia `orchestrator`, un cambio de política sí).
 */
export async function repointTelnyxPhoneNumber(
  businessId: string,
  telnyxPhoneNumberId: string,
  target: VoiceRoutingTarget
): Promise<{ success: true } | { success: false; error: string }> {
  const connectionId = resolveConnectionIdForTarget(target);
  if (!connectionId) {
    return {
      success: false,
      error: `Falta ${
        target === "telnyx"
          ? "TELNYX_CALL_CONTROL_APP_ID"
          : "TELNYX_SIP_CONNECTION_ID"
      }`,
    };
  }

  const lockKey = phoneProvisionLockKey(businessId);
  const lockToken = await acquireLock(
    lockKey,
    LOCK_TTL_MS,
    LOCK_ACQUIRE_BUDGET_MS
  );
  if (!lockToken) {
    return {
      success: false,
      error: "No se pudo bloquear el negocio para cambiar de ruta",
    };
  }

  try {
    await telnyxAiAdapter.setPhoneNumberConnectionId(
      telnyxPhoneNumberId,
      connectionId
    );
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await releaseLock(lockKey, lockToken);
  }
}
