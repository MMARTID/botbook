---
name: BotBook
description: Sistema visual SaaS sereno para negocios de servicios españoles — verde mostrador sobre papel claro
colors:
  background: "#eef2eb"
  surface: "#ffffff"
  surface-soft: "#f6f7f1"
  foreground: "#17211c"
  muted: "#5f6a5e"
  accent: "#1e2b22"
  accent-strong: "#243026"
  accent-soft: "#b8d96e"
  accent-wash: "#eef6dc"
  accent-ink: "#405115"
  accent-ring: "#d7e9c5"
  focus: "#9dbb55"
  stroke: "#d2dacd"
  border: "rgba(30, 43, 34, 0.08)"
  success: "#2c7334"
  success-surface: "#ecf7ec"
  warning: "#9f7a15"
  error: "#c53030"
typography:
  display:
    fontFamily: "var(--font-geist-sans), sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3.75rem)"
    fontWeight: 600
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
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "#344038"
    rounded: "{rounded.sm}"
    padding: "0 20px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "#f4f6f1"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "24px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "16px"
  badge-soft:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  nav-pill:
    backgroundColor: "{colors.surface}"
    textColor: "#344038"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
  nav-pill-active:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.accent-ink}"
  icon-tile:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.success}"
    rounded: "{rounded.md}"
    size: "40px"
---

# Design System: BotBook

## Overview

**Creative North Star: "La Recepción Serena"**

El mostrador de un buen negocio a media mañana: luz natural entrando, madera clara, todo en su
sitio, nadie levantando la voz. Esa es la sensación que persigue BotBook. El producto le habla a
una peluquera, un barbero o un fisioterapeuta que no compró software en su vida y que no quiere
sentirse en una app: quiere sentir que ha contratado a alguien competente y tranquilo. La
interfaz interpreta ese papel — presente, ordenada, sin pedir atención.

Materialmente el sistema es papel verde pálido con tinta verde casi negra. El fondo nunca es
blanco plano: es un degradado radial tenue que baja de `#f7f8f5` a `#e7ece4` con un halo de
Brote Claro arriba a la izquierda, y ese fondo se mantiene **en todas las pantallas**, de la
landing al panel, para que la aplicación no se sienta como un sitio distinto del que te vendió.
Sobre él flotan superficies blancas translúcidas con bordes de un píxel. La profundidad viene
del tono y del borde, no de la sombra.

El anti-referente está confirmado y es explícito: nada de estética de startup ni de app de
consumo. Se rechazaron por nombre el negro verdoso `#101814` y el lima neón `#d6ff72` por
producir exactamente ese registro. El sistema es cálido pero adulto, y su expresividad está en
la precisión — un radio consistente, un acento que aparece poco — no en el volumen.

**Key Characteristics:**

- Papel verde pálido con degradado radial continuo en todas las superficies, jamás fondo plano.
- Un solo acento fuerte por vista; el Brote Claro se reserva para foco y realce.
- Profundidad por capas tonales y bordes de 1 px, con sombra ambiental casi imperceptible.
- Escala de radios corta y disciplinada: 8 / 12 / 16 px, y píldora solo en badges y navegación.
- Respuesta táctil breve: 200 ms, 2 px de elevación en hover, hundido en active.
- Español de España en toda la interfaz; iconografía Lucide sobre azulejo `#eef6dc`.

## Colors

Una paleta de un solo tono — verde — trabajada en todo su rango, del casi negro al brote, sobre
un neutro cálido y ligeramente verdoso que hace de papel.

### Primary

- **Verde Mostrador** (`#1e2b22`): el verde casi negro de la madera pintada de un mostrador.
  Botones primarios, titulares y todo énfasis estructural. Es la tinta de la marca.
- **Verde Mostrador Intenso** (`#243026`): exclusivamente el estado hover de los elementos
  primarios. Nunca como color de reposo.

### Secondary

- **Brote Claro** (`#b8d96e`): el verde tierno de una planta de interior. Anillos de foco,
  realces sutiles y el halo del degradado de fondo. Es el color más vivo del sistema y por eso
  el más racionado.
- **Verde Brote Lavado** (`#eef6dc`): fondo de badges, chips de navegación activos y azulejos de
  icono. Es el Brote Claro convertido en superficie habitable.
- **Tinta Brote** (`#405115`): texto sobre Verde Brote Lavado. Nunca sobre blanco.
- **Anillo Brote** (`#d7e9c5`): borde interior de badges y chips.
- **Verde Foco** (`#9dbb55`): borde de campo enfocado y anillo `focus-visible`. Más contenido
  que el Brote Claro porque tiene que leerse contra blanco.

