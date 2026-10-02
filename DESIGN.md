---
name: Alhabla
description: Sistema visual SaaS de alto contraste para negocios de servicios españoles — negro y blanco con un único acento morado
colors:
  background: "#ffffff"
  surface: "#ffffff"
  surface-soft: "#fafafa"
  foreground: "#0a0a0a"
  foreground-secondary: "#27272a"
  nav-link: "#3f3f46"
  muted: "#52525b"
  subtle: "#a1a1aa"
  accent: "#0a0a0a"
  accent-strong: "#262626"
  accent-soft: "#a78bfa"
  purple: "#8b5cf6"
  purple-strong: "#7c3aed"
  purple-wash: "#f3eeff"
  purple-ink: "#6d28d9"
  purple-ring: "#ddd6fe"
  focus: "#8b5cf6"
  stroke: "#e5e5e5"
  border: "#e5e5e5"
  success: "#2c7334"
  success-surface: "#ecf7ec"
  success-border: "#d8efd7"
  warning: "#9f7a15"
  warning-ink: "#806012"
  warning-surface: "#fef8e7"
  warning-border: "#f0dfa8"
  error: "#c53030"
  error-surface: "#fff1f1"
  error-border: "#f5d3d3"
typography:
  display:
    fontFamily: "var(--font-geist-sans), sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 4.25rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "var(--font-geist-sans), sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "var(--font-geist-sans), sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "var(--font-geist-sans), sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "var(--font-geist-sans), sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.12em"
  mono:
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "8px"
  control: "10px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  "2xl": "24px"
  "3xl": "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-soft}"
  button-purple:
    backgroundColor: "{colors.purple}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "48px"
  button-purple-hover:
    backgroundColor: "{colors.purple-strong}"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "24px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "16px"
  badge-soft:
    backgroundColor: "{colors.purple-wash}"
    textColor: "{colors.purple-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  nav-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground-secondary}"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
  nav-pill-active:
    backgroundColor: "{colors.purple-wash}"
    textColor: "{colors.purple-ink}"
  icon-tile:
    backgroundColor: "{colors.purple-wash}"
    textColor: "{colors.purple}"
    rounded: "{rounded.md}"
    size: "40px"
---

# Design System: Alhabla

## Overview

**Creative North Star: "Recepción de precisión"**

Una recepción que inspira confianza inmediata sin decir una palabra de más: papel blanco,
tinta casi negra, y un único trazo morado que aparece exactamente donde hay que mirar. El
producto le habla a una peluquera, un barbero o un fisioterapeuta que no compró software en su
vida y que no quiere sentirse en una app de consumo: quiere sentir que ha contratado a alguien
competente, serio y moderno. La interfaz interpreta ese papel con contraste alto, tipografía
con peso real y una paleta que no compite consigo misma.

Materialmente el sistema es blanco puro con tinta `#0a0a0a`. No hay degradado de fondo ni papel
tintado: el blanco es plano y el contraste lo pone la tinta, los bordes de un píxel en
`#e5e5e5` y, con mucha disciplina, el morado. Ese blanco se mantiene **en todas las pantallas**,
de la landing al panel, para que la aplicación no se sienta como un sitio distinto del que te
vendió.

El anti-referente sigue vigente y ahora incluye la propia identidad anterior: nada de verde
mostrador, nada de lima neón, nada de negro con tinte verdoso. La paleta anterior (`#1e2b22`,
`#b8d96e`, `#eef6dc`, `#d6ff72`, `#101814`) fue sustituida por completo, sitio a sitio, y no debe
reaparecer como acento «cálido» ni como color semántico salvo en los tres estados heredados que
sí se conservan intactos: éxito, aviso y error.

**Key Characteristics:**

- Blanco plano en toda superficie de fondo; el contraste lo dan la tinta y el borde, no un tinte
  de papel.
- Un solo acento de color por vista: morado. Nunca compite con el negro de los botones primarios
  ni con el verde/rojo semánticos.
- Profundidad casi siempre por borde de 1 px (`#e5e5e5`), no por sombra. Cuando hay sombra, es
  negra (`rgba(0,0,0,…)`) y solo en elementos realmente flotantes.
- Radios generosos y consistentes: paneles y tarjetas grandes en `rounded-3xl` (24 px), tarjetas
  y azulejos de icono en `rounded-xl`/`rounded-2xl` (12–16 px), campos y botones en 10 px
  (`rounded-[10px]`) — píldora queda para círculos, badges y navegación.
- Tipografía con peso real: titulares en `font-black`/`font-extrabold`, nunca semibold tibio.
- Español de España en toda la interfaz; iconografía Lucide sobre azulejo `#f3eeff` con trazo
  morado `#8b5cf6`.

## Colors

Negro y blanco como base absoluta, morado como único acento decorativo, y tres semánticos
heredados (éxito, aviso, error) que se mantienen fuera de la familia morada a propósito: son
estado del sistema, no marca.

### Tokens y modo oscuro

Desde octubre de 2026 la app (no la web pública) tiene modo oscuro. Por defecto sigue al sistema;
en Cuenta hay «Sistema · Claro · Oscuro» y la elección se queda en el dispositivo (`lib/tema.ts`).
Un script en el `<head>` pone `data-tema` en `<html>` antes del primer pintado, sin destello.

