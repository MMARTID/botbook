---
target: pricing page (/planes)
total_score: 25
max_score: 36
na_heuristics: 9
p0_count: 1
p1_count: 2
target_identity: "file:/Users/miguelmartin/AsistAI/frontend/src/app/planes/page.tsx"
target_fingerprint: "sha256:dd178a5faf2fca1e839f2cf7ca0838513743fe88c6ae1d95124edb9e902ebbcb"
target_path: /Users/miguelmartin/AsistAI/frontend/src/app/planes/page.tsx
timestamp: 2026-09-15T21-35-56Z
slug: frontend-src-app-planes-page-tsx
---
# Crítica de diseño + auditoría técnica — /planes

Method: dual-agent (A: ada4f0d4d8a201266 · B: abd415eeb4794729e)

## Contexto importante descubierto
En producción, los botones "Elegir X" NO navegan — `isProductionBuild()` los bloquea y muestra una burbuja "en desarrollo" con email de contacto (decisión explícita 2026-09-14, registro público desactivado). Solo en dev navegan de verdad a /register o /checkout. Esto reduce la urgencia de los hallazgos de copy/UX del funnel (P0/P2 de Assessment A) porque el funnel real está pausado; prioricé los arreglos técnicos verificables.

## Design Health Score
1 Visibilidad 3/4 · 2 Mundo real 4/4 · 3 Control 2/4 · 4 Consistencia 3/4 · 5 Prevención errores 3/4 · 6 Reconocimiento 3/4 · 7 Flexibilidad 2/4 · 8 Estética 3/4 · 9 n/a · 10 Ayuda 2/4.
Total: 25/36

## Veredicto de especificidad
Contextualmente específico: el contraste de ROI real de la calculadora y el estado "El que has elegido" no son plantilla genérica de pricing.

## Lo que funciona
1. La caja de contraste de ROI calla cuando la estimación no cubre el plan — restricción documentada en el propio código ("callar es más honesto que enseñar una resta en contra").
2. Manejo correcto del plan preseleccionado coexistiendo con "Recomendado".
3. Objetivos táctiles ≥44px en toda la página, confirmado en vivo.

## Problemas prioritarios (con estado tras el arreglo)
[Sistémico, hallazgo B] Los tres botones globales `.btn-primary`/`.btn-secondary`/`.btn-purple` (usados en TODA la app, no solo /planes) no tenían anillo de foco morado — caían al outline por defecto del navegador. ARREGLADO en globals.css: un solo cambio cubre cada instancia de estas clases en toda la aplicación. `PlanSelectionLink` usa clases propias (no las globales) y no lo heredó — ARREGLADO también ahí directamente.
[Técnico, hallazgo B] Badge "Recomendado" con fallo real de contraste (blanco sobre #8b5cf6 a 12px = 4.23:1, falla AA) — ARREGLADO a #7c3aed (5.70:1).
[P1] "Volver" fijo a /landing sin importar de dónde llegó el usuario (landing de nicho, /register) — ARREGLADO: nuevo componente BackLink usa router.back() con fallback a /landing solo si no hay historial.
[P2] La misma frase de ROI ("recuperarías X € al mes") se repetía en el titular y en las 3 tarjetas — ARREGLADO: cada tarjeta ahora solo muestra el margen específico de ese plan, el titular ya dice la cifra una vez.
[P0] Sin reassurance junto al CTA sobre qué implica pulsar "Elegir X" (crea cuenta, no cobra) — ARREGLADO 2026-09-16 (decisión del usuario): línea bajo cada botón, enlazada por `aria-describedby`. Cuando el embudo navega: «Crea tu cuenta y añade una tarjeta: no se cobra nada hasta que termina la prueba.» (Stripe exige tarjeta: `payment_method_collection: "always"`); con sesión iniciada se omite «Crea tu cuenta y». En producción, con el registro cerrado: «Registro por invitación mientras terminamos el desarrollo.»
[P1] Flash de contenido genérico→personalizado al cargar (headline y ROI) — verificado por Assessment B: NO hay hydration mismatch (el patrón useState+useEffect es seguro), pero sí hay un salto visual tras el montaje. No se tocó — es un trade-off de UX menor, no un bug.
[P3] Titular puede crecer a 6 líneas en móvil cuando está personalizado — ARREGLADO 2026-09-16: copy más corto («Convierte esas 12 llamadas al mes en 420 € de reservas, sin complicarte.») y un paso menos de cuerpo en móvil (`text-3xl sm:text-4xl`) solo en la variante personalizada, con `text-balance`.

## Alertas de persona
Usuario que llega "frío" a /planes: mejor servido ahora que el foco es visible en cada CTA.
Usuario que llega "caliente" desde la calculadora de una landing de nicho: ya no pierde su contexto al pulsar "Volver" (arreglado); ya no ve la misma frase de ROI repetida 4 veces (arreglado).

## Preguntas provocadoras
1. Si la caja de ROI calla cuando no cubre el plan (honestidad por omisión), ¿por qué repetía la misma cifra positiva 3 veces cuando sí cubre? (Corregido en esta pasada.)
2. Dado que el botón de compra en producción no hace nada (solo abre una burbuja de contacto), ¿vale la pena invertir en copy de reassurance junto al CTA ahora, o esperar a que el registro público se reactive?
