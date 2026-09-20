import type { Prisma } from "@prisma/client";

/**
 * Preferencias de avisos por WhatsApp del negocio (`Business.notificationPrefs`,
 * PLAN-CANAL-DUENO.md § 4). Vive aparte para que las lean tanto los avisos
 * (avisosNegocio.ts) como el estado del panel (altaDueno.ts) sin importarse
 * entre sí.
 */
export interface PreferenciasDeAvisos {
  /** Aviso #1 por cada reserva. Activado salvo que el dueño lo apague. */
  avisoPorReserva?: boolean;
}

export function preferenciasDeAvisos(
  raw: Prisma.JsonValue | null | undefined
): PreferenciasDeAvisos {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const prefs = raw as Record<string, unknown>;
  return {
    avisoPorReserva:
      typeof prefs.avisoPorReserva === "boolean"
        ? prefs.avisoPorReserva
        : undefined,
  };
}