Cada color de esta sección es un **token** con valor claro y oscuro (variables en canales RGB en
`globals.css`, clases del mismo nombre en `tailwind.config.ts`): `bg-superficie`, `text-tinta`,
`bg-lavado`, `text-morado`, `border-linea`… Un hex escrito en una clase no cambia en oscuro, así
que no se escribe ninguno. En oscuro:

- Las superficies se oscurecen por capas: lienzo `#0b0b0e`, paneles `#141418`, lo que flota
  `#1c1c21`; los bordes, `#2e2e36`.
- **Tinta se invierte**: el texto pasa a casi blanco y el botón primario negro pasa a claro con
  texto oscuro (`sobre-tinta`). El morado del acento no cambia; su texto (`morado-tinta`) se aclara.
- **Lo que es oscuro a propósito sigue oscuro** (`oscuro`): la tarjeta de la próxima cita y la
  transcripción. Encima, el texto va en `text-white`.
- Velos de diálogos y hojas: siempre negros (`bg-black/40`). Un QR, siempre sobre blanco.

### Primary

- **Negro Tinta** (`#0a0a0a`): botones primarios, titulares y todo énfasis estructural. Es la
  tinta de la marca — sustituye al antiguo Verde Mostrador en el mismo rol exacto.
- **Negro Intenso** (`#262626`): exclusivamente el estado hover de los elementos primarios negros.
  Nunca como color de reposo.

### Secondary — Morado

- **Morado** (`#8b5cf6`): el único acento de color del sistema. Iconos dentro de azulejo, anillos
  de foco, bordes activos, botones `.btn-purple` cuando un CTA necesita destacar sin ser la
  acción primaria negra.
- **Morado Intenso** (`#7c3aed`): estado hover de elementos morados sólidos.
- **Lavado Morado** (`#f3eeff`): fondo de badges, chips de navegación activos y azulejos de
  icono. Es el morado convertido en superficie habitable — nunca se anida un azulejo `#f3eeff`
  dentro de una sección que ya use `#f3eeff` de fondo; en ese caso el azulejo pasa a blanco sólido
  para no perder contraste.
- **Tinta Morada** (`#6d28d9`): texto sobre Lavado Morado. Nunca sobre blanco liso ni dentro de
  una superficie semántica verde/roja.
- **Anillo Morado** (`#ddd6fe`): borde interior de badges y chips morados.
- **Morado Suave** (`#a78bfa`): variante decorativa de baja saturación — degradados y detalles
  finos donde el morado sólido pesaría demasiado.

### Neutral

- **Superficie** (`#ffffff`): fondo de página y de tarjetas. Plano, sin degradado ni opacidad
  reducida.
- **Superficie Templada** (`#fafafa`): segundo nivel de superficie — filas de tabla, estados hover
  neutros, contenedores anidados dentro de un panel blanco.
- **Tinta** (`#0a0a0a`): texto principal y titulares.
- **Tinta Secundaria** (`#27272a`): etiquetas de campo y texto secundario con más peso que el
  cuerpo muted.
- **Tinta de Navegación** (`#3f3f46`): enlaces de la barra de navegación de la landing en reposo,
  que pasan a Tinta (`#0a0a0a`) al hover. Es el único sitio donde se usa este paso: no es un token
  de propósito general y no debe aparecer en texto de cuerpo — para eso está Tinta Apagada.
  Documentado el 2026-09-07, cuando se detectó que la landing ya lo usaba sin estar en el sistema.
- **Tinta Apagada** (`#52525b`): texto terciario, descripciones y ayudas. Se usa siempre a través
  de la utilidad `.text-muted`, nunca escribiendo el hex, para que el token siga siendo el único
  punto de cambio. Da 7,5:1 sobre blanco — muy por encima de AA.
- **Trazo** (`#e5e5e5`): borde por defecto de campos, tarjetas, paneles y botones secundarios. Es
  el único gris estructural del sistema.
- **Silenciado** (`#a1a1aa`): placeholders, texto deshabilitado, iconografía decorativa de menor
  jerarquía.

### Semantic (heredados, fuera de la familia morada)

- **Éxito** (`#2c7334`) sobre **Superficie Éxito** (`#ecf7ec`) con borde **`#d8efd7`**: conexiones
  activas, confirmaciones, checkmarks de estado «hecho». Se mantiene verde a propósito para no
  confundir «completado» con el acento decorativo morado.
- **Aviso** (`#9f7a15`): advertencias — un ocre, no un amarillo. Sobre **Superficie Aviso**
  (`#fef8e7`) con borde **`#f0dfa8`**. Como **texto** va en **Tinta de Aviso** (`#806012`, variable
  `--warning-ink`): `#9f7a15` da 3,99:1 sobre blanco y 3,76:1 sobre `#fef8e7`, por debajo de AA en
  texto pequeño; `#806012` da 5,8:1 y 5,5:1. El ocre `#9f7a15` se queda para puntos, iconos y
  bordes (decidido en el pase de pulido del 2026-09-26).
- **Error** (`#c53030`) sobre **Superficie Error** (`#fff1f1`) con borde **`#f5d3d3`**: fallos de
  validación, insignias y avisos flotantes de error.
- **Urgente** (`#b42318`, token `urgente`): lo que pide actuar ya (una cita que se cayó, un error
  al cargar, el servicio suspendido). Desde octubre de 2026 esas tarjetas son **blancas, con el
  rojo solo en el azulejo del icono** y el texto en gris: el rosa entero gritaba más de lo que
  pedía. Su sitio (la primera de la columna) ya marca la urgencia.

### Named Rules

