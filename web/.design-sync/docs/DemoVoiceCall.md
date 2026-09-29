---
category: Marketing
---
Modal de la demo de voz. Se abre desde «Escuchar la demo» (`open`/`onClose`),
deja buscar el negocio del visitante en Google Places o «Continuar con una demo
genérica», y arranca una llamada real contra el assistant de voz de la cuenta
de demo con el SDK de Telnyx (`TelnyxRTC`, con login anónimo: no hay
credenciales en el bundle). Pide micrófono, transcribe en directo y deja
silenciar y colgar. El tope de duración lo fija el backend al preparar la
llamada (60 s si no dice nada).

`niche` es el sector de la landing desde la que se abre (si el visitante busca
su negocio, manda el que detecta Places) y `onActiveChange` avisa de si hay una
llamada en curso.

Es un **overlay a pantalla completa** (`role="dialog"`, `fixed inset-0`), no
una tarjeta: no lo metas en una rejilla. Depende de red real
(`createDemoWebCall`, `searchDemoPlaces`, `getDemoPlaceDetails` en
`@/lib/api`) y del micrófono.

Va con tarjeta tipográfica (floor card): el patrón `fixed inset-0` no se deja
fotografiar en la rejilla. **Funciona al importarlo**; solo no se deja capturar
en estático.
