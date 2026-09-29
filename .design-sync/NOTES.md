# Notas de /design-sync — Alhabla (paquete de la app)

## Dos paquetes: la app aquí, la web en `web/.design-sync/`

Desde la separación de las dos webs (2026-09-21,
`docs/historico/PLAN-APP-DOMINIO.md`) la app (`frontend/`, `app.alhabla.ai`) y
la web pública (`web/`, `alhabla.ai`) son dos proyectos Next con su propio
`tsconfig`, su Tailwind y su `globals.css`. design-sync tiene un paquete por
cada una:

|                                     | App (este)                        | Web                                  |
| ----------------------------------- | --------------------------------- | ------------------------------------ |
| Desde dónde se lanza `/design-sync` | la raíz del repo                  | `web/`                               |
| Config                              | `.design-sync/config.json`        | `web/.design-sync/config.json`       |
| Bundle                              | `window.Alhabla` (`alhabla-ui`)   | `window.AlhablaWeb` (`alhabla-web-ui`) |
| Proyecto en claude.ai/design        | «Alhabla UI» (`projectId`)        | ninguno aún: lo crea su primera sync |
| Componentes                         | 12 (7 del panel + 5 compartidos)  | 17 (12 de marketing + 5 compartidos) |

El convertidor busca `.design-sync/` (previews, overrides, caché) en el
directorio desde el que se lanza, así que cada paquete tiene su «hogar».

**No se juntan en un solo bundle a propósito.** El convertidor aplica UN alias
`@/*` —el del `tsconfig` del paquete— a todos los ficheros del bundle
(`tsconfigPathsPlugin` en `lib/bundle.mjs`): un componente de `web/` que
importa `@/lib/niche-landings` resolvería en silencio contra `frontend/src/lib/`.
Un solo paquete exigiría un fork de `bundle.mjs` en `overrides/`, más dos `tsc`
y dos Tailwind fusionados. Decisión del usuario del 2026-09-29.

Los cinco **componentes compartidos** (`BrandMark`, `RangeSlider`,
`GoogleAuthButton`, `ParticleField`, `ParticleMouseLayer`) son copias idénticas
en las dos webs (`scripts/comprobar-copias-compartidas.sh`) y van en los dos
paquetes, con su preview y su doc copiados. **Si cambias la preview o el doc de
uno de ellos, cópialo al otro paquete.**

## Qué es este paquete para el convertidor

No es una librería publicada: no hay `dist/`, ni `.storybook/`, ni `*.stories.*`.
La forma es `package` y el convertidor se alimenta de entradas **generadas** por
`.design-sync/prepare.mjs` (que es `cfg.buildCmd`, así que se ejecuta solo antes
de cada build). El trabajo común de los dos paquetes vive en
`scripts/preparar-design-sync.mjs`; este `prepare.mjs` solo aporta lo propio de
la app (providers con la caché sembrada y los valores por defecto de los
editores).

Escribe en `frontend/.ds-src/` (gitignorado) y en `frontend/dist/types/`
(gitignorado):

1. `entry.ts` — barrel con los componentes de `cfg.componentSrcMap` más los
   datos reales (`DEFAULT_AGENT_SETTINGS`, `DEFAULT_BUSINESS_SCHEDULE`,
   `getScheduleSummary`) y `PreviewProviders`.
2. `process-shim.ts` — **imprescindible y debe ir primero en el barrel**. El
   código lee `process.env` (`lib/api.ts`, `lib/seo.ts`) porque Next lo
   sustituye al compilar; en el navegador no existe y sin el shim el IIFE entero
   revienta al cargar y `window.Alhabla` queda vacío (se manifiesta como
   `[BUNDLE_EXPORT] N/N not a component`). Su `NODE_ENV` es `development`, como
   el `define` del convertidor: con `production` y sin
   `NEXT_PUBLIC_API_BASE_URL`, `lib/api.ts` lanza al cargar.
3. `preview-providers.tsx` — `PreviewProviders`: `QueryClientProvider` con la
   caché sembrada + `AppRouterContext` inerte. Se siembra la caché **en vez de
   mockear `@/lib/api`**, así el bundle sigue llevando el módulo de API real.
   Las semillas van tipadas con los tipos de la app (ver Riesgos).
4. `alhabla.css` — `globals.css` compilado con Tailwind (es `@tailwind`/`@apply`
   sin compilar, inservible tal cual) precedido de los `@font-face` de Geist.
5. `next-env.d.ts` — las referencias de tipos de Next. El de verdad está
   gitignorado y no existe en un checkout limpio; sin él, los imports de
   `*.module.css` o de imágenes dan errores falsos en `tsc`.
6. `dist/types/**` + un `package.json` con `types` — el árbol de `.d.ts`.

**`prepare.mjs` aborta (código 1)** si `componentSrcMap` o los datos extra
apuntan a un fichero que no existe, o si `tsc` da un error dentro de `.ds-src/`
(import roto, exportación renombrada). Antes solo enseñaba los cinco primeros
errores de `tsc` y salía con «✓ listo»: así pasó desapercibido que la
separación de las webs dejó 14 de los 26 módulos del barrel apuntando a
ficheros que ya no estaban en `frontend/` (y `nicheLandings` sin exportar).

## Trampas que ya costaron una vuelta

