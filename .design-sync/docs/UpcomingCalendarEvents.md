---
category: Panel
---
Carrusel horizontal de las próximas citas del calendario conectado (Google u
Outlook), con flechas de desplazamiento cuando no caben.

Lee `["calendar-events", businessId, 15]`. Si la respuesta pide reconexión
llama a `onReconnectRequired` con el proveedor y muestra el estado de error con
su botón de reintento — ese estado de error es el que sale si el `businessId`
no coincide con la clave sembrada.
