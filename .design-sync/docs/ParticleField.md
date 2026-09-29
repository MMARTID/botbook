---
category: Movimiento
---
Fondo decorativo de partículas para las superficies públicas **blancas**
(entrar, alta, recuperar contraseña y registro): es la única excepción a «La
Regla del Blanco Plano» de `DESIGN.md`. El panel y los ajustes van en blanco
liso, sin él.

No va dentro de una caja: es una capa `position: fixed; inset: 0; z-index: -10`
(`.campo-particulas`). La página que lo monta necesita `relative isolate` y
ningún fondo opaco propio, o lo taparía; el contenido va encima sin más.

Cada capa se dibuja una sola vez en un canvas fuera del DOM y se repite como
imagen de fondo; la deriva y la profundidad al hacer scroll son CSS. `color`
lo retinta (por defecto, el morado de marca).
