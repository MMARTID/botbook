import type { PlanId } from "./types";

const PENDING_PLAN_KEY = "botbook_pending_plan";
const VALID_PLAN_IDS: PlanId[] = ["inicio", "pro", "scale"];

export function isPlanId(value: string | null): value is PlanId {
  return value !== null && VALID_PLAN_IDS.includes(value as PlanId);
}

export function savePendingPlan(planId: PlanId) {
  window.localStorage.setItem(PENDING_PLAN_KEY, planId);
}

export function getPendingPlan() {
  const planId = window.localStorage.getItem(PENDING_PLAN_KEY);
  return isPlanId(planId) ? planId : null;
}

export function consumePendingPlan() {
  const planId = getPendingPlan();
  window.localStorage.removeItem(PENDING_PLAN_KEY);
  return planId;
}

export function hasAuthToken() {
  return Boolean(
    window.localStorage.getItem("botbook_token") ??
      window.localStorage.getItem("token") ??
      window.localStorage.getItem("jwt"),
  );
}
