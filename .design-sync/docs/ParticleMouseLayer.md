---
category: Movimiento
---
Capa de partículas que derivan solas y se apartan del cursor. Es una capa
global (`fixed inset-0 -z-10`), no un componente de contenido: se monta una
sola vez por página, junto a `ParticleField`, y se dibuja por detrás de todo.

Solo se activa con puntero fino (ratón) y sin `prefers-reduced-motion`: en
táctil o con movimiento reducido no pinta nada, así que nunca la uses para
transmitir información. `color` la retinta (por defecto, el morado de marca).

Es un canvas `fixed inset-0 -z-10` del tamaño de la ventana: móntalo suelto
en la página, detrás del contenido, no dentro de una caja. Su tarjeta simula
el cursor en el centro para que se vea cómo se apartan los puntos.
