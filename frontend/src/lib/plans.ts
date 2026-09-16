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
    extraPerMinute: 0.45,
    description: "Para negocios que quieren empezar a no perder llamadas importantes.",
    summary: "3 profesionales · reservas en tu calendario · 100 minutos incluidos",
    features: [
      "Atención telefónica 24/7",
      "Reservas directas en tu calendario de Google u Outlook",
      "Hasta 3 profesionales en tu agenda",
      "Confirmación de cita por WhatsApp al cliente",
      "100 minutos de llamadas incluidos",
    ],
    featured: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: 149,
    minutes: 400,
    extraPerMinute: 0.4,
    description: "La opción recomendada: además de atender, te llena la agenda y reduce las ausencias.",
    summary: "10 profesionales · recordatorios de cita · 400 minutos incluidos",
    features: [
      "Todo lo de Inicio",
      "Hasta 10 profesionales en tu agenda",
      "Recordatorios de cita por WhatsApp que reducen las ausencias",
      "Resumen semanal de llamadas y reservas en tu email",
      "Elige la voz y el idioma de tu recepcionista",
      "400 minutos de llamadas incluidos",
    ],
    featured: true,
  },
  {
    id: "scale",
    name: "Scale",
    price: 299,
    minutes: 1000,
    extraPerMinute: 0.35,
    description: "Para negocios con varias sedes o alto volumen que quieren datos para decidir.",
    summary: "Profesionales sin límite · analítica avanzada · 1.000 minutos incluidos",
    features: [
      "Todo lo de Pro",
      "Profesionales sin límite en tu agenda",
      "Analítica avanzada: demanda no atendida y calidad de cada llamada",
      "Varios números para más de una sede (próximamente)",
      "1.000 minutos de llamadas incluidos",
    ],
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
