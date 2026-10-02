/**
 * Lo que necesita el tema antes de que exista React: va aparte de lib/tema.ts
 * (que es de cliente) porque el layout, que es de servidor, mete el script en
 * el <head> como texto.
 */
export const CLAVE_DE_TEMA = "alhabla:tema";
export const CONSULTA_OSCURO = "(prefers-color-scheme: dark)";

/**
 * El mismo cálculo que `aplicarTema`, como texto para un <script> en línea:
 * corre antes de que React exista. Cualquier fallo deja el tema claro.
 */
export const SCRIPT_DE_TEMA = `(function(){try{var p=localStorage.getItem(${JSON.stringify(CLAVE_DE_TEMA)});var t=p==="claro"||p==="oscuro"?p:(window.matchMedia&&window.matchMedia(${JSON.stringify(CONSULTA_OSCURO)}).matches?"oscuro":"claro");var r=document.documentElement;r.dataset.tema=t;r.style.colorScheme=t==="oscuro"?"dark":"light";}catch(e){}})();`;
