---
target: landings públicas de Alhabla (/, landings de nicho, /planes)
total_score: 25
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 3
target_identity: "file:/Users/miguelmartin/AsistAI/web/src/app/page.tsx"
target_fingerprint: "sha256:8e5805db657baa5d2758474018bfec29fbdebd08a6cd7727e5234cda27d42648"
target_path: /Users/miguelmartin/AsistAI/web/src/app/page.tsx
timestamp: 2026-09-24T12-20-39Z
slug: web-src-app-page-tsx
---
Method: dual-agent (A: a64bdba39de65c15d · B: a15d474786bbd35e8)

Nota de método: ambos subagentes compartieron sin querer la misma sesión de Playwright al correr en paralelo (colisión de pestaña visible en A y B). Ambos lo detectaron, verificaron `location.href`/título en cada paso y descartaron la evidencia contaminada, así que los hallazgos reportados abajo son limpios — pero conviene saberlo si se repite la ejecución.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Estados de la demo (idle/permiso/conectando/activo/error) bien cubiertos |
| 2 | Match System / Real World | 4 | Vocabulario y contexto 100% español, sin jerga |
| 3 | User Control and Freedom | 3 | Navegación y demo con salidas claras |
| 4 | Consistency and Standards | 2 | Orden de CTA primario/secundario invertido entre landing principal y landings de nicho |
| 5 | Error Prevention | 3 | Validación de slider y mensajes de error de demo específicos por causa |
| 6 | Recognition Rather Than Recall | 4 | Cabecera sticky, badges autoexplicativos |
| 7 | Flexibility and Efficiency | n/a | Superficie Persuade, sin usuarios recurrentes |
| 8 | Aesthetic and Minimalist Design | 3 | Verde de WhatsApp conviviendo con el morado en /planes sin regla explícita |
| 9 | Error Recovery | 3 | Copy de error en español, accionable, sin culpar al usuario |
| 10 | Help and Documentation | n/a | El FAQ cubre lo que esta superficie necesita |
| **Total** | | **25/32** | **Good (78%)** |

## Design Specificity Verdict

**LLM assessment (Assessment A):** Alta especificidad — no es una landing SaaS genérica. Copy propio por nicho con estadísticas verificables y fuente citada (cumpliendo la prohibición de PRODUCT.md de fabricar prueba social en prelanzamiento), mecánica de producto real expuesta como contenido (reparto por especialidad, "El Gestor" por WhatsApp con mockup de conversación real), acento de color por nicho, calculadora de pérdida de ingresos que alimenta el ROI mostrado después en `/planes`, vocabulario alineado al 100% con PRODUCT.md.

**Deterministic scan (Assessment B):** El escaneo CLI estático sobre los 15 ficheros fuente (JSX/TSX) devolvió **0 hallazgos** — limpio. Toda la señal real vino del escaneo en runtime sobre DOM y estilos computados vía overlay de navegador: **30 hallazgos en `/`, 26 en `/peluqueria`, 10 en `/planes`** (66 en total, antes de descartar falsos positivos). El propio detector marcó el acento morado como `ai-color-palette` ("paleta de colores típica de IA") — un falso positivo confirmado: `CLAUDE.md` documenta el morado `#8b5cf6` como decisión de rediseño de marca deliberada (agosto 2026), no un patrón genérico accidental. Esto refuerza el veredicto de especificidad: incluso lo que un detector genérico confunde con "look de IA" es, aquí, una decisión de marca documentada y consistente.

**Visual overlays:** la inyección de `detect.js` funcionó en las 3 páginas y quedó registrada en consola (no queda overlay persistente para que lo abras ahora mismo — el servidor de detección se paró al cerrar este análisis; puedo relanzarlo si quieres verlo en vivo). Capturas de escritorio y móvil de las 3 páginas quedaron guardadas en el scratchpad de esta sesión.

## Overall Impression

La familia de landings está por encima de la media en especificidad y disciplina de marca — el mayor riesgo no es "se ve genérico", es que el propio sistema documentado en DESIGN.md se está incumpliendo en dos puntos concretos y comprobables (un eyebrow sobre un titular, que la Regla del Titular Solo prohíbe explícitamente, y líneas de cuerpo muy por encima del límite de 65–75 caracteres que el propio documento fija) — más un bug de overflow real que merece revisión técnica antes que de diseño. La mayor oportunidad de conversión no es rediseñar, es despejar el primer viewport: el banner de cookies tapando las señales de confianza justo donde debían compensar la ausencia de testimonios.

