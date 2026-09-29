---
category: Movimiento
---
Envoltorio de aparición al entrar en pantalla (desplazamiento vertical +
opacidad, una sola vez). Es el gesto de movimiento estándar de la landing: no
inventes otro para bloques de sección.

`delay` escalonado (`indice * 0.08`) produce la cascada de las rejillas. `y`
ajusta el recorrido. Respeta `prefers-reduced-motion` renderizando sin
transformación. No debe alterar la maquetación de lo que envuelve.