**La Regla del Acento Único.** El morado es el único color de marca que no sea negro o blanco. En
cualquier vista hay un solo elemento morado que reclama la mirada — un botón, un icono activo, un
borde seleccionado. Si dos cosas gritan en morado a la vez, ninguna se oye.

**La Regla del Azulejo No Anidado.** Un icono en azulejo `bg-[#f3eeff]` nunca vive dentro de una
sección que ya tenga `bg-[#f3eeff]` de fondo — el azulejo se volvería invisible. Dentro de una
sección morada lavada, el azulejo pasa a `bg-white`.

**La Regla del Semántico Aparte.** Éxito y error conservan su propia familia de color (verde,
rojo) de extremo a extremo — fondo, borde y texto del mismo tono — y nunca se les mezcla un borde
o texto morado. Un borde `#ddd6fe` sobre un fondo `#ecf7ec` es el error más común al tocar estos
componentes: revisar siempre que las tres partes (borde, fondo, texto) sean de la misma familia.

**La Regla del Blanco Plano.** El producto —panel, ajustes y todo lo que se usa a diario— va
sobre `#ffffff` liso, sin degradado de papel ni superficie translúcida por defecto. El degradado
radial sutil y los blobs de desenfoque morado (`blur-3xl`) son un acento puntual sobre paneles
concretos, no el fondo general de la página.

**Excepción, decidida el 2026-09-05: las superficies de venta llevan campo de partículas.** La
landing, las cinco landings de nicho, `/login` y `/register` pintan un fondo animado
(`frontend/src/components/particle-field.tsx`): puntos morados en tres profundidades. Vender puede
permitirse espectáculo; trabajar cada día, no — la frontera es exactamente esa, y no se mueve sin
decisión explícita. El campo se dibuja a opacidades que dejan intacto el compromiso WCAG AA, adapta
su densidad al dispositivo y se queda quieto con `prefers-reduced-motion`.

**Color por nicho (2026-09-05):** en `/landing` y `/login`/`/register` (sin nicho) el campo es
morado de marca — ahí sí rige la Regla del Acento Único tal cual. En cada landing de nicho
(`/barberia`, `/fisioterapia`…) el campo toma el `accent.strong` de ESE nicho — barbería en
terracota, fisioterapia en verde azulado. No es una excepción a la regla: cada landing de nicho ya
tenía su propio acento desde antes (badges, iconos, checkmarks — `lib/niche-landings.ts`) y dentro
de esa página sigue habiendo un único acento no-neutro, ahora incluido el fondo. La regla protege
que no compitan dos colores en la misma vista, no que el morado sea el único acento que existe en
todo el producto.

**Cómo se anima, y por qué así.** Cada capa se dibuja **una sola vez** en un canvas fuera del DOM,
se convierte en imagen y se repite verticalmente como fondo de un div. Todo el movimiento a partir
de ahí es del compositor: deriva ambiente en bucle con `transform`, y profundidad al deslizar con
`animation-timeline: scroll()` bajo `@supports` (Chrome/Edge 115+, Safari 26+; en Firefox, aún tras
flag, queda solo la deriva ambiente, que ya separa las capas por sí sola). **No hay
`requestAnimationFrame` ni lectura de `window.scrollY`.** La primera versión sí los tenía —
repintaba el canvas entero en cada fotograma leyendo la posición de scroll — y es el antipatrón
clásico de los *scroll-linked effects*: en móvil el scroll lo gobierna el hilo del compositor, así
que en cuanto el hilo principal se retrasa (constante en un Android de gama media, la escena de uso
real de este producto) el fondo se desincroniza del contenido. Se manifestó dos veces en pruebas
reales, como "desconexión con los elementos que cargan" y como "salta de posición entre secciones".
Medido tras el cambio: 2 llamadas a `requestAnimationFrame` en 3 segundos de reposo, frente a las
~180 de un bucle a 60fps.

El alto del tile es una constante (900px), no el alto de la ventana: así la barra de direcciones
del móvil —que cambia `innerHeight` en cuanto se hace scroll— no puede alterar el fondo. Solo se
redibuja si cambia el **ancho**.

Dos requisitos de implementación no obvios, ambos descubiertos a base de medir píxeles, no de
mirar la pantalla — el campo vive en `z-index: -10` y cualquier fallo de apilamiento es invisible
hasta que se mide:

1. El contenedor de página necesita `relative isolate` y no puede pintar fondo opaco propio. Sin
   el `isolate`, el `z-index` negativo queda por detrás del fondo del `body` y no se ve nada.
2. **Ninguna sección del contenido puede tener fondo opaco propio** (`bg-white`, `bg-[#fafafa]`
   de relleno) si tiene que dejar ver el campo — un elemento en flujo normal siempre pinta por
   encima de un `z-index` negativo del mismo contexto de apilamiento, lo tape o no a propósito.
   La primera versión de esta feature dejaba esas secciones con su tinte de "ritmo" de siempre y
   el campo solo se veía en el hero y en "precios" — los dos únicos huecos transparentes de toda
   la landing. El ritmo visual entre secciones se sostiene con espaciado y, donde ya existía,
   borde (`border-y`) — nunca con un color de fondo de sección. Los bloques negros reales (CTA
   final, plan destacado, panel oscuro de la calculadora) siguen sólidos a propósito: son el
   cierre de la página o contenido con su propia identidad, no relleno de ritmo.

