export const PLAN_IDS = ["inicio", "pro", "scale"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

type BillingPlan = {
  id: PlanId;
  databasePlan: string;
  includedMinutes: number;
  extraMinuteCents: number;
  /** El precio con el que se abre un checkout NUEVO. */
  priceEnvironmentVariable: string;
  /**
   * Precios "de fundador": ya no se ofrecen a nadie nuevo, pero los negocios
   * que los contrataron los conservan mientras sigan suscritos. Sin esto,
   * `getPlanByPriceId` dejaría de reconocerlos en cuanto se suba el precio
   * (plan/minutos/features a null) — ver subida de precios 2026-10.
   */
  legacyPriceEnvironmentVariables: readonly string[];
  usagePriceEnvironmentVariable: string;
};

export const BILLING_PLANS: Record<PlanId, BillingPlan> = {
  inicio: {
    id: "inicio",
    databasePlan: "basic",
    includedMinutes: 150,
    extraMinuteCents: 45,
    priceEnvironmentVariable: "STRIPE_PRICE_INICIO",
    legacyPriceEnvironmentVariables: ["STRIPE_PRICE_INICIO_FOUNDER"],
    usagePriceEnvironmentVariable: "STRIPE_PRICE_EXTRA_INICIO",
  },
  pro: {
    id: "pro",
    databasePlan: "pro",
    includedMinutes: 500,
    extraMinuteCents: 40,
    priceEnvironmentVariable: "STRIPE_PRICE_PRO",
    legacyPriceEnvironmentVariables: ["STRIPE_PRICE_PRO_FOUNDER"],
    usagePriceEnvironmentVariable: "STRIPE_PRICE_EXTRA_PRO",
  },
  scale: {
    id: "scale",
    databasePlan: "enterprise",
    includedMinutes: 1100,
    extraMinuteCents: 35,
    priceEnvironmentVariable: "STRIPE_PRICE_SCALE",
    legacyPriceEnvironmentVariables: ["STRIPE_PRICE_SCALE_FOUNDER"],
    usagePriceEnvironmentVariable: "STRIPE_PRICE_EXTRA_SCALE",
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

export function getUsagePriceId(planId: PlanId) {
  const plan = getBillingPlan(planId);
  const priceId = process.env[plan.usagePriceEnvironmentVariable];
  if (!priceId) {
    throw new Error(`${plan.usagePriceEnvironmentVariable} is not configured`);
  }
  return priceId;
}

/** El precio de fundador de este plan, si hay uno configurado. */
export function getFounderPriceId(planId: PlanId) {
  const envVar = getBillingPlan(planId).legacyPriceEnvironmentVariables[0];
  return envVar ? process.env[envVar] : undefined;
}

/** Todos los precios de fundador configurados, de cualquier plan. */
export function getAllFounderPriceIds(): string[] {
  return Object.values(BILLING_PLANS)
    .map((plan) => getFounderPriceId(plan.id))
    .filter((value): value is string => Boolean(value));
}

export function getPlanByPriceId(priceId: string) {
  return Object.values(BILLING_PLANS).find((plan) => {
    if (process.env[plan.priceEnvironmentVariable] === priceId) return true;
    return plan.legacyPriceEnvironmentVariables.some(
      (envVar) => process.env[envVar] === priceId,
    );
  });
}
