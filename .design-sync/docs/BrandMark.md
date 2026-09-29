---
category: Marca
---
Isotipo de Alhabla: un auricular de teléfono en degradado morado. Es un `<img>`
cuyo SVG va dentro del propio componente (data URI), así que se ve igual en las
dos webs y aquí; lleva sus propios degradados morados, así que no se retinta: no
lo pongas en gris ni en el acento de un nicho. `alt="Alhabla"`: junto al
wordmark visible sigue siendo el nombre accesible del enlace.

El tamaño se fija desde `className`: `h-10 w-10` (`lg:h-11 lg:w-11`) en la
cabecera de la web, `h-11 w-11` en la barra lateral de la app, `h-14 w-14`
centrado sobre los formularios de acceso y `h-8 w-8` en el pie. Junto al
wordmark va con `gap-3` y «Alhabla» en `font-bold`, no en `font-black`.
Funciona igual sobre blanco y sobre `#0a0a0a`.