- **Sin `frontend/dist/types/package.json` los contratos de props salen como
  `[key: string]: unknown`.** El extractor busca el `types` del `package.json`
  más cercano al árbol de `.d.ts`; sin ese marcador cae en un `index.d.ts` que
  no existe y sólo resuelve los componentes con un tipo `<Name>Props` con
  nombre. Con él salen los props reales **con su JSDoc**.
- **El purge de Tailwind incluye `.design-sync/previews/**`.** Si una preview
  usa una utilidad que la app no usa en ningún sitio, sin eso no se genera.
  Por eso hay que reejecutar `prepare.mjs` (o sea `buildCmd`) **después** de
  escribir previews nuevas y antes del build final.
- **`previews/_sin-movimiento.ts` fuerza `prefers-reduced-motion`** en todas las
  previews menos `LottieAnimation`. Las tarjetas son capturas estáticas: lo que
  anima al montar se fotografía a mitad de camino y la tarjeta **miente**.
  `LottieAnimation` es la excepción: con reduced-motion no arranca y no pinta
  nada. Pesa sobre todo en la web (`CountUp`, `SectorDataSection`); aquí se
  mantiene por el siguiente componente animado que entre.
- **Los `.woff` de Geist los inyecta `next/font`.** Fuera de Next no existen
  `--font-geist-sans`/`--font-geist-mono`, así que el prepare los declara
  contra `frontend/src/app/fonts/*.woff`. Sin eso todas las tarjetas salen en
  la fuente de respaldo del navegador.
- `mv` está aliasado a interactivo en esta máquina: los scripts que reescriben
  ficheros en sitio deben usar Python o `mv -f`, o el comando se queda colgado
  esperando una confirmación.

## Avisos de render conocidos (legítimos)

Ninguno pendiente. Verificado el 2026-09-29 con el convertidor montado en
`.ds-sync/` del checkout principal: `package-build.mjs` 12/12 componentes y
12/12 docs, `package-validate.mjs` limpio con render check 12/12 (dos tarjetas
tipográficas, abajo). El validador informa de «tokens: 1 missing, below
threshold», por debajo de su umbral.

## Cosas que se quedaron fuera a propósito

- Las composiciones a nivel de página (`AppShell`, `Providers`, las páginas de
  `app/`) siguen fuera del ámbito por decisión del usuario: sólo se sincronizan
  las piezas reutilizables del sistema.
- **`CallDetailModal` va con tarjeta tipográfica (floor card) a propósito.** Es
  un overlay `position: fixed` a pantalla completa con scroll interno: se probó
  con `cardMode: single` a 900x760, 900x1500, 820x900 y 900x1250, con una
  llamada corta sembrada y con un ancestro transformado (que sí cambia el bloque
  contenedor de los `fixed`) y en todos los casos la captura recorta la
  cabecera o sale en blanco. Se prefirió la tarjeta honesta a una que enseña el
  componente descabezado. **Funciona perfectamente al importarlo**; sólo no se
  deja fotografiar. No repetir el intento sin una técnica nueva para el bloque
  contenedor de `fixed` bajo el ancestro transformado del harness.
- **`ParticleMouseLayer` también va con floor card.** Es una capa global
  `fixed inset-0 -z-10` (mismo problema que `CallDetailModal`) que además se
  apaga sin puntero fino o con `prefers-reduced-motion`, que es justo lo que
  fuerza `_sin-movimiento.ts`.

## Hallazgos sobre el propio código (no tocados)

- **`BrandMark` sale como imagen rota en las tarjetas.** Hoy es un
  `<img src="/brand/alhabla-isotipo.svg">` con ruta absoluta: en la web real la
  sirve `public/`, pero en claude.ai/design esa ruta no existe y el bundle no
  lleva el SVG. Arreglarlo es tocar el componente (copia compartida en las dos
  webs), fuera del alcance de la sincronización.

## Riesgos de cara a la próxima sincronización

- La lista de componentes **no** se propaga sola: vive en
  `cfg.componentSrcMap` y hay que ampliarla a mano cuando se añada un
  componente a `frontend/src/components/`. Si uno se mueve o se borra, el
  prepare ya falla en vez de callarse.
- Las previews del panel dependen de que las **queryKey** de los componentes no
  cambien (`["recent-calls"]`, `["onboarding-state"]`, `["call-detail", id]`).
  Si alguien renombra una clave, la tarjeta pasa a estado de carga o de error
  sin que nada falle ruidosamente: hay que resembrarla en `prepare.mjs`.
- Los datos sembrados (llamadas, onboarding) están inlineados en
  `prepare.mjs`, pero **tipados** con `Call`, `Paginated` y `OnboardingState`
  de `frontend/src/lib/types.ts`: si esos tipos cambian, el prepare aborta con
  el error de `tsc` y hay que resembrar. Antes se generaban como texto sin
  comprobar y se quedaron con desenlaces que ya no existían (`BOOKED`, `INFO`,
  `NO_HELP`): la tarjeta de `RecentCalls` salía sin etiquetas.
- Los docs de `docs/*.md` describen comportamiento y nada los comprueba: al
  cambiar un componente, revisa su doc. El 2026-09-29, 16 de los 24
  contradecían el código (se corrigieron todos contra la fuente).
- El convertidor corre con Playwright + Chrome Headless Shell; el árbol de
  `.d.ts` lo emite el `tsc` del repo (TypeScript 5), ignorando errores de tipos
  fuera de `.ds-src/` siempre que llegue a escribir `dist/types/src/components`.
