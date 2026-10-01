#!/usr/bin/env node
// Prepara el paquete de /design-sync de la WEB PÚBLICA (web/, alhabla.ai):
// las entradas que el convertidor necesita y que una app Next.js no tiene.
// Se sincroniza desde web/ (no desde la raíz, que es el paquete de la app);
// scripts/preparar-design-sync.mjs hace el trabajo común y explica por qué
// son dos paquetes.
//
// Es cfg.buildCmd, así que se ejecuta solo antes de package-build.mjs.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { prepararPaquete } from "../../scripts/preparar-design-sync.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));

// La web no tiene sesión ni TanStack Query: el único contexto que falta
// fuera de Next es el del router. RevenueLossCalculator llama a useRouter(),
// que lanza sin él, y next/link lo lee para el prefetch.
const PROVIDERS = `// GENERADO por web/.design-sync/prepare.mjs — no editar a mano.
"use client";

import * as React from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

// Un stub inerte basta para renderizar: en una tarjeta no se navega.
const ROUTER_INERTE = {
  back: () => {},
  forward: () => {},
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => Promise.resolve(),
} as never;

export function PreviewProviders({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterContext.Provider value={ROUTER_INERTE}>
      {children}
    </AppRouterContext.Provider>
  );
}
`;

prepararPaquete({
  proyecto: resolve(AQUI, ".."),
  config: join(AQUI, "config.json"),
  // El copy real de cada landing de sector, para que las previews (y el
  // agente de diseño) compongan con él en vez de inventar relleno. No genera
  // tarjeta.
  datosExtra: [["../src/lib/niche-landings", ["nicheLandings"]]],
  // Rutas de public/ que cargan las secciones de la portada: el teléfono y el
  // logo del chat de «En tu bolsillo» (<img>) y el portátil 3D de «En tu
  // negocio» (fetch del GLTFLoader). Fuera de Next no existen: sin ellos el
  // teléfono sale roto y «En tu negocio» cae a su versión quieta. El modelo
  // pesa 1,3 MB y es lo que más engorda el bundle (ver NOTES.md).
  recursosPublicos: [
    "/telefono/frente.svg",
    "/brand/alhabla-isotipo.svg",
    "/modelos/macbook.glb",
  ],
  providers: PROVIDERS,
});