**Capa interactiva de ratón, solo escritorio (2026-09-05).** Además del campo ambiente,
`frontend/src/components/particle-mouse-layer.tsx` añade puntos que se repelen del cursor —
gateada tras `pointer: fine` (nunca en táctil) y `prefers-reduced-motion`. Investigado antes de
construir: la referencia visual del usuario (myhabla.com) no usa tsParticles ni ninguna librería —
un script propio de ~110 líneas con `requestAnimationFrame` pero que **nunca lee `scrollY`**. Esa
es la diferencia real con el antipatrón de arriba, no el uso de `requestAnimationFrame` en sí: sin
depender de la posición de scroll, no hay nada que se pueda desincronizar al deslizar. Esta capa
sigue el mismo principio — física simple (repulsión + amortiguación), sin tocar nunca el scroll — y
además limita el riesgo por construcción: en móvil, que es donde vivían los bugs anteriores, el
bucle ni arranca.

**Hilos de voz en el hero de las landings (2026-09-17).** Las landings ya no llevan campo de
partículas (retirado el 2026-09-16: ensuciaba el contenido); su única animación de fondo es
`frontend/src/components/hero-hilos.tsx`, que sustituyó al pulso de llamada (anillos + pastillas)
de la columna derecha. El hero pasó a una columna con el titular centrado y, detrás, un haz de
hilos finos en gris (`#0a0a0a` a ≤30 % de opacidad, en campana hacia los bordes del haz) que cruza
en diagonal y se arruga con ruido de valor; de vez en cuando un pulso en el acento de la página
(morado en `/landing`, `accent.strong` en cada nicho) recorre un hilo. Referencia: la cinta de
ondas de heydiga.com, con otra geometría y otro movimiento a propósito.

El ratón no empuja los hilos "a pelo" como en la referencia: la tela es un campo masa-muelle
(`hero-hilos-fisica.ts`: cada punto con muelle a reposo, tensión con sus vecinos del hilo y
acoplamiento con los hilos contiguos), así que el cursor la aparta con inercia, una pasada rápida
deja estela y la sacudida viaja por el hilo y se asienta sola. La integración lee los vecinos del
estado anterior (doble buffer) y va a paso fijo de 1/120 s con subpasos: la primera versión
actualizaba en el sitio y explotaba a 30 fps, mientras que a 144 fps se veía perfecta — la
estabilidad no puede depender de la tasa de refresco. El cursor se sigue con `useSpring` de
framer-motion y su velocidad sale de `useVelocity`; ambos se leen con `.get()` dentro del bucle,
sin re-render, y una `presencia` con muelle funde la influencia al entrar y salir del hero. Los
hilos bajo el cursor se encienden en el acento con un degradado a lo largo del hilo (lámpara, no
hilo entero). Mismas reglas que la capa de ratón: canvas 2D con `requestAnimationFrame` pero
**sin leer nunca `scrollY`**, ratón solo con `pointer: fine`, un único fotograma quieto con
`prefers-reduced-motion`, bucle parado fuera de pantalla y con la pestaña oculta, oculto por
debajo de `md`. La sección del hero necesita `relative isolate` y no puede pintar fondo propio
(mismo motivo que el campo de partículas).

**Antes de culpar al dibujo, medir la tasa de fotogramas.** El mismo 2026-09-17 esta capa se
retiró y se restauró en el día: en el Safari del usuario "iba a tirones" y se dio por hecho que
canvas 2D a retina no daba la talla. `frontend/tests/manual/bench-hero.html` (misma geometría con
canvas 2D a 1× y 2×, con degradados, WebGL por líneas y WebGL por shader) demostró que las cinco
técnicas daban **exactamente los mismos fps**: 15 con el Modo de bajo consumo de macOS, 30 en un
monitor y 144 en otro — Safari capa `requestAnimationFrame` antes de que el dibujo cuente, y esta
capa cuesta ~0,6 ms de CPU por fotograma. Ningún framework (OGL, three.js, PixiJS, Rive) cambia
ese tope; se descartó cambiar de técnica. Lo que sí se hizo: un **modo ligero** — si en una
ventana de 2 s la mayoría de los fotogramas llegan por debajo de ~45 fps (la primera ventana no
cuenta), el efecto del ratón se apaga con fundido y quedan solo los hilos y los pulsos, porque a
30 fps una tela que persigue al cursor parece rota y un fondo que se mece no. Es definitivo para
esa visita (`data-modo="ligero"` en el canvas). Y con cualquier animación por fotograma: probarla
en WebKit (Playwright `webkit` está instalado) y con `dt` de 1/30 s antes de enseñarla, porque el
navegador integrado de Claude es Chromium a 144 fps y tapa inestabilidades.

## Typography

**Display Font:** Geist Sans (variable 100–900, servida local desde `app/fonts/GeistVF.woff`)
**Body Font:** Geist Sans — la misma familia en todo el sistema
**Label/Mono Font:** Geist Mono (`app/fonts/GeistMonoVF.woff`), reservada para datos técnicos

> **Fuera del producto** (maquetas, presentaciones, cualquier superficie que no pueda servir el
> `.woff` local) la familia se llama **`Geist`** a secas: es su nombre en Google Fonts. Es la misma
> tipografía; solo cambia cómo se carga. Pila de reserva:
> `'Geist', system-ui, -apple-system, sans-serif`.

**Character:** una grotesca neutra y contemporánea, sin manierismos. Al usar una sola familia en
todo el rango, la jerarquía la construyen el tamaño y el peso, no el contraste de fuentes. Los
titulares ganan peso real (`font-black`/`font-extrabold`) para sostener el alto contraste
negro-sobre-blanco sin apoyarse en color.

