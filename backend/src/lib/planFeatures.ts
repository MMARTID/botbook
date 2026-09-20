import {
  getPlanByPriceId,
  PLAN_IDS,
  type PlanId,
} from "../modules/billing/catalog.js";

/**
 * Features y límites que diferencian a cada plan más allá de los minutos.
 *
 * Única fuente de verdad del gating por plan en el backend: cualquier
 * comprobación de "¿este negocio puede usar X?" debe pasar por aquí y no
 * comparar strings de plan sueltas. El copy comercial de las tarjetas vive en
 * `frontend/src/lib/plans.ts` y debe mantenerse coherente con esta tabla.
 */

export type PlanFeature =
  | "recordatorios_cita"
  | "resumen_semanal"
  | "voz_idioma"
  | "analitica_avanzada"
  | "multi_sede";

export type PlanLimitsAndFeatures = {
  /** null = sin límite. Solo cuenta profesionales activos no borrados. */
  maxProfessionals: number | null;
  features: readonly PlanFeature[];
};

const PRO_FEATURES: readonly PlanFeature[] = [
  "recordatorios_cita",
  "resumen_semanal",
  "voz_idioma",
];

const SCALE_FEATURES: readonly PlanFeature[] = [
  ...PRO_FEATURES,
  "analitica_avanzada",
  "multi_sede",
];

export const PLAN_FEATURES: Record<PlanId, PlanLimitsAndFeatures> = {
  inicio: { maxProfessionals: 3, features: [] },
  pro: { maxProfessionals: 10, features: PRO_FEATURES },
  scale: { maxProfessionals: null, features: SCALE_FEATURES },
};

/** Valor de `Business.plan` (columna legacy) → plan comercial. */
const LEGACY_PLAN_TO_PLAN_ID: Record<string, PlanId> = {
  basic: "inicio",
  pro: "pro",
  enterprise: "scale",
};

/**
 * Resuelve el plan comercial de un negocio. El priceId de Stripe manda (es lo
 * que realmente paga); la columna legacy `plan` cubre negocios sin suscripción
 * sincronizada. Sin ninguna pista, se asume Inicio: el gating nunca debe
 * regalar features por un dato ausente.
 */
export function resolvePlanId(business: {
  stripePriceId?: string | null;
  plan?: string | null;
}): PlanId {
  if (business.stripePriceId) {
    const byPrice = getPlanByPriceId(business.stripePriceId);
    if (byPrice) return byPrice.id;
  }
  if (business.plan && business.plan in LEGACY_PLAN_TO_PLAN_ID) {
    return LEGACY_PLAN_TO_PLAN_ID[business.plan];
  }
  return "inicio";
}

export function getPlanLimits(planId: PlanId): PlanLimitsAndFeatures {
  return PLAN_FEATURES[planId];
}

export function planAllows(planId: PlanId, feature: PlanFeature): boolean {
  return PLAN_FEATURES[planId].features.includes(feature);
}

/** El plan inmediatamente superior, o null si ya es el más alto. */
export function nextPlanId(planId: PlanId): PlanId | null {
  const index = PLAN_IDS.indexOf(planId);
  if (index === -1 || index === PLAN_IDS.length - 1) return null;
  return PLAN_IDS[index + 1];
}

/**
 * Error de límite de plan: las rutas lo traducen a un 403 con `code` para que
 * el frontend muestre la invitación a subir de plan en vez de un error
 * genérico.
 */
export class PlanLimitError extends Error {
  readonly code: string;
  readonly planId: PlanId;
  readonly limit: number | null;

  constructor(input: {
    code: string;
    planId: PlanId;
    limit: number | null;
    message: string;
  }) {
    super(input.message);
    this.name = "PlanLimitError";
    this.code = input.code;
    this.planId = input.planId;
    this.limit = input.limit;
  }
}

/**
 * Estados de SubscriptionStatus (schema.prisma) que significan «el negocio
 * no está pagando ahora mismo». No incluye TRIALING/ACTIVE (pagando de
 * facto) ni INCOMPLETE/PAUSED (transitorios/ambiguos) para no bloquear de
 * más; null (cuentas de prueba/demo sin Stripe) se trata como permitido.
 * Lo consultan la reserva por voz y la reserva desde la lista de espera.
 */
export const ESTADOS_DE_SUSCRIPCION_BLOQUEADOS: ReadonlySet<string> = new Set([
  "CANCELED",
  "UNPAID",
  "PAST_DUE",
  "INCOMPLETE_EXPIRED",
]);
