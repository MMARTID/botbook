---
category: Marca
---
Isotipo de Alhabla: un squircle morado con un mordisco circular recortado. Es
un `<img>` del SVG `/brand/alhabla-isotipo.svg`, con sus propios degradados
morados, así que no se retinta: no lo pongas en gris ni en el acento de un
nicho.

El tamaño se fija desde `className`: `h-10 w-10` (`lg:h-11 lg:w-11`) en la
cabecera de la web, `h-11 w-11` en la barra lateral de la app y `h-8 w-8` en el
pie. Junto al wordmark va con `gap-3` y «Alhabla» en `font-bold`, no en
`font-black`. Funciona igual sobre blanco y sobre `#0a0a0a`.

En las tarjetas de este sistema sale como imagen rota: la ruta del SVG la sirve
el `public/` de cada web y aquí no existe. Al componer, respeta su hueco con el
mismo tamaño.
