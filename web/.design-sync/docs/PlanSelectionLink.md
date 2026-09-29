---
category: Formularios
---
Botón «Elegir <plan>» de las tarjetas de precio. No es un enlace: al pulsarlo
salta a `/elegir-plan` de la app (`app.alhabla.ai`) con el plan y el sector en
la query, y la app decide entre el checkout (con sesión) y el registro. Debajo
lleva una nota, enlazada con `aria-describedby`, que avisa de que se pide
tarjeta pero no se cobra hasta que acaba la prueba. Mientras redirige muestra
«Continuando…».

Tres tratamientos: `featured` (el plan recomendado, Pro) es morado sólido
`#7c3aed` y va sobre la tarjeta **negra** —su nota es blanca translúcida y
sobre blanco no se lee—; `preselected` (se llega con el plan ya elegido en la
URL) es negro sólido; sin ninguno de los dos, blanco con borde negro.

`planId` es `"inicio" | "pro" | "scale"` y `planName` el rótulo visible.
