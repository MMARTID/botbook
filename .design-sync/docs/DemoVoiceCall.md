---
category: Marketing
---
Modal de la demo de voz de la landing: se abre desde el botón "Escuchar la
demo" (`open`/`onClose`), deja buscar el negocio del visitante (Google Places)
o continuar con un ejemplo genérico, y luego arranca una llamada real de hasta
60s contra un agente de Retell vía `RetellWebClient` (pide micrófono,
transcribe en directo, deja silenciar/colgar).

Es un **overlay a pantalla completa** (`role="dialog"`, `fixed inset-0`), no
una tarjeta: no lo metas en una rejilla. Depende de red real
(`createDemoWebCall`, `searchDemoPlaces`, `getDemoPlaceDetails` en
`@/lib/api`) y de `RetellWebClient`.

Va con tarjeta tipográfica (floor card): mismo patrón `fixed inset-0` que
`CallDetailModal`, que ya no se deja fotografiar en ningún tamaño de rejilla.
**Funciona perfectamente al importarlo**; solo no se deja capturar en estático.
