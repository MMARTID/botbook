---
target: checkout page (/checkout, /checkout/resultado)
total_score: 19
max_score: 36
na_heuristics: 7
p0_count: 1
p1_count: 2
target_identity: "file:/Users/miguelmartin/AsistAI/frontend/src/app/checkout/page.tsx"
target_fingerprint: "sha256:c9256b58fa217cf9a4c2cd85412dc76ecd86cbed55c8ce0e3ca446b36dde4c72"
target_path: /Users/miguelmartin/AsistAI/frontend/src/app/checkout/page.tsx
timestamp: 2026-09-15T21-42-39Z
slug: frontend-src-app-checkout-page-tsx
---
# Crítica de diseño + auditoría técnica — /checkout y /checkout/resultado

Method: dual-agent (A: a3372f67fb6727526 · B: a5cbc2d7b6574c5e2)

## Hallazgo de partida (antes de las dos evaluaciones)
Ambos archivos seguían usando la paleta verde anterior al rediseño de agosto 2026
(#1e2b22, #eef6dc, #e4e8df, #54634b, #8a6d22, #f3f1e8, sombra teñida de verde) — DESIGN.md
es explícito: "no queda ni un token de la paleta verde anterior". ARREGLADO antes de correr
las evaluaciones, a los tokens actuales (#0a0a0a, .text-muted, #e5e5e5, sombra negra,
#ecf7ec/#2c7334 éxito, #fef8e7/#9f7a15 aviso — este último ya es el patrón real usado en
recent-calls.tsx/app-shell.tsx/ajustes).

## Design Health Score (estados observables)
1 Visibilidad 1/4 · 2 Mundo real 1/4 (antes del arreglo de "webhook") · 3 Control 2/4 · 4 Consistencia 1/4 (antes del error de Stripe sin estilo) · 5 Prevención errores 3/4 · 6 Reconocimiento 3/4 · 7 n/a · 8 Estética 3/4 · 9 Recuperación de errores 0/4 (antes del arreglo) · 10 Ayuda 2/4.
Puntuación previa a los arreglos de esta sesión — la mayoría de heurísticas bajas se debían a los P0/P1 ya corregidos.

## Lo que funciona
1. La página de plan inválido es un estado de error real, con salida, correctamente estilizada.
2. `min-h-[480px]` reserva espacio limpio mientras carga Stripe — sin salto de layout.
3. El sondeo de /checkout/resultado funciona exactamente como está codificado (verificado en vivo: ~2510ms entre peticiones, coincide con refetchInterval:2500).

## Problemas prioritarios (con estado tras el arreglo)
[P0] Cuando Stripe/el backend fallan al crear la sesión, se mostraba el error genérico en inglés de Stripe ("Something went wrong") sin reintentar ni volver — verificado en vivo contra un backend real caído. ARREGLADO: ahora se crea la sesión nosotros mismos (fuera de EmbeddedCheckoutProvider), y si falla se muestra un panel de marca en español con "Reintentar" y "Ver planes". Verificado en vivo, capturas confirmadas.
[P1] La palabra "webhook" aparecía en /checkout/resultado, violando la prohibición explícita de PRODUCT.md ("Nunca... «webhook», «API»..."). ARREGLADO: "Stripe está procesando el pago. En unos segundos activamos tu plan automáticamente."
[P1] El estado de confirmación pendiente sondea cada 2,5s indefinidamente sin ninguna vía de escalado si tarda de verdad. ARREGLADO: tras 60s sin confirmar, aparece una línea secundaria con contacto de soporte (hola@alhabla.ai), sin quitar el mensaje tranquilizador inicial.
[Técnico, hallazgo B] Botón "Planes" con `h-10` (40px) sobrescribiendo la altura base de `.btn-secondary` (48px) — inconsistente con el resto de instancias de esa clase en toda la app. ARREGLADO: se quitó el override, vuelve a 48px.
[P2] "Pago protegido por Stripe" tenía el mismo peso visual que el enlace "Planes", sin mencionar tranquilidad adicional (prueba, cancelación). ARREGLADO parcialmente: se añadió "· Cancela cuando quieras" a la misma línea (dato real de TRIAL_REASSURANCE); no se rediseñó la jerarquía visual completa.
[Técnico, hallazgo B] Sin `--warning-surface` como variable CSS nombrada (a diferencia de `--success-surface`) — el patrón `#fef8e7` es literal en varios sitios de la app, no solo aquí. No se tocó: es una limpieza de sistema de diseño más amplia, fuera del alcance de esta página.
[P3] El estado de plan inválido no explica por qué (enlace caducado, typo) — PENDIENTE, no se tocó.

## Alertas de persona
Ana, dueña de peluquería pagando por primera vez: antes se topaba con un error en inglés sin salida en el peor momento posible — ahora tiene un mensaje en español con reintentar.
Javier, fisioterapeuta interrumpido a media configuración: vuelve a /checkout/resultado sin session_id — antes se quedaba mirando "confirmando" para siempre sin señal de que algo podría fallar; ahora, pasado un minuto, ve una vía de contacto.

## Preguntas provocadoras
1. Si Stripe puede fallar de una forma que este código nunca había manejado (confirmado en vivo, no hipotético), ¿se ha probado alguna vez el flujo de pago fallido de verdad en producción, no solo el camino feliz?
2. Dado que PRODUCT.md prohíbe "webhook"/"API" en copy de usuario como regla dura, ¿se revisó alguna vez esta página contra PRODUCT.md, o solo contra la paleta de color?
