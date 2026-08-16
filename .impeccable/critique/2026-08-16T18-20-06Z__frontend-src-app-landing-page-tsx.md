---
target: landing
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-16T18-20-06Z
slug: frontend-src-app-landing-page-tsx
---
⚠️ DEGRADED: single-context (el sub-agente de Assessment B fue detenido y no es reanudable; su carga determinista se ejecutó en el contexto principal). Assessment A corrió aislada como sub-agente y terminó antes de que cualquier hallazgo del detector entrara en el contexto de síntesis.

# Critique — /landing (landing genérica de conversión)

Target: `frontend/src/app/landing/page.tsx` → `site-landing.tsx` + `landing-hero.tsx`, `hero-conversation.tsx`, `revenue-loss-calculator.tsx`, `demo-voice-call.tsx`, `plans-with-roi.tsx`, `mobile-nav.tsx` · Modo: Persuade

## Design Health Score

| # | Heurística | Nota | Incidencia clave |
|---|-----------|-------|-----------|
| 1 | Visibilidad del estado | 3 | Modal de demo con máquina de estados y `aria-live`; los botones «Empezar con…» navegan sin estado intermedio y nada avisa de que se pedirá el micrófono |
| 2 | Correspondencia con el mundo real | 2 | «detecta leads», «1 archivo de contexto» en la tarjeta de 69 €, «voces hiperrealistas», «Automatizar para crecer», «Casos de prueba» |
| 3 | Control y libertad | 3 | Escape/X/colgar/silenciar correctos; sin confirmación al colgar y sin forma de reiniciar la estimación persistida |
| 4 | Consistencia y estándares | 1 | Ocho etiquetas para el mismo destino `/planes`; plan «Básico» en la tarjeta y «Inicio» en la calculadora; 21 radios fuera de escala |
| 5 | Prevención de errores | 1 | El CTA de mayor peso abre un modal que exige micrófono sin aviso, con la política de privacidad en `href="#"` |
| 6 | Reconocer antes que recordar | 2 | La calculadora produce «420 €/mes» y el bloque de precios no lo referencia |
| 7 | Flexibilidad y eficiencia | 2 | El contexto ROI personaliza el H1 de `/planes`, pero `PersonalizedPlanCard` calcula el contraste de valor y no pinta ni un dato |
| 8 | Estética y minimalismo | 2 | Once secciones, ocho CTAs, nueve FAQ y cuatro bloques oscuros compitiendo |
| 9 | Diagnóstico y recuperación de errores | 1 | `error.message` crudo del SDK de Vapi en pantalla, incluido el nombre de una variable de entorno |
| 10 | Ayuda y documentación | 3 | FAQ genuinamente bueno, pero por debajo del precio y con un `mailto` como único canal |
| **Total** | | **20/40** | **Aceptable — se necesitan mejoras significativas** |

Ninguna heurística marcada `n/a`: en esta superficie el FAQ funciona como documentación y el contexto ROI es un acelerador real.

## Design Specificity Verdict

Mayoritariamente **intercambiable**, con dos islas de autoría real. La secuencia es la plantilla canónica de SaaS sin una sola desviación: hero de dos columnas → tres features → banda de integración → tres benefits → tira oscura → calculadora → chips → tres planes → FAQ → banda de cierre → footer.

Autorado de verdad: **HeroConversation** (teléfono sonando, temporizador `00:07` en mono, tres escenas del oficio, desenlace «Cita confirmada · Mañana · 16:30») y **RevenueLossCalculator** (dos sliders, cifra en la moneda mental de la dueña, cierre «con 2 citas al mes se cubre el plan Inicio»).

Intercambiable: los `highlights` «Atención 24/7 / Agenda conectada / Conversaciones útiles»; la tira oscura de `site-landing.tsx:275-288` (tres frases sin contenido verificable en el bloque de más peso); y la tercera tarjeta **«Pymes y profesionales»** (`:59-78`), que desmonta el posicionamiento vertical de PRODUCT.md. Barberías, salones de uñas y fisioterapia no se nombran salvo en un chip.

Oportunidades perdidas: la **reserva verificada** degradada a viñeta gris; el **RGPD** sin una sola mención; la **prueba de 7 días** (`billing/service.ts:8`) ausente; y las 15+ estadísticas con fuente de `niche-landings.ts` que no llegan, porque `site-landing.tsx:175` condiciona `SectorDataSection` a `content?.sectorData` y en `/landing` `content` es `undefined`.

### Escaneo determinista