### Hierarchy

- **Display** (800, `clamp(2.25rem, 5vw, 4.25rem)`, interlineado 1.05, `-0.02em`): titular de
  hero en landings. Uno por página, nunca en el producto.
- **Headline** (600–800, 1.875 rem, 1.2): títulos de sección y encabezados de página del panel.
- **Title** (600, 1.125 rem, 1.4): títulos de panel y de tarjeta.
- **Body** (400, 0.875 rem, 1.6): el caballo de batalla del sistema. Longitud de línea máxima
  65–75 caracteres.
- **Label** (600, 0.75 rem, `0.12em`, mayúsculas): badges, chips de estado y encabezados de
  columna. **No** eyebrows: ver La Regla del Titular Solo.
- **Mono** (400, 0.8125 rem): identificadores, números de teléfono y fragmentos de transcripción.

### Named Rules

**La Regla del Peso Ganado.** `font-semibold` (o más) se gana: titulares, títulos de tarjeta,
CTAs y cifras clave. El cuerpo, las descripciones y las ayudas van en `font-normal`. Cuando todo
está en semibold, la jerarquía desaparece y la interfaz se lee gritada.

**La Regla del Tracking Contenido.** `-0.02em` en titulares; hasta `0.12em` en labels en
mayúsculas. Por encima de `0.15em` el texto deja de leerse como palabra y pasa a leerse como
adorno.

**La Regla del Titular Solo.** Ningún titular lleva encima una etiqueta en mayúsculas del tipo
«Cómo te ayuda» o «Sin letra pequeña». El titular carga con su propio peso; el eyebrow solo añade
una línea de texto pequeño y bajo contraste que nadie lee. Un badge sí es legítimo cuando aporta
información que el titular no da — «Google Calendar» nombra la integración — pero no cuando solo
anuncia la sección.

**La Regla del Cuerpo Cómodo.** El cuerpo a 0.875 rem es el mínimo del sistema, no su valor
aspiracional. El texto de párrafo largo en landings sube a 1 rem: la audiencia es de edad mixta
y lee en el móvil, de pie y con prisa.

## Layout

Contenedor maestro de `max-w-7xl` (80 rem) centrado, con relleno lateral progresivo de 12 px en
móvil, 24 px desde `sm` y 32 px desde `lg`. El contenido de lectura se estrecha a `max-w-2xl`
(42 rem) y los formularios y tarjetas de auth a `max-w-md`/`max-w-lg`.

El ritmo vertical va en pasos de 4 px y se apoya en 8 / 12 / 16 / 20 / 24 / 32. El área principal
respira 20 px arriba y abajo en móvil y 32 px desde `sm`. La cabecera es `sticky` con
`backdrop-blur`, mide 64 px en móvil y 72 px desde `sm`.

Los puntos de ruptura son los de Tailwind y los que realmente se usan son tres: `sm` (640 px),
`lg` (1024 px) y `xl` (1280 px). El patrón dominante es una columna en móvil que pasa a dos o
tres desde `sm`. El carril de próximas citas es el caso especial: muestra 3 tarjetas con
desplazamiento por ajuste en móvil, 5 desde `sm` y 6 desde `xl`, con las flechas ocultas cuando
no hay desbordamiento.

Por debajo de `lg`, ajustes y agente se reparten en pantallas propias con su «‹ Volver» en la
barra de arriba (ver «App móvil» en Components).

La arquitectura de configuración se divide en dos destinos hermanos y visibles en la navegación:
`/agente` reúne las secciones operativas que determinan cómo trabaja la recepcionista; `/ajustes`
abre con la identidad de acceso y continúa con datos del negocio, seguridad, acceso y zona de
peligro. El primer viewport debe dejar inequívoco cuál de esos dos mundos se está gestionando:
icono en azulejo morado, título directo y una sola frase descriptiva antes del primer panel. No se
intercalan controles de seguridad o cuenta dentro del flujo operativo del agente.

**La Regla del Pulgar.** La configuración se hace de pie, entre cliente y cliente. Todo objetivo
interactivo mide al menos 44 px de alto — de ahí que campos y botones compartan `h-11`/`h-12`.

## Elevation & Depth

El sistema separa superficies **por borde, casi nunca por sombra**. El blanco plano de fondo, la
superficie blanca de `.panel` y el borde de un píxel `#e5e5e5` hacen casi todo el trabajo. Una
sombra solo aparece en elementos realmente flotantes — el botón atrás circular en móvil, un modal,
una barra de configuración `sticky` — y siempre está teñida de negro puro, nunca del antiguo verde
ni de gris frío.

### Shadow Vocabulary

- **`.panel`:** `shadow-none`. La profundidad viene del borde `#e5e5e5`, no de sombra.
- **Elemento flotante** (`rgba(0,0,0,0.08)`–`rgba(0,0,0,0.12)`, offset 8–12 px, blur 20–32 px):
  botón de vuelta circular, barra `sticky` de configuración guiada, modal de demo de voz.
- **Modal / overlay grande** (`rgba(0,0,0,0.18)`, blur ~60 px): únicamente para overlays que se
  superponen al contenido, como el modal de llamada de demo.

Toda sombra usa negro puro (`rgba(0,0,0,…)`). Una sombra verde o de color rompe el contraste alto
que sostiene todo el sistema.

### Named Rules

