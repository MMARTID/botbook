---
category: Estructura
---
Sección plegable de la página de ajustes y contenedor por defecto de cualquier
bloque de configuración. Cerrada muestra título más un **resumen de estado de
una línea** (`summary`) — no un subtítulo decorativo: pon ahí el dato que
evita tener que abrirla («6 servicios», «Cerrado los lunes»).

`pending` marca la sección como incompleta con un indicador ambiental ámbar,
en lugar de sacar al usuario a un asistente aparte.

Es controlada: `open` + `onToggle` los gestiona la página, así se puede abrir
una sección concreta desde un enlace `?section=`.
