---
target: landing page (/landing, MainLanding)
total_score: 23
max_score: 28
na_heuristics: 7,9,10
p0_count: 1
p1_count: 1
target_identity: "file:/Users/miguelmartin/AsistAI/frontend/src/app/landing/page.tsx"
target_fingerprint: "sha256:2a193865fadc56ec80b5e2740d7e9bff8ccfae37e02e57bfdfb3b7daf87f3da6"
target_path: /Users/miguelmartin/AsistAI/frontend/src/app/landing/page.tsx
timestamp: 2026-09-15T19-31-55Z
slug: frontend-src-app-landing-page-tsx
---
# Crítica de diseño — /landing

Method: dual-agent (A: ac47f53e4c3af71bb · B: a632688d104ede5e8)

## Nota de alcance importante

`/landing` no renderiza el árbol JSX de `site-landing.tsx` que la crítica anterior (2026-08-20) probablemente evaluó — con `content` sin definir, `SiteLanding` delega en `MainLanding` (`frontend/src/components/main-landing.tsx`). Esta página no tiene sección de precios, ni FAQ, ni calculadora de pérdida de ingresos — esas piezas solo viven en las landings de nicho.

## Design Health Score

| # | Heurística | Puntuación | Hallazgo clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3/4 | Estados transitorios de count-up/reveal pueden leerse como glitch en scroll rápido |
| 2 | Coincidencia con el mundo real | 4/4 | Copy concreto y específico de pequeño negocio español |
| 3 | Control y libertad del usuario | 2/4 | El scrollytelling de 340vh atrapa el scroll hacia arriba (verificado en móvil) |
| 4 | Consistencia y estándares | 4/4 | Cero violaciones de las reglas nombradas de DESIGN.md |
| 5 | Prevención de errores | 3/4 | Sin formularios; único riesgo es el scroll-hijack |
| 6 | Reconocimiento antes que recuerdo | 3/4 | No hay "Precios" en el nav de esta variante |
| 7 | Flexibilidad y eficiencia | n/a | Superficie Persuade |
| 8 | Diseño estético y minimalista | 4/4 | Disciplinado, un solo acento |
| 9 | Recuperación de errores | n/a | Sin estados de error |
| 10 | Ayuda y documentación | n/a | Sin FAQ en esta variante — agrava #3 |

Total: 23/28 puntos aplicables (82%)

## Veredicto de especificidad de diseño

Específico de Alhabla vía el scrollytelling de desvío de llamada. Detector limpio (`impeccable detect` → `[]`, exit 0, 12 archivos). Evidencia de navegador: jerarquía de encabezados correcta, sin overflow móvil, sin errores de consola. Hallazgo de contraste real: `.badge-soft` "El coste de no contestar" en `sector-data-section.tsx:52` usa `#8b5cf6` crudo (3.73:1, falla AA) en vez de `purple-ink` `#6d28d9` (6.25–7.27:1 en el resto de badges de la página).

## Lo que funciona

1. Animación de desvío de llamada (`ConnectionScene`) — explica, no decora.
2. Disciplina de tokens — coincide con DESIGN.md salvo la excepción anotada.
3. Voz de copy fiel al brief de marca.

## Problemas prioritarios

[P0] Sin precio en `/landing`. Fix: sección compacta con ancla #precios. Comando: clarify/distill.
[P1] Scroll-hijack atrapa navegación hacia arriba en móvil. Fix: soltar snap tras primera etapa o reforzar affordance de salto. Comando: harden/polish.
[P2] Sin FAQ antes del CTA de cierre. Fix: portar 3-4 preguntas de site-landing.tsx. Comando: distill/onboard.
[P3] Grid de estadísticas desbalanceado en desktop (3 columnas, 2 datos). Comando: layout.
[P3] Badge de contraste bajo, real y trazable a sector-data-section.tsx:52. Comando: audit/fix directo.

## Alertas de persona

Dueña de peluquería (móvil, entre clientas): atrapada en scroll-hijack (P1); no encuentra precio (P0).
Visitante escéptica comparando competidores: sin FAQ para resolver dudas rápido (P2).
Visitante que vuelve a mirar precio: no puede completar la tarea en /landing (P0); inconsistencia de nav entre variante genérica y de nicho.

## Observaciones menores

Pasos "01 · Conexión" usan correctamente purple-ink. Código muerto (businessBenefits/FAQ) en site-landing.tsx para esta ruta. Sin testimonios/contadores fabricados — coherente con prelanzamiento. Warning de consola no bloqueante de useScroll.

## Preguntas provocadoras

1. ¿Y si precio/FAQ vivieran después del scrollytelling en la misma página?
2. ¿Y si las tarjetas de sector fueran la navegación principal, enrutando antes a las landings de nicho?
3. ¿Y si el riel de scroll llevara etiquetas de etapa reales en vez de puntos desnudos?
