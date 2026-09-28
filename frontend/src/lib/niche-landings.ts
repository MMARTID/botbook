/**
 * Las landings por sector viven en la web (web/src/lib/niche-landings.ts,
 * docs/historico/PLAN-APP-DOMINIO.md). En la app solo queda el tipo que
 * necesita
 * `range-slider.tsx`, componente copiado idéntico en las dos webs.
 */
export type NicheAccent = {
  /** Color principal del nicho (texto, iconos, bordes) */
  strong: string;
  /** Fondo suave tintado para secciones y chips */
  soft: string;
  /** Variante oscura para degradados y tarjetas destacadas */
  deep: string;
};
