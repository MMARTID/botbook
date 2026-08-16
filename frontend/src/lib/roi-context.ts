import type { Plan } from "@/lib/plans";

const ESTIMATE_KEY = "asistai_roi_estimate_v1";
const ACTIVE_CONTEXT_KEY = "asistai_roi_context_v1";
const CONTEXT_TTL_MS = 60 * 60 * 1000;

export const ROI_LIMITS = {
  ticket: { min: 10, max: 200 },
  appointments: { min: 1, max: 20 },
} as const;

export type RoiEstimate = {
  version: 1;
  averageTicket: number;
  missedAppointmentsPerWeek: number;
  updatedAt: number;
};

type ActiveRoiContext = RoiEstimate & {
  expiresAt: number;
};

export type RoiImpact = {
  monthlyAppointments: number;
  monthlyOpportunity: number;
  annualOpportunity: number;
};

export type PlanValueContrast = RoiImpact & {
  monthlyPlanCost: number;
  annualPlanCost: number;
  monthlyDifference: number;
  annualDifference: number;
  valueMultiple: number;
  appointmentsToCoverPlan: number;
  opportunityCoversPlan: boolean;
};

function clampInteger(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(Math.round(parsed), minimum), maximum);
}

export function normalizeRoiEstimate(value: unknown): RoiEstimate | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<RoiEstimate>;
  const averageTicket = clampInteger(candidate.averageTicket, ROI_LIMITS.ticket.min, ROI_LIMITS.ticket.max);
  const missedAppointmentsPerWeek = clampInteger(
    candidate.missedAppointmentsPerWeek,
    ROI_LIMITS.appointments.min,
    ROI_LIMITS.appointments.max,
  );
  if (averageTicket === null || missedAppointmentsPerWeek === null) return null;

  return {
    version: 1,
    averageTicket,
    missedAppointmentsPerWeek,
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : Date.now(),
  };
}

function readStoredValue(storage: Storage, key: string) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) as unknown : null;
  } catch {
    return null;
  }
}

function writeStoredValue(storage: Storage, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Browsers can deny storage in private or hardened contexts. The generic flow remains available.
  }
}

export function saveRoiEstimate(input: Pick<RoiEstimate, "averageTicket" | "missedAppointmentsPerWeek">) {
  if (typeof window === "undefined") return null;
  const estimate = normalizeRoiEstimate({ ...input, version: 1, updatedAt: Date.now() });
  if (!estimate) return null;
  writeStoredValue(window.localStorage, ESTIMATE_KEY, estimate);
  return estimate;
}

export function getSavedRoiEstimate() {
  if (typeof window === "undefined") return null;
  return normalizeRoiEstimate(readStoredValue(window.localStorage, ESTIMATE_KEY));
}

export function activateRoiContext(input: Pick<RoiEstimate, "averageTicket" | "missedAppointmentsPerWeek">) {
  if (typeof window === "undefined") return;
  const estimate = saveRoiEstimate(input);
  if (!estimate) return;
  const context: ActiveRoiContext = { ...estimate, expiresAt: Date.now() + CONTEXT_TTL_MS };
  writeStoredValue(window.sessionStorage, ACTIVE_CONTEXT_KEY, context);
}

export function getActiveRoiContext() {
  if (typeof window === "undefined") return null;
  const stored = readStoredValue(window.sessionStorage, ACTIVE_CONTEXT_KEY);
  const estimate = normalizeRoiEstimate(stored);
  const expiresAt = stored && typeof stored === "object" && typeof (stored as Partial<ActiveRoiContext>).expiresAt === "number"
    ? (stored as ActiveRoiContext).expiresAt
    : 0;

  if (!estimate || expiresAt <= Date.now()) {
    try {
      window.sessionStorage.removeItem(ACTIVE_CONTEXT_KEY);
    } catch {
      // Ignore unavailable storage and fall back to generic pricing.
    }
    return null;
  }

  return estimate;
}

export function calculateRoiImpact(estimate: Pick<RoiEstimate, "averageTicket" | "missedAppointmentsPerWeek">): RoiImpact {
  const monthlyAppointments = estimate.missedAppointmentsPerWeek * 4;
  const monthlyOpportunity = monthlyAppointments * estimate.averageTicket;
  return {
    monthlyAppointments,
    monthlyOpportunity,
    annualOpportunity: monthlyOpportunity * 12,
  };
}

export function calculatePlanValueContrast(
  estimate: Pick<RoiEstimate, "averageTicket" | "missedAppointmentsPerWeek">,
  plan: Pick<Plan, "price">,
): PlanValueContrast {
  const impact = calculateRoiImpact(estimate);
  const annualPlanCost = plan.price * 12;
  return {
    ...impact,
    monthlyPlanCost: plan.price,
    annualPlanCost,
    monthlyDifference: impact.monthlyOpportunity - plan.price,
    annualDifference: impact.annualOpportunity - annualPlanCost,
    valueMultiple: impact.monthlyOpportunity / plan.price,
    appointmentsToCoverPlan: Math.ceil(plan.price / estimate.averageTicket),
    opportunityCoversPlan: impact.monthlyOpportunity >= plan.price,
  };
}