### Neutral

- **Papel Verde** (`#eef2eb`): base del degradado de fondo del cuerpo.
- **Superficie** (`#ffffff`): tarjetas y paneles, casi siempre al 90–95 % de opacidad para que el
  papel se transparente.
- **Superficie Templada** (`#f6f7f1`): segundo nivel de superficie, secciones anidadas y filas
  alternas.
- **Tinta** (`#17211c`): texto principal.
- **Tinta Apagada** (`#5f6a5e`): texto secundario, descripciones y ayudas. Se usa siempre a través
  de la utilidad `.text-muted`, nunca escribiendo el hex, para que el token siga siendo el único
  punto de cambio. El valor anterior (`#687267`) daba 4,42:1 sobre el papel y no llegaba a AA;
  este pasa sobre blanco (5,66:1), papel (5,00:1) y superficie templada (5,25:1).
- **Trazo** (`#d2dacd`): borde de campos y de botones secundarios.
- **Borde Velado** (`rgba(30, 43, 34, 0.08)`): divisores y bordes de panel; verde translúcido,
  nunca gris.

### Semantic

- **Éxito** (`#2c7334`): conexiones activas, confirmaciones e iconos dentro de azulejo. También
  es el verde de la iconografía en reposo.
- **Superficie Éxito** (`#ecf7ec`): fondo de avisos positivos.
- **Aviso** (`#9f7a15`): advertencias — un ocre, no un amarillo.
- **Error** (`#c53030`): fallos de validación y errores de sistema.

### Named Rules

**La Regla del Acento Único.** El Brote Claro y el Verde Mostrador no compiten. En cualquier
vista hay un solo elemento que reclama la mirada: o el botón primario, o el dato que importa.
Si dos cosas gritan, ninguna se oye.

**La Regla del Verde Único.** No entra ningún tono ajeno a la familia verde salvo los tres
semánticos. Púrpura y naranja están prohibidos por nombre en `HeroConversation` y por extensión
en todo el sistema. Las landings de nicho son la única excepción reglada: cada una tiene su
`NicheAccent` (`strong` / `soft` / `deep`) en `niche-landings.ts` y lo aplica solo a esa página.

**La Regla del Papel Continuo.** Ninguna pantalla usa fondo plano. El degradado radial del
`body` es el suelo compartido de landing, auth, registro, panel y ajustes. Un `#f7f8f4` liso
rompe la continuidad entre la promesa y el producto.

## Typography

**Display Font:** Geist Sans (variable 100–900, servida local desde `app/fonts/GeistVF.woff`)
**Body Font:** Geist Sans — la misma familia en todo el sistema
**Label/Mono Font:** Geist Mono (`app/fonts/GeistMonoVF.woff`), reservada para datos técnicos

**Character:** una grotesca neutra y contemporánea, sin manierismos. Al usar una sola familia en
todo el rango, la jerarquía la construyen el tamaño y el peso, no el contraste de fuentes. Eso
mantiene el tono de herramienta seria y evita el registro editorial o publicitario que
desentonaría con el producto.

### Hierarchy

- **Display** (600, `clamp(2.25rem, 5vw, 3.75rem)`, interlineado 1.05, `-0.02em`): titular de
  hero en landings. Uno por página, nunca en el producto.
- **Headline** (600, 1.875 rem, 1.2): títulos de sección y encabezados de página del panel.
- **Title** (600, 1.125 rem, 1.4): títulos de panel y de tarjeta.
- **Body** (400, 0.875 rem, 1.6): el caballo de batalla del sistema. Longitud de línea máxima
  65–75 caracteres.
- **Label** (600, 0.75 rem, `0.12em`, mayúsculas): badges, chips de estado y encabezados de
  columna. **No** eyebrows: ver La Regla del Titular Solo.
- **Mono** (400, 0.8125 rem): identificadores, números de teléfono y fragmentos de transcripción.

### Named Rules

**La Regla del Peso Ganado.** `font-semibold` se gana: titulares, títulos de tarjeta, CTAs y
cifras clave. El cuerpo, las descripciones y las ayudas van en `font-normal`. Cuando todo está
en semibold, la jerarquía desaparece y la interfaz se lee gritada.

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
(42 rem) y los formularios y tarjetas de auth a `max-w-md` (28 rem).

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
interactivo mide al menos 44 px de alto — de ahí que campos y botones compartan `h-11`.

## Elevation & Depth

El sistema separa superficies **por tono y por borde**, no por sombra. El degradado del papel, el
blanco translúcido del panel (`bg-white/95` con `backdrop-blur-xl`) y el borde de un píxel hacen
casi todo el trabajo; la sombra solo añade el asiento mínimo para que la tarjeta no parezca
recortada y pegada.

