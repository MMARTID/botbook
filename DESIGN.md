---
name: Alhabla
description: Sistema visual SaaS de alto contraste para negocios de servicios españoles — negro y blanco con un único acento morado
colors:
  background: "#ffffff"
  surface: "#ffffff"
  surface-soft: "#fafafa"
  foreground: "#0a0a0a"
  muted: "#52525b"
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
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-soft}"
  button-purple:
    backgroundColor: "{colors.purple}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "48px"
  button-purple-hover:
    backgroundColor: "{colors.purple-strong}"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.pill}"
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
    textColor: "#27272a"
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
  y azulejos de icono en `rounded-xl`/`rounded-2xl` (12–16 px), campos y botones en píldora.
- Tipografía con peso real: titulares en `font-black`/`font-extrabold`, nunca semibold tibio.
- Español de España en toda la interfaz; iconografía Lucide sobre azulejo `#f3eeff` con trazo
  morado `#8b5cf6`.

## Colors

Negro y blanco como base absoluta, morado como único acento decorativo, y tres semánticos
heredados (éxito, aviso, error) que se mantienen fuera de la familia morada a propósito: son
estado del sistema, no marca.

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
- **Aviso** (`#9f7a15`): advertencias — un ocre, no un amarillo.
- **Error** (`#c53030`) sobre **Superficie Error** (`#fff1f1`) con borde **`#f5d3d3`**: fallos de
  validación y errores de sistema.

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

**La Regla del Blanco Plano.** Ninguna pantalla usa degradado de papel ni superficie translúcida
por defecto. El fondo es `#ffffff` liso en landing, auth, registro, panel y ajustes — el
degradado radial sutil y los blobs de desenfoque morado (`blur-3xl`) son un acento puntual sobre
paneles concretos, no el fondo general de la página.

## Typography

**Display Font:** Geist Sans (variable 100–900, servida local desde `app/fonts/GeistVF.woff`)
**Body Font:** Geist Sans — la misma familia en todo el sistema
**Label/Mono Font:** Geist Mono (`app/fonts/GeistMonoVF.woff`), reservada para datos técnicos

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

En ajustes, la navegación por secciones se reemplaza en móvil por un botón de vuelta flotante
arriba a la izquierda; la cabecera completa se oculta por debajo de `sm`.

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

- **Píldora** (`rounded-full`) — campos, botones (`.btn-primary`, `.btn-secondary`, `.btn-purple`)
  y controles pequeños. A diferencia del sistema anterior, aquí el control interactivo es el más
  redondeado: se lee como táctil e invitante, no como recuadro técnico.
- **12 px** (`rounded-xl`) — tarjetas, azulejos de icono y contenedores intermedios.
- **16 px** (`rounded-2xl`) — tarjetas grandes, secciones de wizard, banners de estado.
- **24 px** (`rounded-3xl`) — `.panel` y contenedores mayores de página. Es el radio más grande y
  se reserva para las superficies de más alto nivel.

Los bordes son de 1 px y neutros: `#e5e5e5` en controles, tarjetas y paneles. El morado (`#8b5cf6`
o `#ddd6fe`) solo aparece en el borde cuando la tarjeta está seleccionada, activa o destacada — no
como borde por defecto.

**La Regla de la Escala Amplia.** Píldora / 12 / 16 / 24. No hay un radio pequeño de 8 px en este
sistema: los controles pequeños de 8 px del mundo anterior pasaron a píldora al migrar de verde a
negro/blanco/morado. No reintroducir `rounded-lg` (8 px) como radio de control interactivo.

## Components

Los componentes son **táctiles y receptivos**: responden al dedo y al cursor con un gesto breve y
pequeño. La respuesta física es la firma del sistema; la espectacularidad no. Toda transición dura
200 ms y respeta `prefers-reduced-motion`.

### Buttons

- **Shape:** píldora (`rounded-full`), altura fija de 44–48 px (`h-11`/`h-12`), relleno lateral de
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

- **Style (`.field`):** 44 px de alto, forma píldora, borde `#e5e5e5`, fondo blanco, texto de
  0.875 rem, 16 px de relleno lateral. Placeholder en `#a1a1aa`.
- **Focus:** el borde pasa a morado `#8b5cf6` y aparece un anillo de 2 px al 30 % de opacidad.
  Transición de 200 ms. El foco siempre es visible; nunca se suprime el outline sin sustituto.
- **Disabled:** fondo `#fafafa` y cursor no permitido.
- **Error:** borde y texto de ayuda en `#c53030`, con el mensaje bajo el campo — en español,
  accionable y sin culpar al usuario.
- **Checkbox nativo:** tinte `accent-[#8b5cf6]` en lugar del azul/negro por defecto del navegador.

### Navigation

Cabecera `sticky` sobre `#fafafa` al 80 % con `backdrop-blur-xl` y borde inferior `white/60`. A la
izquierda, el logotipo `BrandMark` (squircle morado con mordisco circular blanco) de 40–44 px, el
nombre del producto en semibold negro y el nombre del negocio debajo en tinta apagada. A la
derecha, badge de estado morado y cierre de sesión, que en móvil se reduce a icono.

Los enlaces son pastillas con icono Lucide de 16 px: activo en Lavado Morado, inactivo en blanco
con hover templado (`#fafafa`). En las páginas de ajustes la cabecera se oculta en móvil y la
sustituye un botón circular de vuelta de 40 px con sombra negra, fijo arriba a la izquierda.

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
- **Do** limitarse a la escala de radios píldora / 12 / 16 / 24 px.
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
- **Don't** usar degradado de papel ni superficie translúcida como fondo general de página; el
  degradado radial sutil y los blobs `blur-3xl` morados son un acento puntual sobre un panel
  concreto, no el fondo del `body`.
- **Don't** aplicar sombras teñidas de verde (`rgba(30,43,34,…)`) — son residuo del sistema
  anterior y no pertenecen a la paleta actual.
- **Don't** dejar que un contenedor colapse mientras carga: el checkout embebido reserva
  `min-h-[480px]` y todo contenedor asíncrono debe reservar su altura igual.
- **Don't** usar `rounded-lg` (8 px) como radio de botón o campo — ese tamaño de radio quedó
  reservado a detalles muy pequeños, no a controles interactivos, tras la migración a píldora.