Detector empaquetado: **0 hallazgos, exit 0**, en dos invocaciones (los 9 archivos del árbol; y `frontend/src/components` + `globals.css`). Verificado que sí escanea `.tsx` (`SCANNABLE_EXTENSIONS` en `detector/node/file-system.mjs:26`): limpio real, no falso negativo por extensión. Su vocabulario de reglas no cubre lo que falla aquí.

Mediciones propias:

| Comprobación | Resultado |
|---|---|
| Lima neón `#d6ff72` | 1 — `landing-hero.tsx:65`, `rgba(214,255,114,0.22)` en el halo del panel hero |
| Negro verdoso `#101814` | 8 — `site-landing.tsx` ×4, `landing-hero.tsx` ×2, `demo-voice-call.tsx` ×1, más el footer `bg-[#0b110e]` |
| Radios fuera de escala | 21 — `rounded-3xl` ×1 y 20 arbitrarios: 1.1, 1.25, 1.35, 1.4, 1.5×4, 1.7×2, 1.75×5, 1.8, 2rem×3 |
| Sombras > 32px / 0,16 | 7 — `0_18px_50px`, `0_16px_45px`, `0_22px_55px`×3, `0_20px_45px`, `0_26px_80px_rgba(16,24,20,0.28)` en `demo-voice-call.tsx:449` |
| `tracking` > `0.12em` | 8 — `0.3em`×4, `0.28em`×2, `0.18em`, `0.15em` |
| Fuentes < 14px | 16 declaraciones en `hero-conversation.tsx` (8/9/10/11/13px) + `demo-voice-call.tsx:563` |
| `role="dialog"` / `aria-modal` | 0 en todo el árbol — el modal de `demo-voice-call.tsx:449` no es un diálogo para tecnología asistiva |
| Objetivos táctiles < 44px | thumbs de slider a 24px (`h-6`, `revenue-loss-calculator.tsx:120` y `:147`); CTAs de cabecera y menú móvil a 40px |
| `prefers-reduced-motion` | Solo `hero-conversation.tsx:164` en JS; `globals.css` cubre `.demo-call-modal`. `animate-spin` en `demo-voice-call.tsx:523` sin guarda |

Contrastes WCAG calculados (luminancia relativa 2.1):

| Ratio | AA normal | Par | Dónde |
|---|---|---|---|
| 2,99:1 | FALLA | `#8b9a7f` sobre blanco | eyebrow «Precios» `site-landing.tsx:312`; etiquetas «Cliente»/«AsistAI» a 8px en `hero-conversation.tsx:121` |
| 3,79:1 | FALLA | `#7a8774` sobre blanco | nota al pie de la calculadora `:202`, extremos de sliders, «Tiempo máximo» de la demo |
| 4,22:1 | FALLA | `#718064` sobre blanco | eyebrows `:180`, `:296`, `:349`, `:97`, `:452` |
| 4,42:1 | FALLA | `#687267` sobre `#eef2eb` | el token `--muted` sobre el papel: falla en toda la aplicación |
| 3,04:1 | FALLA | `#8e968d` sobre blanco | placeholder de `.field` en `globals.css` |
| 9,26:1 | PASA | `#b8d96e` sobre `#1e2b22` | los 14 usos del Brote Claro están sobre bloque oscuro |
| 7,08–8,92:1 | PASA | `text-white/65…75` sobre `#1e2b22` | todo el texto de bloques oscuros pasa con holgura |

Falsos positivos descartados: «Brote Claro sobre blanco» (1,59:1) es falso — las 14 apariciones están sobre `bg-[#1e2b22]`, incluida la cifra grande de la calculadora (`:171`, dentro del panel oscuro de `:158`). El `aria-hidden` de los extremos de slider no exime del contraste: siguen siendo visibles.

Overlays visuales: ninguno. No se inyectó script y no existe overlay en el navegador del usuario. Visualización de navegador omitida: el sub-agente arrancó un segundo servidor de desarrollo junto al preexistente y ambos se pisaron los manifests de `frontend/.next`.

## Overall Impression

Dos piezas mejores que la media del sector y nueve secciones que podrían ser de cualquiera. El código es cuidadoso (`aria-live` donde toca, `useReducedMotion` cableado, `<details>` nativos); el problema es que las dos piezas buenas están en la posición 6 de 11 y en un panel que en móvil cae bajo el pliegue, mientras el espacio de máximo valor lo ocupan afirmaciones sin respaldo en un producto que tiene prohibido fabricar prueba social. Mayor oportunidad: subir la calculadora al hero y dejar HeroConversation como prueba en la sección siguiente.

## What's Working