**La Regla de la Sombra Escasa.** La mayoría de tarjetas, listas y secciones plegables no llevan
sombra en absoluto — solo borde. Añadir una sombra a un elemento que no flota realmente sobre otro
es la deriva más común hacia el registro de app de consumo.

## Shapes

Escala de radios generosa y deliberada, de menor a mayor superficie:

- **10 px** (`rounded-[10px]`) — botones (`.btn-primary`, `.btn-secondary`, `.btn-purple`) y campos
  (`.field`). Radio propio, distinto del de las tarjetas: suficiente para leerse suave y táctil sin
  caer en la píldora completa del sistema anterior (agosto 2026 → septiembre 2026, decisión
  2026-09-17: los controles interactivos rectangulares dejaron de ser píldora — quedaban
  desproporcionados, sobre todo en campos anchos).
- **12 px** (`rounded-xl`) — tarjetas, azulejos de icono y contenedores intermedios.
- **16 px** (`rounded-2xl`) — tarjetas grandes, secciones de wizard, banners de estado.
- **24 px** (`rounded-3xl`) — `.panel` y contenedores mayores de página. Es el radio más grande y
  se reserva para las superficies de más alto nivel.
- **Píldora** (`rounded-full`) — reservada a lo que es genuinamente circular o una etiqueta: badges
  y chips de información (`.badge-soft`), navegación en pastilla (enlaces de sidebar, nav inferior
  móvil), controles segmentados tipo pestañas (p. ej. el selector "Hoy / 7 días / 30 días" de
  agenda), barras de progreso, el pomo y el raíl de los sliders, y botones solo-icono realmente
  circulares (cerrar, volver, avatar). Ya no es la forma por defecto de un botón o un campo de
  texto.

Los bordes son de 1 px y neutros: `#e5e5e5` en controles, tarjetas y paneles. El morado (`#8b5cf6`
o `#ddd6fe`) solo aparece en el borde cuando la tarjeta está seleccionada, activa o destacada — no
como borde por defecto.

**La Regla de la Escala Amplia.** 10 / 12 / 16 / 24, más píldora solo para lo que es círculo o
etiqueta. No hay un radio de 8 px en este sistema: no reintroducir `rounded-lg` (8 px) ni como
radio de control interactivo ni como sustituto barato del radio de 10 px de botones/campos.

## Components

Los componentes son **táctiles y receptivos**: responden al dedo y al cursor con un gesto breve y
pequeño. La respuesta física es la firma del sistema; la espectacularidad no. Toda transición dura
200 ms y respeta `prefers-reduced-motion`.

### Buttons

- **Shape:** 10 px (`rounded-[10px]`), altura fija de 44–48 px (`h-11`/`h-12`), relleno lateral de
  20–24 px, `inline-flex` con 8 px de hueco para el icono.
- **Primary (`.btn-primary`):** negro `#0a0a0a` con texto blanco, texto de 0.875 rem en semibold.
- **Secondary (`.btn-secondary`):** superficie blanca, borde negro `#0a0a0a`, texto negro; en hover
  el fondo pasa a `#fafafa`.
- **Purple (`.btn-purple`):** morado `#8b5cf6` con texto blanco; en hover pasa a `#7c3aed`. Se usa
  cuando un CTA necesita destacar sin competir con la acción primaria negra de la misma vista.
- **Hover / Focus:** eleva 2 px (`-translate-y-0.5`). `focus-visible` dibuja anillo morado
  (`ring-[#8b5cf6]`).
- **Disabled:** 60 % de opacidad, cursor no permitido y sin elevación. Un botón deshabilitado no se
  mueve.

### Avisos de estado y objetivos pequeños

- **Resultado de guardar en una página larga (`AvisoFlotante`, `components/aviso-flotante.tsx`):**
  flota abajo — encima de la barra inferior en móvil, en la esquina derecha en escritorio — con las
  tres partes de su familia semántica y sombra negra de elemento flotante. El éxito se va solo a
  los 5 s; el error se queda hasta cerrarlo. Un aviso pintado arriba del todo no lo ve quien acaba
  de pulsar «Guardar» al final de la página.
- **Mensaje junto al botón (`FeedbackMessage`):** siempre montado con `role="status"`; una región
  `aria-live` que nace ya con texto no la anuncia casi ningún lector de pantalla.
- **Enlaces de texto pequeños (`.zona-tactil`):** amplía a 44 px la zona que responde al dedo sin
  mover el diseño. Para «Activarlo ahora», «Ver facturación» y similares; los botones siguen
  midiendo 44 px de verdad.
- **Controles segmentados** (periodo de agenda, niveles por servicio): la opción activa en Lavado
  Morado con anillo `#ddd6fe`, como el enlace activo de la navegación.
- **Progreso del alta (`PasoDelAlta`):** barra negra con «Paso n de 5» al lado, nunca encima del
  titular — el morado de esas pantallas ya lo lleva el azulejo del icono.

### Chips y Badges

- **Style (`.badge-soft`):** píldora sobre Lavado Morado (`#f3eeff`), texto Tinta Morada
  (`#6d28d9`) de 0.75 rem en semibold, anillo interior `#ddd6fe`. 12 px de relleno lateral.
- **State:** en navegación, el enlace activo lleva `#f3eeff`/`#ddd6fe`/`#6d28d9`; inactivo va
  blanco con borde `#e5e5e5` y hover `#fafafa`.

### Cards / Containers

