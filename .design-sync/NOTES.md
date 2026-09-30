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
| Proyecto en claude.ai/design        | «Alhabla App» (`projectId`)       | «Alhabla Web» (`projectId`)          |
| Componentes                         | 12 (7 del panel + 5 compartidos)  | 19 (14 de marketing + 5 compartidos) |

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

**Primera subida real: 2026-09-29**, a dos proyectos nuevos creados ese día
(«Alhabla App» `b0d14166…` y «Alhabla Web» `bfd840b2…`). El `projectId`
anterior de la app (`f9904448…`, «Alhabla UI») daba 404 y la cuenta no tenía
ningún proyecto: la subida de septiembre nunca llegó a hacerse. Desde aquí
cada re-sync trae su ancla (`_ds_sync.json`) del proyecto y solo reverifica lo
que cambie.

El convertidor se monta en `.ds-sync/` de la raíz (con `playwright@1.63.0`,
que es la versión que casa con el `chromium-1243` de la caché de esta máquina);
`web/.ds-sync/` es otra copia de los scripts con `node_modules` enlazado al de
la raíz. `--node-modules` es `frontend/node_modules` aquí y `node_modules`
desde `web/`.

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
- Ninguna tarjeta tipográfica: desde el 2026-09-29 los 12 componentes tienen
  preview. `CallDetailModal` (viewport 900x800) y `ParticleMouseLayer`
  (900x480) usan la técnica de abajo.

**Overlays `fixed` en una tarjeta (técnica del 2026-09-29).** La tarjeta
envuelve cada historia en un `div` con `transform`, que pasa a ser el bloque
contenedor de los `fixed`; pero ese `div` mide 0 de alto porque el overlay está
fuera del flujo, así que `inset-0` colapsaba y la captura salía en blanco o sin
cabecera (así fallaron las cuatro pruebas de antes con `CallDetailModal`). La
preview mete el componente en una caja propia con alto explícito igual al
viewport del override y su propio `transform`: el overlay la llena entero.

`ParticleMouseLayer` además **no** importa `_sin-movimiento.ts` (con
`prefers-reduced-motion` no arranca) y simula un `mousemove` en el centro para
que se vea la repulsión; sus puntos se siembran al azar, así que la captura
cambia en cada build aunque la calificación se mantiene.

## Hallazgos sobre el propio código (no tocados)

- Ninguno pendiente.

## Riesgos de cara a la próxima sincronización

- **`BrandMark` lleva una copia del isotipo dentro** (`brand-mark.tsx`, SVG de
  `public/brand/alhabla-isotipo.svg` pasado por `svgo --multipass`, como data
  URI de un `<img>`). Si cambia el logo, hay que regenerar esa copia en las dos
  webs. Volver a una ruta `/brand/...` —que fuera de Next no existe— la dejaría
  otra vez como imagen rota; `tests/components/brand-mark.test.tsx` (en las dos
  webs) lo impide.
- La hora de las llamadas sembradas sale de `AHORA` en `prepare.mjs` (19:30 en
  Madrid): con las llamadas hasta 12 h antes, moverla hacia la mañana las lleva
  a la madrugada y la tarjeta deja de ser verosímil.

- La lista de componentes **no** se propaga sola: vive en
  `cfg.componentSrcMap` y hay que ampliarla a mano cuando se añada un
  componente a `frontend/src/components/`. Si uno se mueve o se borra, el
  prepare ya falla en vez de callarse.
- Las reservas sembradas llevan fecha fija (jueves 10, martes 8 y lunes 7 de
  septiembre de 2026, como dicen sus resúmenes); las llamadas son relativas a
  `AHORA`. Si cambias una de las dos cosas, revisa que resumen, transcripción y
  «Reserva vinculada» de `CallDetailModal` sigan diciendo lo mismo.
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
