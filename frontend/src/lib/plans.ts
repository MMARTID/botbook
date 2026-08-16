export type Plan = {
  id: "inicio" | "pro" | "scale";
  name: string;
  price: number;
  minutes: number;
  extraPerMinute: number;
  description: string;
  summary: string;
  features: readonly string[];
  featured: boolean;
};

export const plans: readonly Plan[] = [
  {
    id: "inicio",
    name: "Inicio",
    price: 69,
    minutes: 100,
    extraPerMinute: 0.6,
    description: "Para negocios que quieren empezar a no perder llamadas importantes.",
    summary: "3 profesionales · 1 documento de tu negocio · 100 minutos incluidos",
    features: [
      "Atención telefónica 24/7",
      "Hasta 3 profesionales en tu agenda",
      "Los servicios se ofrecen para todo el equipo, sin asignar por profesional",
      "1 documento con la información de tu negocio: precios, servicios u horarios",
      "100 minutos de llamadas incluidos",
    ],
    featured: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: 149,
    minutes: 400,
    extraPerMinute: 0.45,
    description: "La opción recomendada para trabajar con agenda, servicios por profesional y seguimiento.",
    summary: "5 profesionales · servicios por profesional · 400 minutos incluidos",
    features: [
      "Hasta 5 profesionales en tu agenda",
      "Asigna qué servicios hace cada profesional",
      "3 documentos con la información de tu negocio",
      "400 minutos de llamadas incluidos",
      "Agenda conectada y seguimiento de clientes potenciales",
    ],
    featured: true,
  },
  {
    id: "scale",
    name: "Scale",
    price: 299,
    minutes: 1000,
    extraPerMinute: 0.35,
    description: "Para equipos con alto volumen de llamadas y necesidad de prioridad operativa.",
    summary: "Uso intensivo · operación escalable · prioridad alta",
    features: ["Todo lo de Pro", "Uso intensivo", "Prioridad alta", "Operación más escalable"],
    featured: false,
  },
] as const;

export const starterPlan = plans[0];

/**
 * Días de prueba de la suscripción. Debe coincidir con `CHECKOUT_TRIAL_DAYS`
 * en `src/modules/billing/service.ts`, que es quien lo aplica en Stripe.
 */
export const TRIAL_DAYS = 7;

/** Tranquilizador que acompaña a cualquier bloque de precios. */
export const TRIAL_REASSURANCE = `${TRIAL_DAYS} días de prueba. Sin permanencia. Cancela cuando quieras.`;

export function formatPlanPrice(price: number) {
  return `${price}€`;
}

export function formatExtraMinute(price: number) {
  return `${price.toFixed(2).replace(".", ",")}€/min adicional`;
}

export function formatIncludedMinutes(minutes: number) {
  return new Intl.NumberFormat("es-ES").format(minutes);
}
