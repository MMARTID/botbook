/**
 * Escribe frontend/tests/fixtures/catalogo-de-idiomas.ts con lo que devuelve
 * GET /business/me/idiomas para el mercado de España (catalogoParaElPanel en
 * src/lib/idiomas/panel.ts), para que los tests del panel usen el catálogo
 * real. Hay que volver a ejecutarlo cuando cambie el catálogo (por ejemplo,
 * tras regenerar vocesUltra.ts). Puro: no consulta ninguna API.
 *
 * Uso:
 *   npx tsx scripts/generarFixtureDeIdiomas.ts [--comprobar]
 * --comprobar no escribe: falla si el fixture no está al día.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { catalogoParaElPanel } from "../src/lib/idiomas/panel.js";

const SALIDA = fileURLToPath(
  new URL(
    "../../frontend/tests/fixtures/catalogo-de-idiomas.ts",
    import.meta.url
  )
);

const CABECERA = `import type { CatalogoDeIdiomas } from "@/lib/types";

/**
 * Lo que devuelve GET /business/me/idiomas para el mercado de España
 * (catalogoParaElPanel en backend/src/lib/idiomas/panel.ts). GENERADO: si el
 * catálogo del backend cambia, se regenera con:
 *   cd backend && npx tsx scripts/generarFixtureDeIdiomas.ts
 */
export const CATALOGO_DE_IDIOMAS: CatalogoDeIdiomas = `;

/** El JSON con el estilo de Prettier del frontend: claves sin comillas
 * cuando se puede y coma tras el último elemento. */
function comoTypeScript(valor: unknown): string {
  const lineas = JSON.stringify(valor, null, 2).split("\n");
  return lineas
    .map((linea, indice) => {
      const sinComillas = linea.replace(
        /^(\s*)"([A-Za-z_$][A-Za-z0-9_$]*)":/,
        "$1$2:"
      );
      const siguiente = lineas[indice + 1];
      return siguiente !== undefined &&
        /^\s*[\]}]/.test(siguiente) &&
        !/[[{]$/.test(sinComillas)
        ? `${sinComillas},`
        : sinComillas;
    })
    .join("\n");
}

const contenido = `${CABECERA}${comoTypeScript(catalogoParaElPanel())};\n`;

if (process.argv.includes("--comprobar")) {
  const actual = readFileSync(SALIDA, "utf8");
  if (actual !== contenido) {
    console.error(
      `[Idiomas] ${SALIDA} no está al día: npx tsx scripts/generarFixtureDeIdiomas.ts`
    );
    process.exitCode = 1;
  } else {
    console.log(`[Idiomas] ${SALIDA} está al día.`);
  }
} else {
  writeFileSync(SALIDA, contenido);
  console.log(`[Idiomas] Escrito ${SALIDA}`);
}
