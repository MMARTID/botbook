#!/usr/bin/env node
// Prepara las entradas que el convertidor de /design-sync necesita y que este
// repo no tiene por ser una app Next.js y no una librería publicada:
//
//   1. frontend/.ds-src/entry.ts        — barrel con los componentes del ámbito
//   2. frontend/.ds-src/preview-providers.tsx — contexto (React Query + router)
//   3. frontend/.ds-src/alhabla.css     — Tailwind compilado + @font-face de Geist
//
// Todo lo generado vive en frontend/.ds-src/ y está en .gitignore: el único
// origen de verdad es .design-sync/config.json (componentSrcMap) y el propio
// código de la app. Se ejecuta como cfg.buildCmd antes de package-build.mjs.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..");
const FRONTEND = join(RAIZ, "frontend");
const DESTINO = join(FRONTEND, ".ds-src");
const CONFIG = join(AQUI, "config.json");

const cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
const mapa = cfg.componentSrcMap ?? {};
mkdirSync(DESTINO, { recursive: true });

// --- 1. barrel -----------------------------------------------------------
// Un solo `export { X } from "..."` por componente del ámbito. Agrupa por
// fichero para no repetir la misma ruta cuando un módulo exporta varios.
// Exportaciones que no son componentes pero que las previews necesitan para
// componer con datos reales (contenido de landings por nicho, valores por
// defecto de los editores). No generan tarjeta: el listado de componentes sale
// exclusivamente de componentSrcMap.
const DATOS_EXTRA = [
  ["../src/lib/niche-landings", ["nicheLandings"]],
  ["../src/components/agent-settings-editor", ["DEFAULT_AGENT_SETTINGS"]],
  ["../src/components/business-hours-editor", ["DEFAULT_BUSINESS_SCHEDULE", "getScheduleSummary"]],
];

const porFichero = new Map();
for (const [nombre, ruta] of Object.entries(mapa)) {
  if (ruta === null) continue;
  const especificador =
    "../" + relative(FRONTEND, resolve(FRONTEND, ruta)).replace(/\.tsx?$/, "");
  if (!porFichero.has(especificador)) porFichero.set(especificador, []);
  porFichero.get(especificador).push(nombre);
}
const lineas = [...porFichero.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([ruta, nombres]) => `export { ${nombres.sort().join(", ")} } from ${JSON.stringify(ruta)};`);

writeFileSync(
  join(DESTINO, "entry.ts"),
  [
    "// GENERADO por .design-sync/prepare.mjs — no editar a mano.",
    "// El ámbito se define en .design-sync/config.json → componentSrcMap.",
    "",
    "// Debe ir primero: en ESM las dependencias se evalúan en orden de import,",
    "// y el shim tiene que existir antes de que se cargue lib/api.ts.",
    'import "./process-shim";',
    "",
    ...lineas,
    "",
    "// Datos y constantes reales del repo. Se exportan para que las previews (y",
    "// el agente de diseño) compongan con el contenido de verdad en lugar de con",
    "// copias inertes que se quedan desfasadas en cuanto cambia la fuente.",
    ...DATOS_EXTRA.map(
      ([ruta, nombres]) => `export { ${nombres.join(", ")} } from ${JSON.stringify(ruta)};`,
    ),
    "",
    'export { PreviewProviders } from "./preview-providers";',
    "",
  ].join("\n"),
);

// --- 1 bis. shim de `process` -------------------------------------------
// El código de la app lee process.env (lib/api.ts, lib/seo.ts) porque Next lo
// sustituye en tiempo de compilación. En el bundle del navegador no existe, y
// sin esto el IIFE entero revienta al cargar y window.Alhabla queda vacío.
writeFileSync(
  join(DESTINO, "process-shim.ts"),
  `// GENERADO por .design-sync/prepare.mjs — no editar a mano.
declare const globalThis: Record<string, unknown>;

if (typeof globalThis.process === "undefined") {
  // NEXT_PUBLIC_API_BASE_URL se deja sin definir a propósito: lib/api.ts cae
  // entonces en la baseURL relativa "/api/backend", que en un diseño publicado
  // falla de forma inocua en lugar de golpear la API de producción.
  globalThis.process = { env: { NODE_ENV: "production" } };
}
if (typeof globalThis.global === "undefined") globalThis.global = globalThis;

export {};
`,
);

