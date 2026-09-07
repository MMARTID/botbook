---
category: Panel
---
Modal con el detalle completo de una llamada: resumen, transcripción turno a
turno, duración, coste, sentimiento y la reserva creada si la hubo.

Es un **overlay a pantalla completa**, no una tarjeta: no lo metas en una
rejilla. Lee `["call-detail", callId]`, gestiona el foco al abrir y devuelve el
control con `onClose`.
