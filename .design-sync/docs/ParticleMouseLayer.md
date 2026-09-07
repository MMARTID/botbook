---
category: Movimiento
---
Capa de partículas que reacciona al movimiento del ratón. Es una capa global
(`fixed inset-0 -z-10`), no un componente de contenido: se monta una sola vez
por página y se dibuja por detrás de todo.

**No tiene render estático**: sin movimiento de ratón el canvas queda vacío, por
eso su tarjeta es la tipográfica. No la uses en móvil ni la conviertas en un
elemento con el que se pueda interactuar.
