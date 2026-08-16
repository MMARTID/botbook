export const PLAN_IDS = ["inicio", "pro", "scale"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

type BillingPlan = {
  id: PlanId;
  databasePlan: string;
  includedMinutes: number;
  extraMinuteCents: number;
  priceEnvironmentVariable: string;
};

export const BILLING_PLANS: Record<PlanId, BillingPlan> = {
  inicio: {
    id: "inicio",
    databasePlan: "basic",
    includedMinutes: 100,
    extraMinuteCents: 60,
    priceEnvironmentVariable: "STRIPE_PRICE_INICIO",
  },
  pro: {
    id: "pro",
    databasePlan: "pro",
    includedMinutes: 400,
    extraMinuteCents: 45,
    priceEnvironmentVariable: "STRIPE_PRICE_PRO",
  },
  scale: {
    id: "scale",
    databasePlan: "enterprise",
    includedMinutes: 1000,
    extraMinuteCents: 35,
    priceEnvironmentVariable: "STRIPE_PRICE_SCALE",
  },
};

export function getBillingPlan(planId: PlanId) {
  return BILLING_PLANS[planId];
}

export function getPriceId(planId: PlanId) {
  const plan = getBillingPlan(planId);
  const priceId = process.env[plan.priceEnvironmentVariable];

  if (!priceId) {
    throw new Error(`${plan.priceEnvironmentVariable} is not configured`);
  }

  return priceId;
}

export function getPlanByPriceId(priceId: string) {
  return Object.values(BILLING_PLANS).find(
    (plan) => process.env[plan.priceEnvironmentVariable] === priceId,
  );
}