### Shadow Vocabulary

- **Ambiental panel** (`box-shadow: 0 8px 24px rgba(30,43,34,0.06)`): reposo de `.panel`. Sube a
  `0 12px 32px rgba(30,43,34,0.08)` desde `sm`, donde hay más superficie que sostener.
- **Ambiental tarjeta** (`box-shadow: 0 4px 16px rgba(30,43,34,0.04)`): tarjetas pequeñas y
  elementos de carril.
- **Acción primaria** (`box-shadow: 0 8px 20px rgba(30,43,34,0.12)`): botón primario en reposo;
  `0 10px 28px rgba(30,43,34,0.16)` desde `sm`. Es la única sombra del sistema con intención de
  destacar en lugar de asentar.

Toda sombra usa `rgba(30,43,34,...)` — el propio Verde Mostrador diluido. Una sombra gris o negra
ensucia el papel verde y se ve inmediatamente.

### Named Rules

**La Regla de los 24 Píxeles.** Ningún desenfoque de sombra pasa de 32 px ni ninguna opacidad de
0,16. Las sombras de 55 u 80 px de desenfoque despegan los paneles del papel y convierten una
herramienta en un escaparate.

## Shapes

Escala de radios corta y deliberada, de menor a mayor superficie:

- **8 px** (`rounded-lg`) — campos, botones y controles pequeños. La forma con la que el usuario
  interactúa directamente es la menos redondeada: se lee como control, no como pastilla.
- **12 px** (`rounded-xl`) — tarjetas, azulejos de icono y contenedores intermedios.
- **16 px** (`rounded-2xl`) — paneles y contenedores mayores.
- **Píldora** (`rounded-full`) — **solo** en badges, chips de estado, pastillas de navegación y
  botones de icono cuadrados de 32–40 px.

Los bordes son de 1 px y de la familia verde: `#d2dacd` en controles, `rgba(30,43,34,0.08)` en
paneles, `#d7e9c5` en badges. Nunca gris neutro. El panel añade además un borde interior claro
(`border-white/70`) que le da el canto de vidrio esmerilado.

**La Regla de la Escala Corta.** 8, 12, 16 y píldora. No hay un quinto radio. Valores como
`rounded-3xl`, `rounded-[1.75rem]` o `rounded-[2rem]` no pertenecen al sistema: aflojan la
geometría hasta el registro de app de consumo, que es justo el anti-referente.

## Components

Los componentes son **táctiles y receptivos**: responden al dedo y al cursor con un gesto breve y
pequeño. La respuesta física es la firma del sistema; la espectacularidad no. Toda transición
dura 200 ms y respeta `prefers-reduced-motion`.

### Buttons

- **Shape:** esquinas suaves de 8 px (`rounded-lg`), altura fija de 44 px (`h-11`), relleno
  lateral de 20 px, `inline-flex` con 8 px de hueco para el icono.
- **Primary:** Verde Mostrador con texto blanco, texto de 0.875 rem en semibold y sombra de
  acción primaria.
- **Hover / Focus:** eleva 2 px (`-translate-y-0.5`) y pasa a Verde Mostrador Intenso.
  `focus-visible` dibuja anillo de Verde Foco. En `active` el botón vuelve a su sitio y hunde
  ligeramente: la elevación se gana y se devuelve.
- **Secondary:** superficie blanca al 95 %, borde Trazo, texto `#344038`; en hover eleva igual y
  el fondo pasa a `#f4f6f1`.
- **Disabled:** 60 % de opacidad, cursor no permitido y sin elevación. Un botón deshabilitado no
  se mueve.

### Chips

- **Style:** píldora sobre Verde Brote Lavado, texto Tinta Brote de 0.75 rem en semibold, anillo
  interior de Anillo Brote. 12 px de relleno lateral.
- **State:** en navegación, activo lleva Verde Brote Lavado con borde `#cfe1ae`; inactivo va
  blanco con borde `#e4e8df` y hover `#f6f8f2`.

### Cards / Containers

- **Corner Style:** 16 px en paneles, 12 px en tarjetas.
- **Background:** blanco al 90–95 % con `backdrop-blur-xl`, para que el papel verde se
  transparente. Nunca blanco opaco.
- **Shadow Strategy:** ambiental panel o ambiental tarjeta (ver Elevation & Depth). Nada más.
- **Border:** 1 px de Borde Velado, más borde interior `white/70` en `.panel`.
- **Internal Padding:** 24 px en paneles, 16 px en tarjetas, 12 px en tarjetas de carril en móvil.

