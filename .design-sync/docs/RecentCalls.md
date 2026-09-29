---
category: Panel
---
Listado de las últimas conversaciones de la recepcionista: llamadas y chats de
WhatsApp. Cada fila lleva el teléfono, la fecha, la duración (o «Chat de
WhatsApp»), el resumen y el desenlace (Resuelta, Cliente potencial, Cliente
frustrado, Escalada, Sin respuesta o Sin clasificar), más un chip de «Reserva
creada» / «Reserva modificada» o, si no hubo cita, el motivo del escalado. El
sentimiento es un icono que solo aparece desde `sm`. Al pulsar una fila abre
`CallDetailModal`.

No recibe props: lee `["recent-calls"]` de React Query. En un diseño, siembra
esa clave en la caché del `QueryClient` con un `{ data, total, limit, offset }`
de `Call`.