// --- 2. providers de preview ---------------------------------------------
// Los componentes de panel leen sus datos con TanStack Query y algunos usan
// useRouter() de Next. Fuera de la app no existe ninguno de los dos contextos,
// así que las tarjetas renderizarían en blanco o reventarían. Sembramos la
// caché de Query con datos reales de ejemplo (mismas queryKey que la app) en
// lugar de mockear @/lib/api: el bundle sigue llevando el módulo de API real.
writeFileSync(
  join(DESTINO, "preview-providers.tsx"),
  `// GENERADO por .design-sync/prepare.mjs — no editar a mano.
"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

/** Identificadores fijos que las previews deben usar para acertar la queryKey. */
export const PREVIEW_BUSINESS_ID = "biz-demo";
export const PREVIEW_CALL_ID = "call-demo-1";

const AHORA = new Date("2026-09-05T10:30:00.000Z");
const desplazar = (minutos: number) =>
  new Date(AHORA.getTime() + minutos * 60_000).toISOString();

const LLAMADAS = [
  {
    id: PREVIEW_CALL_ID,
    businessId: PREVIEW_BUSINESS_ID,
    agentId: "agent-demo",
    vapiCallId: "retell-demo-1",
    fromNumber: "+34 655 21 44 09",
    status: "completed",
    outcome: "BOOKED",
    sentiment: "POSITIVE",
    summary:
      "Carmen pide hora para corte y color el jueves por la tarde. Se confirma a las 17:30 con Lucía.",
    successful: true,
    durationSecs: 96,
    costCents: 11,
    startedAt: desplazar(-38),
    endedAt: desplazar(-36),
    createdAt: desplazar(-38),
    updatedAt: desplazar(-36),
    transcript: {
      id: "tr-1",
      callId: PREVIEW_CALL_ID,
      fullText: "",
      createdAt: desplazar(-36),
      messages: [
        { role: "agent", content: "Peluquería Aurora, ¿en qué puedo ayudarte?" },
        { role: "user", content: "Hola, quería pedir hora para corte y color." },
        { role: "agent", content: "Claro. ¿Te viene bien el jueves a las 17:30 con Lucía?" },
        { role: "user", content: "Perfecto, el jueves a las 17:30." },
        { role: "agent", content: "Reservado. Te llega la confirmación por SMS. ¡Hasta el jueves!" },
      ],
    },
    booking: {
      id: "bk-1",
      programedAt: desplazar(4290),
      durationMinutes: 90,
      numberPeople: 1,
    },
  },
  {
    id: "call-demo-2",
    businessId: PREVIEW_BUSINESS_ID,
    agentId: "agent-demo",
    vapiCallId: "retell-demo-2",
    fromNumber: "+34 611 07 82 30",
    status: "completed",
    outcome: "INFO",
    sentiment: "NEUTRAL",
    summary: "Consulta por el precio de las mechas balayage y el horario del sábado.",
    successful: true,
    durationSecs: 51,
    costCents: 6,
    startedAt: desplazar(-124),
    endedAt: desplazar(-123),
    createdAt: desplazar(-124),
    updatedAt: desplazar(-123),
  },
  {
    id: "call-demo-3",
    businessId: PREVIEW_BUSINESS_ID,
    agentId: "agent-demo",
    vapiCallId: "retell-demo-3",
    fromNumber: "+34 699 43 15 88",
    status: "completed",
    outcome: "BOOKED",
    sentiment: "POSITIVE",
    summary: "Manicura semipermanente el martes a las 11:00 con Noelia.",
    successful: true,
    durationSecs: 73,
    costCents: 8,
    startedAt: desplazar(-260),
    endedAt: desplazar(-259),
    createdAt: desplazar(-260),
    updatedAt: desplazar(-259),
  },
  {
    id: "call-demo-4",
    businessId: PREVIEW_BUSINESS_ID,
    agentId: "agent-demo",
    vapiCallId: "retell-demo-4",
    fromNumber: "+34 622 90 51 17",
    status: "completed",
    outcome: "NO_HELP",
    sentiment: "NEGATIVE",
    summary: "Pregunta por microblading de cejas, un servicio que el salón no ofrece.",
    successful: false,
    durationSecs: 34,
    costCents: 4,
    startedAt: desplazar(-410),
    endedAt: desplazar(-409),
    createdAt: desplazar(-410),
    updatedAt: desplazar(-409),
  },
  {
    id: "call-demo-5",
    businessId: PREVIEW_BUSINESS_ID,
    agentId: "agent-demo",
    vapiCallId: "retell-demo-5",
    fromNumber: "+34 638 12 76 45",
    status: "completed",
    outcome: "BOOKED",
    sentiment: "POSITIVE",
    summary: "Cambia su cita del viernes al lunes a las 10:00.",
    successful: true,
    durationSecs: 62,
    costCents: 7,
    startedAt: desplazar(-540),
    endedAt: desplazar(-539),
    createdAt: desplazar(-540),
    updatedAt: desplazar(-539),
  },
  {
    id: "call-demo-6",
    businessId: PREVIEW_BUSINESS_ID,
    agentId: "agent-demo",
    vapiCallId: "retell-demo-6",
    fromNumber: "+34 677 33 02 91",
    status: "completed",
    outcome: "INFO",
    sentiment: "NEUTRAL",
    summary: "Quiere saber si hay aparcamiento cerca y si aceptan pago con tarjeta.",
    successful: true,
    durationSecs: 40,
    costCents: 5,
    startedAt: desplazar(-720),
    endedAt: desplazar(-719),
    createdAt: desplazar(-720),
    updatedAt: desplazar(-719),
  },
];

const EVENTOS = [
  { id: "ev-1", summary: "Corte y color — Carmen Ruiz", start: desplazar(90), end: desplazar(180), location: "Peluquería Aurora", htmlLink: "#" },
  { id: "ev-2", summary: "Manicura semipermanente — Noelia Prats", start: desplazar(210), end: desplazar(255), location: "Peluquería Aurora", htmlLink: "#" },
  { id: "ev-3", summary: "Mechas balayage — Marta Gil", start: desplazar(1500), end: desplazar(1650), location: "Peluquería Aurora", htmlLink: "#" },
  { id: "ev-4", summary: "Corte caballero — Javier Soto", start: desplazar(1740), end: desplazar(1770), location: "Peluquería Aurora", htmlLink: "#" },
  { id: "ev-5", summary: "Tratamiento de keratina — Ana Belén", start: desplazar(2880), end: desplazar(3000), location: "Peluquería Aurora", htmlLink: "#" },
];

/** queryKey -> datos. Las claves replican exactamente las de los componentes. */
const SEMILLAS: Array<[readonly unknown[], unknown]> = [
  [["recent-calls"], { data: LLAMADAS, total: LLAMADAS.length, limit: 6, offset: 0 }],
  [["call-detail", PREVIEW_CALL_ID], LLAMADAS[0]],
  // Llamada corta a propósito para la tarjeta de CallDetailModal: el modal
  // acota su cuerpo a la altura de la ventana y lo hace scrollable, así que
  // con la llamada larga la captura sale desplazada y sin cabecera.
  [
    ["call-detail", "call-demo-corta"],
    {
      ...LLAMADAS[1],
      id: "call-demo-corta",
      transcript: {
        id: "tr-corta",
        callId: "call-demo-corta",
        fullText: "",
        createdAt: desplazar(-123),
        messages: [
          { role: "agent", content: "Peluquería Aurora, ¿en qué puedo ayudarte?" },
          { role: "user", content: "¿Cuánto cuestan las mechas balayage?" },
          { role: "agent", content: "Entre 90 y 120 €, según el largo. ¿Te reservo hora?" },
        ],
      },
    },
  ],
  [["calendar-events", PREVIEW_BUSINESS_ID, 15], { events: EVENTOS, provider: "google" }],
  [
    ["onboarding-state"],
    {
      steps: { schedule: true, services: true, professionals: false, calendar: false },
      progress: 50,
      dismissedAt: null,
      completedAt: null,
      isActive: true,
    },
  ],
];

function crearCliente() {
  const cliente = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
  for (const [clave, valor] of SEMILLAS) cliente.setQueryData(clave, valor);
  return cliente;
}

// useRouter() de next/navigation lanza fuera de la app; next/link también lee
// este contexto para el prefetch. Un stub inerte basta para renderizar.
const ROUTER_INERTE = {
  back: () => {},
  forward: () => {},
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => Promise.resolve(),
} as never;

export function PreviewProviders({ children }: { children: React.ReactNode }) {
  const [cliente] = React.useState(crearCliente);
  return (
    <AppRouterContext.Provider value={ROUTER_INERTE}>
      <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
    </AppRouterContext.Provider>
  );
}
`,
);

