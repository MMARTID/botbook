---
category: Panel
---
Listado de las últimas llamadas atendidas por el agente, con desenlace
(reservada / informativa / fuera de alcance) y sentimiento por fila. Al pulsar
una fila abre `CallDetailModal`.

No recibe props: lee `["recent-calls"]` de React Query. En un diseño, siembra
esa clave en la caché del `QueryClient` con un `{ data, total, limit, offset }`
de `Call`.
