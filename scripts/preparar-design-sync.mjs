// Núcleo común de los dos prepare.mjs de /design-sync. Desde la separación de
// las dos webs (docs/historico/PLAN-APP-DOMINIO.md) hay dos paquetes, cada uno
// con su proyecto en claude.ai/design:
//
//   .design-sync/prepare.mjs      → la app  (frontend/), se sincroniza desde la raíz
//   web/.design-sync/prepare.mjs  → la web  (web/),      se sincroniza desde web/
//
// No se juntan en un solo bundle porque el convertidor aplica UN alias `@/*`
// (el del tsconfig del paquete) a todos los ficheros: `@/lib/niche-landings`
// importado desde web/ resolvería en silencio contra frontend/src.
//
// Cada prepare.mjs llama a prepararPaquete() con lo suyo (datos extra y
// providers de preview) y esto genera en <proyecto>/.ds-src/ (gitignorado):
//
//   1. entry.ts               — barrel con los componentes de componentSrcMap
//   2. process-shim.ts        — `process` para el bundle del navegador
//   3. preview-providers.tsx  — el contexto que necesitan las tarjetas
//   4. cfg.cssEntry           — Tailwind compilado + @font-face de Geist
//
// y en <proyecto>/dist/types/ (gitignorado) el árbol de .d.ts. El único origen
// de verdad es el config.json de cada paquete y el propio código.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fallar(mensaje, detalle = []) {
  console.error(`✗ ${mensaje}`);
  for (const linea of detalle) console.error(`    ${linea}`);
  process.exit(1);
}

function esFichero(ruta) {
  return existsSync(ruta) && statSync(ruta).isFile();
}

/** Resuelve un especificador relativo sin extensión, como el bundler. */
function existeModulo(base) {
  return ["", ".ts", ".tsx"].some((ext) => esFichero(base + ext));
}

/**
 * @param {object} opciones
 * @param {string} opciones.proyecto  Raíz del proyecto Next (frontend/ o web/).
 * @param {string} opciones.config    Ruta del config.json del paquete.
 * @param {Array<[string, string[]]>} [opciones.datosExtra]  Exportaciones que
 *   no son componentes (datos reales para componer). Especificadores
 *   relativos a .ds-src/, como los del barrel.
 * @param {string} opciones.providers Contenido de preview-providers.tsx.
 */
