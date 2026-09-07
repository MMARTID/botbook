---
category: Movimiento
---
Animación Lottie decorativa. Reserva el hueco con `aspect-square` mientras carga
y respeta `prefers-reduced-motion` quedándose en el primer fotograma.

`src` es la URL del JSON (en la app, una ruta de `public/`); el ancho lo fija
`className`. Es siempre decorativa: va con `aria-hidden`, así que nunca la uses
para transmitir información que no esté también en texto.