// --- 2 bis. árbol de .d.ts -----------------------------------------------
// El convertidor extrae el contrato de props (<Name>.d.ts, lo que el agente de
// diseño lee como API) del árbol de .d.ts del paquete. Una app Next no emite
// ninguno, así que sin este paso los 26 contratos salen como
// `[key: string]: unknown` — inservibles. tsc los emite en dist/types/, que es
// uno de los directorios que el convertidor busca por convención.
const tsconfigTipos = join(DESTINO, "tsconfig.types.json");
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
      include: ["../src/**/*.ts", "../src/**/*.tsx", "./**/*.ts", "./**/*.tsx"],
      exclude: ["../node_modules", "../tests"],
    },
    null,
    2,
  ) + "\n",
);

const tsc = join(FRONTEND, "node_modules", ".bin", "tsc");
if (!existsSync(tsc)) {
  console.error("\u2717 falta node_modules/.bin/tsc \u2014 ejecuta `npm install` en frontend/");
  process.exit(1);
}
rmSync(join(FRONTEND, "dist", "types"), { recursive: true, force: true });
try {
  execFileSync(tsc, ["--project", tsconfigTipos], { cwd: FRONTEND, stdio: ["ignore", "pipe", "pipe"] });
} catch (e) {
  // tsc emite declaraciones aunque haya errores de tipos; solo abortamos si no
  // ha llegado a escribir nada.
  const salida = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
  if (salida) console.error(`  ! tsc: ${salida.split("\n").slice(0, 5).join(" | ")}`);
}
if (!existsSync(join(FRONTEND, "dist", "types", "src", "components"))) {
  console.error("\u2717 tsc no emitió dist/types/src/components \u2014 los contratos de props saldrían vacíos");
  process.exit(1);
}

