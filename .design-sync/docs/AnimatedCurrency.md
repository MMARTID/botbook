---
category: Cifras
---
Importe en euros que cambia con una inercia breve (0,24 s) al mover un control,
para que se lea la relación causa-efecto sin retrasar el valor real.

Formatea con `Intl.NumberFormat("es-ES")` sin decimales. Renderiza el importe
**dos veces**: el visible con `aria-hidden` y el valor real en `.sr-only`, para
que el lector de pantalla anuncie la cifra definitiva y no la animación.
