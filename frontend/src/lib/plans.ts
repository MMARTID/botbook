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
    name: "Básico",
    price: 69,
    minutes: 100,
    extraPerMinute: 0.6,
    description: "Para negocios que quieren empezar a no perder llamadas importantes.",
    summary: "3 profesionales · 1 archivo de contexto · 100 min en llamadas móvil",
    features: [
      "Atención telefónica 24/7",
      "Hasta 3 profesionales",
      "Sin asociación de servicios a profesionales",
      "1 archivo de contexto",
      "100 min incluidos en llamadas móvil",
    ],
    featured: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: 149,
    minutes: 400,
    extraPerMinute: 0.45,
    description: "La opción recomendada para operar con agenda, contexto y seguimiento real.",
    summary: "5 profesionales configurables · 3 archivos · 400 min en web y móvil",
    features: [
      "Hasta 5 profesionales configurables",
      "Asocia servicios a cada profesional",
      "3 archivos de contexto",
      "400 min incluidos en llamadas web y móvil",
      "Agenda conectada y seguimiento de leads",
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

export function formatPlanPrice(price: number) {
  return `${price}€`;
}

export function formatExtraMinute(price: number) {
  return `${price.toFixed(2).replace(".", ",")}€/min adicional`;
}

export function formatIncludedMinutes(minutes: number) {
  return new Intl.NumberFormat("es-ES").format(minutes);
}
