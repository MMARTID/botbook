# Notas de /design-sync — Alhabla (paquete de la web pública)

## Dónde encaja

Este es el paquete de **la web pública** (`web/`, `alhabla.ai`): portada,
landings por sector, planes, legal y registro. **Se lanza `/design-sync` desde
`web/`**, no desde la raíz: la raíz es el hogar del paquete de la app
(`.design-sync/`, `window.Alhabla`). Por qué son dos paquetes y no uno, y la
tabla completa de los dos, en `../../.design-sync/NOTES.md`.

- Bundle: `window.AlhablaWeb` (`cfg.pkg` = `alhabla-web-ui`, que es también el
  especificador que importan las previews).
- Proyecto en claude.ai/design: **«Alhabla Web»** (`projectId` en el config),
  creado y subido por primera vez el 2026-09-29. La app va en «Alhabla App».
- 17 componentes: 12 de marketing y los 5 compartidos con la app (`BrandMark`,
  `RangeSlider`, `GoogleAuthButton`, `ParticleField`, `ParticleMouseLayer`),
  copias idénticas en las dos webs. **Si cambias la preview o el doc de uno de
  los compartidos, cópialo al paquete de la app.**

## Qué genera el prepare

`web/.design-sync/prepare.mjs` (es `cfg.buildCmd`) llama al núcleo común,
`scripts/preparar-design-sync.mjs`, que escribe en `web/.ds-src/` y
`web/dist/types/` (gitignorados) el barrel, el shim de `process`, los providers,
la hoja de estilos compilada con los `@font-face` de Geist, las referencias de
tipos de Next y el árbol de `.d.ts` con su `package.json` marcador. El detalle
de cada pieza y sus trampas está en las notas de la app; lo propio de la web:

- **Datos extra**: `nicheLandings` (`web/src/lib/niche-landings.ts`), el copy
  real de las cinco landings por sector, para componer sin inventar relleno.
- **Providers**: solo `AppRouterContext` inerte. La web no tiene sesión ni
  TanStack Query (no está en sus dependencias), pero `RevenueLossCalculator`
  llama a `useRouter()`, que lanza sin router.
- **`process-shim` es igual de imprescindible**: `lib/api.ts`, `lib/seo.ts` y
  `lib/app-url.ts` leen `process.env` al cargar, y `lib/api.ts` lanza con
  `NODE_ENV=production` sin `NEXT_PUBLIC_API_BASE_URL`.
- **`previews/_sin-movimiento.ts` pesa aquí de verdad**: sin forzar
  `prefers-reduced-motion`, `CountUp`, `AnimatedCurrency`, `Reveal` y lo que
  los embebe (`SectorDataSection`) se fotografían a mitad de animación —
  `SectorDataSection` mostraba 57% donde los datos ponen 62%, y `CountUp` salía
  a cero porque su `useInView` con margen `-80px` nunca se dispara arriba del
  todo.
- El purge de Tailwind incluye `web/.design-sync/previews/**`: reejecuta el
  prepare después de escribir previews nuevas y antes del build final.

El prepare **aborta** si `componentSrcMap` apunta a un fichero que no existe o
si el barrel no compila, en lugar de dejar la tarjeta vacía.

## Avisos conocidos (legítimos)

- `tsc` da dos TS2742 al emitir los `.d.ts` del editor de Keystatic del blog
  (`src/components/blog/editor-del-blog.tsx`, `src/lib/keystatic/bloques.tsx`:
  tipos inferidos que apuntan al `@types/react` anidado de `@keystar/ui`). Son
  de emisión de declaraciones, fuera del ámbito del barrel, y no afectan a
  ningún contrato: el prepare los enseña como aviso y sigue.
- Verificado el 2026-09-29 con el convertidor montado en `.ds-sync/` del
  checkout principal: `package-build.mjs` 17/17 componentes y 17/17 docs,
  `package-validate.mjs` limpio con render check 17/17 (dos tarjetas
  tipográficas, abajo). «tokens: 1 missing, below threshold», por debajo de su
  umbral.

## Cosas que se quedaron fuera a propósito

- Las composiciones a nivel de página (`MainLanding`, `SiteLanding`,
  `CityNicheLanding`, `SiteHeader`, `SiteFooter`, `PlansWithRoi`, `LegalPage`)
  y las secciones de una sola landing (`HeroHilos`, `LlamadaScroll`, las
  `*-section` salvo `SectorDataSection`): sólo se sincronizan las piezas reutilizables del sistema.
- **`DemoVoiceCall` va con tarjeta tipográfica (floor card).** Es un overlay
  `fixed inset-0` como `CallDetailModal` en la app, con red y micrófono de por
  medio (`createDemoWebCall`, `searchDemoPlaces`, `getDemoPlaceDetails` y el SDK
  `@telnyx/webrtc`). Una preview del estado inicial a `cardMode: single`
  480x720 recortaba la cabecera igual que las cuatro pruebas de
  `CallDetailModal`; no repetir sin una técnica nueva para el bloque contenedor
  de `fixed` bajo el ancestro transformado del harness.
- **`ParticleMouseLayer` también va con floor card**: capa global
  `fixed inset-0 -z-10` que se apaga sin puntero fino o con
  `prefers-reduced-motion`.

## Hallazgos sobre el propio código (no tocados)

- **`BrandMark` ya no sale roto**: desde el 2026-09-29 lleva el SVG dentro como
  data URI (ver las notas de la app).
- **Las páginas `/legal/privacidad` y `/legal/aviso-legal` conservan
  hexadecimales de la paleta verde anterior** (`#344038`, `#1e2b22`) pese a que
  `DESIGN.md` dice que no queda ningún token verde.

## Riesgos de cara a la próxima sincronización

- **Las previews no pueden inventar cifras.** El agente de diseño imita lo que
  ve en ellas, y PRODUCT.md § Evidence on Hand prohíbe métricas propias y
  cifras sin fuente externa. El 2026-09-29 `CountUp` presentaba «26.000» (los
  centros de uñas de STANPA) como «citas reservadas por agentes» y
  `SectorDataSection` enseñaba tres cifras sin fuente; ahora salen de
  `nicheLandings` con su etiqueta y su fuente reales. Al tocar una preview con
  números, cópialos de `niche-landings.ts` y revisa la cuenta (la tarjeta de
  `AnimatedCurrency` decía 420 € al mes = 4.680 € al año).

- La lista de componentes vive en `cfg.componentSrcMap` y hay que ampliarla a
  mano cuando se añada un componente reutilizable a `web/src/components/`.
- Las previews de `LandingHero`, `SectorDataSection` y `RevenueLossCalculator`
  leen `nicheLandings.peluqueria`: si cambia la forma de `NicheLandingContent`,
  la tarjeta cambia con ella (es lo buscado) o se rompe en el render check.
- La preview de `PlanSelectionLink` copia a mano precios y tarjetas de
  `lib/plans.ts` y `PlansWithRoi`: si cambian, actualízala.
- Los docs de `docs/*.md` describen comportamiento y nada los comprueba: al
  cambiar un componente, revisa su doc. El 2026-09-29 la mayoría contradecía
  el código (el hero de dos columnas, la demo con Retell, el botón de Google
  «que ignoraba sus props») y se corrigieron todos contra la fuente.