1. **RevenueLossCalculator**: dos variables conocidas de memoria, `aria-live="polite"` con `aria-atomic` en la cifra (`:170`), `aria-valuetext` en español en ambos sliders (`:119`, `:146`), progreso pintado con gradiente en vez de depender del color del thumb, y cierre aritmético con disclaimer honesto.
2. **HeroConversation**: `useReducedMotion` congela la rotación, elimina delays, muestra todos los mensajes de golpe y oculta indicadores. Termina siempre en desenlace verificable — el lenguaje de PRODUCT.md: citas, no conversaciones.
3. **El FAQ**: nueve objeciones reales en el orden de una venta, con respuestas concretas, en `<details>` nativos accesibles por teclado sin JS.

## Priority Issues

### [P0] La demo —el CTA principal— rompe la confianza al pedir el micrófono
Tres fallos concurrentes: la «política de privacidad» de `demo-voice-call.tsx:534` apunta a `href="#"` y esa política no existe en el proyecto (cero apariciones de «privacidad», «aviso legal», «cookies» en `frontend/src`); `:352`, `:367` y `:381` vuelcan `error.message` crudo del SDK, incluido «Falta configurar NEXT_PUBLIC_VAPI_DEMO_PUBLIC_KEY»; y el contenedor no tiene `role="dialog"`, `aria-modal` ni trampa de foco, así que con teclado o lector se tabula fuera del modal mientras el agente habla.
**Fix:** crear `/legal/privacidad` y `/legal/aviso-legal` y enlazarlas desde `:534` y el footer. Tres mensajes en español según causa (permiso denegado / sin conexión / resto). Añadir `role="dialog" aria-modal="true" aria-labelledby="demo-title"`, `id` en el `h2` de `:453` y ciclo de foco.
**Comando:** `/impeccable harden`

### [P0] El bloque de precios oculta la prueba de 7 días y sus botones no cumplen lo que prometen
`CHECKOUT_TRIAL_DAYS = 7` se aplica en `billing/service.ts:173` y no se menciona en la landing. Los botones «Empezar con Básico / Pro / Scale» (`site-landing.tsx:336`) apuntan todos a `/planes` sin `?plan=`. Y el plan es «Básico» en `plans.ts:15` pero «plan Inicio» en `revenue-loss-calculator.tsx:181`.
**Fix:** unificar el nombre y derivarlo de `starterPlan.name`; añadir `?plan=${plan.id}` y leerlo en `/planes`; línea de 16px bajo el H2 con «7 días de prueba. Sin permanencia. Cancela cuando quieras», indicando si hace falta tarjeta.
**Comando:** `/impeccable clarify`

### [P1] La landing genérica no tiene ninguna prueba, con quince cifras con fuente a un `if` de distancia
`site-landing.tsx:175` condiciona `SectorDataSection` a `content?.sectorData`. El espacio donde iría el dato lo ocupa la tira oscura de `:275-288` con tres frases de relleno, en un producto en prelanzamiento sin permiso para fabricar prueba social.
**Fix:** `SectorData` transversal con 2–3 cifras válidas para los cinco nichos desde las fuentes de `niche-landings.ts`; sustituir la tira oscura por ese bloque con su «Fuente:» visible.
**Comando:** `/impeccable shape`

### [P1] Tres promesas del copy no son entregables, y una se emite a Google
FAQ `:99` promete elegir entre «voces ultra-naturales e hiperrealistas» y no existe selector de voz en el frontend. «Configuramos contigo» / «Activamos contigo» prometen acompañamiento humano en un autoservicio. Y `seo.ts:88-101` publica un nodo «Soporte para Kit Digital» que afirma facilitar «la optención de subvenciones» (con errata) apuntando a `/landing#kit-digital`, un ancla inexistente.
**Fix:** reescribir la FAQ de la voz a lo cierto (tono cálido/profesional/directo); cambiar «Configuramos contigo» por «Te guiamos con instrucciones paso a paso»; eliminar el nodo Kit Digital del structured data.
**Comando:** `/impeccable clarify`

