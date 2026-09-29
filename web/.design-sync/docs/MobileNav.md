---
category: Estructura
---
Navegación de la web por debajo del breakpoint `md`: CTA «Empezar» siempre
visible más el botón de menú. El contenedor lleva `md:hidden`, así que **en
escritorio no se renderiza nada** — en ese tramo la navegación la pone la barra
completa (`SiteHeader`, que es quien la monta).

Cierra con Escape y tocando fuera, y bloquea el scroll del body mientras está
abierto. `niche` propaga el sector al enlace de planes; `inicio` es el prefijo
de los enlaces a secciones (`#como-funciona`, `#preguntas`) cuando la página no
es la portada.
