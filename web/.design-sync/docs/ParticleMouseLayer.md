---
category: Movimiento
---
Capa de partículas que derivan solas y se apartan del cursor. Es una capa
global (`fixed inset-0 -z-10`), no un componente de contenido: se monta una
sola vez por página, junto a `ParticleField`, y se dibuja por detrás de todo.

Solo se activa con puntero fino (ratón) y sin `prefers-reduced-motion`: en
táctil o con movimiento reducido no pinta nada, así que nunca la uses para
transmitir información. `color` la retinta (por defecto, el morado de marca).

Su tarjeta es la tipográfica: las capturas de este sistema fuerzan
`prefers-reduced-motion`, y con él el canvas queda vacío.
