import type { PlanId } from "./types";

const VALID_PLAN_IDS: PlanId[] = ["inicio", "pro", "scale"];

export function isPlanId(value: string | null): value is PlanId {
  return value !== null && VALID_PLAN_IDS.includes(value as PlanId);
}