## What's Working

1. **Especificidad sin fabricar prueba social.** Estadísticas de sector con fuente citada y enlace real, ejecutado con disciplina en las 5 landings de nicho — exactamente lo que exige PRODUCT.md en prelanzamiento.
2. **La calculadora de ROI como mecánica de conversión, no decoración.** Propaga la estimación a `/planes` (`roi-context.ts`) y solo fuerza la comparación cuando el ahorro cubre el plan — más honesto que forzarla siempre.
3. **Reaseguro específico en los puntos de fricción reales.** El copy de error de la demo distingue permiso denegado / sin micrófono / fallo de red con instrucciones concretas, y el aviso de privacidad del micrófono aparece antes de pedir permiso, no después.

## Priority Issues

**[P1] El banner de cookies tapa la fila de señales de confianza en el primer viewport del hero.**
- **Why it matters:** "Sin cambiar de número / Google Calendar y Outlook / Sin permanencia" son las tres señales que sustituyen a la prueba social que el producto no puede mostrar (prelanzamiento, sin testimonios ni clientes). Un visitante que decide en los primeros 5 segundos se queda sin ese argumento tapado por un panel legal.
- **Fix:** banner más compacto (barra inferior fina en vez de panel de dos párrafos) o diferir su aparición hasta el primer scroll, para no competir con el hero en la carga inicial.
- **Suggested command:** /impeccable layout

**[P1] La landing principal incumple su propia Regla del Titular Solo (kicker sobre titular) en 2 puntos, confirmado por el detector.**
- **Why it matters:** DESIGN.md prohíbe explícitamente un eyebrow en mayúsculas sobre un titular ("el eyebrow solo añade una línea de texto pequeño y bajo contraste que nadie lee"). El overlay de runtime encontró exactamente ese patrón dos veces: "Hecho para tu ritmo" sobre "Cada negocio tiene su forma de llenar la agenda" y "Tu recepción, siempre disponible" sobre el CTA final. No es una opinión de diseño — es el propio sistema documentado incumpliéndose a sí mismo en el código.
- **Fix:** eliminar el kicker en ambos puntos, o convertirlo en un badge que aporte información real que el titular no dé (la propia regla lo permite en ese caso).
- **Suggested command:** /impeccable typeset

**[P1] Overflow real de texto en varias tarjetas de la landing principal — probable bug de layout, no solo estético.**
- **Why it matters:** el overlay midió elementos `li` desbordando su caja por 775–883px y `strong` por 77–150px. Esas magnitudes son demasiado grandes para ser un simple ajuste de padding; sugiere un contenedor flex/grid sin `min-width: 0` o texto sin envoltura en algún breakpoint concreto, lo que puede romper visualmente en anchos intermedios no cubiertos por las capturas manuales habituales.
- **Fix:** revisar el contenedor exacto (probablemente en el bloque de reparto por especialidad o en las tarjetas de estadísticas de sector) con DevTools en los breakpoints `sm`/`lg`, y añadir `min-width: 0` / `flex-wrap` donde falte.
- **Suggested command:** /impeccable audit

**[P2] Orden de CTA primario/secundario invertido entre la landing principal y las landings de nicho.**
- **Why it matters:** en `main-landing.tsx` el hero pone primero el CTA primario ("Probar Alhabla 7 días") y después la demo. En `landing-hero.tsx` (las 5 landings de nicho, que reciben más tráfico de búsqueda que la principal) el orden está invertido: la demo va primero y el registro segundo, sin ningún comentario que justifique la divergencia a diferencia del resto del fichero, que sí está muy documentado. Es una violación real de consistencia (heurística 4) que, si no fue deliberada, degrada el CTA de mayor intención comercial a segunda posición en la mayoría del tráfico.
- **Fix:** decidir explícitamente un orden único y aplicarlo en los dos componentes, o dejar un comentario documentando por qué difiere.
- **Suggested command:** /impeccable polish

**[P2] Tipografía de cuerpo por encima y por debajo de los límites que el propio DESIGN.md fija.**
- **Why it matters:** DESIGN.md fija línea de cuerpo máxima en 65–75 caracteres y un mínimo de 14px ("no su valor aspiracional"). El overlay midió líneas de hasta 202 caracteres en `/peluqueria` y dos bloques de texto a 11px en la misma página — ambos por fuera de los límites documentados, en una superficie de conversión donde DESIGN.md pide subir el cuerpo largo a 1rem, no bajarlo.
- **Fix:** aplicar `max-width` a los bloques de texto largo identificados y sustituir los 11px detectados por el token `body` (14px) del sistema.
- **Suggested command:** /impeccable typeset

