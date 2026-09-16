import { isAxiosError } from "axios";
import type { PlanId } from "@/lib/types";

export type PlanLimitInfo = {
  code: string;
  planId: PlanId;
  limit: number | null;
};

/**
 * Extrae la información de límite de plan de un error del backend (403 con
 * `code` tipo PLAN_LIMIT_*), o null si el error es de otro tipo.
 */
export function getPlanLimitInfo(error: unknown): PlanLimitInfo | null {
  if (!isAxiosError(error)) return null;
  const data = error.response?.data as
    | { code?: string; planId?: PlanId; limit?: number | null }
    | undefined;
  if (error.response?.status !== 403 || !data?.code?.startsWith("PLAN_LIMIT_")) {
    return null;
  }
  return {
    code: data.code,
    planId: data.planId ?? "inicio",
    limit: data.limit ?? null,
  };
}

/** Copy de la invitación a subir de plan cuando se alcanza el límite. */
export function planLimitUpgradeMessage(info: PlanLimitInfo): string {
  const nextPlan =
    info.planId === "inicio" ? "Pro" : info.planId === "pro" ? "Scale" : null;
  const base =
    info.limit != null
      ? `Tu plan incluye hasta ${info.limit} profesionales activos.`
      : "Has alcanzado el límite de tu plan.";
  return nextPlan
    ? `${base} Pasa al plan ${nextPlan} para añadir más.`
    : base;
}
