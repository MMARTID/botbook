# Notas de /design-sync — Alhabla

## Qué es este repo para el convertidor

No es una librería publicada: es la app Next.js de `frontend/`. No hay `dist/`,
ni `.storybook/`, ni ficheros `*.stories.*`. La forma es `package` y el
convertidor se alimenta de entradas **generadas** por `.design-sync/prepare.mjs`
(que es `cfg.buildCmd`, así que se ejecuta solo antes de cada build).

`prepare.mjs` escribe en `frontend/.ds-src/` (gitignorado) y en
`frontend/dist/types/` (gitignorado):

1. `entry.ts` — barrel con los componentes de `cfg.componentSrcMap` más las
   exportaciones de datos reales (`nicheLandings`, `DEFAULT_AGENT_SETTINGS`,
   `DEFAULT_BUSINESS_SCHEDULE`, `getScheduleSummary`) y `PreviewProviders`.
2. `process-shim.ts` — **imprescindible y debe ir primero en el barrel**. El
   código de la app lee `process.env` (`lib/api.ts`, `lib/seo.ts`) porque Next
   lo sustituye al compilar; en el navegador no existe y sin el shim el IIFE
   entero revienta al cargar y `window.Alhabla` queda vacío (se manifiesta como
   `[BUNDLE_EXPORT] 26/26 not a component`).
3. `preview-providers.tsx` — `PreviewProviders`: `QueryClientProvider` con la
   caché sembrada + `AppRouterContext` inerte. Se siembra la caché **en vez de
   mockear `@/lib/api`**, así el bundle sigue llevando el módulo de API real.
4. `alhabla.css` — `globals.css` compilado con Tailwind (es `@tailwind`/`@apply`
   sin compilar, inservible tal cual) precedido de los `@font-face` de Geist.
5. `dist/types/**` + un `package.json` con `types` — el árbol de `.d.ts`.

## Trampas que ya costaron una vuelta

- **Sin `frontend/dist/types/package.json` los 26 contratos de props salen como
  `[key: string]: unknown`.** El extractor busca el `types` del `package.json`
  más cercano al árbol de `.d.ts`; sin ese marcador cae en un `index.d.ts` que
  no existe y sólo resuelve los componentes con un tipo `<Name>Props` con
  nombre. Con él salen los props reales **con su JSDoc**.
- **El purge de Tailwind incluye `.design-sync/previews/**`.** Si una preview
  usa una utilidad que la app no usa en ningún sitio, sin eso no se genera.
  Por eso hay que reejecutar `prepare.mjs` (o sea `buildCmd`) **después** de
  escribir previews nuevas y antes del build final.
- **`.design-sync/previews/_sin-movimiento.ts` fuerza `prefers-reduced-motion`
  en todas las previews menos `LottieAnimation`.** Las tarjetas son capturas
  estáticas: sin él, todo lo que anima con framer-motion se fotografía a mitad
  de camino y la tarjeta **miente** — `SectorDataSection` mostraba 57% donde
  los datos ponen 62%, y `CountUp` salía a cero porque su `useInView` con
  margen `-80px` nunca se dispara arriba del todo. `LottieAnimation` es la
  excepción: con reduced-motion pasa `autoplay={false}` y no pinta nada.
- **Los `.woff` de Geist los inyecta `next/font` en la app.** Fuera de Next no
  existen `--font-geist-sans`/`--font-geist-mono`, así que `prepare.mjs` los
  declara contra `frontend/src/app/fonts/*.woff`. Sin eso todas las tarjetas
  renderizan en la fuente de respaldo del navegador.
- `mv` está aliasado a interactivo en esta máquina: los scripts que reescriben
  ficheros en sitio deben usar Python o `mv -f`, o el comando se queda colgado
  esperando una confirmación.

## Avisos de render conocidos (legítimos)

Ninguno pendiente: `package-validate.mjs` sale limpio, sin warns.

## Cosas que se quedaron fuera a propósito

- **`DemoVoiceCall`** (536 líneas, SDK de Retell + red en vivo) y las
  composiciones a nivel de página (`SiteLanding`, `AppShell`, `LegalPage`,
  `PlansWithRoi`, `Providers`) están fuera del ámbito por decisión del usuario:
  sólo se sincronizan las piezas reutilizables del sistema.
- **`CallDetailModal` va con tarjeta tipográfica (floor card) a propósito.** Es
  un overlay `position: fixed` a pantalla completa con scroll interno: se probó
  con `cardMode: single` a 900x760, 900x1500, 820x900 y 900x1250, con una
  llamada corta sembrada y con un ancestro transformado (que sí cambia el bloque
  contenedor de los `fixed`) y en todos los casos la captura recorta la
  cabecera o sale en blanco. Se prefirió la tarjeta honesta a una que enseña el
  componente descabezado. **Funciona perfectamente al importarlo**; sólo no se
  deja fotografiar. Su `.prompt.md` lo explica.
- **`ParticleMouseLayer` también va con floor card.** Sólo pinta en respuesta al
  movimiento del ratón (`fixed inset-0 -z-10`): no existe render estático suyo.

## Hallazgos sobre el propio código (no tocados)

- **`GoogleAuthButton` ignora todas sus props** (`onError`, `beforeStart`,
  `disabled`, `acceptedTerms`): el registro público está bloqueado a propósito y
  el botón sólo abre la burbuja de «próximamente». El `.d.ts` sigue anunciando
  esos props, así que el contrato miente respecto al comportamiento. Está
  documentado en su `.prompt.md`; si se reactiva el registro, revisar ese doc.
- **Las páginas de `/legal/` conservan hexadecimales de la paleta verde
  anterior** (`#344038`, `#1e2b22`) pese a que `DESIGN.md` dice que no queda
  ningún token verde. No se ha tocado nada de la app en esta sincronización.

## Riesgos de cara a la próxima sincronización

- `prepare.mjs` **duplica** el `content` de `frontend/tailwind.config.ts` sólo
  en la medida en que lo reexporta (`import base from "../tailwind.config.ts"`),
  así que los cambios de tema se propagan solos. Lo que **no** se propaga es la
  lista de componentes: vive en `cfg.componentSrcMap` y hay que ampliarla a mano
  cuando se añada un componente nuevo a `frontend/src/components/`.
- Las previews de `panel` dependen de que las **queryKey** de los componentes no
  cambien (`["recent-calls"]`, `["onboarding-state"]`,
  `["calendar-events", businessId, 15]`, `["call-detail", id]`). Si alguien
  renombra una clave, la tarjeta pasa a estado de carga o de error sin que nada
  falle ruidosamente: hay que resembrarla en `prepare.mjs`.
- Los datos sembrados (llamadas, eventos, onboarding) están **inlineados** en
  `prepare.mjs`. Si cambian los tipos de `frontend/src/lib/types.ts`, esos
  objetos se quedan desfasados en silencio — TypeScript no los comprueba porque
  se generan como texto.
- Verificado con Playwright 1.63.0 + Chrome Headless Shell 153. El árbol de
  `.d.ts` lo emite el `tsc` del repo (TypeScript 5), ignorando errores de tipos
  siempre que llegue a escribir `dist/types/src/components`.
- **La subida quedó pendiente**: esta sesión no pudo autorizar `DesignSync`
  (`/design-login` requiere una sesión interactiva). No hay proyecto en
  claude.ai/design todavía, así que **no hay `projectId` en la config** y la
  próxima ejecución creará uno nuevo y subirá todo desde cero.
