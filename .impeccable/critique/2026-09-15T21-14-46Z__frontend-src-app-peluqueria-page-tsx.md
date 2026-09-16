---
target: peluqueria niche landing (/peluqueria, shared site-landing template)
total_score: 29
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 1
target_identity: "file:/Users/miguelmartin/AsistAI/frontend/src/app/peluqueria/page.tsx"
target_fingerprint: "sha256:f1e2a8274a671ae5b61b0aa943fdce05da36bd5a27aa48aff2e8d5a0a75a2ae0"
target_path: /Users/miguelmartin/AsistAI/frontend/src/app/peluqueria/page.tsx
timestamp: 2026-09-15T21-14-46Z
slug: frontend-src-app-peluqueria-page-tsx
---
# Crítica de diseño + auditoría técnica — /peluqueria

Method: dual-agent (A: aa250b4719ceb726f · B: acd46f062b11cac3b)

Página representativa de la plantilla compartida (site-landing.tsx) de las 5 landings de nicho.

## Design Health Score
1 Visibilidad 3/4 · 2 Mundo real 4/4 · 3 Control 3/4 · 4 Consistencia 2/4 (acento de nicho incompleto) · 5 Prevención errores 3/4 · 6 Reconocimiento 4/4 · 7 Flexibilidad 3/4 · 8 Estética 3/4 · 9 n/a · 10 Ayuda 4/4.
Total renormalizado (9 aplicables): ~29/36 (81%)

## Veredicto de especificidad
Copy genuinamente de peluquería. Pero el acento por nicho solo cubre ~40% de las superficies: titular subrayado del hero, RangeSlider completo y la calculadora de pérdida de ingresos (el momento emocional más alto) quedan en morado de marca fijo en las 5 landings.

## Lo que funciona
1. Calculadora de pérdida de ingresos funcional y bien afinada (ticket medio, persistencia de ROI a /planes).
2. Sourcing de datos de terceros correcto (etiqueta + fuente + enlace), respeta restricción de prelanzamiento.
3. Copy con vocabulario real de peluquería.

## Problemas prioritarios (con estado tras el arreglo)
[P1] Acento de nicho incompleto (~40% cobertura) — ARREGLADO (commit 78f10a9, 2026-09-16): `.titular-subrayado` toma `--purple-ring` del acento por instancia, `RangeSlider` recibe `accent` (icono, relleno, thumb y anillo de foco), la calculadora tiñe la cifra de pérdida, el check y el botón con `accent.strong`, y los iconos de beneficio y de calendario en site-landing.tsx usan `accent.soft/strong`. Revisión 2026-09-16: no queda morado de marca fijo en la ruta de nicho salvo la demo de voz (UI del producto, no del nicho) y el `.btn-purple` del cierre negro.
[P2] HeroPulse oculto en móvil (landing-hero.tsx, hidden lg:block). Comando: adapt. PENDIENTE — decisión 2026-09-16: fuera de esta pasada.
[P2] Cita de prensa puede leerse como testimonio de cliente (sector-data-section.tsx:112-120). Comando: clarify. PENDIENTE.
[P2 técnico] Menú móvil sin fixed/backdrop — ARREGLADO (78f10a9): panel `fixed` con backdrop que cierra al tocar fuera; `aria-modal` descartado a propósito (no es válido en un landmark `nav`).
[P3 técnico] Objetivos táctiles <44px — botón "Reproducir" ARREGLADO (78f10a9, `h-11`); el logotipo sigue en 32px pero su enlace incluye el nombre de la marca, así que el objetivo real es más ancho. Comando: adapt.
[P3] Sin reassurance explícito para salón de una silla. Comando: clarify. PENDIENTE.

## Hallazgos técnicos
A11y: jerarquía de encabezados limpia, sliders correctamente etiquetados, sin img sueltas. Contraste del badge hero (#b23a68/#fbe9f1) pasa por margen estrecho (4.87:1) — riesgo arquitectónico en landing-hero.tsx a verificar en las otras 4 niches. Rendimiento limpio (transform/opacity, sin antipatrón scrollY). Sin overflow móvil. Consola limpia incluso tras interacción con la calculadora.

## Alertas de persona
Dueña de peluquería en móvil: pierde HeroPulse. Comparadora entre nichos: calculadora idéntica en color. Salón de una silla: tiene que inferir si el producto le sirve.

## Observaciones menores
btn-purple como nombre de clase engañoso ahora que no todas las landings son moradas.

## Preguntas provocadoras
1. ¿Para qué sirve el sistema de acento por nicho si los dos elementos de mayor atención nunca cambian de color?
2. ¿El orden de la FAQ está pensado para este nicho o heredado de la genérica?
3. ¿Hay un tratamiento visual distinto preparado para cuando lleguen testimonios reales?