### [P2] Deriva visual contra el sistema y cinco tokens de texto por debajo de AA
21 radios fuera de escala, 7 sombras por encima del techo, el lima prohibido en el halo del hero, ocho `rgba(16,24,20,…)` y un footer `#0b110e` fuera de paleta. Y `#8b9a7f` (2,99:1), `#7a8774` (3,79:1), `#718064` (4,22:1), `#687267` sobre papel (4,42:1) y el placeholder `#8e968d` (3,04:1) incumplen WCAG 2.1 AA. El caso peor combina ambas: `#8b9a7f` a 8px en `hero-conversation.tsx:121`.
**Fix:** radios arbitrarios → `rounded-lg/xl/2xl`; las 7 sombras → `0_12px_32px_rgba(30,43,34,0.08)`; halo → `rgba(184,217,110,0.22)`; `rgba(16,24,20,…)` → `rgba(30,43,34,…)`; footer → `#1e2b22`. Texto: `#718064` y `#7a8774` → `#54634b` (6,44:1); `#8b9a7f` → `#687267` (5,01:1) y de 8–11px a 14px mínimo; `tracking-[0.3em]` → `0.12em`. Revisar `--muted` sobre papel a nivel de token.
**Comando:** `/impeccable polish`

## Persona Red Flags

**Jordan (primera vez):** «desvío» no aparece hasta la FAQ 2, al final. La sección `id="#como-funciona"` promete el cómo y entrega tres beneficios. «Saltar al contenido» (`site-landing.tsx:131`) apunta a `#main-content`, que es el `<main>` que lo contiene: no salta nada. Badge con icono `Sparkles` y cero texto en `landing-hero.tsx:72`.

**Riley (límites):** con los sliders al máximo anuncia 16.000 €/mes y 192.000 €/año para una peluquería, con el disclaimer a 12px en 3,79:1 — alarmismo por construcción, prohibido por PRODUCT.md. Pulsar «Recuperar mis 420 €» sin tocar sliders deja `hasInteracted` en `false` y `/planes` muestra el titular genérico. Tabular en el modal con llamada activa cae en la landing de detrás.

**Casey (móvil):** el artefacto de prueba es ilegible — 8/9/10/11px en `hero-conversation.tsx` frente a los 14px mínimos de DESIGN.md. El hero ocupa `min-h-[calc(100svh-4rem)]`: en 375×667 el panel de conversación queda bajo el pliegue. El botón oscuro abre un modal a `100dvh` pidiendo micrófono. El menú móvil no cierra al tocar fuera ni con Escape y no bloquea el scroll. Thumbs de 24px.

**Marisa, 52, dueña de peluquería** (persona del proyecto): no la reconocen — «negocios», «Pymes y profesionales»; sus palabras solo están en la animación que no puede leer. «Archivo de contexto» impreso en la tarjeta de 69 €. Nadie le dice qué pasa con su Google ni con la conversación de sus clientas, sin política de privacidad que consultar. La prueba gratuita existe sin que se entere.

## Minor Observations

- **Bug real:** `site-landing.tsx:186` y `:255` eligen el icono con `highlights[index]?.icon` — por posición en el array por defecto, no por contenido. Cualquier override de nicho recibe iconos que no corresponden.
- Las FAQ genéricas dicen «tu salón» y «un tinte, unas uñas o un masaje»: excluyen fisioterapia. La FAQ `:91` promete solo Google Calendar cuando también hay Outlook.
- `plans.ts:25` lista «Sin asociación de servicios a profesionales» como feature del plan Básico, con check verde.
- `plans.ts:21/27` distingue «llamadas móvil» de «llamadas web y móvil» sin explicar qué es una llamada web.
- Sin `openGraph.images` ni `twitter.images` con `card: summary_large_image`: compartir por WhatsApp sale sin imagen.
- El `sr-only` de `hero-conversation.tsx:240` describe una escena mientras rotan tres.
- El azulejo de icono de `:189` mide 48px con `rounded-2xl` sobre `#f4f8eb`; el sistema dice 40px, `rounded-xl`, `#eef6dc`.
- `#demo-llamada` (`landing-hero.tsx:64`) es un ancla muerta. La cabecera no da acceso al FAQ ni a la demo.

## Questions to Consider

1. Si `RevenueLossCalculator` es lo único no copiable en una tarde, ¿por qué está en la posición 6 de 11 y no en el hero?
2. `PersonalizedPlanCard` calcula `valueMultiple`, `monthlyDifference` y `opportunityCoversPlan` y no pinta ninguno. ¿Abandonado o descartado por agresivo?
3. Cinco landings de nicho con cifras y fuentes reales, y una genérica sin nada. ¿Por qué la genérica es la canónica en sitemap y JSON-LD?
4. «Pymes y profesionales»: ¿hipótesis de mercado o duda de posicionamiento? No se sostiene junto a «vertical, no constructor genérico».
5. `HeroConversation` ya es una demo silenciosa con guion y `prefers-reduced-motion`. ¿Por qué no es la alternativa accesible a la demo de micrófono? Hoy a 8px, con `aria-hidden` y llamada «Casos de prueba».