// El extractor de props busca el `types` del package.json más cercano al árbol
// de .d.ts. Sin este marcador cae en <frontend>/index.d.ts, que no existe, y
// solo resuelve los componentes que declaran un tipo `<Name>Props` con nombre;
// los que tipan las props en línea (la mayoría) quedan vacíos.
writeFileSync(
  join(FRONTEND, "dist", "types", "package.json"),
  JSON.stringify({ name: "alhabla-ui", version: "0.1.0", types: "./.ds-src/entry.d.ts" }, null, 2) + "\n",
);

// --- 3. hoja de estilos --------------------------------------------------
// globals.css es Tailwind sin compilar (@tailwind, @apply): inservible tal cual.
// Se compila con la config real de la app, ampliando `content` con las previews
// para que sus utilidades no se queden fuera del purge.
const configTailwind = join(DESTINO, "tailwind.config.mjs");
writeFileSync(
  configTailwind,
  `// GENERADO por .design-sync/prepare.mjs — no editar a mano.
// Reexporta la config real de la app añadiendo las previews al purge.
import base from "../tailwind.config.ts";

export default {
  ...base,
  content: [...base.content, "../.design-sync/previews/**/*.{ts,tsx}"],
};
`,
);

const cssCompilado = join(DESTINO, ".tailwind.out.css");
const bin = join(FRONTEND, "node_modules", ".bin", "tailwindcss");
if (!existsSync(bin)) {
  console.error("✗ falta node_modules/.bin/tailwindcss — ejecuta `npm install` en frontend/");
  process.exit(1);
}
execFileSync(
  bin,
  ["-c", configTailwind, "-i", join(FRONTEND, "src", "app", "globals.css"), "-o", cssCompilado],
  { cwd: FRONTEND, stdio: ["ignore", "ignore", "inherit"] },
);

// next/font inyecta --font-geist-sans/--font-geist-mono en la app real; aquí no
// hay Next, así que declaramos las mismas familias contra los .woff del repo.
// Sin esto cada tarjeta renderiza en la fuente de respaldo del navegador.
const FUENTES = `/* GENERADO por .design-sync/prepare.mjs — no editar a mano. */
@font-face {
  font-family: "Geist";
  src: url("../src/app/fonts/GeistVF.woff") format("woff");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Geist Mono";
  src: url("../src/app/fonts/GeistMonoVF.woff") format("woff");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

:root {
  --font-geist-sans: "Geist";
  --font-geist-mono: "Geist Mono";
}

`;

const salidaCss = join(DESTINO, "alhabla.css");
writeFileSync(salidaCss, FUENTES + readFileSync(cssCompilado, "utf8"));

console.error(
  `✓ .ds-src listo: ${lineas.length} módulos en el barrel, ` +
    `${Object.keys(mapa).filter((k) => mapa[k] !== null).length} componentes, ` +
    `${(readFileSync(salidaCss, "utf8").length / 1024).toFixed(0)} KB de CSS`,
);