### Inputs / Fields

- **Style:** 44 px de alto, esquinas de 8 px, borde Trazo, fondo blanco al 95 %, texto de
  0.875 rem, 16 px de relleno lateral. Placeholder en `#8e968d`.
- **Focus:** el borde pasa a Verde Foco y aparece un anillo de 2 px de Brote Claro al 40 %.
  Transición de 200 ms. El foco siempre es visible; nunca se suprime el outline sin sustituto.
- **Disabled:** fondo `#f0f3ea` y cursor no permitido.
- **Error:** borde y texto de ayuda en Error, con el mensaje bajo el campo — en español,
  accionable y sin culpar al usuario.

### Navigation

Cabecera `sticky` sobre `#fbfcf8` al 90 % con `backdrop-blur-xl` y borde inferior `#dfe6da`. A la
izquierda, el azulejo de logotipo de 36–40 px en Verde Brote Lavado con el icono en Verde
Mostrador, el nombre del producto en semibold y el nombre del negocio debajo en Tinta Apagada. A
la derecha, badge de estado y cierre de sesión, que en móvil se reduce a icono.

Los enlaces son pastillas con icono Lucide de 16 px: activo en Verde Brote Lavado, inactivo en
blanco con hover templado. En las páginas de ajustes la cabecera se oculta en móvil y la
sustituye un botón circular de vuelta de 40 px, fijo arriba a la izquierda.

### Icon Tiles

La firma más reconocible del sistema: icono Lucide dentro de un azulejo de 12 px en Verde Brote
Lavado (`#eef6dc`) con el trazo en Éxito (`#2c7334`). 40 px de lado en cabeceras de sección,
32 px en listas. Los iconos nunca van sueltos sobre el papel: siempre llevan su azulejo.

## Do's and Don'ts

### Do:

- **Do** mantener el degradado radial del `body` en todas las páginas, incluidas auth, registro y
  checkout.
- **Do** limitarse a la escala de radios 8 / 12 / 16 px, con píldora reservada a badges, chips,
  pastillas de navegación y botones de icono.
- **Do** teñir todas las sombras con `rgba(30,43,34,...)` y quedarse por debajo de 32 px de
  desenfoque y 0,16 de opacidad.
- **Do** reservar `font-semibold` para titulares, títulos de tarjeta, CTAs y cifras clave, y
  dejar el cuerpo en `font-normal`.
- **Do** dar 44 px de alto a todo control interactivo: se configura de pie y con prisa.
- **Do** envolver cada icono Lucide en su azulejo `#eef6dc` con trazo `#2c7334`.
- **Do** hacer visible el foco en todo elemento interactivo con el anillo de Verde Foco; es
  requisito del compromiso WCAG 2.1 AA registrado en PRODUCT.md.
- **Do** subir el texto de párrafo largo a 1 rem en superficies públicas.

### Don't:

- **Don't** usar `#d6ff72` (lima neón) ni `#101814` (negro verdoso). Están rechazados por nombre
  y siguen presentes en el código: `rgba(214,255,114,…)` aparece en `app-shell.tsx`,
  `landing-hero.tsx`, `app/page.tsx` y `planes/page.tsx`, y `rgba(16,24,20,…)` en once archivos.
  Son deuda a corregir, no precedente a imitar.
- **Don't** introducir `rounded-3xl`, `rounded-[1.75rem]`, `rounded-[2rem]` ni ningún radio fuera
  de la escala. Hoy hay 10 usos de `rounded-3xl` y 16 de radios arbitrarios: son la deriva, no la
  norma.
- **Don't** usar sombras de gran desenfoque tipo `0_22px_55px`, `0_26px_80px` o `0_20px_80px`.
  Hay cinco en el código y todas despegan el panel del papel.
- **Don't** aplicar `tracking-[0.3em]` ni superior. Los siete usos actuales convierten el label
  en textura ilegible.
- **Don't** poner púrpura, naranja ni ningún color fuera de la familia verde, salvo los tres
  semánticos y el `NicheAccent` de su propia landing.
- **Don't** usar fondos planos (`#f7f8f4` y similares) en lugar del degradado del papel.
- **Don't** dejar cajas oscuras dentro del panel: la tarjeta «Estado general» va en `#f7f9f3` con
  acentos verdes, no en un bloque oscuro.
- **Don't** aplicar sombras grises o negras. El papel es verde y las delata.
- **Don't** dejar que un contenedor colapse mientras carga: el checkout embebido reserva
  `min-h-[480px]` y todo contenedor asíncrono debe reservar su altura igual.