export function prepararPaquete({
  proyecto,
  config,
  datosExtra = [],
  providers,
}) {
  const cfg = JSON.parse(readFileSync(config, "utf8"));
  const mapa = cfg.componentSrcMap ?? {};
  const destino = join(proyecto, ".ds-src");
  // El convertidor resuelve cfg.entry contra el directorio desde el que se
  // lanza, que es el que contiene .design-sync/ (el «hogar» del paquete).
  const hogar = dirname(dirname(config));
  const previews = join(dirname(config), "previews");
  const relProyecto = relative(RAIZ, proyecto);

  if (resolve(hogar, cfg.entry ?? "") !== join(destino, "entry.ts")) {
    fallar(
      `cfg.entry (${cfg.entry}) no apunta al barrel que genera este script`,
      [`esperado: ${relative(hogar, join(destino, "entry.ts"))}`]
    );
  }
  if (!cfg.pkg || !cfg.cssEntry) fallar("faltan cfg.pkg o cfg.cssEntry");

  // --- 0. el ámbito apunta a ficheros que existen ------------------------
  // Sin esto un componente movido o borrado deja un import roto en el barrel
  // y el paquete sale igual, con la tarjeta vacía (pasó al separar las webs).
  const inexistentes = [
    ...Object.entries(mapa)
      .filter(([, ruta]) => ruta !== null)
      .filter(([, ruta]) => !esFichero(resolve(proyecto, ruta)))
      .map(([nombre, ruta]) => `${nombre} → ${relProyecto}/${ruta}`),
    ...datosExtra
      .filter(
        ([especificador]) => !existeModulo(resolve(destino, especificador))
      )
      .map(
        ([especificador, nombres]) => `${nombres.join(", ")} → ${especificador}`
      ),
  ];
  if (inexistentes.length) {
    fallar("el ámbito apunta a ficheros que no existen:", inexistentes);
  }

  mkdirSync(destino, { recursive: true });

  // --- 1. barrel -----------------------------------------------------------
  // Un solo `export { X } from "..."` por fichero, aunque exporte varios
  // componentes. Los datos extra no generan tarjeta: el listado de
  // componentes sale exclusivamente de componentSrcMap.
  const porFichero = new Map();
  for (const [nombre, ruta] of Object.entries(mapa)) {
    if (ruta === null) continue;
    const especificador = relative(destino, resolve(proyecto, ruta)).replace(
      /\.tsx?$/,
      ""
    );
    if (!porFichero.has(especificador)) porFichero.set(especificador, []);
    porFichero.get(especificador).push(nombre);
  }
  const lineas = [...porFichero.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([ruta, nombres]) =>
        `export { ${nombres.sort().join(", ")} } from ${JSON.stringify(ruta)};`
    );

  writeFileSync(
    join(destino, "entry.ts"),
    [
      `// GENERADO por ${relative(RAIZ, join(dirname(config), "prepare.mjs"))} — no editar a mano.`,
      `// El ámbito se define en ${relative(RAIZ, config)} → componentSrcMap.`,
      "",
      "// Debe ir primero: en ESM las dependencias se evalúan en orden de import,",
      "// y el shim tiene que existir antes de que se cargue lib/api.ts.",
      'import "./process-shim";',
      "",
      ...lineas,
      "",
      ...(datosExtra.length
        ? [
            "// Datos y constantes reales del repo. Se exportan para que las previews",
            "// (y el agente de diseño) compongan con el contenido de verdad en lugar",
            "// de con copias inertes que se quedan desfasadas.",
            ...datosExtra.map(
              ([ruta, nombres]) =>
                `export { ${nombres.join(", ")} } from ${JSON.stringify(ruta)};`
            ),
            "",
          ]
        : []),
      'export { PreviewProviders } from "./preview-providers";',
      "",
    ].join("\n")
  );

  // --- 1 bis. shim de `process` -------------------------------------------
  // El código de las webs lee process.env (lib/api.ts, lib/seo.ts…) porque
  // Next lo sustituye al compilar. En el bundle del navegador no existe, y sin
  // esto el IIFE entero revienta al cargar y window.<global> queda vacío.
  writeFileSync(
    join(destino, "process-shim.ts"),
    `// GENERADO por scripts/preparar-design-sync.mjs — no editar a mano.
declare const globalThis: Record<string, unknown>;

if (typeof globalThis.process === "undefined") {
  // NODE_ENV coincide con el define del convertidor ("development"), y
  // NEXT_PUBLIC_API_BASE_URL se deja sin definir a propósito: lib/api.ts cae
  // en la baseURL relativa "/api/backend", que en un diseño publicado falla
  // de forma inocua en lugar de golpear la API de producción. Con
  // NODE_ENV=production y sin URL, lib/api.ts lanzaría al cargar.
  globalThis.process = { env: { NODE_ENV: "development" } };
}
if (typeof globalThis.global === "undefined") globalThis.global = globalThis;

export {};
`
  );

  // --- 2. providers de preview ---------------------------------------------
  writeFileSync(join(destino, "preview-providers.tsx"), providers);

  // --- 2 bis. árbol de .d.ts -----------------------------------------------
  // El convertidor extrae el contrato de props (<Name>.d.ts, lo que el agente
  // de diseño lee como API) del árbol de .d.ts del paquete. Una app Next no
  // emite ninguno, así que sin este paso los contratos salen como
  // `[key: string]: unknown`. tsc los emite en dist/types/, uno de los
  // directorios que el convertidor busca por convención.
  //
  // next-env.d.ts está gitignorado y no existe en un checkout limpio: sin sus
  // referencias, los imports de *.module.css o de imágenes dan errores falsos.
  writeFileSync(
    join(destino, "next-env.d.ts"),
    `// GENERADO por scripts/preparar-design-sync.mjs — no editar a mano.
/// <reference types="next" />
/// <reference types="next/image-types/global" />
`
  );
  const tsconfigTipos = join(destino, "tsconfig.types.json");
  writeFileSync(
    tsconfigTipos,
    JSON.stringify(
      {
        extends: "../tsconfig.json",
        compilerOptions: {
          noEmit: false,
          declaration: true,
          emitDeclarationOnly: true,
          jsx: "react-jsx",
          outDir: "../dist/types",
          rootDir: "..",
          incremental: false,
        },
        include: [
          "../src/**/*.ts",
          "../src/**/*.tsx",
          "./**/*.ts",
          "./**/*.tsx",
        ],
        exclude: ["../node_modules", "../tests"],
      },
      null,
      2
    ) + "\n"
  );

  const tsc = join(proyecto, "node_modules", ".bin", "tsc");
  if (!existsSync(tsc)) {
    fallar(
      `falta node_modules/.bin/tsc — ejecuta \`npm install\` en ${relProyecto}/`
    );
  }
  const tipos = join(proyecto, "dist", "types");
  rmSync(tipos, { recursive: true, force: true });
  let salidaTsc = "";
  try {
    execFileSync(tsc, ["--project", tsconfigTipos], {
      cwd: proyecto,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    salidaTsc = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  // tsc emite declaraciones aunque haya errores de tipos, así que un error en
  // el código de la web no para el paquete. Uno en .ds-src/ sí: es un import
  // roto del barrel (componente movido o borrado, exportación renombrada), con
  // el que el paquete saldría con la tarjeta vacía, o una semilla de los
  // providers que ya no encaja con los tipos de la app.
  const errores = salidaTsc
    .split("\n")
    .filter((linea) => /error TS\d+/.test(linea));
  const delBarrel = errores.filter((linea) => linea.startsWith(".ds-src/"));
  if (delBarrel.length) {
    fallar(`lo generado en ${relProyecto}/.ds-src no compila:`, delBarrel);
  }
  if (errores.length) {
    console.error(
      `  ! tsc: ${errores.length} errores de tipos fuera del barrel ` +
        `(los .d.ts se emiten igual): ${errores.slice(0, 5).join(" | ")}`
    );
  }
  if (!existsSync(join(tipos, "src", "components"))) {
    fallar(
      `tsc no emitió ${relProyecto}/dist/types/src/components — ` +
        "los contratos de props saldrían vacíos"
    );
  }

  // El extractor de props busca el `types` del package.json más cercano al
  // árbol de .d.ts. Sin este marcador cae en <proyecto>/index.d.ts, que no
  // existe, y solo resuelve los componentes que declaran un tipo
  // `<Name>Props` con nombre; los que tipan las props en línea quedan vacíos.
  writeFileSync(
    join(tipos, "package.json"),
    JSON.stringify(
      { name: cfg.pkg, version: "0.1.0", types: "./.ds-src/entry.d.ts" },
      null,
      2
    ) + "\n"
  );

  // --- 3. hoja de estilos --------------------------------------------------
  // globals.css es Tailwind sin compilar (@tailwind, @apply): inservible tal
  // cual. Se compila con la config real del proyecto, ampliando `content`
  // con las previews para que sus utilidades no se queden fuera del purge.
  // Tailwind resuelve `content` contra el cwd, que es el proyecto.
  const configTailwind = join(destino, "tailwind.config.mjs");
  writeFileSync(
    configTailwind,
    `// GENERADO por scripts/preparar-design-sync.mjs — no editar a mano.
// Reexporta la config real del proyecto añadiendo las previews al purge.
import base from "../tailwind.config.ts";

export default {
  ...base,
  content: [...base.content, ${JSON.stringify(`${relative(proyecto, previews)}/**/*.{ts,tsx}`)}],
};
`
  );

  const cssCompilado = join(destino, ".tailwind.out.css");
  const tailwind = join(proyecto, "node_modules", ".bin", "tailwindcss");
  if (!existsSync(tailwind)) {
    fallar(
      `falta node_modules/.bin/tailwindcss — ejecuta \`npm install\` en ${relProyecto}/`
    );
  }
  execFileSync(
    tailwind,
    [
      "-c",
      configTailwind,
      "-i",
      join(proyecto, "src", "app", "globals.css"),
      "-o",
      cssCompilado,
    ],
    { cwd: proyecto, stdio: ["ignore", "ignore", "inherit"] }
  );

  // next/font inyecta --font-geist-sans/--font-geist-mono en la web real;
  // aquí no hay Next, así que se declaran las mismas familias contra los
  // .woff del repo. Sin esto cada tarjeta sale en la fuente de respaldo.
  const salidaCss = resolve(proyecto, cfg.cssEntry);
  const fuentes = relative(
    dirname(salidaCss),
    join(proyecto, "src", "app", "fonts")
  );
  writeFileSync(
    salidaCss,
    `/* GENERADO por scripts/preparar-design-sync.mjs — no editar a mano. */
@font-face {
  font-family: "Geist";
  src: url("${fuentes}/GeistVF.woff") format("woff");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Geist Mono";
  src: url("${fuentes}/GeistMonoVF.woff") format("woff");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

:root {
  --font-geist-sans: "Geist";
  --font-geist-mono: "Geist Mono";
}

` + readFileSync(cssCompilado, "utf8")
  );

  const componentes = Object.values(mapa).filter((ruta) => ruta !== null);
  console.error(
    `✓ ${relProyecto}/.ds-src listo: ${lineas.length} módulos en el barrel, ` +
      `${componentes.length} componentes, ` +
      `${(readFileSync(salidaCss, "utf8").length / 1024).toFixed(0)} KB de CSS`
  );
}