- **Corner Style:** 24 px en `.panel`, 12–16 px en tarjetas y secciones.
- **Background:** blanco sólido. Sin translucidez ni backdrop-blur salvo en cabeceras `sticky`.
- **Shadow Strategy:** ninguna por defecto (ver Elevation & Depth). Solo elementos flotantes.
- **Border:** 1 px `#e5e5e5`. El borde pasa a morado (`#8b5cf6`/`#ddd6fe`) únicamente en estado
  seleccionado/activo.
- **Internal Padding:** 24 px en paneles, 16 px en tarjetas, 12 px en tarjetas de carril en móvil.

### Inputs / Fields

- **Style (`.field`):** 44 px de alto, radio de 10 px (`rounded-[10px]`), borde `#e5e5e5`, fondo
  blanco, texto de 0.875 rem, 16 px de relleno lateral. Placeholder en `#a1a1aa`.
- **Focus:** el borde pasa a morado `#8b5cf6` y aparece un anillo de 2 px al 30 % de opacidad.
  Transición de 200 ms. El foco siempre es visible; nunca se suprime el outline sin sustituto.
- **Disabled:** fondo `#fafafa` y cursor no permitido.
- **Error:** borde y texto de ayuda en `#c53030`, con el mensaje bajo el campo — en español,
  accionable y sin culpar al usuario.
- **Checkbox nativo:** tinte `accent-[#8b5cf6]` en lugar del azul/negro por defecto del navegador.

### Navigation

En escritorio, la barra lateral plegable (ver «Escritorio»): arriba el logotipo `BrandMark`
(squircle morado con mordisco circular blanco) de 36 px, el nombre del producto en negrita y el del
negocio debajo en tinta apagada; luego el chip de estado del servicio y el buscador; abajo los
minutos, Ajustes, Facturación y cerrar sesión.

Los enlaces son pastillas con icono Lucide de 16 px: activo en Lavado Morado, inactivo en blanco
con hover templado (`#fafafa`). Por debajo de `lg` no hay cabecera global: cada pantalla trae la
suya y la navegación es la barra de pestañas (ver «App móvil»).

### App móvil (por debajo de `lg`)

Por debajo de 1024 px la app es una app móvil, no el panel encogido (rediseño de octubre de 2026,
prototipo «Alhabla Movil» de Claude Design). El escritorio no cambia.

- **Barra de pestañas** fija abajo con cinco destinos: Inicio, Agenda, Llamadas, Agente y Cuenta
  (`components/movil/barra-de-pestanas.tsx`). Sin «Más»: cuenta, facturación, Gestor y ayuda viven
  en la pestaña Cuenta (`/ajustes` en móvil). Llamadas lleva una insignia negra con las llamadas
  por devolver; Cuenta, un punto ocre cuando quedan pocos minutos. Solo las cinco pestañas la
  llevan: las pantallas de detalle la ocultan.
- **Cabecera de pantalla** (`CabeceraMovil`): barra fija de 44 px y debajo el título grande (32 px,
  30 en detalle, `font-extrabold`) con una frase. Al desplazar aparece el título pequeño centrado
  y la línea inferior. Las pantallas de detalle llevan «‹ Agente», «‹ Cuenta»… a la izquierda;
  Inicio lleva la marca, el negocio y el chip de estado. `AppPageHeader` pinta las dos cabeceras y
  el CSS decide cuál se ve.
- **Detalle en pantalla propia**: cada ajuste del agente es una ruta (`/agente/horario`…, mapa en
  `AJUSTES_DEL_AGENTE`); los `?section=` de siempre redirigen a ella y, en escritorio, la ruta
  vuelve al bloque plegable. Entran desde la derecha (`.entrada-detalle`).
- **Hojas inferiores** (`HojaInferior`) para lo que se consulta sin salir de la lista: detalle de
  llamada (con la grabación fija al pie), de cita, estado del servicio y editores de servicio y
  profesional. `rounded-t-3xl`, asa de 40×5, velo al 45 %, Escape y trampa de foco.
- **Guardar solo con cambios**: los editores largos no llevan botón al final; una barra
  «Descartar / Guardar» sube desde abajo cuando hay algo sin guardar (`BarraGuardar`).
- **Teléfonos sin +34** (`formatPhoneLocal`) y llamar siempre a un toque: botón redondo de 44 px
  en filas, deslizar a la izquierda en el historial, botón primario en hojas.
- La próxima cita de Inicio es la única superficie negra de la app: es lo primero que se mira.

### Escritorio (desde `lg`)

Rediseño de octubre de 2026 a partir de los wireframes «Alhabla Escritorio Wireframes» de Claude
Design (sistema A: barra lateral y paneles de detalle). Fase 1: navegación, Panel, Agenda y
Llamadas; Agente, Gestor, Ajustes, Facturación, número principal, login, alta y checkout siguen
con el diseño anterior hasta sus fases.

- **Barra lateral plegable** (`components/escritorio/barra-lateral.tsx`): 240 px desplegada, franja
  de iconos de 64 px plegada, con bocadillos negros al pasar por encima. Se pliega sola en Agenda,
  Llamadas y Gestor; lo que el dueño elija se recuerda por tipo de pantalla. Arriba, siempre a la
  vista, el chip de estado del servicio (abre un diálogo con las mismas señales que la hoja del
  móvil) y el buscador.
- **Buscador ⌘K** (`buscador.tsx`): pantallas, citas y conversaciones del negocio, «Preguntar al
  gestor…» y copiar el número de Alhabla. «G» + letra salta a una pantalla (P, A, L, R, G, J).
