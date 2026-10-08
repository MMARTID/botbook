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
  // Elegir entre todas las voces del idioma principal (desde el 2026-10-07;
  // ver funcionQueExige en lib/idiomas/resolver.ts). Sin ella, el dueño
  // elige mujer u hombre y atiende la voz por defecto de ese género. El
  // idioma principal es libre en todos los planes, catalán, euskera y
  // gallego incluidos: sustituye a «lenguas_locales» (del 05 al 07-10) y a
  // «voz_idioma» (antes del 05-10).
  | "elegir_voz"
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
  "elegir_voz",
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

/** Cómo llama la web a cada plan (`name` en web/src/lib/plans.ts). */
const NOMBRES_DE_PLAN: Record<PlanId, string> = {
  inicio: "Inicio",
  pro: "Pro",
  scale: "Scale",
};

/** «Pro y Scale»: los planes que incluyen `feature`, para los candados del
 * panel y los 403 de las rutas. */
export function planesQueIncluyen(feature: PlanFeature): string {
  const nombres = PLAN_IDS.filter((planId) => planAllows(planId, feature)).map(
    (planId) => NOMBRES_DE_PLAN[planId]
  );
  return nombres.length < 2
    ? nombres.join("")
    : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * Las features del plan tal como las lee la app (`planFeatures` de
 * GET /billing/summary). Mientras dura el despliegue del 2026-10-07 lleva
 * también las claves que leen las apps anteriores, porque Vercel y Cloud
 * Run no publican a la vez y una pestaña abierta no recarga:
 *
 * - «lenguas_locales», en todos los planes: la app del 05-10 desbloquea con
 *   ella catalán, euskera y gallego si su catálogo en caché (se pide una vez
 *   por sesión) aún les pone ese `requiere`. Ya son de todos los planes.
 * - «voz_idioma» donde hay «elegir_voz»: la app anterior al 05-10
 *   desbloqueaba con ella la voz y los idiomas.
 *
 * QUITAR las dos en la PR siguiente, cuando ninguna app las pida.
 */
export function featuresParaLaApp(planId: PlanId): string[] {
  const features: string[] = [...PLAN_FEATURES[planId].features];
  return [
    ...features,
    "lenguas_locales",
    ...(features.includes("elegir_voz") ? ["voz_idioma"] : []),
  ];
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
