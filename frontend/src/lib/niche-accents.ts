import type { NicheAccent, NicheSlug } from "./niche-landings";

/**
 * Colores de acento por nicho, separados de niche-landings.ts para que un
 * consumidor que solo necesita el color (p. ej. la pastilla de categoría de
 * la demo) no cargue el copy completo de las landings (FAQs, estadísticas,
 * conversaciones de ejemplo). niche-landings.ts reexporta estos mismos
 * valores para sus landings — una sola fuente de verdad.
 */
export const NICHE_ACCENTS: Record<NicheSlug, NicheAccent> = {
  peluqueria: { strong: "#b23a68", soft: "#fbe9f1", deep: "#7c2547" },
  "centro-de-estetica": { strong: "#6c4bd8", soft: "#eee9fb", deep: "#46308f" },
  "salon-de-unas": { strong: "#c95c3f", soft: "#fbeae2", deep: "#8e3a24" },
  barberia: { strong: "#a86a1c", soft: "#f7ecd8", deep: "#71470f" },
  fisioterapia: { strong: "#0e7f78", soft: "#e0f1ee", deep: "#0a5751" },
};