## Persona Red Flags

**Jordan (primera vez, confundido):** llega a `/peluqueria` desde una búsqueda y ve 4 CTAs (Iniciar sesión, Empezar ahora, Probar 7 días, Escuchar demo) más un desplegable de sectores antes de leer el titular; si además el banner de cookies tapa de inmediato las señales de confianza (P1), la primera impresión de una marca desconocida sin testimonios pierde justo el argumento que debía sustituirlos.

**Riley (estresa casos límite):** el flujo de error de la demo está bien cubierto (permiso denegado / sin micrófono / red, con copy específico por caso) — pero no existe ninguna vía para "quiero ver qué hace la demo sin ceder el micrófono", el hueco de accesibilidad que el propio PRODUCT.md ya admite como abierto y sin alternativa hoy.

**Casey (móvil, distraída):** en el carrusel de tarjetas de sector por debajo de 640px, la única pista de que las tarjetas se pueden deslizar es el canto de la siguiente carta asomando y unos puntos de paginación pequeños — sin ninguna palabra o icono de gesto. Puede quedarse solo con "Peluquerías" visible y no descubrir que hay 4 sectores más. (No es un problema de accesibilidad real: el `tablist` con `aria-label` por sector sí da una vía por teclado/lector de pantalla — es puramente de descubribilidad visual para quien usa el pulgar.)

## Minor Observations

- **Falso positivo verificado — `low-contrast` "#3f3f46 sobre #3f3f46":** el detector reportó texto y fondo del mismo color 5 veces en `/` y 5 en `/peluqueria`. Confirmado contra el código: `#3f3f46` solo se usa como color de texto en todo `web/src/`, ningún elemento lo usa de fondo — probable artefacto del propio detector al resolver el "fondo efectivo" subiendo por los ancestros, no un bug real del producto.
- **Falso positivo verificado — `dark-glow` en `/peluqueria`:** es `box-shadow: 0 0 0 2px <acento del nicho>` — un anillo de selección sin difuminado, no un resplandor. Viene de `niche-accents.ts`, acento documentado por sector.
- **Real y menor — contraste 4.2:1 en `/planes`** (texto blanco sobre morado `#8b5cf6`, umbral 4.5:1): matemáticamente real, por debajo del umbral por poco. El propio equipo ya resolvió el mismo problema en otro sitio del sistema usando `#7c3aed` en vez de `#8b5cf6` sobre texto — aplicable aquí también.
- **`gpt-thin-border-wide-shadow` ×3, `cramped-padding` ×2, `nested-cards` ×8, `all-caps-body` ×1:** hallazgos del detector no verificados individualmente contra el código; varios (sombra ancha con borde fino, tarjetas anidadas) contradicen en principio "La Regla de la Sombra Escasa" y el espíritu de bordes-no-sombra de DESIGN.md, pero merecen una pasada de `/impeccable audit` dedicada antes de tocarlos — no se incluyeron en Priority Issues por no tener aún ubicación de archivo/línea confirmada.
- **`icon-tile-stack` (icono en azulejo justo sobre un h3), 3–4 veces por página:** coincide con el patrón "Icon Tiles" que DESIGN.md documenta como firma deliberada del sistema — probable falso positivo de un detector genérico anti-patrón-IA, no una recomendación de cambio.
- El acento morado único convive con el verde de marca de WhatsApp en `/planes` sin que DESIGN.md distinga explícitamente "logo de integración de terceros" de "acento que compite" — margen de ambigüedad, no error visible hoy.
- El contador animado de estadísticas arranca en "0%" en el DOM antes de hidratar — inofensivo hoy, pero frágil si algún día se audita con una herramienta que lee SSR sin hidratar.

## Questions to Consider

- ¿El orden invertido de CTA en las landings de nicho (demo antes que registro) fue una decisión deliberada de "reducir el compromiso pedido a tráfico frío de búsqueda", o una divergencia accidental respecto a la landing principal?
- Si la demo de voz es el único sustituto de la prueba social ausente, ¿vale la pena tratar el primer viewport como zona protegida frente al banner de cookies, igual que ya se protege el fondo animado de que ninguna sección lo tape?
- ¿Se ha validado con un usuario real no técnico si entiende que las tarjetas de sector en móvil se pueden arrastrar?