- **Pantallas de trabajo de borde a borde**: Panel, Agenda y Llamadas no llevan el margen de
  90 rem; empiezan con una franja de título (`TiraDePagina`) y ocupan el alto de la ventana con su
  propio scroll.
- **Detalle a la derecha, no en modal** (`PanelDeDetalle`): la cita en la Agenda, la conversación en
  Llamadas. La lista sigue a la vista y se sigue eligiendo (↑ ↓ en Llamadas, Escape cierra). La
  selección y los filtros viven en la URL, para que el buscador y «Ver en la agenda» abran
  directamente una cita o una llamada.
- **La agenda en horas**: una columna por día (o por profesional en «Día»), lo cerrado sombreado
  en rayas, hoy en lavado morado y la línea de «ahora» en morado. Las citas que se solapan se
  reparten el ancho. Arrastrar una cita la mueve: se comprueba el hueco real y se pide «sí».
- **Diálogos centrados** (`Dialogo`) solo para confirmar algo que cambia fuera del panel (mover o
  cancelar una cita, avisar al cliente) o para contenido largo que no tiene pantalla (el desvío).
- Las piezas de la columna derecha del Panel (citas sin reservar, guía de configuración, últimos
  7 días, llamadas recientes) son las mismas que las de Inicio en el móvil.

### Icon Tiles

La firma más reconocible del sistema: icono Lucide dentro de un azulejo de 12 px en Lavado Morado
(`#f3eeff`) con el trazo en morado (`#8b5cf6`). 40 px de lado en cabeceras de sección, 32 px en
listas. Los iconos nunca van sueltos sobre el fondo: siempre llevan su azulejo — salvo dentro de
una sección que ya sea `#f3eeff`, donde el azulejo pasa a blanco (ver La Regla del Azulejo No
Anidado).

### Logotipo

`BrandMark` (`frontend/src/components/brand-mark.tsx`): squircle morado de 12 px de radio con un
mordisco circular recortado vía `<mask>` SVG. Sustituye por completo al antiguo icono `Bot` de
Lucide y al logotipo raster anterior en header, footer, favicon, `apple-icon` e `opengraph-image`.

## Do's and Don'ts

### Do:

- **Do** usar fondo blanco plano en toda página — landing, auth, registro, panel y ajustes.
- **Do** limitarse a la escala de radios 10 / 12 / 16 / 24 px, más píldora para círculos y
  etiquetas.
- **Do** teñir toda sombra estructural con `rgba(0,0,0,…)` y reservarla a elementos que
  realmente flotan.
- **Do** reservar `font-semibold` o más para titulares, títulos de tarjeta, CTAs y cifras clave, y
  dejar el cuerpo en `font-normal`.
- **Do** dar 44 px de alto a todo control interactivo: se configura de pie y con prisa.
- **Do** envolver cada icono Lucide en su azulejo `#f3eeff` con trazo `#8b5cf6`, salvo dentro de
  una sección ya morada lavada (usar blanco ahí).
- **Do** hacer visible el foco en todo elemento interactivo con el anillo morado; es requisito del
  compromiso WCAG 2.1 AA registrado en PRODUCT.md.
- **Do** mantener éxito y error en su propia familia verde/roja de extremo a extremo — nunca mezclar
  con borde o texto morado.
- **Do** subir el texto de párrafo largo a 1 rem en superficies públicas.

### Don't:

- **Don't** usar ningún tono de la paleta verde anterior (`#1e2b22`, `#b8d96e`, `#eef6dc`,
  `#405115`, `#9dbb55`, etc.) como color estructural. Quedan reservados en exclusiva a los tres
  semánticos heredados (éxito/aviso/error), que sí conservan su verde y su rojo originales.
- **Don't** usar `#d6ff72` (lima neón) ni `#101814` (negro verdoso) — rechazados por nombre desde
  la revisión de agosto y con más razón ahora que la identidad es negro/blanco/morado.
- **Don't** anidar un azulejo `bg-[#f3eeff]` dentro de una sección que ya tenga `bg-[#f3eeff]` de
  fondo: se vuelve invisible por falta de contraste.
- **Don't** poner un borde o texto morado dentro de un banner semántico verde (éxito) o rojo
  (error). Las tres partes — fondo, borde, texto — deben ser de la misma familia semántica.
- **Don't** usar degradado de papel ni superficie translúcida como fondo general de página **en el
  producto** (panel, ajustes); el degradado radial sutil y los blobs `blur-3xl` morados son un
  acento puntual sobre un panel concreto, no el fondo del `body`. Las superficies de venta
  (landings, `/login`, `/register`) sí llevan el campo de partículas — ver La Regla del Blanco
  Plano.
- **Don't** aplicar sombras teñidas de verde (`rgba(30,43,34,…)`) — son residuo del sistema
  anterior y no pertenecen a la paleta actual.
- **Don't** dejar que un contenedor colapse mientras carga: el checkout embebido reserva
  `min-h-[480px]` y todo contenedor asíncrono debe reservar su altura igual.
- **Don't** usar `rounded-lg` (8 px) como radio de botón o campo — ese tamaño de radio quedó
  reservado a detalles muy pequeños, no a controles interactivos.
- **Don't** usar píldora completa (`rounded-full`) en un botón o un campo de texto — quedó
  reservada a círculos de verdad, badges/chips, navegación en pastilla, controles segmentados y
  barras de progreso (decisión 2026-09-17). Botones y campos van en `rounded-[10px]`.
